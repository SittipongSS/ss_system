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

test('inactive category remains selectable only for its current historic value', () => {
  const row = { mainCategoryCode: '01', typeCode: '002', isActive: false };
  assert.equal(isProductCategorySelectable(row), false);
  assert.equal(isProductCategorySelectable(row, '01-002'), true);
});
