import { normalizeProductCategoryInput, productCategoryCode } from './productCategory';

export const PRODUCT_CATEGORY_IMPORT_VERSION = 'PC-IMPORT-1';
export const PRODUCT_CATEGORY_IMPORT_MAX_ROWS = 2000;
export const PRODUCT_CATEGORY_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export const PRODUCT_CATEGORY_IMPORT_HEADERS = Object.freeze({
  mainCategoryCode: 'รหัสหมวดหลัก',
  mainCategoryName: 'ชื่อหมวดหลัก',
  typeCode: 'รหัสหมวดรอง',
  nameTh: 'ชื่อหมวดสินค้า (ไทย)',
  nameEn: 'Product category name (English)',
  status: 'สถานะ',
  note: 'หมายเหตุ',
  recordId: '__recordId',
  expectedUpdatedAt: '__updatedAt',
});

export const PRODUCT_CATEGORY_STATUS_LABELS = Object.freeze({
  active: 'ใช้งาน',
  inactive: 'พักใช้งาน',
});

const comparableText = (value) => String(value ?? '').trim();
const comparableTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

function statusValue(value) {
  const text = comparableText(value);
  if (text === PRODUCT_CATEGORY_STATUS_LABELS.active) return { value: true, error: null };
  if (text === PRODUCT_CATEGORY_STATUS_LABELS.inactive) return { value: false, error: null };
  return { value: null, error: 'สถานะต้องเป็น “ใช้งาน” หรือ “พักใช้งาน”' };
}

function fieldsChanged(before, after) {
  return ['mainCategoryName', 'nameTh', 'nameEn', 'note'].some(
    (key) => comparableText(before?.[key]) !== comparableText(after?.[key]),
  );
}

function issue(row, message, kind = 'error') {
  if (!row.errors.includes(message)) row.errors.push(message);
  if (kind === 'conflict') row.hasConflict = true;
}

function normalizeWorkbookRow(raw) {
  const input = {
    mainCategoryCode: comparableText(raw.mainCategoryCode),
    mainCategoryName: comparableText(raw.mainCategoryName),
    typeCode: comparableText(raw.typeCode),
    nameTh: comparableText(raw.nameTh),
    nameEn: comparableText(raw.nameEn),
    note: comparableText(raw.note),
  };
  const normalized = normalizeProductCategoryInput(input);
  const status = statusValue(raw.status);
  const errors = [...normalized.errors];
  if (status.error) errors.push(status.error);
  for (const field of raw.formulaFields || []) {
    errors.push(`คอลัมน์ ${field} ต้องเป็นค่าคงที่และห้ามใช้สูตร`);
  }
  const value = {
    ...normalized.value,
    mainCategoryCode: input.mainCategoryCode,
    typeCode: input.typeCode,
    isActive: status.value,
  };
  return {
    rowNumber: Number(raw.rowNumber) || 0,
    recordId: comparableText(raw.recordId),
    expectedUpdatedAt: comparableTime(raw.expectedUpdatedAt),
    value,
    key: productCategoryCode(value),
    errors: [...new Set(errors)],
    hasConflict: false,
    current: null,
  };
}

/**
 * Compare workbook rows with the latest product_types snapshot. This function
 * is intentionally pure: the preview API persists its result only after every
 * row has been classified here.
 */
