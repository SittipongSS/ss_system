// ชื่อหมวดสินค้าที่ติดไปกับสินค้า/บรรทัด FG (มติผู้ใช้ 2026-09-22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCategoryNames, categoryNamesOf } from './productCategoryNames.js';

const TYPES = [
  { mainCategoryCode: '01', typeCode: '002', nameTh: 'น้ำหอม', nameEn: 'Perfume' },
  { mainCategoryCode: '02', typeCode: '001', nameTh: 'แพ็คเกจบริการ', nameEn: '' },
  { mainCategoryCode: '03', typeCode: '001', nameTh: '', nameEn: 'Scent Design' },
  // prod มีหมวดชื่อว่างทั้งสองภาษาจริง 5 แถว
  { mainCategoryCode: '01', typeCode: '001', nameTh: '', nameEn: '' },
];

test('ใช้ categoryCode ที่บันทึกไว้ก่อน แล้วค่อยถอดจากรหัส FG', () => {
  assert.deepEqual(
    categoryNamesOf({ categoryCode: '01-002', fgCode: 'FG-AAA-02-001-0001' }, TYPES),
    { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' },
  );
  assert.deepEqual(
    categoryNamesOf({ fgCode: 'FG-AAA-01-002-0001' }, TYPES),
    { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' },
  );
});

test('ขาดภาษาไหนถอยไปอีกภาษา · ว่างทั้งคู่/ไม่รู้จักหมวด = null (ไม่เอารหัสดิบมาโชว์)', () => {
  assert.deepEqual(categoryNamesOf({ categoryCode: '02-001' }, TYPES),
    { categoryName: 'แพ็คเกจบริการ', categoryNameEn: 'แพ็คเกจบริการ' });
  assert.deepEqual(categoryNamesOf({ categoryCode: '03-001' }, TYPES),
    { categoryName: 'Scent Design', categoryNameEn: 'Scent Design' });
  assert.equal(categoryNamesOf({ categoryCode: '01-001' }, TYPES), null);
  assert.equal(categoryNamesOf({ categoryCode: '09-999' }, TYPES), null);
  assert.equal(categoryNamesOf({ fgCode: 'FG-001' }, TYPES), null);
  assert.equal(categoryNamesOf(null, TYPES), null);
});

test('attachCategoryNames แปะเฉพาะตัวที่หาชื่อเจอ', () => {
  const rows = [{ id: 'A', categoryCode: '01-002' }, { id: 'B', categoryCode: '01-001' }];
  attachCategoryNames(rows, TYPES);
  assert.equal(rows[0].categoryName, 'น้ำหอม');
  assert.equal('categoryName' in rows[1], false);
});
