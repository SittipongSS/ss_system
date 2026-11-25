// ── "วันที่ส่งของ" ของ SO ค่าสรรพสามิต (มติเจ้าของ 03/11/2026 V21–V22 · แผนรื้อสรรพสามิต หมวด 12.13) ─────────────
//
// เจ้าของ: "วันที่ส่งของ ให้ SA ใส่ตอนยื่นอนุมัติ SO สรรพสามิต และวันที่ส่งของจะย้อนไปอัปเดตใน SO สินค้าต้นทางด้วย"
// ⇒ ใช้ช่องเดิม `deliveryDueDate` (mig 0363) ของ SO ค่าสรรพสามิต — ตอนออกใบเว้นว่าง = ใช้กำหนดส่งของ SO ต้นทาง ·
//    ยื่นอนุมัติต้องมีวัน (ด่านใน PATCH submit) · ยื่นสำเร็จ = เขียนกลับ SO ต้นทาง (แบ่งหลายรอบ = รอบล่าสุดเขียนทับ · V22)
// ⭐ ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบ่งเดือนด้วยวันนี้ (`lib/excise/raFilingTable.js`)
// ⭐ มติเจ้าของ 25/11/2026: "ตอนจะยื่นอนุมัติ ต้องบังคับใส่วันที่ส่งของ ซึ่งมันจะลิงก์ย้อนกลับทั้งหมด และวันที่ส่งของต้อง pop ให้เห็นก่อนยื่นอนุมัติ"
//    ⇒ ① ไม่มีวัน = ปุ่มยื่นไม่เปิดโมดัล บอกเหตุ (ด่าน PATCH submit เดิมยังอยู่) · ② โมดัลยื่นโชว์วันที่ส่งของตัวใหญ่ + วันของ SO ต้นทางที่จะถูกเขียนทับ
//       (`exciseSubmitDeliveryView`) · ③ แก้วันบนใบที่อนุมัติแล้ว (ดินสอ `set_delivery_due`) ก็เขียนกลับ SO ต้นทางด้วย — เดิมเขียนเฉพาะตอนยื่น
//    · ทุกทางเขียนกลับยึด "รอบล่าสุด" (V22): มีรอบที่ออกทีหลังและยื่นไปแล้ว = รอบนี้ไม่เขียนทับ
//    ④ (เจ้าของดูจอ 25/11: "pop วันที่ส่งของ สามารถแก้ได้ด้วย เผื่อแก้ก่อนกดยื่น") — ช่องวันในโมดัลยื่นแก้ได้ · ใบไม่มีวันก็เปิดโมดัลให้ใส่ ·
//       ยื่นพร้อม `deliveryDueDate` = บันทึกวันลงใบก่อนแล้วค่อยยื่นในคำขอเดียว (`applySubmitDeliveryDate`) · ว่าง = ยื่นไม่ได้เหมือนเดิม
import { recordAudit } from '@/lib/audit';
import { fmtDate } from '@/lib/format';
import { exciseRowsOnly } from '@/lib/sales/historicalOrders';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/customer';
import { parseDeliveryDueDate } from '@/lib/sales/salesOrderDeliveryDue';

export const EXCISE_DELIVERY_DATE_TEXT = Object.freeze({
  label: 'วันที่ส่งของ',
  /* ⚠️ "ตอนออกใบเว้นว่าง" เท่านั้นที่ถอยไปใช้วันของใบต้นทาง (POST) — ใบร่างที่ล้างวันทิ้งแล้วบันทึก = ว่างจริง ยื่นไม่ได้ ⇒ คำต้องไม่บอกว่าว่างได้เสมอ */
  note: 'จำเป็นก่อนยื่นอนุมัติ — ฝ่าย RA ใช้แบ่งรายการยื่นชำระรายเดือน · ยื่นแล้วระบบเขียนเป็นกำหนดส่งของใบสั่งขายต้นทาง · ตอนออกใบเว้นว่าง = ใช้กำหนดส่งของใบต้นทาง',
  required: 'ใส่ "วันที่ส่งของ" ของใบค่าสรรพสามิตก่อนยื่นอนุมัติ — ฝ่าย RA ใช้แบ่งรายการยื่นชำระรายเดือน และระบบเขียนกลับเป็นกำหนดส่งของใบสั่งขายต้นทาง',
  /* ใบร่างที่ยังไม่มีวัน (โหมดอ่าน) — บอกว่าขาดอะไรก่อนกดยื่น ไม่ใช่ "ยังไม่ตกลงวันส่ง" ของใบปกติ */
  readEmpty: 'ยังไม่ใส่ — ต้องใส่ก่อนยื่นอนุมัติ',
  /* ช่องในโมดัลยื่นยังว่าง */
  submitEmpty: 'ใส่วันที่ส่งของก่อนกดยื่น',
  /* ใต้ดินสอของใบที่อนุมัติแล้ว (แทน AMEND_NOTE ของใบปกติ) */
  amendNote: 'แก้ได้โดยไม่ต้องออก Rev. · ไม่กระทบยอดเงิน · บันทึกแล้วระบบเขียนเป็นกำหนดส่งของใบสั่งขายต้นทางด้วย '
    + '(เว้นแต่มีใบค่าสรรพสามิตรอบหลังที่ยื่นไปแล้ว — รอบล่าสุดเป็นตัวกำหนด)',
});

