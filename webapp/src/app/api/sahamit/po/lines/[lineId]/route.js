import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { deliveryMonthOf, cleanDestination } from '@/lib/sahamit/po';
import { insertPoLinesTolerant, updatePoLineTolerant } from '@/lib/sahamit/poServer';
import { refreshSahamitFlags } from '@/lib/sahamit/flagsSync';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function loadLine(supabase, customerId, lineId) {
  const { data } = await supabase
    .from('sahamit_po_lines').select('*').eq('id', lineId).eq('customerId', customerId).maybeSingle();
  return data;
}

// PATCH /api/sahamit/po/lines/[lineId]
//   Normal edit  : { qty?, dueDate?, expectedDate?, actualDeliveredDate?, status?, rescheduleReason? }
//                  Changing expectedDate appends the previous value to
//                  expectedHistory (loophole C4: keep every reschedule, >1 ok).
//                  Setting actualDeliveredDate marks the line delivered.
//   Split        : { action:'split', splitQty, dueDate?, expectedDate? }
//                  Moves splitQty into a new balance line; parent → partial.
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { lineId } = await params;

  const line = await loadLine(supabase, customerId, lineId);
  if (!line) return Response.json({ error: 'ไม่พบรายการ PO นี้' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // ── Split ──────────────────────────────────────────────────────────
  if (body?.action === 'split') {
    const splitQty = Number(body.splitQty);
    if (!Number.isFinite(splitQty) || splitQty <= 0 || splitQty >= Number(line.qty)) {
      return Response.json({ error: 'จำนวนที่แยกต้องมากกว่า 0 และน้อยกว่าจำนวนคงเหลือของบรรทัด' }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const balance = {
      id: 'SPL-' + randomUUID(),
      poId: line.poId,
      customerId,
      productId: line.productId,
      fgCode: line.fgCode,
      productName: line.productName,
      qty: splitQty,
      dueDate: body.dueDate || line.dueDate,
      expectedDate: body.expectedDate || line.expectedDate,
      destination: line.destination ?? null,
      expectedHistory: [],
      actualDeliveredDate: null,
      deliveryMonth: deliveryMonthOf({ expectedDate: body.expectedDate || line.expectedDate, dueDate: body.dueDate || line.dueDate }),
      splitFromPoLineId: line.id,
      status: 'open',
      createdAt: nowIso,
    };
    const insErr = await insertPoLinesTolerant(supabase, [balance]);
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

    const { data: parent, error: updErr } = await supabase
      .from('sahamit_po_lines')
      .update({ qty: Number(line.qty) - splitQty, status: line.status === 'delivered' ? 'delivered' : 'partial' })
      .eq('id', line.id).eq('customerId', customerId).select().single();
    if (updErr) {
      await supabase.from('sahamit_po_lines').delete().eq('id', balance.id);
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    await recordAudit({
      user, action: 'update', entityType: 'sahamit_po_line', entityId: line.id,
      before: line, after: parent, summary: `แยก PO line ${line.fgCode} ออก ${splitQty}`, request,
    });
    return Response.json({ parent, balance });
  }

  // ── Normal edit ─────────────────────────────────────────────────────
  const patch = {};
  if ('qty' in body) {
    const q = Number(body.qty);
    if (!Number.isFinite(q) || q <= 0) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
    patch.qty = q;
  }
  if ('dueDate' in body) patch.dueDate = body.dueDate || null;

  // Reschedule: log the previous expectedDate before overwriting.
  if ('expectedDate' in body && (body.expectedDate || null) !== (line.expectedDate || null)) {
    const history = Array.isArray(line.expectedHistory) ? [...line.expectedHistory] : [];
    history.push({
      expectedDate: line.expectedDate || null,
      changedAt: new Date().toISOString(),
      reason: body.rescheduleReason || null,
    });
    patch.expectedDate = body.expectedDate || null;
    patch.expectedHistory = history;
  }

  if ('actualDeliveredDate' in body) {
    patch.actualDeliveredDate = body.actualDeliveredDate || null;
    if (body.actualDeliveredDate && !('status' in body)) patch.status = 'delivered';
  }
  if ('status' in body) patch.status = body.status;
  if ('destination' in body) patch.destination = cleanDestination(body.destination);

  // Recompute the FC-matching month if either date moved.
  if ('expectedDate' in patch || 'dueDate' in patch) {
    patch.deliveryMonth = deliveryMonthOf({
      expectedDate: 'expectedDate' in patch ? patch.expectedDate : line.expectedDate,
      dueDate: 'dueDate' in patch ? patch.dueDate : line.dueDate,
    });
  }

  if (!Object.keys(patch).length) return Response.json(line);

  const { data: updated, error } = await updatePoLineTolerant(supabase, lineId, customerId, patch);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'update', entityType: 'sahamit_po_line', entityId: lineId,
    before: line, after: updated, summary: `แก้ไข PO line ${updated.fgCode}`, request,
  });

  // แก้จำนวน/ยกเลิกบรรทัด กระทบยอด PO ที่หักยอด FC ลด — รีเฟรชธง. Best-effort.
  try { await refreshSahamitFlags(supabase, customerId); } catch (e) { console.error('[sahamit] flag refresh failed', e?.message || e); }

  return Response.json(updated);
}

// DELETE /api/sahamit/po/lines/[lineId] — remove a single line. Scoped.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { lineId } = await params;

  const line = await loadLine(supabase, customerId, lineId);
  if (!line) return Response.json({ error: 'ไม่พบรายการ PO นี้' }, { status: 404 });

  const { error } = await supabase
    .from('sahamit_po_lines').delete().eq('id', lineId).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  try { await refreshSahamitFlags(supabase, customerId); } catch (e) { console.error('[sahamit] flag refresh failed', e?.message || e); }

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_po_line', entityId: lineId,
    before: line, summary: `ลบ PO line ${line.fgCode}`, request,
  });
  return Response.json({ ok: true });
}
