// ── ใบสเปคสินค้า FM-SA-04 ใช้กับสินค้าหมวดไหน (mig 0364) ─────────────────────
//
// ⭐ มติผู้ใช้ 2026-09-16/17: **กลุ่มหลัก 01 (ODM) และ 02 (ธุรกิจบริการ) ทุกชนิด**
// · 03 ค่าออกแบบ และ 04 รายได้อื่นๆ ไม่ใช่ตัวสินค้าแต่เป็นค่าบริการ/รายได้ ⇒ ไม่มี
//   บรรจุภัณฑ์ให้ checklist และไม่มีสเปกให้ลูกค้าเซ็นรับ
// · 02 เอาทุกชนิดรวม `02-001` ระบบกระจายกลิ่นและ `02-024` เครื่องกดสบู่ (เจ้าของ
//   ตอบยืนยันเองหลังเห็นข้อสังเกตว่าสองชนิดนั้นเป็นเครื่อง ไม่มีขวด/ฝา/ซีลฟิล์ม)
//
// ⚠️ **นี่คือ "เลขหมวดตายตัว" โดยตั้งใจ** เหมือน `RETAIL_PRICE_MAIN_CATEGORY` —
// ผลที่ตามมาถ้าวันหนึ่งมีกลุ่มใหม่ที่ต้องมีใบสเปก: **ต้องมาแก้บรรทัดนี้** ไม่ใช่ติ๊ก
// เอาที่หน้าหมวดสินค้า · ถึงตอนนั้นให้ย้ายเป็นช่องติ๊กบนหมวดเหมือน `isExcise`
//
// ⚠️ **ตัดด้วยกลุ่มหลัก ไม่ใช่ `isExcise`** — ภาระภาษีมาจากพิกัดสินค้า ส่วนใบสเปก
// มาจาก "มีของจริงให้ตกลงสเปกกันไหม" สองเรื่องนี้ไม่ได้เดินคู่กัน
import { categoryOf } from '@/lib/master/categoryOf';

export const PRODUCT_SPEC_MAIN_CATEGORIES = Object.freeze(['01', '02']);

/** รับรหัสหมวด `'01-002'` ตรง ๆ — ฟอร์มรู้หมวดก่อนที่รหัส FG จะถูกประกอบ */
export function productSpecUsedForCategory(categoryCode) {
  const main = String(categoryCode || '').slice(0, 2);
  return PRODUCT_SPEC_MAIN_CATEGORIES.includes(main);
}

/** รับรหัส FG — บรรทัดใบสั่งขายถือ `fgCode` เป็น snapshot อยู่แล้ว */
export function productSpecUsedForFgCode(fgCode) {
  return productSpecUsedForCategory(categoryOf(fgCode));
}

/**
 * เหตุผลที่บรรทัดนี้ไม่มีใบสเปก — คืน `null` เมื่อมี
 *
 * ⚠️ คืน **ข้อความ** ไม่ใช่ boolean เพราะจอต้องบอกเหตุตอนกด ไม่ใช่ซ่อนปุ่มเงียบ ๆ
 * (กฎ ui-visibility-rule: ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ)
 */
export function productSpecScopeReason({ fgCode, categoryCode } = {}) {
  const code = categoryCode || categoryOf(fgCode);
  if (!code) return 'รายการนี้ไม่มีรหัสหมวดสินค้า — ใบสเปคออกได้เฉพาะสินค้าหมวด 01 และ 02';
  if (!productSpecUsedForCategory(code)) {
    return `หมวด ${String(code).slice(0, 2)} ไม่ใช้ใบสเปคสินค้า — ใบนี้ออกเฉพาะหมวด 01 และ 02`;
  }
  return null;
}
