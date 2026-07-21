import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProductCategorySelectable,
  normalizeProductCategoryInput,
  productCategoryCode,
} from './productCategory';

test('product category codes are normalized and strictly shaped', () => {
  const { value, errors } = normalizeProductCategoryInput({
    mainCategoryCode: ' 05 ', typeCode: ' 007 ', mainCategoryName: ' บริการ ',
    nameTh: ' ค่าบริการ ', nameEn: '', note: '',
  });
  assert.deepEqual(errors, []);
  assert.equal(productCategoryCode(value), '05-007');
  assert.equal(value.mainCategoryName, 'บริการ');
  assert.equal(value.nameTh, 'ค่าบริการ');
  assert.equal(value.nameEn, null);
});

test('product category requires fixed codes and at least one item name', () => {
  const { errors } = normalizeProductCategoryInput({
    mainCategoryCode: '5', typeCode: '7A', mainCategoryName: '', nameTh: '', nameEn: '',
  });
  assert.ok(errors.includes('รหัสหมวดหลักต้องเป็นตัวเลข 2 หลัก'));
  assert.ok(errors.includes('รหัสหมวดรองต้องเป็นตัวเลข 3 หลัก'));
  assert.ok(errors.includes('กรุณาระบุชื่อหมวดหลัก'));
  assert.ok(errors.includes('กรุณาระบุชื่อหมวดสินค้าอย่างน้อย 1 ภาษา'));
});

test('ช่องติ๊กกำกับดูแล (mig 0131): default false, รับเฉพาะ boolean, partial ไม่แตะค่าเดิม', () => {
  // สร้างใหม่ไม่ส่งธง → default false ทั้งคู่ (ตรงกับ DB DEFAULT false)
  const created = normalizeProductCategoryInput({
    mainCategoryCode: '05', typeCode: '007', mainCategoryName: 'บริการ', nameTh: 'ค่าบริการ',
  });
  assert.equal(created.value.isExcise, false);
  assert.equal(created.value.requiresFdaNotice, false);

  const flagged = normalizeProductCategoryInput({
    mainCategoryCode: '05', typeCode: '007', mainCategoryName: 'บริการ', nameTh: 'ค่าบริการ',
    isExcise: true, requiresFdaNotice: true,
  });
  assert.equal(flagged.value.isExcise, true);
  assert.equal(flagged.value.requiresFdaNotice, true);

  // partial (PATCH) ไม่ส่งธง → ไม่อยู่ใน value (ไม่ทับค่าเดิมใน DB)
  const partial = normalizeProductCategoryInput({ nameTh: 'ชื่อใหม่' }, { partial: true });
  assert.ok(!('isExcise' in partial.value));
  assert.ok(!('requiresFdaNotice' in partial.value));

  // ค่าที่ไม่ใช่ boolean ถูกปฏิเสธ — กัน "true"/1 หลุดมาจาก client อื่น
  const invalid = normalizeProductCategoryInput({ isExcise: 'true' }, { partial: true });
  assert.ok(invalid.errors.some((error) => error.includes('isExcise')));
});

test('inactive category remains selectable only for its current historic value', () => {
  const row = { mainCategoryCode: '01', typeCode: '002', isActive: false };
  assert.equal(isProductCategorySelectable(row), false);
  assert.equal(isProductCategorySelectable(row, '01-002'), true);
});
