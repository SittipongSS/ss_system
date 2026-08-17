import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskUrgency } from './derived';

// วันที่สัมพัทธ์กับ "วันนี้" เสมอ — เทสต์ที่ตรึงวันไว้จะเน่าเมื่อเวลาผ่านไป
const shiftDays = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('🐞 งานสถานะ "รอดำเนินการ" ที่เลยกำหนดแล้ว ต้องบอกว่าเลยกำหนด — ไม่ใช่ "ยังไม่เริ่ม"', () => {
  const u = taskUrgency({ status: 'Pending', dueDate: shiftDays(-10) });
  assert.equal(u.overdue, true);
  assert.equal(u.tone, 'overdue');
  assert.match(u.label, /เลยกำหนด 10 วัน/);
});

test('งานที่ยังไม่เริ่มและยังไม่มีกำหนด = ยังไม่เริ่ม (ของเดิมต้องไม่เพี้ยน)', () => {
  assert.deepEqual(taskUrgency({ status: 'Pending' }), { tone: 'idle', label: 'ยังไม่เริ่ม', overdue: false });
});

test('กำลังทำและเลยกำหนด = แดง (อยู่ในมือเรา)', () => {
  const u = taskUrgency({ status: 'In Progress', dueDate: shiftDays(-1) });
  assert.equal(u.tone, 'overdue');
  assert.equal(u.label, 'เลยกำหนด 1 วัน');
});

test('รอคนอื่นและเลยกำหนด = ยังนับว่าเลยกำหนด แต่แยกโทนเป็น waiting', () => {
  const u = taskUrgency({ status: 'Blocked', dueDate: shiftDays(-3) }, { waiting: true });
  assert.equal(u.overdue, true);
  assert.equal(u.tone, 'waiting');
  assert.match(u.label, /เลยกำหนด 3 วัน · รอคนอื่น/);
});

test('ใกล้ครบกำหนด (≤3 วัน) = เหลือกี่วัน · รอคนอื่นแยกโทน', () => {
  assert.equal(taskUrgency({ status: 'In Progress', dueDate: shiftDays(2) }).tone, 'soon');
  assert.equal(taskUrgency({ status: 'Blocked', dueDate: shiftDays(2) }, { waiting: true }).tone, 'waiting');
});

test('งานที่ปิดแล้วไม่ต้องพูดเรื่องกำหนดอีก', () => {
  assert.deepEqual(taskUrgency({ status: 'Completed', dueDate: shiftDays(-30) }), { tone: 'done', label: 'เสร็จแล้ว', overdue: false });
});