/* สถานะของรอบที่ "เขียนวันของตัวเองกลับต้นทางไปแล้ว" — ยื่นแล้วหรืออนุมัติแล้ว (ร่าง/ตีกลับยังไม่ได้เขียน · ยกเลิก = ไม่นับ) */
const WRITTEN_ROUND_STATUSES = Object.freeze(['pending_approval', 'approved']);

/** กำหนดส่งของ SO ต้นทางของใบค่าสรรพสามิต — ค่าตั้งต้นของ "วันที่ส่งของ" ตอนออก SO ค่าสรรพสามิต · อ่านพลาด = throw
 *  (SO ต้นทาง = ใบที่ใบค่าสรรพสามิตที่ผู้ออกเปิดได้ชี้อยู่ — อ่านเฉพาะช่องวันที่) */
export async function sourceDeliveryDueDate(supabase, sourceSalesOrderId) {
  if (!sourceSalesOrderId) return null;
  const { data, error } = await supabase.from('sales_orders')
    .select('id, "deliveryDueDate"').eq('id', sourceSalesOrderId).maybeSingle();
  if (error) throw new Error(`อ่านกำหนดส่งของใบสั่งขายต้นทางไม่สำเร็จ: ${error.message}`);
  return data?.deliveryDueDate || null;
}

/** ด่านยื่นอนุมัติ SO ค่าสรรพสามิต — null = ผ่าน */
export const exciseDeliveryDateBlocker = (order) => (order?.deliveryDueDate ? null : EXCISE_DELIVERY_DATE_TEXT.required);

/**
 * ก้อนที่โมดัล "ยื่นอนุมัติ" ของ SO ค่าสรรพสามิตวาด (มติ 25/11) — วันที่ส่งของตัวใหญ่ + ผลที่จะเกิดกับ SO ต้นทาง
 * `source` = `{ orderNumber, deliveryDueDate, error }` จาก GET (`sourceDelivery`) · อ่านไม่ขึ้น = บอกว่าอ่านไม่ขึ้น ไม่เดาว่า "ว่าง"
 * คืน null เมื่อใบไม่มีวัน (ผู้เรียกต้องไม่เปิดโมดัล — ด่าน `exciseDeliveryDateBlocker`)
 */
