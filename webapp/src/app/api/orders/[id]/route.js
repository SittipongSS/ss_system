import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields, isSuperuser } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations } from '@/lib/tax/orders';

export const dynamic = 'force-dynamic';
// GET /api/orders/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  if (!canViewRecord(user, 'orders', data)) {
    return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  }
  await attachRegistrations(supabase, data);
  return Response.json(data);
}

// PATCH /api/orders/[id] — PO-header / workflow fields only.
// Editing line items (qty/add/remove) is not supported in v1.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });

  if (!canEditRecord(user, 'orders', order)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Sales own the PO header + S&S receipt; legal own the excise/tax fields.
  // allowedEditFields keeps a sales user out of the excise columns and a
  // legal user out of the commercial header. Status is handled explicitly
  // below (per-capability transition gate), not via this generic copy.
  const salesEditable = ['quotationRef', 'poReference', 'deliveryDate', 'remarks', 'assignee', 'receiptNumber'];
  const allowed = allowedEditFields(user, 'orders', salesEditable);
  const isLegal = can(user?.role, 'legal:approve');
  const isSales = can(user?.role, 'sales:act');

  const updates = {};
  for (const k of allowed) if (k !== 'status' && body[k] !== undefined) updates[k] = body[k];

  // ── Status transition gate ──
  // sales:act  : pending → received, and rejected → received (resubmit)
  // legal:approve : received → filing → complete, + rejected, + revert to received
  if (body.status !== undefined && body.status !== order.status) {
    const target = body.status;
    const salesTargets = ['received'];
    const legalTargets = ['received', 'filing', 'complete', 'rejected'];
    const ok = (isSales && salesTargets.includes(target)) || (isLegal && legalTargets.includes(target));
    if (!ok) {
      return Response.json({ error: 'ไม่อนุญาตให้เปลี่ยนสถานะนี้' }, { status: 403 });
    }
    updates.status = target;
    if (target === 'complete') {
      // Filing done: stamp who/when + the clearance timestamp.
      updates.clearedAt = new Date().toISOString();
      updates.filedAt = new Date().toISOString();
      updates.filedBy = user?.id ?? null;
      updates.filedByName = user?.name ?? null;
    }
    if (target === 'rejected') {
      if (!body.rejectionReason || !String(body.rejectionReason).trim()) {
        return Response.json({ error: 'กรุณาระบุเหตุผลที่ตีกลับ' }, { status: 400 });
      }
    }
    // Resubmit: Sales fixed a rejected order and sends it back to LG's queue.
    if (target === 'received' && order.status === 'rejected') {
      updates.rejectionReason = null;
    }
  }

  // ── Line-item edit (sales-owned) ──
  // Only while the order is still editable (pending or rejected/resubmit).
  // Replaces all line items and recomputes the tax rollups.
  let newItemRows = null;
  if (Array.isArray(body.items) && isSales && (order.status === 'pending' || order.status === 'rejected')) {
    const items = body.items.filter((it) => it.registrationId && it.quantity);
    if (items.length === 0) {
      return Response.json({ error: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    const regIds = [...new Set(items.map((it) => it.registrationId))];
    const { data: regs, error: regErr } = await supabase
      .from('excise_registrations').select('*').in('id', regIds);
    if (regErr) return Response.json({ error: regErr.message }, { status: 500 });
    const regMap = new Map((regs || []).map((r) => [r.id, r]));

    // Every line's registration must be approved + belong to the order's
    // customer (legacy orders without a customerId skip the ownership check).
    for (const r of regMap.values()) {
      if (order.customerId && r.customerId !== order.customerId) {
        return Response.json({ error: `ทะเบียน ${r.fgCode} ไม่ใช่ของลูกค้ารายนี้` }, { status: 400 });
      }
      if (r.status !== 'approved') {
        return Response.json({ error: `ทะเบียน ${r.fgCode} ยังไม่ได้รับการอนุมัติ` }, { status: 400 });
      }
    }

    let totalExciseTax = 0, totalLocalTax = 0;
    newItemRows = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const reg = regMap.get(it.registrationId);
      if (!reg) return Response.json({ error: `ไม่พบทะเบียน ${it.registrationId}` }, { status: 404 });
      const qty = parseInt(it.quantity);
      if (!qty || qty < 1) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
      const itemExcise = (reg.exciseTax || 0) * qty;
      const itemLocal = (reg.localTax || 0) * qty;
      totalExciseTax += itemExcise;
      totalLocalTax += itemLocal;
      newItemRows.push({
        id: `OIT-${id.slice(3)}-${i + 1}`,
        orderId: id,
        registrationId: reg.id,
        productId: reg.productId,
        quantity: qty,
        totalExciseTax: itemExcise,
        totalLocalTax: itemLocal,
        totalTax: itemExcise + itemLocal,
      });
    }
    updates.totalExciseTax = totalExciseTax;
    updates.totalLocalTax = totalLocalTax;
    updates.totalTax = totalExciseTax + totalLocalTax;
  }

  const { error: updErr } = await supabase.from('orders').update(updates).eq('id', id);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  // Swap line items after the header update succeeds. ids reuse the order
  // suffix so we must delete the old set before inserting the new one.
  if (newItemRows) {
    await supabase.from('order_items').delete().eq('orderId', id);
    const { error: itemsErr } = await supabase.from('order_items').insert(newItemRows);
    if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await attachRegistrations(supabase, data);
  return Response.json(data);
}

// DELETE /api/orders/[id] — order_items cascade via FK on delete cascade.
// Scope: supervisor (any team) or senior_ae (own team). Orders already in the
// tax workflow (filed / has receipt / completed) may be deleted by supervisor
// only.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });

  if (!canDeleteRecord(user, 'orders', order)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  // Tax-locked orders: superuser only.
  const locked = order.receiptNumber || order.clearedAt || order.status === 'complete';
  if (locked && !isSuperuser(user?.role)) {
    return Response.json(
      { error: 'รายการนี้เข้าสู่ขั้นตอนภาษีแล้ว ต้องเป็นผู้ดูแลระบบจึงจะลบได้' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.from('orders').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' });
}
