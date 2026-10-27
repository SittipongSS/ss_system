import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields, isSalesManager } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations, insertOrderItems, stampExemptFlags, updateOrderResilient } from '@/lib/tax/orders';
import { recordAudit } from '@/lib/audit';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { purgeAttachments } from '@/lib/master/attachments';
import { orderStatusUpdate } from '@/lib/master/recordUpdates';
import { billedTaxTotals, exciseTaxLineForRegistration, exciseTaxTotals } from '@/lib/tax/exciseBilling';
import { FILING_EDITABLE_STATUSES, filingTransitionError } from '@/lib/excise/workflow';
import { filingItemRows, filingTotalsOf, resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { genId } from '@/lib/id';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { customerTaxSiblingIds } from '@/lib/master/customerTaxSiblings';

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

  // Sales own the PO header + S&S receipt; RA own the excise/tax fields.
  // allowedEditFields keeps a sales user out of the excise columns and a
  // RA user out of the commercial header. Status is handled explicitly
  // below (per-capability transition gate), not via this generic copy.
  const salesEditable = ['quotationRef', 'poReference', 'deliveryDate', 'remarks', 'assignee', 'receiptNumber'];
  const allowed = allowedEditFields(user, 'orders', salesEditable);
  const isLegal = can(user?.role, 'ra:approve');
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
  /* ⭐ ตารางเดียว (FILING_TRANSITIONS · lib/excise/workflow) ตัดสิน "มาจากไหน · ใครทำ · ต้องมีอะไร"
     ของทุกปลายทาง — ตรวจระบบ 2026-10-26 ข้อ 4: เดิมเช็กต้นทางแค่ 3 ปลายทาง ⇒ RA ปิดงาน "ชำระแล้ว"
     จากร่าง/รอรับเงินได้ (ข้ามการรับเงินจากลูกค้า) · ตีกลับใบที่ชำระแล้วได้ · เลขใบเสร็จบังคับแค่บนจอ
     ⚠️ "ยกเว้นภาษี" ตัดสินจากทะเบียนของรายการ (`stampExemptFlags` → isExemptFiling) ไม่ใช่ยอด 0 —
        ใบยกเว้นไม่ต้องมีเลขใบเสร็จ และข้ามขั้นกำลังยื่นได้ (รับเงินแล้ว → ชำระแล้ว) */
  if (body.status !== undefined && body.status !== order.status) {
    const target = body.status;
    let exempt = false;
    if (['received', 'filing', 'complete'].includes(target)) {
      const { data: exemptItems, error: exemptErr } = await fetchAllResult(() => supabase
        .from('order_items').select('id, registrationId, totalTax, quantity').eq('orderId', id)
        .order('id', { ascending: true }));
      if (exemptErr) return Response.json({ error: exemptErr.message }, { status: 500 });
      try {
        [{ taxExempt: exempt }] = await stampExemptFlags(supabase, [{ ...order, items: exemptItems || [] }]);
      } catch (e) {
        return Response.json({ error: `ตรวจทะเบียนของรายการไม่สำเร็จ: ${e?.message || 'ระบบขัดข้อง'}` }, { status: 500 });
      }
    }
    // ช่องบังคับนับทั้งค่าที่ส่งมากับคำขอนี้ และค่าที่เก็บไว้บนใบแล้ว (ส่งเลขมารอบก่อนก็ผ่าน)
    const fields = {
      receiptNumber: updates.receiptNumber !== undefined ? updates.receiptNumber : order.receiptNumber,
      taxInvoiceNumber: updates.taxInvoiceNumber !== undefined ? updates.taxInvoiceNumber : order.taxInvoiceNumber,
      exciseReceiptNumber: updates.exciseReceiptNumber !== undefined ? updates.exciseReceiptNumber : order.exciseReceiptNumber,
      rejectionReason: body.rejectionReason,
    };
    const blocked = filingTransitionError({
      from: order.status, to: target, caps: { sales: isSales, ra: isLegal }, exempt, fields,
    });
    if (blocked) return Response.json({ error: blocked.error }, { status: blocked.status });
    updates.status = target;
    // ตัดช่องว่างหัวท้ายของเลขเอกสารที่ส่งมาในจังหวะเปลี่ยนสถานะ — ค่าที่ผ่านด่านคือค่าที่ลงฐาน
    for (const key of ['receiptNumber', 'taxInvoiceNumber', 'exciseReceiptNumber']) {
      if (typeof updates[key] === 'string') updates[key] = updates[key].trim();
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
    // Resubmit: Sales fixed a rejected order and sends it back to RA's queue.
    if (target === 'received' && order.status === 'rejected') {
      updates.rejectionReason = null;
    }
  }

  // ── Line-item edit (sales-owned) ──
  // Only while the order is still editable (FILING_EDITABLE_STATUSES — ชุดเดียวกับปุ่มบนจอ).
  // Replaces all line items and recomputes the tax rollups.
  const lineEditable = isSales && FILING_EDITABLE_STATUSES.includes(order.status);
  let newItemRows = null;

  /* ⭐ ใบยื่นจากใบสั่งขาย: แก้รายการได้ทางเดียว = **คิดใหม่จาก SO** (ตรวจระบบ 2026-10-26 ข้อ 3)
     🐞 เดิมฟอร์มเลือกทะเบียนส่ง `items` มา แล้วด่านข้างล่างทิ้งบรรทัดที่ `registrationId` ว่างเงียบ ๆ ⇒ ยอดหด ·
        ทุกบรรทัดไม่มีทะเบียน = 400 ส่งกลับไม่ได้เลย · แถวใหม่ยังทิ้ง `salesOrderLineId`
     มติ 2026-07-22 ข้อ 4: ทะเบียนเป็นแค่คำเตือนของใบจาก SO ⇒ ต้องคิดผ่าน resolver ตัวเดียวกับตอนสร้าง
     (อัตราของสินค้า ณ ตอนนี้ · จำนวนจากบรรทัด SO) ไม่ใช่ด่าน "ทะเบียนต้องอนุมัติ" ของใบยื่นมือ */
  if (order.salesOrderId && Array.isArray(body.items)) {
    return Response.json({
      error: 'ใบยื่นนี้สร้างจากใบสั่งขาย — แก้รายการด้วย "คิดภาษีใหม่จากใบสั่งขาย" ไม่ใช่เลือกทะเบียนทีละรายการ',
    }, { status: 400 });
  }
  if (body.recalcFromSalesOrder === true) {
    if (!order.salesOrderId) {
      return Response.json({ error: 'ใบยื่นนี้ไม่ได้สร้างจากใบสั่งขาย' }, { status: 400 });
    }
    if (!lineEditable) {
      return Response.json({ error: 'คิดภาษีใหม่ได้เฉพาะใบที่ยังไม่ยืนยันรับเงิน หรือใบที่ถูกตีกลับ (ฝ่ายขาย)' }, { status: 403 });
    }
    // ด่านเดียวกับตอนสร้างใบจาก SO (POST from-sales-order: inSalesEditScope ของดีลแม่) — โหลดกับตรวจในจังหวะเดียว
    const scoped = await loadScoped(supabase, 'sales_orders', order.salesOrderId, user, 'edit');
    if (scoped.response) return scoped.response;
    // select('*') ของบรรทัด = มี packQty เสมอ (จำนวนที่ยื่น = แพ็ค × จำนวน · ด่าน linePackReaders)
    const { data: soLines, error: linesErr } = await fetchAllResult(() => supabase
      .from('sales_order_lines').select('*').eq('salesOrderId', order.salesOrderId)
      .order('id', { ascending: true }));
    if (linesErr) return Response.json({ error: linesErr.message }, { status: 500 });
    const salesOrder = { ...scoped.row, lines: soLines || [] };
    if (isHistoricalOrder(salesOrder)) {
      return Response.json({ error: 'ใบสั่งขายย้อนหลังไม่ใช้คิดภาษีในระบบ' }, { status: 400 });
    }
    let resolved;
    try {
      resolved = await resolveSalesOrderFiling(supabase, salesOrder);
    } catch (e) {
      return Response.json({ error: `คิดภาษีจากใบสั่งขายไม่สำเร็จ: ${e?.message || 'ระบบขัดข้อง'}` }, { status: 500 });
    }
    if (!resolved.lines.length) {
      return Response.json({ error: 'ใบสั่งขายต้นทางไม่มีรายการสินค้าสรรพสามิตให้คิดภาษีแล้ว' }, { status: 400 });
    }
    newItemRows = filingItemRows(id, resolved.lines);
    Object.assign(updates, filingTotalsOf(resolved));
  }

  if (Array.isArray(body.items) && lineEditable) {
    const items = body.items.filter((it) => it.registrationId && it.quantity);
    if (items.length === 0) {
      return Response.json({ error: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    const regIds = [...new Set(items.map((it) => it.registrationId))];
    const { data: regs, error: regErr } = await supabase
      .from('excise_registrations').select('*').in('id', regIds);
    if (regErr) return Response.json({ error: regErr.message }, { status: 500 });
    const regMap = new Map((regs || []).map((r) => [r.id, r]));

    /* Every line's registration must be approved + belong to the order's
       customer (legacy orders without a customerId skip the ownership check).
       ⭐ "ลูกค้ารายนี้" = **นิติบุคคล** ไม่ใช่ใบลูกค้าใบเดียว (มติผู้ใช้ 2026-09-07) —
       ใบยื่นที่ออกจาก SO อ้างทะเบียนของใบลูกค้าที่เป็นเจ้าของ FG ได้ (ดู resolveSoFiling)
       ⇒ ถ้าด่านนี้ยังเทียบ id ตรง ๆ ใบที่ถูกตีกลับจะ **แก้แล้วส่งกลับไม่ได้เลย**
       เพราะโมดัลส่ง registrationId เดิมกลับมาแล้วโดนตีตกที่นี่ทุกครั้ง */
    const ownerIds = new Set(order.customerId
      ? await customerTaxSiblingIds(supabase, order.customerId)
      : []);
    for (const r of regMap.values()) {
      if (order.customerId && !ownerIds.has(r.customerId)) {
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
        // id ใหม่ทุกครั้ง — ชุดใหม่ถูกใส่ **ก่อน** ลบชุดเดิม (ดูขั้นสลับรายการข้างล่าง) จึงห้ามชนแถวเดิม
        id: genId('OIT'),
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
    // 🐞 เดิมไม่คิดยอดเรียกเก็บใหม่ ⇒ หัวใบค้างยอดก่อนแก้ (สูตรเดียวกับตอนสร้าง: ภาษี + VAT 7%)
    updates.amountToCollect = billedTaxTotals(newItemRows).amountToCollect;
  }

  /* สลับรายการ **ก่อน** หัวใบ: ใส่ชุดใหม่ → ลบชุดเดิม → แล้วค่อยเขียนยอดลงหัวใบ
     🐞 เดิมเขียนหัวใบก่อน แล้ว "ลบชุดเดิมก่อนใส่ชุดใหม่" (id ชุดใหม่ซ้ำกับชุดเดิม) — ใส่ไม่ผ่านเมื่อไร
        ใบเหลือ **ไม่มีรายการเลย** แต่หัวใบถือยอดใหม่ไปแล้ว · ลำดับนี้: ใส่ไม่ผ่าน = ไม่มีอะไรเปลี่ยน ·
        ลบชุดเดิมไม่ผ่าน = ถอนชุดใหม่ออกแล้วตอบ error (ใบกลับเป็นเหมือนเดิม) */
  if (newItemRows) {
    const { data: oldItems, error: oldErr } = await supabase.from('order_items').select('id').eq('orderId', id);
    if (oldErr) return Response.json({ error: oldErr.message }, { status: 500 });
    const { error: itemsErr } = await insertOrderItems(supabase, newItemRows);
    if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 });
    const oldIds = (oldItems || []).map((row) => row.id);
    if (oldIds.length) {
      const { error: delErr } = await supabase.from('order_items').delete().in('id', oldIds);
      if (delErr) {
        await supabase.from('order_items').delete().in('id', newItemRows.map((row) => row.id));
        return Response.json({ error: `สลับรายการไม่สำเร็จ ใบยื่นยังเป็นรายการเดิม: ${delErr.message}` }, { status: 500 });
      }
    }
  }

  const { error: updErr } = await updateOrderResilient(supabase, id, updates);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

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
  // Tax-locked orders: admin + ผู้มีอำนาจตัดสินของฝ่ายขาย (CD · CM · AE Sup) — AC Supervisor ไม่ได้ (ผังตำแหน่ง 2026-09-24)
  const locked = order.receiptNumber || order.clearedAt || ['complete', 'delivered'].includes(order.status);
  if (locked && !isSalesManager(user?.role)) {
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
