/* ── กำหนดส่งสินค้าบนใบสั่งขาย — ตัวตรวจค่าตัวกลาง (0363) ─────────────────────
 *
 * ⭐ มติผู้ใช้ 2026-09-17: ใบสั่งขายเก็บ "กำหนดส่งสินค้า" เอง เพราะแบบฟอร์ม
 * FM-SA-04 / FM-SA-07 ต้องพิมพ์ค่านี้ และทั้งระบบไม่มีที่เก็บมาก่อน
 *
 * ⚠️ **ว่างได้ และว่างไม่เท่ากับวันนี้** — AE ที่ยังรอลูกค้าเคาะวันส่งต้องตั้งใบร่างได้
 * ⇒ `null` = "ยังไม่ตกลงวันส่ง" ซึ่งเป็นข้อเท็จจริง ไม่ใช่ข้อมูลขาด
 *
 * ⚠️ **ไม่ตัดวันในอดีต** — ใบที่คีย์ตามหลังของจริง (และใบย้อนหลัง) มีวันส่งที่ผ่านไปแล้ว
 * เป็นเรื่องปกติ · ด่านที่นี่คือ "เป็นวันที่จริงหรือไม่" ไม่ใช่ "สมเหตุสมผลหรือไม่"
 *
 * ⚠️ `new Date('2026-02-31')` ของ JS **ไม่ throw** แต่เลื่อนไปเป็น 3 มี.ค. เงียบ ๆ
 * ⇒ ต้องเทียบสตริงที่ normalize กลับมา ไม่ใช่เช็คแค่ `isNaN`
 */

import { isHistoricalOrder } from '@/lib/sales/historicalOrders';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DELIVERY_DUE_INVALID = 'รูปแบบกำหนดส่งสินค้าไม่ถูกต้อง (ต้องเป็นวันที่จริง)';

/** '' / null / undefined → null (ล้างค่า) · 'YYYY-MM-DD' ที่เป็นวันจริง → คืนค่าเดิม */
export function parseDeliveryDueDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, value: null };
  if (!ISO_DATE.test(raw)) return { ok: false, error: DELIVERY_DUE_INVALID };
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: DELIVERY_DUE_INVALID };
  if (parsed.toISOString().slice(0, 10) !== raw) return { ok: false, error: DELIVERY_DUE_INVALID };
  return { ok: true, value: raw };
}

/* ── แก้กำหนดส่งบนใบที่อนุมัติแล้ว (มติผู้ใช้ 2026-09-29) ──────────────────────────
 *
 * ⭐ วันส่งเป็นคำสัญญาเรื่อง **ของ** ไม่ใช่เงิน ⇒ ไม่อยู่ในสิ่งที่ผู้อนุมัติเซ็น
 *    (`salesOrderApprovalFingerprint` ไม่อ่านคอลัมน์นี้) · ไม่แตะ Actual · กระดาษ SO ไม่พิมพ์
 *    ⇒ แก้หลังอนุมัติได้โดยไม่ต้องออก Rev. (แพตเทิร์นเดียวกับจำนวนรอบบริการ `set_service_rounds`)
 * 🐞 ที่มา: FM-SA-04 พิมพ์ "กำหนดส่งสินค้า" จากช่องนี้ช่องเดียว แต่ช่องนี้แก้ได้แค่ตอนใบเป็นร่าง
 *    ⇒ SO ที่อนุมัติไปแล้วโดยยังไม่ได้กรอก (SO-26090236-0 ของเอกสาร 04 ใบจริงใบแรก) ต้องออก Rev. ทั้งใบ
 *    เพื่อเติมวันเดียว
 * ⚠️ ใบร่าง/ตีกลับแก้ที่ฟอร์มของใบ (action `save`) ตามเดิม — ทางนี้ไม่ใช่ทางที่สอง
 * ⚠️ เอกสาร FM-SA-04 ที่ยื่นแล้วถ่ายวันส่งไว้ในภาพนิ่ง ⇒ แก้ที่นี่ไม่ย้อนไปเปลี่ยนกระดาษที่ยื่นแล้ว
 *    (ร่างที่ยังไม่ยื่นอ่านสดจาก SO จึงเห็นวันใหม่เอง)
 * คืน **เหตุผลเป็นข้อความ** (กฎ ui-visibility-rule: ปุ่มกับ API ใช้ด่านตัวเดียวกัน) · `null` = แก้ได้ */
export const DELIVERY_DUE_AMEND_TEXT = Object.freeze({
  missing: 'ไม่พบใบสั่งขาย',
  noRight: 'แก้กำหนดส่งได้เฉพาะฝ่ายขายที่ดูแลใบนี้',
  historical: 'ใบสั่งขายย้อนหลังไม่มีช่องกำหนดส่งสินค้า',
  draft: 'ใบที่ยังเป็นร่างแก้กำหนดส่งที่ฟอร์มของใบ (ปุ่มแก้ไข)',
  pending: 'ใบนี้รออนุมัติอยู่ — แก้กำหนดส่งได้หลังอนุมัติ หรือดึงกลับมาแก้',
  revoked: 'ใบนี้ถูกย้อนการอนุมัติแล้ว — แก้กำหนดส่งที่ใบ Rev. ใหม่',
  closed: 'ใบนี้ปิดไปแล้ว — แก้กำหนดส่งไม่ได้',
  // ⚠️ ทางแก้หลังอนุมัติตั้ง/เลื่อนวันได้อย่างเดียว ไม่ล้าง (ช่องที่ถูกลบจนว่างส่ง '' มา — รับ = วันส่งหายเงียบ)
  empty: 'เลือกวันส่งก่อนบันทึก — ใบที่อนุมัติแล้วล้างกำหนดส่งไม่ได้',
});

export function deliveryDueAmendError(order, { canEdit = false } = {}) {
  if (!order) return DELIVERY_DUE_AMEND_TEXT.missing;
  if (!canEdit) return DELIVERY_DUE_AMEND_TEXT.noRight;
  if (isHistoricalOrder(order)) return DELIVERY_DUE_AMEND_TEXT.historical;
  if (order.supersededById) return DELIVERY_DUE_AMEND_TEXT.closed;
  switch (order.status) {
    case 'approved': return null;
    case 'draft':
    case 'rejected': return DELIVERY_DUE_AMEND_TEXT.draft;
    case 'pending_approval': return DELIVERY_DUE_AMEND_TEXT.pending;
    case 'approval_revoked': return DELIVERY_DUE_AMEND_TEXT.revoked;
    default: return DELIVERY_DUE_AMEND_TEXT.closed;
  }
}
