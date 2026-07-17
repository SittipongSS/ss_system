import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoTaskUpdates } from './taskUpdates';

const base = { status: 'Pending', dueDate: '2026-07-20' };

test('autoTaskUpdates: แก้ชื่องานเฉย ๆ = ไม่ต้องรบกวนเธรด', () => {
  assert.deepEqual(autoTaskUpdates({ ...base, title: 'ก' }, { ...base, title: 'ข' }), []);
});

test('autoTaskUpdates: เปลี่ยนสถานะ → บันทึกพร้อม from/to', () => {
  const [u] = autoTaskUpdates(base, { ...base, status: 'In Progress' });
  assert.equal(u.kind, 'status');
  assert.match(u.body, /รอดำเนินการ → กำลังทำ/);
  assert.deepEqual(u.meta, { field: 'status', from: 'Pending', to: 'In Progress' });
});

test('autoTaskUpdates: เลื่อนกำหนดเสร็จ → บันทึกวันเดิมไว้ด้วย', () => {
  const [u] = autoTaskUpdates(base, { ...base, dueDate: '2026-07-30' });
  assert.equal(u.kind, 'due');
  assert.match(u.body, /2026-07-20 → 2026-07-30/);
  assert.equal(u.meta.from, '2026-07-20');
});

test('autoTaskUpdates: ล้างกำหนดเสร็จ (มี → ไม่มี) ก็นับว่าเลื่อน', () => {
  const [u] = autoTaskUpdates(base, { ...base, dueDate: null });
  assert.equal(u.kind, 'due');
  assert.match(u.body, /ไม่ระบุ/);
});

test('autoTaskUpdates: dueDate "" กับ null ถือว่าเท่ากัน (ฟอร์มส่ง "" ตอนล้าง)', () => {
  assert.deepEqual(autoTaskUpdates({ ...base, dueDate: null }, { ...base, dueDate: '' }), []);
});

test('autoTaskUpdates: ปิดงานเกินกำหนด = สถานะ + สาเหตุ 2 อัปเดต', () => {
  const out = autoTaskUpdates(base, { ...base, status: 'Completed' }, { lateReason: 'รออนุมัติจากลูกค้า' });
  assert.deepEqual(out.map((u) => u.kind), ['status', 'late']);
  assert.equal(out[1].body, 'รออนุมัติจากลูกค้า');
});

test('autoTaskUpdates: ข้อมูลไม่ครบ = ไม่พัง', () => {
  assert.deepEqual(autoTaskUpdates(null, base), []);
  assert.deepEqual(autoTaskUpdates(base, null), []);
});
