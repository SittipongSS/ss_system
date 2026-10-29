// ── SO ค่าสรรพสามิต (แผนรื้อสรรพสามิต PR4 · mig 0416 · มติเจ้าของ 28/10/2026) ─────────────────────────────
//
// SO ค่าสรรพสามิต = แถวจริงใน `sales_orders` · origin 'excise' · ไม่มีดีล/โครงการ · ชี้ SO ลูกค้าด้วย "sourceSalesOrderId"
// สร้างจากใบเสนอราคาค่าสรรพสามิตที่ลูกค้ารับแล้ว (`create_excise_sales_order_draft`) · ยื่น/อนุมัติ/งวด/FN เส้นเดิมทุกขั้น
// ⭐ ไม่นับ Actual (CHECK actualAmount = 0 + `isActualOrder`) · ไม่มี Rev. · ย้อนอนุมัติไม่ได้ · ยกเลิกแบบไม่ย้อนดีลเท่านั้น
// ⭐ สิทธิ์ = ดีลของ SO ต้นทาง (`row.sourceDeal` — ใช้ตัดสินอย่างเดียว ห้ามใส่ `row.deal`)
import { isExciseOrder } from '@/lib/sales/historicalOrders';

/* รหัสจาก create_excise_sales_order_draft (0416) → ข้อความไทย · รหัสร่วมกับใบปกติ (เอกสารยืนยัน · เลขเต็ม) ปล่อยให้ route จัดตามเดิม */
const CREATE_ERRORS = Object.freeze({
  excise_quotation_origin_invalid: 'ใบเสนอราคานี้ไม่ใช่ใบค่าสรรพสามิต',
  quotation_not_won: 'สร้างใบสั่งขายได้เฉพาะใบค่าสรรพสามิตที่ลูกค้ารับแล้ว',
  quotation_lines_required: 'ใบค่าสรรพสามิตนี้ไม่มีรายการ — กด “คิดใหม่จากใบสั่งขาย” บนใบก่อน',
  excise_source_order_invalid: 'ใบสั่งขายต้นทางไม่ได้อยู่ในสถานะอนุมัติแล้ว (ถูกย้อนอนุมัติ/ยกเลิก/ออก Rev.) — ออกใบสั่งขายค่าสรรพสามิตไม่ได้',
});

/** ข้อความไทยของ error จาก RPC สร้าง SO ค่าสรรพสามิต — ไม่ใช่รหัสของชุดนี้ = null */
export function exciseSalesOrderCreateError(error) {
  const message = String(error?.message || '');
  const code = Object.keys(CREATE_ERRORS).find((key) => message.includes(key));
  return code ? CREATE_ERRORS[code] : null;
}

/* ทางที่ SO ค่าสรรพสามิตไม่มี — route ตอบข้อความนี้ก่อนถึงฐาน (ฐานกันซ้ำอีกชั้น: CHECK revisionNo = 0 · trigger `sales_orders_excise_no_revoke_trg` 0416) */
const BLOCKED = Object.freeze({
  revoke: 'ใบสั่งขายค่าสรรพสามิตย้อนการอนุมัติไม่ได้ — ยกเลิกใบแล้วออกใหม่จากใบเสนอราคาค่าสรรพสามิตใบเดิม',
  revise: 'ใบสั่งขายค่าสรรพสามิตออก Rev. ไม่ได้ — ยกเลิกใบแล้วออกใหม่จากใบเสนอราคาค่าสรรพสามิตใบเดิม',
  reverse: 'ใบสั่งขายค่าสรรพสามิตไม่ผูกดีล — ยกเลิกได้แบบไม่ย้อนสถานะดีลเท่านั้น',
  edit_lines: 'รายการของใบสั่งขายค่าสรรพสามิตมาจากใบเสนอราคาค่าสรรพสามิต แก้บนใบสั่งขายไม่ได้',
});

/** ทางที่ปิดสำหรับ SO ค่าสรรพสามิต — ใบอื่น/ทางอื่น = null */
export function exciseSalesOrderBlock(order, action) {
  if (!isExciseOrder(order)) return null;
  return BLOCKED[action] || null;
}

/** ดีลที่ใช้ตัดสินผู้ยื่น/ผู้อนุมัติของ SO — ใบปกติ = ดีลของใบ · SO ค่าสรรพสามิต = ดีลของ SO ต้นทาง (`sourceDeal`) */
export const salesOrderApprovalDeal = (order) => order?.deal || (isExciseOrder(order) ? order?.sourceDeal || null : null);

