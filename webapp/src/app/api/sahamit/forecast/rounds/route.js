import { randomUUID } from 'crypto';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';
import { detectFlags } from '@/lib/sahamit/flags';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/forecast/rounds — all FC rounds for AR-109, each with its
// lines, ordered by roundNo. The client computes round-to-round diff + peak from
// this single payload (pure logic in lib/sahamit). Scoped + gated by context.
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;

  const { data: rounds, error } = await supabase
    .from('sahamit_forecast_rounds')
    .select('*')
    .eq('customerId', customerId)
    .order('roundNo', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (rounds || []).map((r) => r.id);
  let linesByRound = {};
  if (ids.length) {
    const { data: lines, error: lErr } = await supabase
      .from('sahamit_forecast_lines')
      .select('*')
      .in('roundId', ids);
    if (lErr) return Response.json({ error: lErr.message }, { status: 500 });
    for (const l of lines || []) (linesByRound[l.roundId] ||= []).push(l);
  }

  const out = (rounds || []).map((r) => ({ ...r, lines: linesByRound[r.id] || [] }));
  return Response.json(out);
}

// POST /api/sahamit/forecast/rounds — create a round + its lines.
// Body: { receivedDate, coverMonths?, note?, lines:[{fgCode, month, qty}] }
// roundNo auto-increments per customer. fgCodes are resolved against AR-109's
// catalog; unknown codes are stored anyway (productId=null) and reported back.
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const receivedDate = body?.receivedDate;
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  if (!receivedDate) return Response.json({ error: 'ต้องระบุวันที่รับ FC (receivedDate)' }, { status: 400 });

  // Keep only lines with a fgCode + a month + a positive qty.
  const cleaned = rawLines
    .map((l) => ({ fgCode: String(l.fgCode || '').trim(), month: String(l.month || '').trim(), qty: Number(l.qty) }))
    .filter((l) => l.fgCode && /^\d{4}-\d{2}$/.test(l.month) && Number.isFinite(l.qty) && l.qty > 0);
  if (!cleaned.length) return Response.json({ error: 'ไม่มีรายการ FC ที่ถูกต้อง (ต้องมีรหัสสินค้า เดือน YYYY-MM และจำนวน > 0)' }, { status: 400 });

  // Resolve fgCodes against the catalog.
  let products;
  try {
    products = await loadSahamitProducts(supabase, customerId);
  } catch (e) {
    return Response.json({ error: `อ่านแคตตาล็อกสินค้าไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  const index = indexByFgCode(products);
  const unknown = new Set();

  // Next round number for this customer.
  const { data: last } = await supabase
    .from('sahamit_forecast_rounds')
    .select('roundNo')
    .eq('customerId', customerId)
    .order('roundNo', { ascending: false })
    .limit(1)
    .maybeSingle();
  const roundNo = (last?.roundNo || 0) + 1;

  const coverMonths = Array.isArray(body?.coverMonths) && body.coverMonths.length
    ? [...new Set(body.coverMonths)].sort()
    : [...new Set(cleaned.map((l) => l.month))].sort();

  const roundId = 'FCR-' + randomUUID();
  const nowIso = new Date().toISOString();
  const round = {
    id: roundId,
    customerId,
    roundNo,
    receivedDate,
    coverMonths,
    note: body?.note || null,
    createdById: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const { error: rErr } = await supabase.from('sahamit_forecast_rounds').insert(round);
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });

  const lineRows = cleaned.map((l) => {
    const r = resolveFgCode(index, l.fgCode);
    if (!r.known) unknown.add(l.fgCode);
    return {
      id: 'FCL-' + randomUUID(),
      roundId,
      customerId,
      productId: r.productId,
      fgCode: l.fgCode,
      productName: r.productName,
      month: l.month,
      qty: l.qty,
      createdAt: nowIso,
    };
  });

  const { error: lErr } = await supabase.from('sahamit_forecast_lines').insert(lineRows);
  if (lErr) {
    // Roll back the header so we don't leave an empty round behind.
    await supabase.from('sahamit_forecast_rounds').delete().eq('id', roundId);
    return Response.json({ error: lErr.message }, { status: 500 });
  }

  await recordAudit({
    user, action: 'create', entityType: 'sahamit_forecast_round', entityId: roundId,
    after: round, summary: `สร้าง FC รอบที่ ${roundNo} (${lineRows.length} รายการ)`, request,
  });

  // Shift/cut audit (เฟส 5b): raise flags for drops/shifts vs the previous round
  // + lockedBreaks. Never let this break round creation.
  try {
    const { data: allRounds } = await supabase
      .from('sahamit_forecast_rounds').select('*').eq('customerId', customerId);
    const ids = (allRounds || []).map((r) => r.id);
    let allLines = [];
    if (ids.length) ({ data: allLines } = await supabase.from('sahamit_forecast_lines').select('*').in('roundId', ids));
    const roundsWithLines = (allRounds || []).map((r) => ({ ...r, lines: (allLines || []).filter((l) => l.roundId === r.id) }));
    const { data: locks } = await supabase.from('sahamit_fc_locks').select('*').eq('customerId', customerId);
    const flags = detectFlags(roundsWithLines, locks || []);
    if (flags.length) {
      const flagRows = flags.map((f) => ({
        id: 'FCF-' + randomUUID(), customerId, fgCode: f.fgCode, month: f.month, roundNo: f.roundNo,
        prevQty: f.prevQty, newQty: f.newQty, drop: f.drop, kind: f.kind, status: 'open',
        shiftToMonth: f.shiftToMonth || null, createdAt: nowIso,
      }));
      await supabase.from('sahamit_fc_flags').upsert(flagRows, { onConflict: 'customerId,fgCode,month,roundNo,kind', ignoreDuplicates: true });
    }
  } catch (e) {
    console.error('[sahamit] flag detection failed', e?.message || e);
  }

  return Response.json(
    { ...round, lines: lineRows, unknownFgCodes: [...unknown] },
    { status: 201 },
  );
}
