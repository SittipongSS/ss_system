// ── คอนเฟิร์มเกินจำนวนที่ลูกค้าจ่าย (ม-164 PR-3 · มติเจ้าของ 13/11 ข้อ 2) — logic ล้วน ไม่แตะ DB ──
//
// ⭐ **เกินที่จ่ายต้องมีที่มา** — มาจาก SO ที่ลูกค้าซื้อเพิ่มแล้วแนบ (นับเข้าจำนวนกลิ่นอยู่แล้ว · PR-2) หรือเป็น
//   **ของแถม** พร้อมเหตุผลบนแถว (`freebieReason` · mig 0436) · ไม่มีทั้งสองอย่าง = ตีกลับ `409 { code: 'over_paid' }`
//   ให้จอเปิดโมดัลสองทาง (แนบ SO / ของแถม)
// ⭐ **จอกับ route ถามตัวเดียวกัน** — จอเช็กก่อนยิง (ไม่ต้องรอ 409) · route ตัดสินจริง
// ⚠️ อ่านจำนวนกลิ่นไม่ได้ (SO หลัก qty ไม่ใช่จำนวนเต็ม · ใบไม่มีบรรทัดออกแบบกลิ่น) = **ไม่มีด่าน** (พฤติกรรมเดิม)
// ⚠️ race: สองจอคอนเฟิร์มพร้อมกันตอนเหลือที่ว่างหนึ่ง = ผ่านทั้งคู่ เกินได้หนึ่ง · การ์ดกระทบยอดขึ้น "เกิน 1 ยังไม่ระบุ"
//   และด่านปิดใบบล็อกจนกว่าจะระบุ — ไม่ล็อกแถว (ราคาของการล็อกสูงกว่าเคสที่แทบไม่เกิด)
import { requestCloseNeedsSoConfirm } from '@/lib/master/requestTypes';
import { scentCountForOrder } from '@/lib/requests/scentDesignOrders';
import { confirmedQty, freebieQty, salesOrderQty } from '@/lib/requests/soReconcile';
import { scentSlotLinesOf } from '@/lib/requests/scentOrderLinks';

export const OVER_PAID_CODE = 'over_paid';

/** จำนวนกลิ่นที่ลูกค้าจ่าย (SO หลัก + SO แนบที่ไม่ใช่ 03-010) — null = ไม่มีด่าน */
export function paidScentSlots(request) {
  if (!request || !requestCloseNeedsSoConfirm(request.kind)) return null;
  const lines = scentSlotLinesOf(request);
  if (!lines.length) return null;
  if (scentCountForOrder(request.salesOrderLines || []) == null) return null;
  return salesOrderQty(lines);
}

/**
 * คอนเฟิร์มแถวนี้แล้วเกินที่จ่ายไหม (นับหลังบันทึก) — คืน null หรือ `{ code, error, slots, confirmedAfter, over }`
 * @param rowId          แถวที่กำลังคอนเฟิร์ม (ไม่นับซ้ำถ้าข้อมูลเก่าบอกว่าคอนเฟิร์มอยู่แล้ว)
 * @param freebieReason  ส่งมาพร้อมคอนเฟิร์ม = แถวนี้เป็นของแถม (ไม่นับเป็นส่วนเกิน)
 */
export function overPaidAfterConfirm({ request, items = [], rowId = null, freebieReason = null } = {}) {
  const slots = paidScentSlots(request);
  if (slots == null) return null;
  const others = (items || []).filter((i) => i?.id !== rowId);
  const confirmedAfter = confirmedQty(others) + 1;
  const freebiesAfter = freebieQty(others) + (String(freebieReason ?? '').trim() ? 1 : 0);
  const over = confirmedAfter - freebiesAfter - slots;
  if (over <= 0) return null;
  return {
    code: OVER_PAID_CODE,
    slots,
    confirmedAfter,
    over,
    error: `เกินจำนวนที่ลูกค้าจ่าย (คอนเฟิร์ม ${confirmedAfter} จาก ${slots}) — แนบใบสั่งขายที่ซื้อเพิ่ม หรือบันทึกเป็นของแถมพร้อมเหตุผล`,
  };
}

/** ส่งเหตุผลแถมมาทั้งที่ยังไม่เกิน — คืนข้อความไทย หรือ null (กันแถวถูกติดป้ายแถมผิด) */
export function freebieNotNeededError({ request, items = [], rowId = null, freebieReason = null } = {}) {
  if (!String(freebieReason ?? '').trim()) return null;
  if (overPaidAfterConfirm({ request, items, rowId })) return null;
  return 'ยังไม่เกินจำนวนที่ลูกค้าจ่าย — ไม่ต้องระบุของแถม';
}

/** เกินที่ยังไม่ระบุตอนนี้ (ก่อนกดอะไร) — 0 = ไม่มี */
export function unexplainedOver(request, items = request?.items || []) {
  const slots = paidScentSlots(request);
  if (slots == null) return 0;
  return Math.max(0, confirmedQty(items) - freebieQty(items) - slots);
}

/**
 * ระบุของแถมย้อนหลังบนแถวที่คอนเฟิร์มแล้ว — ได้เฉพาะตอนใบเกินที่ยังไม่ระบุอยู่ · คืนข้อความไทย หรือ null
 * ⚠️ ขั้นของแถว (คอนเฟิร์มแล้ว · ยังไม่แถม · พัฒนากลิ่น) ตรวจที่ `hopStageError` แล้ว — ที่นี่ตรวจระดับใบ
 */
export function freebieHopError(request, items = request?.items || []) {
  if (paidScentSlots(request) == null) return 'ใบนี้ไม่มีจำนวนกลิ่นจากใบสั่งขายให้เทียบ — ไม่ต้องระบุของแถม';
  if (!unexplainedOver(request, items)) return 'ใบนี้ยังไม่เกินจำนวนที่ลูกค้าจ่าย — ไม่ต้องระบุของแถม';
  return null;
}
