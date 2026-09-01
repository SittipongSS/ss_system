export const PRODUCT_CATEGORY_LIMITS = Object.freeze({
  mainCategoryName: 50,
  nameTh: 100,
  nameEn: 100,
  note: 255,
});

export function productCategoryCode(row) {
  if (!row?.mainCategoryCode || !row?.typeCode) return '';
  return `${row.mainCategoryCode}-${row.typeCode}`;
}

export function normalizeProductCategoryInput(input = {}, { partial = false } = {}) {
  const value = {};
  const errors = [];
  const setText = (key, max, required = false) => {
    if (partial && input[key] === undefined) return;
    const text = String(input[key] ?? '').trim();
    if (required && !text) errors.push(`กรุณาระบุ${key === 'mainCategoryName' ? 'ชื่อหมวดหลัก' : 'ชื่อหมวดสินค้า'}`);
    if (text.length > max) errors.push(`${key} ต้องไม่เกิน ${max} ตัวอักษร`);
    value[key] = text || null;
  };

  if (!partial || input.mainCategoryCode !== undefined) {
    const code = String(input.mainCategoryCode ?? '').trim();
    if (!/^\d{2}$/.test(code)) errors.push('รหัสหมวดหลักต้องเป็นตัวเลข 2 หลัก');
    value.mainCategoryCode = code;
  }
  if (!partial || input.typeCode !== undefined) {
    const code = String(input.typeCode ?? '').trim();
    if (!/^\d{3}$/.test(code)) errors.push('รหัสหมวดรองต้องเป็นตัวเลข 3 หลัก');
    value.typeCode = code;
  }

  setText(
    'mainCategoryName',
    PRODUCT_CATEGORY_LIMITS.mainCategoryName,
    !partial || input.mainCategoryName !== undefined,
  );
  setText('nameTh', PRODUCT_CATEGORY_LIMITS.nameTh);
  setText('nameEn', PRODUCT_CATEGORY_LIMITS.nameEn);
  setText('note', PRODUCT_CATEGORY_LIMITS.note);

  // ช่องติ๊กกำกับดูแล (mig 0131): isExcise = เสียภาษีสรรพสามิต (ขับตรรกะภาษีทั้งระบบ),
  // requiresFdaNotice = ต้องจดแจ้ง อย. (เฟสแรก: ป้าย + เตือนตอนสร้างสินค้า)
  for (const key of ['isExcise', 'requiresFdaNotice']) {
    if (partial && input[key] === undefined) continue;
    if (input[key] !== undefined && typeof input[key] !== 'boolean') {
      errors.push(`${key} ต้องเป็นค่า true/false`);
      continue;
    }
    value[key] = !!input[key];
  }

  if (!partial || input.nameTh !== undefined || input.nameEn !== undefined) {
    const nameTh = value.nameTh ?? String(input.nameTh ?? '').trim();
    const nameEn = value.nameEn ?? String(input.nameEn ?? '').trim();
    if (!nameTh && !nameEn) errors.push('กรุณาระบุชื่อหมวดสินค้าอย่างน้อย 1 ภาษา');
  }

  return { value, errors: [...new Set(errors)] };
}

export function isProductCategorySelectable(row, currentCode = '') {
  return row?.isActive !== false || productCategoryCode(row) === currentCode;
}

// ── ลบหมวดสินค้า (มติผู้ใช้ 2026-09-01) ──────────────────────────────────
//
// ⭐ **รหัสหมวดที่โค้ดอ้างตรง ๆ ลบไม่ได้เลย แม้ยังไม่มีสินค้าสักตัว** — ต่างจากทีม
//   ตรงที่นี่ไม่มี FK ห้ามลบ (`categoryOf(fgCode)` อ่านจากตัวรหัสในสตริง fgCode เอง
//   ไม่ใช่ join ตาราง `product_types`) ⇒ ลบแถวไปก็ไม่มี error จาก Postgres แต่จะเสีย
//   สองอย่างเงียบ ๆ: (1) เลือกหมวดนี้ตอนสร้างสินค้าใหม่ไม่ได้อีกเลย — ปิดทางสร้าง
//   ของใหม่ทั้งหมวดโดยไม่มีใครตั้งใจ (2) สินค้าเดิมที่ยังใช้รหัสนี้อยู่จะหาชื่อ/ธง
//   ภาษี/อย. ของหมวดตัวเองไม่เจอ (`categoryInfoOf` คืน null)
//   ⚠️ ทุกโค้ดที่เทียบรหัสตรง ๆ ต้องมาต่อท้ายลิสต์นี้ — ลืมอันไหน = ลบหมวดนั้นได้
//   ทั้งที่ไม่ควร (โรคเดียวกับ `LEAD_BELL_KINDS` ที่ต้องตรงกับ kind ที่ยิงจริงเสมอ)
export const PROTECTED_PRODUCT_CATEGORY_CODES = Object.freeze([
  '02-001', // SERVICE_ROUND_CATEGORY — lib/sales/serviceOrders.js (แพ็คเกจบริการ SDS)
  '02-020', // PDR_FRAGRANCE_OIL_CODE — lib/requests/pdrFields.js
  '03-001', '03-002', '03-005', '03-008', '03-009', '03-010', // SCENT_DESIGN_CATEGORIES — lib/requests/scentDesignOrders.js
  '01-001', // pdrProductKinds/categoryCode ตั้งต้น — lib/documents/standardPreview.js
  '02-010', // pdrProductKinds/categoryCode ตั้งต้น — lib/documents/standardPreview.js
]);

/**
 * เหตุผลที่ลบหมวดสินค้านี้ไม่ได้ — คืนข้อความไทย หรือ `''` ถ้าลบได้
 *
 * @param row            แถวทะเบียนหมวด
 * @param usage.total    จำนวนที่ใช้งานอยู่รวมสินค้า/ดีล/โครงการ (คำนวณจากฐานจริง)
 * @param protectedCode  รหัสนี้ถูกโค้ดอ้างตรง ๆ ไหม (PROTECTED_PRODUCT_CATEGORY_CODES)
 */
export function productCategoryDeleteBlocker(row, { usage = {}, protectedCode = false } = {}) {
  if (!row) return 'ไม่พบหมวดสินค้านี้';
  if (protectedCode) {
    return `หมวดนี้เป็นหมวดที่ระบบอ้างตรง ๆ ในโค้ด (เช่น งานบริการ/PDR/ออกแบบกลิ่น) — ลบไม่ได้ ใช้ "พักใช้" แทน`;
  }
  const total = Number(usage.total) || 0;
  if (total > 0) {
    const detail = [
      usage.products ? `${usage.products} สินค้า` : null,
      usage.deals ? `${usage.deals} ดีล` : null,
      usage.projects ? `${usage.projects} โครงการ` : null,
    ].filter(Boolean).join(' · ');
    return `หมวดนี้ถูกใช้ไปแล้ว (${detail}) — ลบไม่ได้เพราะของเดิมจะหาชื่อ/ธงภาษีของหมวดไม่เจอ · ใช้ "พักใช้" แทน`;
  }
  return '';
}
