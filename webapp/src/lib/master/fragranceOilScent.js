// ── FG หมวดหัวน้ำหอม (02-020): ผูกกลิ่นจากทะเบียน ไม่ผูกสูตร ─────────────────
//
// ⭐ มติผู้ใช้ 2026-11-02 — *"FG สินค้า ตอนนี้ มีการผูกชื่อสูตร แต่ว่า จะมีหมวด หัวน้ำหอม ที่ใช้เป็นชื่อกลิ่น"*
//   · ตามสายขอ RD (ม-148): พัฒนากลิ่นที่ **ส่งเป็นหัวน้ำหอม** = กลิ่นเข้าทะเบียนตัวเดียว ไม่มีสูตรเกิด
//     (ส่งเป็นสินค้าหมวดอื่น = กลิ่น + สูตร) ⇒ FG หัวน้ำหอมไม่มีสูตรให้เลือก ของที่ต้องผูกคือตัวกลิ่น
//   · ผู้ใช้เลือก **"กลิ่นอย่างเดียว"** — ฟอร์มหมวดนี้มีช่องกลิ่นแทนช่องสูตร · ไม่มีช่องสูตรรอง
//     (FG เดิม 4 ตัวที่ผูกสูตร 02-020 อยู่ ย้ายไปผูกกลิ่นแม่ของสูตรนั้น — ใบสเปคพิมพ์ชื่อกลิ่น ไม่ใช่สูตร REV)
//   · ไม่บังคับเลือก — เท่ากับช่องสูตรของหมวดอื่น
//
// ⚠️ หมวดอื่น `products.scentId` ยัง derive จากสูตร (FG → สูตร → กลิ่น) เหมือนเดิม — หมวดนี้เท่านั้นที่เลือกกลิ่นตรง
// ⚠️ ไฟล์นี้ต้องเบา (logic ล้วน) — ฟอร์มสินค้าฝั่ง client กับ API ใช้ตัวตัดสินตัวเดียวกัน · ของที่แตะฐานอยู่
//    `productScentSnapshot` (scentFormulaAdmin.js)
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';
import { SCENT_STATUS_LABELS, SCENT_USABLE_STATUSES } from '@/lib/master/scents';

/** หมวดหัวน้ำหอม — ตัวเดียวกับที่สายขอ RD นับเป็น "ส่งเป็นหัวน้ำหอม" (02-020 อย่างเดียว) */
export const FRAGRANCE_OIL_CATEGORY_CODE = PDR_FRAGRANCE_OIL_CODE;

const clean = (value) => String(value ?? '').trim();

/** FG หมวดนี้ผูกกลิ่นแทนสูตรไหม */
export function isFragranceOilCategory(categoryCode) {
  return clean(categoryCode) === FRAGRANCE_OIL_CATEGORY_CODE;
}

/**
 * กลิ่นที่ช่องกลิ่นของ FG หัวน้ำหอมเลือกได้ — เฉพาะที่ใช้งานได้ (กำลังพัฒนา · ใช้งานได้)
 * · ร่างที่ RD ยังไม่รับเข้าทะเบียน / เลิกใช้แล้ว ไม่ให้เลือกใหม่
 * · ตัวที่ FG นี้ถืออยู่คงอยู่ในลิสต์เสมอ (ไม่งั้นเปิดแก้ชื่อสินค้าแล้วกดบันทึก กลิ่นหลุดเงียบ ๆ)
 */
export function fragranceOilScentChoices(scents = [], currentScentId = '') {
  const current = clean(currentScentId);
  return (scents || []).filter((s) => (current && s.id === current) || SCENT_USABLE_STATUSES.includes(s?.status));
}

/**
 * เหตุที่ผูกกลิ่นนี้กับ FG ไม่ได้ — `null` = ผูกได้
 * @param scent แถวทะเบียนกลิ่น (`null` = ไม่พบ)
 * @param currentScentId กลิ่นที่ FG ถืออยู่ก่อนแก้ — ตัวเดิมผ่านเสมอแม้สถานะเปลี่ยนไปแล้ว (กติกาเดียวกับลิสต์)
 */
export function fragranceOilScentError(scent, { currentScentId = null } = {}) {
  if (!scent) return 'ไม่พบกลิ่นที่เลือกในทะเบียนกลิ่น';
  if (currentScentId && scent.id === currentScentId) return null;
  if (SCENT_USABLE_STATUSES.includes(scent.status)) return null;
  const label = SCENT_STATUS_LABELS[scent.status] || scent.status;
  return `กลิ่น "${scent.name}" สถานะ "${label}" ผูกกับสินค้าไม่ได้ — ต้องเป็นกลิ่นที่ RD รับเข้าทะเบียนแล้ว`;
}
