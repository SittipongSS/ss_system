// Tests helper กลางของธงหมวดสินค้า (mig 0131) — สรรพสามิต/จดแจ้ง อย. ตัดสินจาก
// ช่องติ๊กบน product_types ไม่ใช่รหัสหมวดตายตัว. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, categoryFlags, isExciseCategory, categoryInfo } from './categoryOf';

const TYPES = [
  { mainCategoryCode: '01', typeCode: '002', nameTh: 'น้ำหอมฉีดผิวกาย', isExcise: true, requiresFdaNotice: false },
  { mainCategoryCode: '02', typeCode: '001', nameTh: 'ครีมบำรุง', isExcise: false, requiresFdaNotice: true },
  { mainCategoryCode: '03', typeCode: '005', nameTh: 'หมวดใหม่', isExcise: true, requiresFdaNotice: true },
];

test('categoryOf แยกรหัสหมวดจาก fgCode', () => {
  assert.equal(categoryOf('FG-AAA-01-002-1234'), '01-002');
  assert.equal(categoryOf('ไม่ใช่รหัส'), null);
  assert.equal(categoryOf(null), null);
});

test('categoryFlags อ่านธงจากแถวหมวด — หมวดไม่รู้จัก/ไม่ส่งรายการ = false ทุกธง', () => {
  assert.deepEqual(categoryFlags('01-002', TYPES), { isExcise: true, requiresFdaNotice: false });
  assert.deepEqual(categoryFlags('02-001', TYPES), { isExcise: false, requiresFdaNotice: true });
  assert.deepEqual(categoryFlags('03-005', TYPES), { isExcise: true, requiresFdaNotice: true });
  assert.deepEqual(categoryFlags('09-999', TYPES), { isExcise: false, requiresFdaNotice: false });
  // จงใจไม่มี fallback รหัสตายตัว — ไม่ส่งรายการหมวด = ไม่รู้จัก = false
  assert.deepEqual(categoryFlags('01-002'), { isExcise: false, requiresFdaNotice: false });
});

test('isExciseCategory ตามธง isExcise — รหัส 01-002 ไม่ใช่ค่าพิเศษอีกต่อไป', () => {
  assert.equal(isExciseCategory('01-002', TYPES), true);
  assert.equal(isExciseCategory('03-005', TYPES), true);
  assert.equal(isExciseCategory('02-001', TYPES), false);
  // หมวด 01-002 ที่ "ไม่ได้ติ๊ก" ธง → ไม่เข้าข่าย (พิสูจน์ว่าตรรกะมาจาก DB จริง)
  const unticked = [{ mainCategoryCode: '01', typeCode: '002', isExcise: false }];
  assert.equal(isExciseCategory('01-002', unticked), false);
});

test('categoryInfo คืน typeInfo พร้อมธง — ใช้ต่อใน ProductForm/popup ได้ตรง ๆ', () => {
  const info = categoryInfo('FG-AAA-02-001-9', TYPES);
  assert.equal(info.found, true);
  assert.equal(info.code, '02-001');
  assert.equal(info.typeInfo.requiresFdaNotice, true);
  assert.equal(info.typeInfo.isExcise, false);
});