export function exciseSubmitDeliveryView(order, source = null) {
  const date = order?.deliveryDueDate || null;
  if (!date) return null;
  const sourceNo = source?.orderNumber || order?.metadata?.sourceOrderNumber || 'ใบสั่งขายต้นทาง';
  let effect;
  if (source?.error) {
    effect = `ยื่นแล้วระบบเขียนวันนี้เป็นกำหนดส่งสินค้าของ ${sourceNo} (อ่านกำหนดส่งปัจจุบันของใบนั้นไม่ขึ้น: ${source.error})`;
  } else if (source && source.deliveryDueDate === date) {
    effect = `ตรงกับกำหนดส่งสินค้าของ ${sourceNo} อยู่แล้ว — ไม่มีอะไรเปลี่ยนที่ใบต้นทาง`;
  } else if (source && source.deliveryDueDate) {
    effect = `ยื่นแล้วกำหนดส่งสินค้าของ ${sourceNo} เปลี่ยนจาก ${fmtDate(source.deliveryDueDate)} เป็น ${fmtDate(date)}`;
  } else {
    effect = `ยื่นแล้วระบบเขียนวันนี้เป็นกำหนดส่งสินค้าของ ${sourceNo} (ตอนนี้ใบนั้นยังไม่ตกลงวันส่ง)`;
  }
  /* สหมิตร (มติ 25/11): ตาราง RA โชว์/แบ่งเดือนด้วยวันที่เอกสาร PO ของใบลูกค้า ไม่ใช่วันนี้ ⇒ บอกตามจริง */
  const sahamit = order?.customer?.arCode === SAHAMIT_AR_CODE;
  return {
    label: EXCISE_DELIVERY_DATE_TEXT.label,
    date: fmtDate(date),
    effect,
    note: `${sahamit
      ? 'สหมิตร: ตาราง RA โชว์และแบ่งเดือนด้วยวันที่เอกสาร PO ของใบลูกค้า (ไม่ใช่วันนี้)'
      : 'ฝ่าย RA ใช้วันนี้แบ่งรายการยื่นชำระรายเดือน'} — แก้วันได้ในช่องนี้ ระบบบันทึกวันลงใบพร้อมกับการยื่น`,
  };
}

/**
 * วันที่ส่งของที่มากับคำขอยื่น (ช่องในโมดัลยื่น · มติ 25/11) — บันทึกลงใบก่อน แล้วคืนแถวที่ใช้ยื่นต่อ
 * คืน `{ order }` (ไม่ได้ส่งวันมา / วันเดิม = แถวเดิม) หรือ `{ error, status }` · ไม่ throw
 * ⚠️ ผู้เรียกต้องผ่านด่านสถานะ (ร่าง/ตีกลับ) และสิทธิ์ยื่นมาก่อน — ที่นี่ตรวจซ้ำแค่ที่แถวจริง (`status` + `updatedAt` เดิม)
 * ⚠️ แถวที่คืนพก `updatedAt` ใหม่ ⇒ RPC ยื่น (expectedUpdatedAt) ต้องใช้แถวนี้ ไม่ใช่แถวก่อนเขียน
 * ⚠️ ยื่นไม่ผ่านด่านถัดไป (ทะเบียน · เอกสารยืนยัน · ลายเซ็น) = วันที่บันทึกแล้วยังอยู่บนใบร่าง — เป็นวันที่ผู้ยื่นเลือกเอง ไม่ต้องย้อน
 */
export async function applySubmitDeliveryDate(supabase, order, body, { user, request = null, audit = recordAudit } = {}) {
  if (!body || !('deliveryDueDate' in body)) return { order };
  const parsed = parseDeliveryDueDate(body.deliveryDueDate);
  if (!parsed.ok) return { error: parsed.error, status: 400 };
  if (!parsed.value) return { error: EXCISE_DELIVERY_DATE_TEXT.required, status: 400 };
  if (parsed.value === (order.deliveryDueDate || null)) return { order };
  const { data, error } = await supabase.from('sales_orders')
    .update({ deliveryDueDate: parsed.value, updatedAt: new Date().toISOString() })
    .eq('id', order.id).eq('status', order.status).eq('updatedAt', order.updatedAt)
    .select('id, "deliveryDueDate", "updatedAt"').maybeSingle();
  if (error) return { error: `บันทึกวันที่ส่งของไม่สำเร็จ: ${error.message}`, status: 500 };
  if (!data) return { error: 'ใบสั่งขายถูกแก้ระหว่างทาง กรุณาโหลดใหม่แล้วยื่นอีกครั้ง', status: 409 };
  await audit({
    user, action: 'update', entityType: 'sales_order', entityId: order.id,
    before: { deliveryDueDate: order.deliveryDueDate || null },
    after: { deliveryDueDate: data.deliveryDueDate },
    summary: `วันที่ส่งของใบค่าสรรพสามิต ${order.orderNumber || order.id} (แก้ในโมดัลยื่นอนุมัติ): `
      + `${order.deliveryDueDate || 'ยังไม่ใส่'} → ${data.deliveryDueDate}`,
    request,
  });
  return { order: { ...order, deliveryDueDate: data.deliveryDueDate, updatedAt: data.updatedAt } };
}

