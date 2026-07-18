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
