import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { buildReconMatrix } from '@/lib/sahamit/reconcileClient';
import { materialView } from '@/lib/sahamit/material';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/material — every active PO line enriched with its lead-time
// view (in-FC/out-FC, leadDays, recommended readyDate, lateness flags) plus its
// saved PM/RM tracking. Reuses the reconcile matrix to decide in-FC. Scoped.
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;

  // FC rounds (+lines)
  const { data: rounds, error: rErr } = await supabase
    .from('sahamit_forecast_rounds').select('*').eq('customerId', customerId);
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });
  const roundIds = (rounds || []).map((r) => r.id);
  let fcLines = [];
  if (roundIds.length) {
    const { data, error } = await supabase.from('sahamit_forecast_lines').select('*').in('roundId', roundIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    fcLines = data || [];
  }
  const roundsWithLines = (rounds || []).map((r) => ({ ...r, lines: fcLines.filter((l) => l.roundId === r.id) }));

  // POs (+lines)
  const { data: pos, error: pErr } = await supabase
    .from('sahamit_pos').select('*').eq('customerId', customerId);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  const poIds = (pos || []).map((p) => p.id);
  let poLines = [];
  if (poIds.length) {
    const { data, error } = await supabase.from('sahamit_po_lines').select('*').in('poId', poIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    poLines = data || [];
  }
  const posWithLines = (pos || []).map((p) => ({ ...p, lines: poLines.filter((l) => l.poId === p.id) }));

  // holidays → Set('YYYY-MM-DD')
  const { data: hol } = await supabase.from('holidays').select('date');
  const holidays = new Set((hol || []).map((h) => h.date));

  // saved tracking, keyed by poLineId
  const { data: trk } = await supabase
    .from('sahamit_material_tracking').select('*').eq('customerId', customerId);
  const trackingByLine = new Map((trk || []).map((t) => [t.poLineId, t]));

  // effective FC lookup (fgCode||month -> fcQty) from the reconcile matrix
  const matrix = buildReconMatrix(roundsWithLines, posWithLines);
  const fcLookup = new Map();
  for (const row of matrix.rows) for (const m of matrix.months) fcLookup.set(`${row.fgCode}||${m}`, row.cells[m]?.fcQty || 0);

  const poById = new Map((pos || []).map((p) => [p.id, p]));
  const rows = [];
  for (const line of poLines) {
    if (line.status === 'cancelled') continue;
    const po = poById.get(line.poId);
    const fcQty = fcLookup.get(`${line.fgCode}||${line.deliveryMonth}`) || 0;
    const view = materialView(line, fcQty, po?.receivedDate, holidays);
    const t = trackingByLine.get(line.id) || null;
    rows.push({
      poLineId: line.id,
      poNumber: po?.poNumber || '',
      receivedDate: po?.receivedDate || null,
      fgCode: line.fgCode,
      productName: line.productName,
      qty: line.qty,
      deliveryMonth: line.deliveryMonth,
      dueDate: line.dueDate,
      expectedDate: line.expectedDate,
      actualDeliveredDate: line.actualDeliveredDate,
      status: line.status,
      ...view, // inForecast, leadDays, readyDate, lateVsDue, ourSlip
      tracking: t ? {
        pmDueDate: t.pmDueDate, pmArrivedAt: t.pmArrivedAt,
        rmDueDate: t.rmDueDate, rmArrivedAt: t.rmArrivedAt, note: t.note,
      } : null,
    });
  }

  // Soonest recommended ready date first; lines without a date go last.
  rows.sort((a, b) => (a.readyDate || '9999').localeCompare(b.readyDate || '9999'));
  return Response.json(rows);
}
