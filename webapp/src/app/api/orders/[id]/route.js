import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, allowedEditFields } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations, stampExemptFlags, updateOrderResilient } from '@/lib/tax/orders';
import { recordAudit } from '@/lib/audit';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { purgeAttachments } from '@/lib/master/attachments';
import { orderStatusUpdate } from '@/lib/master/recordUpdates';
import { filingTransitionError } from '@/lib/excise/workflow';
import { loadFilingSummary } from '@/lib/excise/raFiling';
import { FILING_REASON_MAX, FILING_REASON_MIN } from '@/lib/excise/raFilingRules';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

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
  /* แผงสรุป SO + ด่านเริ่มยื่น (PR5) — RA ไม่เข้าหน้าขาย ⇒ สรุปมากับใบยื่น · อ่านพังต้องไม่ทำหน้าใบยื่นพังทั้งหน้า */
  try {
    data.source = await loadFilingSummary(supabase, data);
  } catch (e) {
    data.source = { error: e?.message || 'อ่านใบสั่งขายต้นทางไม่สำเร็จ' };
  }
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

  /* ⭐ แผนรื้อสรรพสามิต PR5: ใบยื่นเป็นงานของ RA ทั้งเส้น — proxy เปิดการเขียน /api/orders ให้ ra:approve เท่านั้น
     ช่องหัวใบของฝ่ายขายยังอยู่ในลิสต์ (แอดมินถือทั้งสองฝั่ง) แต่ไม่มีปลายทางสถานะไหนเป็นของฝ่ายขายแล้ว
     Status is handled explicitly below (per-capability transition gate), not via this generic copy. */
  const salesEditable = ['quotationRef', 'poReference', 'deliveryDate', 'remarks', 'assignee', 'receiptNumber'];
  const allowed = allowedEditFields(user, 'orders', salesEditable);
  const isLegal = can(user?.role, 'ra:approve');
  const isSales = can(user?.role, 'sales:act');
  const now = new Date().toISOString();

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
     จากร่างได้ · เลขใบเสร็จบังคับแค่บนจอ
     ⭐ v3 (มติเจ้าของ 02/11): เหลือปลายทางเดียว กำลังยื่น → ชำระแล้ว · "กำลังยื่น" เกิดตอนเขียนบันทึก (from-sales-order)
     ⚠️ "ยกเว้นภาษี" ตัดสินจากทะเบียนของรายการ (`stampExemptFlags` → isExemptFiling) ไม่ใช่ยอด 0 —
        ใบยกเว้นทั้งใบไม่ต้องมีเลขใบเสร็จ */
  if (body.status !== undefined && body.status !== order.status) {
    const target = body.status;
    let exempt = false;
    if (target === 'complete') {
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
      exciseReceiptNumber: updates.exciseReceiptNumber !== undefined ? updates.exciseReceiptNumber : order.exciseReceiptNumber,
    };
    const blocked = filingTransitionError({
      from: order.status, to: target, caps: { sales: isSales, ra: isLegal }, exempt, fields,
    });
    if (blocked) return Response.json({ error: blocked.error }, { status: blocked.status });
    updates.status = target;
    if (target === 'complete') {
      // ชำระแล้ว: ใคร/เมื่อไรที่บันทึก (วันชำระจริงของกรมอยู่ที่ taxPaidDate จากโมดัล)
      updates.clearedAt = now;
      updates.filedAt = now;
      updates.filedBy = user?.id ?? null;
      updates.filedByName = user?.name ?? null;
    }
  }
  // ตัดช่องว่างหัวท้ายของเลขเอกสาร — ค่าที่ผ่านด่านคือค่าที่ลงฐาน (รวมการแก้เลขหลังชำระแล้ว · D11)
  for (const key of ['taxInvoiceNumber', 'exciseReceiptNumber']) {
    if (typeof updates[key] === 'string') updates[key] = updates[key].trim();
  }
  /* D11: แก้เลขใบเสร็จหลังชำระแล้วได้ แต่ห้ามล้างจนว่าง — ด่าน "ต้องมีเลขใบเสร็จ" ของขั้นชำระแล้วต้องจริงตลอดชีวิตของบันทึก */
  if (order.status === 'complete' && updates.exciseReceiptNumber !== undefined && !updates.exciseReceiptNumber && order.exciseReceiptNumber) {
    return Response.json({ error: 'กรุณาระบุเลขที่ใบเสร็จสรรพสามิต — ล้างเลขของบันทึกที่ชำระแล้วไม่ได้' }, { status: 400 });
  }
  /* ⭐ v3: บันทึกการยื่นตรึงรายการ ณ ตอนเริ่มยื่น — ไม่มีทางแก้/คิดรายการใหม่ (ยกเลิกการเริ่มยื่นแล้วเริ่มใหม่แทน · D10) */
  if (Array.isArray(body.items) || body.recalcFromSalesOrder === true) {
    return Response.json({
      error: 'บันทึกการยื่นตรึงรายการไว้ตอนเริ่มยื่น — แก้รายการไม่ได้ (ยกเลิกการเริ่มยื่นแล้วกดเริ่มยื่นใหม่ เพื่อดึงรายการจากใบสั่งขายอีกครั้ง)',
    }, { status: 400 });
  }

  updates.updatedAt = now;
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
// ⭐ v3 (D10 · มติ 02/11): **ยกเลิกการเริ่มยื่น** — RA ลบบันทึกที่ยัง "กำลังยื่น" ได้ (กดเริ่มยื่นผิดใบ) พร้อมเหตุผล 10–500 ตัว
//    ⇒ งานกลับไป "รอ RA" (SO ลูกค้า/SO ค่าสรรพสามิตปลดล็อกตาม FK) · audit เก็บแถวเดิม + เหตุผล
//    ชำระแล้ว = ยกเลิกไม่ได้ (แอดมินลบได้ทุกสถานะ · admin-full-rights · ยังต้องมีเหตุผล)
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

  if (!can(user?.role, 'ra:approve')) {
    return Response.json({ error: 'ยกเลิกการเริ่มยื่นได้เฉพาะฝ่าย RA' }, { status: 403 });
  }
  // ร่าง (ของเก่าก่อน v3) ยกเลิกได้เหมือนกำลังยื่น — prod 02/11 ไม่มีแถวแบบนั้นแล้ว
  if (!['filing', 'draft'].includes(order.status) && user?.role !== 'admin') {
    return Response.json({ error: 'ยกเลิกการเริ่มยื่นได้เฉพาะงานที่ยัง "กำลังยื่น" — บันทึกที่ชำระแล้วยกเลิกไม่ได้' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < FILING_REASON_MIN || reason.length > FILING_REASON_MAX) {
    return Response.json({ error: `ระบุเหตุผลที่ยกเลิกการเริ่มยื่น (${FILING_REASON_MIN}–${FILING_REASON_MAX} ตัวอักษร)` }, { status: 400 });
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
  await recordAudit({
    user, action: 'delete', entityType: 'order', entityId: id, before: order, request,
    summary: `RA ยกเลิกการเริ่มยื่น ${order.poReference || id} — ${reason}`,
  });
  return Response.json({ success: true, message: 'ยกเลิกการเริ่มยื่นแล้ว — งานกลับไปรอ RA' });
}
