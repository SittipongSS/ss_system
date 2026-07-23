import { randomUUID } from 'crypto';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';
import { refreshSahamitFlags } from '@/lib/sahamit/flagsSync';
import { renumberRoundsByDate } from '@/lib/sahamit/roundOrder';

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
// roundNo = chronological order by receivedDate (a backfilled historical round
// slots in between and later rounds shift up — see lib/sahamit/roundOrder).
// fgCodes are resolved against AR-109's catalog; unknown codes are stored
// anyway (productId=null) and reported back.
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

  // Insert at the end (max+1 never collides with the unique index); the round
  // is then renumbered into its chronological slot by receivedDate below, so a
  // backfilled historical round doesn't get read as the "latest" round.
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

  // Slot the round into chronological order by receivedDate (backfill support).
  // Best-effort: a failure leaves valid append-order numbering, never a broken write.
  try {
    const changes = await renumberRoundsByDate(supabase, customerId);
    const mine = changes.find((c) => c.id === roundId);
    if (mine) round.roundNo = mine.to;
  } catch (e) {
    console.error('[sahamit] round renumber failed', e?.message || e);
  }

  await recordAudit({
    user, action: 'create', entityType: 'sahamit_forecast_round', entityId: roundId,
    after: round, summary: `สร้าง FC รอบที่ ${round.roundNo} (${lineRows.length} รายการ)`, request,
  });

  // Shift/cut/PO-fill audit — recompute ทุกคู่รอบ, PO-aware, คงการตัดสินของคน.
  // Best-effort: อย่าให้พังการสร้างรอบ.
  try {
    await refreshSahamitFlags(supabase, customerId);
  } catch (e) {
    console.error('[sahamit] flag refresh failed', e?.message || e);
  }

  return Response.json(
    { ...round, lines: lineRows, unknownFgCodes: [...unknown] },
    { status: 201 },
  );
}
