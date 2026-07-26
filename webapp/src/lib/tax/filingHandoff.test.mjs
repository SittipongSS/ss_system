import test from 'node:test';
import assert from 'node:assert/strict';
import { filingHandoffTarget } from './filingHandoff.js';

const at = (status) => ({ id: 'TAX-1', status, customerName: 'ลูกค้า ก' });
const spaceOf = (from, to) => filingHandoffTarget(at(from), at(to))?.space ?? null;

test('จุดเปลี่ยนมือ SA ↔ LG แจ้งถูก space', () => {
  assert.equal(spaceOf('draft', 'pending'), 'sales');     // ฝ่ายขายไปเก็บเงิน
  assert.equal(spaceOf('pending', 'received'), 'legal');  // ถึงคิวฝ่ายกฎหมายให้ไปยื่น
  assert.equal(spaceOf('filing', 'complete'), 'sales');   // ชำระแล้ว ฝ่ายขายส่งเอกสารต่อ
  assert.equal(spaceOf('received', 'rejected'), 'sales'); // ตีกลับให้ฝ่ายขายแก้
});

test('ฝ่ายขายแก้ใบที่ถูกตีกลับแล้วส่งกลับ = แจ้งฝ่ายกฎหมายอีกรอบ', () => {
  assert.equal(spaceOf('rejected', 'received'), 'legal');
});

test('ความเคลื่อนไหวภายในเลนเดียวกันไม่แจ้ง (กันการ์ดรบกวน)', () => {
  assert.equal(spaceOf('received', 'filing'), null);    // LG เริ่มยื่นเอง
  assert.equal(spaceOf('complete', 'delivered'), null); // SA ปิดงานเอง = ปลายทาง
});

test('สถานะไม่เปลี่ยน / ข้อมูลไม่ครบ = ไม่แจ้ง', () => {
  assert.equal(filingHandoffTarget(at('received'), at('received')), null);
  assert.equal(filingHandoffTarget(null, at('received')), null);
  assert.equal(filingHandoffTarget(at('received'), null), null);
});

test('ทุกปลายทางที่แจ้งต้องบอก "ขั้นถัดไป" — ไม่ใช่แค่บอกว่าเปลี่ยนสถานะแล้ว', () => {
  for (const status of ['pending', 'received', 'complete', 'rejected']) {
    const target = filingHandoffTarget(at('draft'), at(status));
    assert.ok(target?.next, `${status} ต้องมีขั้นถัดไป`);
    assert.ok(target.title);
  }
});
