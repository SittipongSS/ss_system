// ── ป้าย/ชุดค้นของ dropdown ลูกค้า ────────────────────────────────────────
//
// 🐞 2026-09-03: ลูกค้าที่มีแต่ชื่ออังกฤษ (คอลัมน์ `name` ว่าง) ได้ป้าย `AR-630 · —`
// ทุก dropdown และพิมพ์ชื่ออังกฤษหาไม่เจอ เพราะไฟล์นี้อ่าน `customer.name` ดิบ
import test from 'node:test';
import assert from 'node:assert/strict';

import { customerOptionDisplay, customerSelectOptions } from './customerOption.js';

const TH = { id: 'CUS-1', arCode: 'AR-001', name: 'บริษัท เอบีซี จำกัด', nameEn: 'ABC Co., Ltd.' };
const EN_ONLY = { id: 'CUS-2', arCode: 'AR-630', name: '', nameEn: 'Shinesty company' };

test('ป้าย: ไทยก่อน ไม่มีค่อยตกไปอังกฤษ — ไม่มีทางได้ "รหัส · —" ทั้งที่มีชื่อ', () => {
  assert.equal(customerOptionDisplay(TH).text, 'AR-001 · บริษัท เอบีซี จำกัด');
  assert.equal(customerOptionDisplay(EN_ONLY).text, 'AR-630 · Shinesty company');
});

test('ป้าย: ไม่มีทั้งรหัสและชื่อไทย = โชว์ชื่ออังกฤษเปล่า ไม่ใช่ "— ชื่อ"', () => {
  assert.equal(customerOptionDisplay({ id: 'CUS-3', nameEn: 'Foreign Co.' }).text, 'Foreign Co.');
});

test('ชุดค้น: เจอทั้งรหัสและชื่อทั้งสองภาษา แม้ป้ายโชว์ภาษาเดียว', () => {
  const { search } = customerOptionDisplay(TH);
  assert.ok(search.includes('AR-001'));
  assert.ok(search.includes('บริษัท เอบีซี จำกัด'));
  // ⚠️ ตัวจริงของบั๊ก: ป้ายโชว์ไทย แต่คนพิมพ์หาลูกค้าต่างชาติด้วยชื่ออังกฤษเสมอ
  assert.ok(search.includes('ABC Co., Ltd.'), 'ชุดค้นต้องมีชื่ออังกฤษด้วย');
  assert.ok(customerOptionDisplay(EN_ONLY).search.includes('Shinesty'));
});

test('options: เรียงตามรหัสแบบ numeric และตัวไม่มีรหัสไปท้ายลิสต์ (ของเดิมต้องไม่เพี้ยน)', () => {
  const rows = [
    { id: 'a', arCode: 'AR-1001', name: 'พัน' },
    { id: 'b', arCode: 'AR-078', name: 'เจ็ดแปด' },
    { id: 'c', name: 'ไม่มีรหัส' },
    { id: 'd', arCode: 'AR-109', nameEn: 'One Zero Nine' },
  ];
  assert.deepEqual(customerSelectOptions(rows).map((o) => o.arCode), ['AR-078', 'AR-109', 'AR-1001', '']);
  // ลูกค้าอังกฤษล้วนต้องมีป้ายอ่านออก ไม่ใช่ค่าว่างหรือ id ดิบ
  assert.equal(customerSelectOptions(rows).find((o) => o.value === 'd').label, 'AR-109 · One Zero Nine');
});