export function planProductCategoryImport(rawRows = [], currentRows = []) {
  const currentByKey = new Map(currentRows.map((row) => [productCategoryCode(row), row]));
  const currentById = new Map(currentRows.map((row) => [String(row.id), row]));
  const rows = rawRows.map(normalizeWorkbookRow);

  const rowsByKey = new Map();
  for (const row of rows) {
    if (!row.key) continue;
    const group = rowsByKey.get(row.key) || [];
    group.push(row);
    rowsByKey.set(row.key, group);
  }
  for (const [key, duplicates] of rowsByKey) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) issue(row, `รหัส ${key} ซ้ำในไฟล์`);
  }

  for (const row of rows) {
    const currentByCode = currentByKey.get(row.key) || null;
    const currentFromMetadata = row.recordId ? currentById.get(row.recordId) || null : null;

    if (row.recordId && !currentFromMetadata) {
      issue(row, 'ไม่พบรายการต้นทางจากไฟล์ กรุณาดาวน์โหลดไฟล์ล่าสุด', 'conflict');
    } else if (currentFromMetadata && productCategoryCode(currentFromMetadata) !== row.key) {
      issue(row, 'รหัสหมวดเดิมถูกแก้ไข ซึ่งระบบไม่อนุญาต', 'error');
    }
    if (currentByCode && row.recordId && String(currentByCode.id) !== row.recordId) {
      issue(row, `รหัส ${row.key} อ้างถึงคนละรายการกับไฟล์ต้นทาง`, 'conflict');
    }
    if (!currentByCode && row.recordId && !currentFromMetadata) {
      issue(row, `รายการเดิม ${row.key || row.recordId} ไม่อยู่ในฐานข้อมูลแล้ว`, 'conflict');
    }
    if (currentByCode && (!row.recordId || !row.expectedUpdatedAt)) {
      issue(row, `รายการ ${row.key} ไม่มีข้อมูลเวอร์ชัน กรุณาใช้ไฟล์ที่ดาวน์โหลดจากระบบ`, 'conflict');
    }
    if (currentByCode && row.expectedUpdatedAt &&
        comparableTime(currentByCode.updatedAt) !== row.expectedUpdatedAt) {
      issue(row, `รายการ ${row.key} ถูกแก้ไขหลังจากสร้างไฟล์ กรุณาดาวน์โหลดไฟล์ล่าสุด`, 'conflict');
    }
    row.current = currentByCode;
  }

  const rowsByMainCode = new Map();
  for (const row of rows) {
    const mainCode = row.value.mainCategoryCode;
    if (!/^\d{2}$/.test(mainCode)) continue;
    const group = rowsByMainCode.get(mainCode) || [];
    group.push(row);
    rowsByMainCode.set(mainCode, group);
  }

  for (const [mainCode, group] of rowsByMainCode) {
    const names = new Set(group.map((row) => comparableText(row.value.mainCategoryName)).filter(Boolean));
    if (names.size > 1) {
      for (const row of group) issue(row, `รหัสหมวดหลัก ${mainCode} มีชื่อหมวดหลักมากกว่า 1 ค่า`);
      continue;
    }

    const desiredName = [...names][0] || '';
    const existingGroup = currentRows.filter((row) => row.mainCategoryCode === mainCode);
    const renaming = existingGroup.some(
      (row) => comparableText(row.mainCategoryName) !== desiredName,
    );
    if (!renaming || !existingGroup.length) continue;

    const fileKeys = new Set(group.map((row) => row.key));
    const missing = existingGroup.filter((row) => !fileKeys.has(productCategoryCode(row)));
    if (missing.length) {
      const missingCodes = missing.map(productCategoryCode).join(', ');
      for (const row of group) {
        issue(row, `การเปลี่ยนชื่อหมวดหลัก ${mainCode} ต้องมีหมวดรองครบทั้งกลุ่ม (ขาด ${missingCodes})`);
      }
    }
  }

  const plannedRows = rows.map((row) => {
    const before = row.current ? { ...row.current } : null;
    const after = {
      ...(before || {}),
      mainCategoryCode: row.value.mainCategoryCode,
      mainCategoryName: row.value.mainCategoryName,
      typeCode: row.value.typeCode,
      nameTh: row.value.nameTh,
      nameEn: row.value.nameEn,
      note: row.value.note,
      isActive: row.value.isActive,
    };

    let action;
    if (row.errors.length) action = row.hasConflict ? 'conflict' : 'error';
    else if (!before) action = 'create';
    else {
      const contentChanged = fieldsChanged(before, after);
      const activeChanged = before.isActive !== after.isActive;
      if (!contentChanged && !activeChanged) action = 'unchanged';
      else if (!contentChanged && activeChanged) action = after.isActive ? 'activate' : 'deactivate';
      else action = 'update';
    }

    return {
      rowNumber: row.rowNumber,
      mainCategoryCode: row.value.mainCategoryCode || null,
      typeCode: row.value.typeCode || null,
      code: row.key,
      action,
      before,
      after,
      errors: row.errors,
      expectedUpdatedAt: row.current ? row.expectedUpdatedAt || null : null,
    };
  });

  const summary = {
    total: plannedRows.length,
    create: plannedRows.filter((row) => row.action === 'create').length,
    update: plannedRows.filter((row) => row.action === 'update').length,
    activate: plannedRows.filter((row) => row.action === 'activate').length,
    deactivate: plannedRows.filter((row) => row.action === 'deactivate').length,
    unchanged: plannedRows.filter((row) => row.action === 'unchanged').length,
    error: plannedRows.filter((row) => row.action === 'error').length,
    conflict: plannedRows.filter((row) => row.action === 'conflict').length,
  };
  const changeCount = summary.create + summary.update + summary.activate + summary.deactivate;
  return {
    rows: plannedRows,
    summary,
    hasChanges: changeCount > 0,
    committable: summary.error === 0 && summary.conflict === 0 && changeCount > 0,
  };
}
