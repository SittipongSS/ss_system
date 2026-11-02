// ── ปิดยอดค้างค่าสรรพสามิตบน SO ลูกค้า (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V11 · D17 · mig 0418) ─────────────
//
// แบ่งรอบแล้วส่วนที่เหลือจะไม่ส่ง (ลูกค้าลด/ยกเลิกส่วนที่เหลือ) ⇒ SA ปิดยอดค้างพร้อมเหตุผล — ไม่ต้องออก Rev. SO ลูกค้า
// ปิดแล้ว = ไม่ออกรอบใหม่ (exciseQuotationBlocker) · รอบที่ออกไปแล้ว (รวมร่าง) เดินต่อได้ · คิว SA ถือว่าจบ (exciseHandledOrderIds)
// เปิดกลับได้ถ้ากดผิด · ทุกครั้งลง audit (route)
// ⚠️ ไฟล์บริสุทธิ์ — จอ import ได้ (ช่องเหตุผลของโมดัลใช้กติกาชุดเดียวกับ route)

export const EXCISE_REMAINDER_REASON_MIN = 10;
export const EXCISE_REMAINDER_REASON_MAX = 500;

/** เหตุผลที่จอส่งมา — `{ value }` หรือ `{ error }` (ข้อความไทย) */
export function exciseRemainderReasonInput(body = {}) {
  const reason = String(body?.reason || '').trim();
  if (reason.length < EXCISE_REMAINDER_REASON_MIN || reason.length > EXCISE_REMAINDER_REASON_MAX) {
    return { error: `ระบุเหตุผล ${EXCISE_REMAINDER_REASON_MIN}–${EXCISE_REMAINDER_REASON_MAX} ตัวอักษร` };
  }
  return { value: reason };
}

/**
 * ปิด/เปิดยอดค้างบน SO นี้ได้ไหม — ตัวตัดสินเดียวของปุ่มบนจอกับ route · null = ได้
 * @param rounds `{ liveCount, hasRemaining }` จาก loadExciseRoundState
 * @param reopening true = เปิดยอดค้างกลับ
 */
export function exciseRemainderBlocker(order, { rounds = null, reopening = false } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (order.origin && order.origin !== 'pipeline') return 'ปิดยอดค้างได้เฉพาะใบสั่งขายจากใบเสนอราคา';
  if (reopening) {
    if (!order.exciseRemainderClosedAt) return 'ใบสั่งขายนี้ยังไม่ได้ปิดยอดค้าง';
    return null;
  }
  if (order.status !== 'approved' || order.supersededById) return 'ปิดยอดค้างได้เฉพาะใบสั่งขายที่อนุมัติแล้วและยังไม่ถูกออก Rev. ทับ';
  if (order.exciseRemainderClosedAt) return 'ใบสั่งขายนี้ปิดยอดค้างไปแล้ว';
  // D17: ยังไม่ออกสักรอบ = ไม่ใช่ "ยอดค้าง" — ใช้ "ไม่เรียกเก็บในระบบ" หรือยกเลิกใบสั่งขายแทน
  if (!rounds?.liveCount) return 'ยังไม่มีใบเสนอราคาค่าสรรพสามิตสักรอบ — ถ้าไม่เก็บค่าภาษีของใบนี้ ใช้ "ไม่เรียกเก็บในระบบ" แทน';
  if (rounds.hasRemaining === false) return 'ใบสั่งขายนี้ออกใบค่าสรรพสามิตครบทุกรายการแล้ว — ไม่มียอดค้างให้ปิด';
  return null;
}

/** แพตช์ของคอลัมน์ชุดนี้ — ปิด (ครบทั้งชุด) หรือเปิดกลับ (ว่างทั้งชุด) */
export function exciseRemainderPatch(reason, { user, at } = {}) {
  if (!reason) {
    return {
      exciseRemainderClosedAt: null, exciseRemainderClosedById: null,
      exciseRemainderClosedByName: null, exciseRemainderClosedReason: null,
    };
  }
  return {
    exciseRemainderClosedAt: at,
    exciseRemainderClosedById: user?.id || null,
    exciseRemainderClosedByName: user?.name || null,
    exciseRemainderClosedReason: reason,
  };
}