/** กำหนดส่ง + เลขที่ของ SO ต้นทาง ให้โมดัลยื่น (GET ของใบค่าสรรพสามิต) · อ่านพลาด = `{ error }` ไม่ throw (ไม่บล็อกหน้าใบ) */
export async function loadSourceDelivery(supabase, sourceSalesOrderId) {
  if (!sourceSalesOrderId) return null;
  const { data, error } = await supabase.from('sales_orders')
    .select('id, "orderNumber", "deliveryDueDate"').eq('id', sourceSalesOrderId).maybeSingle();
  if (error) return { orderNumber: null, deliveryDueDate: null, error: error.message || String(error) };
  if (!data) return { orderNumber: null, deliveryDueDate: null, error: 'ไม่พบใบสั่งขายต้นทาง' };
  return { orderNumber: data.orderNumber || null, deliveryDueDate: data.deliveryDueDate || null, error: null };
}

/**
 * เขียนวันที่ส่งของของ SO ค่าสรรพสามิตกลับ SO ต้นทาง — คืน `{ updated }` · ไม่ throw (การยื่น/การแก้สำเร็จไปแล้ว) แต่คืน `{ error }`
 * เรียกจากสองทาง: ยื่นอนุมัติ (`submit`) และแก้วันบนใบที่อนุมัติแล้ว (`set_delivery_due` · มติ 25/11)
 * ⚠️ เขียนเฉพาะ SO ต้นทางที่อนุมัติแล้ว (`.eq('status', 'approved')` — กติกาเดียวกับ action set_delivery_due) · วันเดิม = ไม่เขียน
 * ⚠️ รอบล่าสุดเป็นตัวกำหนด (V22): มีใบค่าสรรพสามิตของต้นทางเดียวกันที่ออกทีหลังและยื่น/อนุมัติแล้ว = ไม่เขียนทับ (`skipped: 'newer_round'`)
 *    — เดิมแก้รอบเก่าจะดึงวันของต้นทางถอยกลับไปทับวันของรอบใหม่ · อ่านรอบอื่นไม่ขึ้น = ไม่เขียน (ไม่เดาว่าเป็นรอบล่าสุด)
 */
export async function syncSourceDeliveryDate(supabase, exciseOrder, { user, request = null, audit = recordAudit } = {}) {
  const date = exciseOrder?.deliveryDueDate || null;
  const sourceId = exciseOrder?.sourceSalesOrderId || null;
  if (!date || !sourceId) return { updated: false };
  if (exciseOrder.createdAt) {
    const { data: newer, error: roundError } = await exciseRowsOnly(supabase.from('sales_orders')
      .select('id').eq('sourceSalesOrderId', sourceId))
      .neq('id', exciseOrder.id).in('status', WRITTEN_ROUND_STATUSES).gt('createdAt', exciseOrder.createdAt).limit(1);
    if (roundError) return { updated: false, error: roundError };
    if (newer?.length) return { updated: false, skipped: 'newer_round' };
  }
  const { data: source, error } = await supabase.from('sales_orders')
    .select('id, "orderNumber", status, "deliveryDueDate"').eq('id', sourceId).maybeSingle();
  if (error) return { updated: false, error };
  if (!source || source.status !== 'approved' || source.deliveryDueDate === date) return { updated: false };
  const { data: written, error: writeError } = await supabase.from('sales_orders')
    .update({ deliveryDueDate: date, updatedAt: new Date().toISOString() })
    .eq('id', sourceId).eq('status', 'approved').select('id').maybeSingle();
  if (writeError) return { updated: false, error: writeError };
  if (!written) return { updated: false };
  await audit({
    user, action: 'update', entityType: 'sales_order', entityId: sourceId,
    before: { deliveryDueDate: source.deliveryDueDate || null },
    after: { deliveryDueDate: date },
    summary: `กำหนดส่งสินค้าใบสั่งขาย ${source.orderNumber} ตามวันที่ส่งของของใบค่าสรรพสามิต ${exciseOrder.orderNumber || exciseOrder.id}: `
      + `${source.deliveryDueDate || 'ยังไม่ตกลงวันส่ง'} → ${date}`,
    request,
  });
  return { updated: true };
}
