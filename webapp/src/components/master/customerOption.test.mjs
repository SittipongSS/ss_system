import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOptionDisplay, customerSelectOptions } from './customerOption.js';

test('ป้ายเป็น "รหัส · ชื่อ" ตามทรง entity ของระบบ', () => {
  assert.equal(customerOptionDisplay({ arCode: 'AR-015', name: 'บริษัท ก จำกัด' }).text,
    'AR-015 · บริษัท ก จำกัด');
});

// ลูกค้าที่ยังไม่ออกรหัส — โชว์ชื่อเปล่า ไม่ใช่ตัวคั่นลอยที่อ่านเหมือนรหัสหาย
test('ไม่มีรหัส = ชื่อเปล่า ไม่มีตัวคั่นค้าง', () => {
  assert.equal(customerOptionDisplay({ name: 'บริษัท ข จำกัด' }).text, 'บริษัท ข จำกัด');
  assert.equal(customerOptionDisplay({ arCode: '  ', name: 'บริษัท ข จำกัด' }).text, 'บริษัท ข จำกัด');
});

test('ค้นหาเจอทั้งรหัสและชื่อ', () => {
  const { search } = customerOptionDisplay({ arCode: 'AR-015', name: 'บริษัท ก จำกัด' });
  assert.ok(search.includes('AR-015'));
  assert.ok(search.includes('บริษัท ก จำกัด'));
});

// ⭐ รหัส AR มีจำนวนหลักไม่เท่ากัน — เรียงแบบตัวอักษรล้วนจะได้ AR-078 → AR-1001 → AR-109
test('เรียงตามรหัสแบบตัวเลข (AR-1001 ต้องอยู่หลัง AR-109)', () => {
  const rows = customerSelectOptions([
    { id: 'c1', arCode: 'AR-1001', name: 'พันหนึ่ง' },
    { id: 'c2', arCode: 'AR-109', name: 'ร้อยเก้า' },
    { id: 'c3', arCode: 'AR-078', name: 'เจ็ดแปด' },
  ]);
  assert.deepEqual(rows.map((r) => r.arCode), ['AR-078', 'AR-109', 'AR-1001']);
});

test('ลูกค้าที่ยังไม่มีรหัสไปท้ายลิสต์ ไม่ใช่หัวลิสต์', () => {
  const rows = customerSelectOptions([
    { id: 'c1', name: 'ยังไม่มีรหัส' },
    { id: 'c2', arCode: 'AR-001', name: 'มีรหัส' },
  ]);
  assert.deepEqual(rows.map((r) => r.value), ['c2', 'c1']);
});
