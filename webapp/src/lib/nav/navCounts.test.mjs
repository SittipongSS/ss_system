import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deptRequestsTodoCount, myTasksTodoCount, pruneZeroCounts, requestsTodoCount,
} from './navCounts.js';

const req = (over = {}) => ({
  id: 'r1', status: 'pending', dept: 'PC', kind: 'inquiry', _mine: false, ...over,
});

test('เลขบนเมนูคำร้อง = ใบที่รอฝ่ายฉันตอบ ไม่ใช่ทุกใบที่มองเห็น', () => {
  const rows = [
    req({ id: 'a', dept: 'PC' }),                       // รอฝ่ายฉัน
    req({ id: 'b', dept: 'RD' }),                       // ฝ่ายอื่น
    req({ id: 'c', dept: 'PC', status: 'draft', _mine: true }), // ร่างของฉัน ยังไม่ส่ง
  ];
  assert.equal(requestsTodoCount(rows, ['PC']), 1);
});

test('ร่างของตัวเองไม่นับ — ไม่งั้นเลขบนเมนูบวกซ้ำกับแท็บ "ที่ฉันเปิด"', () => {
  const rows = [req({ status: 'draft', _mine: true, dept: 'PC' })];
  assert.equal(requestsTodoCount(rows, ['PC']), 0);
});

test('ไม่มีฝ่ายที่ตอบได้ = ไม่มีอะไรรอเรา', () => {
  assert.equal(requestsTodoCount([req({ dept: 'PC' })], []), 0);
});

test('คิวของฝ่าย (RD) นับเฉพาะใบที่ยังรอฝ่ายนั้นตอบ', () => {
  const rows = [
    req({ id: 'a', dept: 'RD' }),
    req({ id: 'b', dept: 'PC' }),
  ];
  assert.equal(deptRequestsTodoCount(rows, 'RD'), 1);
  assert.equal(deptRequestsTodoCount(rows, null), 0);
});

test('งานของฉัน = ยังไม่เสร็จ + ฉันเป็นผู้รับผิดชอบ (งานที่ฉันมอบให้คนอื่นไม่นับ)', () => {
  const me = 'u1';
  const tasks = [
    { id: '1', status: 'Pending', assigneeId: me },              // ต้องทำ
    { id: '2', status: 'Completed', assigneeId: me },            // เสร็จแล้ว
    { id: '3', status: 'Pending', ownerId: me, assigneeId: 'u2' }, // ฉันมอบให้คนอื่น
    { id: '4', status: 'InProgress', proxyBy: me, assigneeId: 'u2' }, // ฉันดึงมาทำแทน
  ];
  assert.equal(myTasksTodoCount(tasks, me), 2);
});

test('ค่าศูนย์ถูกตัดทิ้ง — เมนูที่ไม่มีอะไรค้างต้องไม่มีป้าย', () => {
  assert.deepEqual(pruneZeroCounts({ requests: 3, tasks: 0, leads: 0 }), { requests: 3 });
});
