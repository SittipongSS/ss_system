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