/**
 * SO ค่าสรรพสามิตที่ยังมีผลของใบเสนอราคาค่าสรรพสามิตใบนี้ (ไม่ยกเลิก · ไม่ถูกแทน) — ใบละไม่เกินหนึ่ง (ด่าน 0416)
 * @returns `{ data, error }` · data = `{ id, orderNumber, status }` หรือ null
 */
export async function loadLiveExciseSalesOrder(supabase, quotationId) {
  if (!quotationId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('sales_orders')
    .select('id, "orderNumber", status, "supersededById", origin')
    .eq('quotationId', quotationId)
    .neq('status', 'cancelled')
    .is('supersededById', null)
    .order('createdAt', { ascending: false })
    .limit(1);
  if (error) return { data: null, error };
  return { data: data?.[0] || null, error: null };
}

/** ยกเลิกใบค่าสรรพสามิตที่รับแล้วได้เมื่อไม่มี SO ค่าสรรพสามิตที่ยังมีผล (แผน หมวด 5) — ข้อความ หรือ null */
export function exciseQuotationCancelBlock(quote, liveOrder) {
  if (!isExciseOrder(quote) || !liveOrder) return null;
  return `ยกเลิกใบค่าสรรพสามิตนี้ไม่ได้ — มีใบสั่งขายค่าสรรพสามิต ${liveOrder.orderNumber || liveOrder.id} ที่ยังมีผลอยู่ · ยกเลิกใบสั่งขายนั้นก่อน`;
}

/* ถ้อยคำบนหน้า SO ค่าสรรพสามิต — ของใบปกติบอกผลต่อ Actual ทุกสถานะ ("ยอดถูกนับเป็น Actual แล้ว") ซึ่งไม่จริงกับใบนี้
   ⚠️ ไฟล์นี้ไม่มีของฝั่ง server — จอ import ตรงได้ */
export const EXCISE_ORDER_STATUS_DESCRIPTION = Object.freeze({
  draft: 'ใบสั่งขายค่าสรรพสามิต — แนบเอกสารยืนยันจากลูกค้าแล้วยื่นอนุมัติ · ไม่นับ Actual / FC / เป้า',
  pending_approval: 'รอ AE Supervisor อนุมัติ · ใบนี้ไม่นับ Actual / FC / เป้า',
  approved: 'อนุมัติแล้ว — แจ้งชำระที่แท็บการชำระ บัญชีรับรองเงินและออกใบกำกับตามปกติ · ไม่นับ Actual / FC / เป้า',
  rejected: 'แก้ไขตามเหตุผลแล้วส่งอนุมัติใหม่',
  cancelled: 'ยกเลิกแล้ว — ออกใบใหม่ได้จากใบเสนอราคาค่าสรรพสามิตใบเดิม',
});

/** เลข SO ลูกค้าต้นทาง — RPC ประทับไว้ใน metadata ตอนสร้าง (0416) · ไม่มี = id */
export const exciseSourceOrderLabel = (order) => order?.metadata?.sourceOrderNumber || order?.sourceSalesOrderId || '';

/** ยอดก่อน VAT ของ SO ค่าสรรพสามิต — ช่อง Actual = 0 เสมอ (CHECK 0414) ⇒ คิดจากยอดรวม − VAT */
export const excisePreVatAmount = (order) => Math.max(0, Number(order?.totalAmount || 0) - Number(order?.vatAmount || 0));

/* บรรทัดผลลัพธ์ของโมดัลบนหน้า SO ค่าสรรพสามิต (กติกา approval-confirm-modals #1223) — ของใบปกติพูดเรื่องยอดรออนุมัติ/Actual ทุกโมดัล */
export const EXCISE_ORDER_MODAL_COPY = Object.freeze({
  submit: 'ใบค่าสรรพสามิตไม่นับ Actual และไม่ขึ้นเป็นยอดรออนุมัติบนดีล/โครงการ',
  approve: 'ใบค่าสรรพสามิตไม่นับ Actual — งวดชำระถูกล็อกยอด ฝ่ายขายแจ้งชำระได้ บัญชีรับรองเงินและออกใบกำกับตามปกติ',
  withdraw: 'ใบกลับเป็นร่าง · หลักฐานการยื่นเดิมยังคงอยู่ในประวัติ หลังแก้ไขต้องยื่นและลงนามใหม่ · ใบค่าสรรพสามิตไม่นับ Actual',
  reject: 'ใบกลับไปให้ผู้จัดทำแก้ไขแล้วยื่นใหม่ · ใบค่าสรรพสามิตไม่นับ Actual',
  cancel: 'ยกเลิกใบสั่งขายค่าสรรพสามิต — ไม่กระทบ Actual หรือดีล · ออกใบใหม่ได้จากใบเสนอราคาค่าสรรพสามิตใบเดิม · เลือกเหตุผลที่ยกเลิก',
});
