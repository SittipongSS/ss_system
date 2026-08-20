// รหัสลูกค้า (AR) คู่ชื่อกิจการ — IS-26080003
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerArIndex, customerHeadline, customerSearchText, customerWithAr } from './customerAr.js';

const customers = [
  { id: 'CUS-1', name: 'บริษัท รวย เหนือ ฝัน จำกัด', arCode: 'AR-787' },
  { id: 'CUS-2', name: 'สปาฟินเเลนด์', arCode: '  AR-899  ' },
  { id: 'CUS-3', name: 'ลูกค้าที่ยังไม่ได้ออกรหัส', arCode: null },
];
const index = customerArIndex(customers);

test('ทะเบียนที่ยังไม่ได้ออกรหัสต้องไม่เข้าแผนที่ — ไม่งั้นได้ค่าว่างไปวาดบนจอ', () => {
  assert.equal(index.get('CUS-1'), 'AR-787');
  assert.equal(index.has('CUS-3'), false);
  assert.equal(customerArIndex(null).size, 0);
});

test('ตัดช่องว่างหัวท้ายของรหัส — ข้อมูลเก่ามีเว้นวรรคติดมา', () => {
  assert.equal(index.get('CUS-2'), 'AR-899');
});

test('ชื่อใช้ค่าที่แถวประทับไว้ก่อน แล้วรหัสอ่านสดจากทะเบียน', () => {
  // ⚠️ ใบเก่าที่ลูกค้าเปลี่ยนชื่อทีหลัง ต้องยังอ่านชื่อ ณ วันที่ผูกได้
  const row = customerWithAr('CUS-1', 'ชื่อเดิมตอนเปิดใบ', index);
  assert.deepEqual(row, { name: 'ชื่อเดิมตอนเปิดใบ', arCode: 'AR-787' });
});

test('ไม่มีชื่อประทับไว้ = ตกไปที่ id ดิบ ดีกว่าขีดที่ตามต่อไม่ได้', () => {
  assert.deepEqual(customerWithAr('CUS-9', null, index), { name: 'CUS-9', arCode: null });
  assert.deepEqual(customerWithAr(null, null, index), { name: '—', arCode: null });
});

test('ค้นด้วยรหัส AR ต้องเจอแถวของลูกค้ารายนั้น', () => {
  const text = customerSearchText('CUS-1', 'บริษัท รวย เหนือ ฝัน จำกัด', index);
  assert.ok(text.includes('AR-787'));
  assert.ok(text.includes('รวย เหนือ ฝัน'));
  // ลูกค้าที่ยังไม่มีรหัส ยังต้องค้นด้วยชื่อได้ตามเดิม
  assert.equal(customerSearchText('CUS-3', 'ลูกค้าที่ยังไม่ได้ออกรหัส', index), 'ลูกค้าที่ยังไม่ได้ออกรหัส');
});

// ── หัวหน้ารายละเอียด: รหัส AR นำหน้าชื่อลูกค้า (มติผู้ใช้ 2026-08-21) ────────
test('customerHeadline: รหัสนำหน้าชื่อ · ไม่มีรหัสก็ไม่มีตัวคั่นลอย', () => {
  assert.equal(customerHeadline('บริษัท ตัวอย่าง จำกัด', 'AR-306'), 'AR-306 · บริษัท ตัวอย่าง จำกัด');
  assert.equal(customerHeadline('บริษัท ตัวอย่าง จำกัด', ''), 'บริษัท ตัวอย่าง จำกัด');
  assert.equal(customerHeadline('บริษัท ตัวอย่าง จำกัด', null), 'บริษัท ตัวอย่าง จำกัด');
  // ไม่มีชื่อ (ยังไม่ผูกลูกค้า/ข้อมูลเก่า) = รหัสล้วน ไม่ใช่ ' · ' ห้อยอยู่
  assert.equal(customerHeadline('', 'AR-306'), 'AR-306');
  assert.equal(customerHeadline('', ''), '');
  // ช่องว่างล้วนนับเป็นไม่มี
  assert.equal(customerHeadline('  ', '  '), '');
  assert.equal(customerHeadline(' ชื่อ ', ' AR-1 '), 'AR-1 · ชื่อ');
});
