import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, productCategoryLabel } from './productFilter.js';

const TYPES = [
  { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '002', nameTh: 'น้ำหอมสำหรับผิวกาย', nameEn: 'BODY PERFUME', isExcise: true },
  { mainCategoryCode: '03', mainCategoryName: 'OEM', typeCode: '001', nameTh: 'วัตถุดิบ', nameEn: 'RAW', isExcise: false },
];
const P = (over) => ({ fgCode: 'FG-1', productDescription: 'ก', isActive: true, ...over });

test('เลิกใช้ถูกตัดออก จนกว่าจะติ๊ก "รวมสินค้าที่เลิกใช้"', () => {
  const rows = [P({ fgCode: 'A' }), P({ fgCode: 'B', isActive: false })];
  assert.deepEqual(filterProducts(rows).map((r) => r.fgCode), ['A']);
  assert.deepEqual(filterProducts(rows, { showInactive: true }).map((r) => r.fgCode), ['A', 'B']);
});

test('สถานะอนุมัติ: NULL ของแถวเก่านับเป็น approved', () => {
  const rows = [P({ fgCode: 'A' }), P({ fgCode: 'B', approvalStatus: 'pending' })];
  assert.deepEqual(filterProducts(rows, { statuses: ['approved'] }).map((r) => r.fgCode), ['A']);
  assert.deepEqual(filterProducts(rows, { statuses: ['pending'] }).map((r) => r.fgCode), ['B']);
});

// มิติ "ขึ้นทะเบียน" มีความหมายเฉพาะหมวดสรรพสามิต — เลือกแล้วหมวดอื่นหายทั้งหมด
test('ตัวกรองขึ้นทะเบียนตัดสินค้าหมวดอื่นทิ้งทั้งหมด', () => {
  const rows = [
    P({ fgCode: 'A', categoryCode: '01-002', registrationStatus: 'none' }),
    P({ fgCode: 'B', categoryCode: '01-002', registrationStatus: 'approved' }),
    P({ fgCode: 'C', categoryCode: '03-001' }), // ไม่ใช่หมวดสรรพสามิต
  ];
  const out = filterProducts(rows, { registrations: ['none'], productTypes: TYPES });
  assert.deepEqual(out.map((r) => r.fgCode), ['A']);
});

test('ค้นได้ทั้งรหัส ชื่อสองภาษา แบรนด์ และชื่อหมวด', () => {
  const rows = [
    P({ fgCode: 'FG-108', productDescription: 'น้ำหอม', productDescriptionEn: 'Perfume', brandName: 'Artepola', categoryCode: '01-002' }),
    P({ fgCode: 'FG-999', productDescription: 'อื่น', categoryCode: '03-001' }),
  ];
  const hits = (q) => filterProducts(rows, { search: q, productTypes: TYPES }).map((r) => r.fgCode);
  assert.deepEqual(hits('108'), ['FG-108']);
  assert.deepEqual(hits('perfume'), ['FG-108']);      // ไม่สนตัวพิมพ์
  assert.deepEqual(hits('ARTEPOLA'), ['FG-108']);
  assert.deepEqual(hits('BODY PERFUME'), ['FG-108']); // ชื่อหมวด
  assert.deepEqual(hits('  '), ['FG-108', 'FG-999']); // ช่องว่างล้วน = ไม่กรอง
});

test('ไม่ส่ง productTypes มา = ค้นชื่อหมวดไม่เจอ (กับดักที่ต้องรู้)', () => {
  const rows = [P({ fgCode: 'FG-108', categoryCode: '01-002' })];
  assert.deepEqual(filterProducts(rows, { search: 'BODY PERFUME' }), []);
  assert.equal(productCategoryLabel(rows[0], []), null);
  assert.deepEqual(productCategoryLabel(rows[0], TYPES), { main: 'ODM', sub: 'BODY PERFUME · น้ำหอมสำหรับผิวกาย' });
});

test('หมวดถอดจาก fgCode ได้เมื่อแถวเก่าไม่มี categoryCode', () => {
  const legacy = P({ fgCode: 'FG-108-01-002-2009' });
  assert.equal(productCategoryLabel(legacy, TYPES)?.main, 'ODM');
});
