import test from 'node:test';
import assert from 'node:assert/strict';
import { isMyOpenTask, isOpenStatus, statusCounts } from './constants.js';

// ── ป้ายตัวเลขบนเมนู "รายการงาน" (ม-116) ─────────────────────────────────
test('⭐ "รอฉันลงมือ" = ยังไม่จบ + มอบหมายให้ฉัน — งานที่ฉันสั่งคนอื่นไม่นับ', () => {
  const me = 'USR-ME';
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: me }, me), true);
  assert.equal(isMyOpenTask({ status: 'in_progress', assigneeId: me }, me), true);
  assert.equal(isMyOpenTask({ status: 'done', assigneeId: me }, me), false);
  assert.equal(isMyOpenTask({ status: 'cancelled', assigneeId: me }, me), false);
  // งานของคนอื่น — แม้ฉันจะเป็นคนสร้าง ก็ไม่ใช่งานที่รอฉัน
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: 'USR-OTHER' }, me), false);
  // งานที่ยังไม่มีผู้รับผิดชอบ ไม่ใช่ของใครโดยเฉพาะ
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: null }, me), false);
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: me }, ''), false);
});

test('สถานะที่นับว่ายังไม่จบ ตรงกับที่ statusCounts แยกช่อง', () => {
  assert.equal(isOpenStatus('todo'), true);
  assert.equal(isOpenStatus('in_progress'), true);
  assert.equal(isOpenStatus('done'), false);
  const counts = statusCounts([
    { status: 'todo' }, { status: 'in_progress' }, { status: 'done' }, { status: 'cancelled' },
  ]);
  assert.deepEqual(counts, { todo: 1, in_progress: 1, done: 1, cancelled: 1 });
});
