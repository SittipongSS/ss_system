import { randomUUID } from 'crypto';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';
import { detectFlags } from '@/lib/sahamit/flags';

export const dynamic = 'force-dynamic';

// Re-detect shift/cut flags across all rounds after a create/edit. Best-effort —
// never let it break the write. (Same routine POST uses.)
async function refreshFlags(supabase, customerId, nowIso) {
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
}

// PATCH /api/sahamit/forecast/rounds/[id] — edit a round (fix a wrong/forgotten
// entry). Updates the header (receivedDate/note/coverMonths) and REPLACES the
// round's lines wholesale. Rounds are editable by decision (option B) — counting
// stays per-entry but a mislogged round can be corrected. Scoped to AR-109.
// Body: { receivedDate?, note?, coverMonths?, lines:[{fgCode, month, qty}] }
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { data: round } = await supabase
    .from('sahamit_forecast_rounds').select('*')
    .eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!round) return Response.json({ error: 'ไม่พบรอบ FC นี้' }, { status: 404 });

  const receivedDate = body?.receivedDate || round.receivedDate;
  if (!receivedDate) return Response.json({ error: 'ต้องระบุวันที่รับ FC (receivedDate)' }, { status: 400 });

  const cleaned = (Array.isArray(body?.lines) ? body.lines : [])
    .map((l) => ({ fgCode: String(l.fgCode || '').trim(), month: String(l.month || '').trim(), qty: Number(l.qty) }))
    .filter((l) => l.fgCode && /^\d{4}-\d{2}$/.test(l.month) && Number.isFinite(l.qty) && l.qty > 0);
  if (!cleaned.length) return Response.json({ error: 'ไม่มีรายการ FC ที่ถูกต้อง (ต้องมีรหัสสินค้า เดือน YYYY-MM และจำนวน > 0)' }, { status: 400 });

  let products;
  try {
    products = await loadSahamitProducts(supabase, customerId);
  } catch (e) {
    return Response.json({ error: `อ่านแคตตาล็อกสินค้าไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  const index = indexByFgCode(products);
  const unknown = new Set();

  const coverMonths = Array.isArray(body?.coverMonths) && body.coverMonths.length
    ? [...new Set(body.coverMonths)].sort()
    : [...new Set(cleaned.map((l) => l.month))].sort();
  const note = body?.note !== undefined ? body.note : round.note;
  const nowIso = new Date().toISOString();

  // Keep the old lines so we can restore them if the re-insert fails (no txn).
  const { data: oldLines } = await supabase
    .from('sahamit_forecast_lines').select('*').eq('roundId', id);

  const { error: uErr } = await supabase
    .from('sahamit_forecast_rounds')
    .update({ receivedDate, note, coverMonths, updatedAt: nowIso })
    .eq('id', id).eq('customerId', customerId);
  if (uErr) return Response.json({ error: uErr.message }, { status: 500 });

  const { error: dErr } = await supabase.from('sahamit_forecast_lines').delete().eq('roundId', id);
  if (dErr) return Response.json({ error: dErr.message }, { status: 500 });

  const lineRows = cleaned.map((l) => {
    const r = resolveFgCode(index, l.fgCode);
    if (!r.known) unknown.add(l.fgCode);
    return {
      id: 'FCL-' + randomUUID(), roundId: id, customerId,
      productId: r.productId, fgCode: l.fgCode, productName: r.productName,
      month: l.month, qty: l.qty, createdAt: nowIso,
    };
  });

  const { error: lErr } = await supabase.from('sahamit_forecast_lines').insert(lineRows);
  if (lErr) {
    // Best-effort restore of the previous lines so we don't leave the round empty.
    if (oldLines?.length) await supabase.from('sahamit_forecast_lines').insert(oldLines);
    return Response.json({ error: lErr.message }, { status: 500 });
  }

  const after = { ...round, receivedDate, note, coverMonths, updatedAt: nowIso };
  await recordAudit({
    user, action: 'update', entityType: 'sahamit_forecast_round', entityId: id,
    before: round, after,
    summary: `แก้ FC รอบที่ ${round.roundNo} (${lineRows.length} รายการ)`, request,
  });

  await refreshFlags(supabase, customerId, nowIso);

  return Response.json({ ...after, lines: lineRows, unknownFgCodes: [...unknown] });
}

// DELETE /api/sahamit/forecast/rounds/[id] — remove a round (lines cascade via
// the FK in migration 0051). Scoped to AR-109 so a stray id from another
// customer can't be deleted through this module.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: round } = await supabase
    .from('sahamit_forecast_rounds')
    .select('*')
    .eq('id', id)
    .eq('customerId', customerId)
    .maybeSingle();
  if (!round) return Response.json({ error: 'ไม่พบรอบ FC นี้' }, { status: 404 });

  const { error } = await supabase
    .from('sahamit_forecast_rounds')
    .delete()
    .eq('id', id)
    .eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_forecast_round', entityId: id,
    before: round, summary: `ลบ FC รอบที่ ${round.roundNo}`, request,
  });

  return Response.json({ ok: true });
}
