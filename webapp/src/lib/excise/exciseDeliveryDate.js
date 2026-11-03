// ── "วันที่ส่งของ" ของ SO ค่าสรรพสามิต (มติเจ้าของ 03/11/2026 V21–V22 · แผนรื้อสรรพสามิต หมวด 12.13) ─────────────
//
// เจ้าของ: "วันที่ส่งของ ให้ SA ใส่ตอนยื่นอนุมัติ SO สรรพสามิต และวันที่ส่งของจะย้อนไปอัปเดตใน SO สินค้าต้นทางด้วย"
// ⇒ ใช้ช่องเดิม `deliveryDueDate` (mig 0363) ของ SO ค่าสรรพสามิต — ตอนออกใบเว้นว่าง = ใช้กำหนดส่งของ SO ต้นทาง ·
//    ยื่นอนุมัติต้องมีวัน (ด่านใน PATCH submit) · ยื่นสำเร็จ = เขียนกลับ SO ต้นทาง (แบ่งหลายรอบ = รอบล่าสุดเขียนทับ · V22)
// ⭐ ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบ่งเดือนด้วยวันนี้ (`lib/excise/raFilingTable.js`)
import { recordAudit } from '@/lib/audit';

export const EXCISE_DELIVERY_DATE_TEXT = Object.freeze({
  label: 'วันที่ส่งของ',
  note: 'จำเป็นก่อนยื่นอนุมัติ — ฝ่าย RA ใช้แบ่งรายการยื่นชำระรายเดือน · ยื่นแล้วระบบเขียนเป็นกำหนดส่งของใบสั่งขายต้นทาง · เว้นว่าง = ใช้กำหนดส่งของใบต้นทาง',
  required: 'ใส่ "วันที่ส่งของ" ของใบค่าสรรพสามิตก่อนยื่นอนุมัติ — ฝ่าย RA ใช้แบ่งรายการยื่นชำระรายเดือน และระบบเขียนกลับเป็นกำหนดส่งของใบสั่งขายต้นทาง',
});

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
 * เขียนวันที่ส่งของของ SO ค่าสรรพสามิตกลับ SO ต้นทาง — คืน `{ updated }` · ไม่ throw (การยื่นสำเร็จไปแล้ว) แต่คืน `{ error }`
 * ⚠️ เขียนเฉพาะ SO ต้นทางที่อนุมัติแล้ว (`.eq('status', 'approved')` — กติกาเดียวกับ action set_delivery_due) · วันเดิม = ไม่เขียน
 */
export async function syncSourceDeliveryDate(supabase, exciseOrder, { user, request = null, audit = recordAudit } = {}) {
  const date = exciseOrder?.deliveryDueDate || null;
  const sourceId = exciseOrder?.sourceSalesOrderId || null;
  if (!date || !sourceId) return { updated: false };
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
