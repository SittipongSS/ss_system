import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields, isSuperuser } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations, insertOrderItems, updateOrderResilient } from '@/lib/tax/orders';
import { recordAudit } from '@/lib/audit';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { purgeAttachments } from '@/lib/master/attachments';
import { orderStatusUpdate } from '@/lib/master/recordUpdates';
import { exciseTaxLineForRegistration, exciseTaxTotals } from '@/lib/tax/exciseBilling';

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

  // Duplicate quotation = hard block on rename too (เลขที่ใบเสนอราคา ห้ามซ้ำ),
  // excluding this order. The '-' placeholder is exempt.
  if (updates.quotationRef !== undefined) {
    const q = String(updates.quotationRef || '').trim();
    if (q && q !== '-') {
      const { data: dupQuote, error: dupQuoteError } = await supabase
        .from('orders').select('id').eq('quotationRef', q).neq('id', id).maybeSingle();
      if (dupQuoteError) return Response.json({ error: dupQuoteError.message }, { status: 500 });
      if (dupQuote) {
        return Response.json({ error: `เลขที่ใบเสนอราคานี้ถูกใช้แล้วในใบยื่น ${dupQuote.id} — ห้ามซ้ำ` }, { status: 409 });
      }
    }
  }

  // ── Status transition gate ──
  // sales:act  : draft → pending → received, rejected → received, complete → delivered
  // legal:approve : received → filing → complete, + rejected, + revert to received
  if (body.status !== undefined && body.status !== order.status) {
    const target = body.status;
    const salesTargets = ['pending', 'received', 'delivered'];
    const legalTargets = ['received', 'filing', 'complete', 'rejected'];
    const ok = (isSales && salesTargets.includes(target)) || (isLegal && legalTargets.includes(target));
    if (!ok) {
      return Response.json({ error: 'ไม่อนุญาตให้เปลี่ยนสถานะนี้' }, { status: 403 });
    }
    updates.status = target;
    if (target === 'pending' && order.status !== 'draft') {
      return Response.json({ error: 'ส่งเข้าคิวเก็บเงินได้จากฉบับร่างเท่านั้น' }, { status: 400 });
    }
    if (target === 'received' && !['pending', 'rejected'].includes(order.status)) {
      return Response.json({ error: 'ยืนยันรับเงินได้จากรายการรอรับเงินหรือรายการที่แก้ไขแล้วเท่านั้น' }, { status: 400 });
    }
    if (target === 'delivered' && order.status !== 'complete') {
      return Response.json({ error: 'ยืนยันส่งเอกสารได้หลังชำระภาษีแล้วเท่านั้น' }, { status: 400 });
    }
    // เริ่มยื่น (received → filing): LG must record the เลขที่ใบกำกับภาษี first.
    // Accept it from this request or an already-stored value. Exempt orders skip
    // 'filing' entirely (received → complete) so they're never gated here.
    if (target === 'filing' && order.status === 'received') {
      const invoiceNo = String(
        updates.taxInvoiceNumber !== undefined ? updates.taxInvoiceNumber : order.taxInvoiceNumber || '',
      ).trim();
      if (!invoiceNo) {
        return Response.json({ error: 'กรุณาระบุเลขที่ใบกำกับภาษีก่อนเริ่มยื่น' }, { status: 400 });
      }
      updates.taxInvoiceNumber = invoiceNo;
    }
    if (target === 'complete') {
      // Filing done: stamp who/when + the clearance timestamp.
      updates.clearedAt = new Date().toISOString();
      updates.filedAt = new Date().toISOString();
      updates.filedBy = user?.id ?? null;
      updates.filedByName = user?.name ?? null;
    }
    if (target === 'received' && order.status === 'pending') {
      updates.collectedConfirmedAt = new Date().toISOString();
      updates.collectedConfirmedBy = user?.id ?? null;
    }
    if (target === 'delivered') {
      updates.docsDeliveredAt = new Date().toISOString();
      updates.docsDeliveredBy = user?.id ?? null;
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

    // อัตราภาษีอ่านจาก **สินค้า** (ราคาขายปลีกของ FG) ด้วยตัวคิดกลางตัวเดียวกับ
    // POST /api/orders และทางที่ออกใบยื่นจาก Sale Order — เดิมสามที่คิดคนละสูตร
    const productIds = [...new Set([...regMap.values()].map((r) => r.productId).filter(Boolean))];
    const { data: taxProducts, error: taxProdErr } = productIds.length
      ? await supabase.from('products').select('id, fgCode, exciseTax, localTax').in('id', productIds)
      : { data: [], error: null };
    if (taxProdErr) return Response.json({ error: taxProdErr.message }, { status: 500 });
    const productMap = new Map((taxProducts || []).map((p) => [p.id, p]));

    newItemRows = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const reg = regMap.get(it.registrationId);
      if (!reg) return Response.json({ error: `ไม่พบทะเบียน ${it.registrationId}` }, { status: 404 });
      const qty = parseInt(it.quantity);
      if (!qty || qty < 1) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
      const product = productMap.get(reg.productId);
      if (!product) {
        return Response.json({ error: `ไม่พบสินค้าของทะเบียน ${reg.fgCode || reg.id} — คิดอัตราภาษีไม่ได้` }, { status: 400 });
      }
      const taxLine = exciseTaxLineForRegistration({ registration: reg, product, quantity: qty });
      newItemRows.push({
        id: `OIT-${id.slice(3)}-${i + 1}`,
        orderId: id,
        registrationId: reg.id,
        productId: reg.productId,
        salePrice: it.salePrice != null && it.salePrice !== '' ? Number(it.salePrice) : null,
        ...taxLine,
      });
    }
    const rollup = exciseTaxTotals(newItemRows);
    updates.totalExciseTax = rollup.totalExciseTax;
    updates.totalLocalTax = rollup.totalLocalTax;
    updates.totalTax = rollup.totalTax;
  }

  const { error: updErr } = await updateOrderResilient(supabase, id, updates);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  // Swap line items after the header update succeeds. ids reuse the order
  // suffix so we must delete the old set before inserting the new one.
  if (newItemRows) {
    await supabase.from('order_items').delete().eq('orderId', id);
    const { error: itemsErr } = await insertOrderItems(supabase, newItemRows);
    if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await attachRegistrations(supabase, data);
  const summary = body.status && body.status !== order.status
    ? `เปลี่ยนสถานะใบยื่น ${id}: ${order.status} → ${body.status}` : null;
  // เหตุการณ์ลงเธรด — ไม่เช็ค error โดยเจตนา
  // ⭐ ยื่นใหม่หลังถูกตีกลับล้าง `rejectionReason` เป็น null (บรรทัด ~131) →
  // เหตุผลรอบก่อนหายถาวร · ใช้ `body.rejectionReason` ไม่ใช่แถวหลังอัปเดต
  if (body.status && body.status !== order.status) {
    const threadEvent = orderStatusUpdate(body.status, {
      reason: body.rejectionReason, fromStatus: order.status,
    });
    if (threadEvent) {
      await appendUpdate(supabase, { entityType: 'excise_order', entityId: id, ...threadEvent, user });
    }
  }
  // Audit เก็บ header แบบ plain — ตัด items/registrations ที่ฝังมา (ORDER_SELECT +
  // attachRegistrations) ออก กันบวมและให้ changedKeys เทียบกับ before (plain) ได้ตรง.
  const { items: _items, registrations: _regs, ...plainAfter } = data;
  await recordAudit({ user, action: 'update', entityType: 'order', entityId: id, before: order, after: plainAfter, summary, request });
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
  const locked = order.receiptNumber || order.clearedAt || ['complete', 'delivered'].includes(order.status);
  if (locked && !isSuperuser(user?.role)) {
    return Response.json(
      { error: 'รายการนี้เข้าสู่ขั้นตอนภาษีแล้ว ต้องเป็นผู้ดูแลระบบจึงจะลบได้' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.from('orders').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  /* เธรดกลางกับไฟล์แนบเป็น polymorphic ไม่มี FK → ต้องกวาดเอง **ทั้งคู่**
     🐞 เดิมกวาดแต่เธรด ⇒ แถวไฟล์แนบของใบที่ถูกลบค้างชี้ไปยัง id ที่ไม่มีแล้ว และไฟล์
     บน Drive ก็ค้างตาม · วัดบน prod 2026-08-25: แถวกำพร้าชนิด `order` 2 แถว มาจาก
     ตรงนี้ทั้งคู่ (ไปโผล่ที่หน้าตั้งค่า → ที่เก็บไฟล์ ให้แอดมินมานั่งกดล้างทีหลัง) */
  await purgeUpdates(supabase, 'excise_order', id);
  await purgeAttachments('order', id);
  await recordAudit({ user, action: 'delete', entityType: 'order', entityId: id, before: order, request });
  return Response.json({ success: true, message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' });
}
