// ── pointer ที่ชี้เข้าทะเบียนกลิ่น/สูตร แล้ว "ห้ามหายเงียบ" (mig 0232) ────
//
// ⭐ **รายการเดียว ใช้สามที่** — นับก่อนลบ (`countRegistryRefs`) · ปลดก่อนบังคับลบ
// (`unlinkRegistryRefs`) · และเทสต์ที่เทียบกับไฟล์ migration จริง
// 🐞 เขียนรายการซ้ำสองที่เมื่อไรจะได้อาการที่แย่ที่สุดของฟีเจอร์นี้: **นับอย่าง
// ปลดอีกอย่าง** ⇒ ผู้ดูแลระบบกดบังคับลบแล้วยังโดนฐานข้อมูลปฏิเสธอยู่ดี โดยข้อความ
// ที่ขึ้นจอไม่ได้บอกว่าช่องไหนที่ยังค้าง
//
// ⚠️ **ที่ไม่อยู่ในรายการนี้คือของที่ยังเป็น `SET NULL` โดยตั้งใจ** —
// `products.scentId/formulaId` (สินค้ามีตัวตนของตัวเอง) · `formulas.scentId` ·
// `scent_lineage."derivedFromScentId"` (บรรพบุรุษที่ถูกลบ = "ไม่รู้ที่มา" ซึ่งเป็นจริง)

/** [ตาราง, คอลัมน์] ที่เป็น FK `ON DELETE RESTRICT` เข้า `scents` */
export const SCENT_REF_TARGETS = Object.freeze([
  ['dept_requests', 'scentId'],
  ['dept_request_items', 'scentId'],
  ['dept_request_items', 'producedScentId'],
  ['material_prices', 'scentId'],
]);

/** [ตาราง, คอลัมน์] ที่เป็น FK `ON DELETE RESTRICT` เข้า `formulas` */
export const FORMULA_REF_TARGETS = Object.freeze([
  ['dept_requests', 'formulaId'],
  ['dept_request_items', 'producedFormulaId'],
  ['material_prices', 'formulaId'],
]);

/** `kind` = 'scent' | 'formula' — คืนรายการเป้าหมายของทะเบียนนั้น */
export function registryRefTargets(kind) {
  return kind === 'scent' ? SCENT_REF_TARGETS : FORMULA_REF_TARGETS;
}
