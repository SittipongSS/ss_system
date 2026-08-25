// ── รอบแก้ต้องแจ้งวันส่งใหม่ (มติผู้ใช้ 2026-08-25) ────────────────────────
//
// ครอบทั้งตัวตัดสิน (`dueIsStale`) และผลที่มันมีต่อ **ทุกจอที่เล่าขั้นเดียวกัน** —
// ป้ายสถานะ · รางบนหน้ารายละเอียด · รางบนตาราง · ด่านฝั่ง server · คิว
// ⚠️ เทสต์ตัวตัดสินอย่างเดียวไม่พอ: บั๊กที่ผู้ใช้เจอคือ "จอหนึ่งบอกผ่านแล้ว อีกจอบอก
// ยังค้าง" ซึ่งเกิดตอนผู้เรียกคนใดคนหนึ่งลืมถามตัวตัดสิน ไม่ใช่ตอนตัวตัดสินผิด
import test from 'node:test';
import assert from 'node:assert/strict';

import { dueIsStale, openReworkRows } from './dueRound.js';
import { requestAwaitingDue, requestStatusView } from './statuses.js';
import { commitDueRequestError, rescheduleRequestError } from './stages.js';
import { requestRailSteps } from './requestRail.js';
import { requestQueueTrack } from './queueTrack.js';
import { requestNextStep } from './queueBoard.js';

const ACKED = '2026-08-01T03:00:00.000Z';
const DUE_SET = '2026-08-05T03:00:00.000Z';   // RD แจ้งวันครั้งแรก
const REWORK = '2026-08-20T03:00:00.000Z';    // ลูกค้าขอแก้ หลังจากนั้น

// แถวรอบแรกที่ส่งไปแล้วและลูกค้าตอบว่าขอแก้ (จบแล้ว) — `outcome` ทำให้ settled
const doneRow = (over = {}) => ({
  id: 'DRI-1', lineKind: 'scent_dev', answerStatus: 'done', outcome: 'revise',
  outcomeAt: '2026-08-20', createdAt: ACKED, ackAt: '2026-08-01', ...over,
});
// แถวที่ `followUpRowFrom` สร้างให้ — ชี้กลับแถวเดิม ยังไม่จบ
const reworkRow = (over = {}) => ({
  id: 'DRI-2', lineKind: 'scent_dev', answerStatus: 'pending',
  derivedFromItemId: 'DRI-1', ackAt: '2026-08-01', createdAt: REWORK, ...over,
});

const req = (over = {}) => ({
  id: 'R1', docNo: 'PF-1', kind: 'scent_dev', dept: 'RD', status: 'acknowledged',
  acknowledgedAt: ACKED, acknowledgedByName: 'ตาล',
  committedDueDate: '2026-08-14', dueCommittedAt: DUE_SET,
  items: [doneRow(), reworkRow()], ...over,
});

test('แถวรอบแก้ที่ยังเดินอยู่ = แถวที่ชี้กลับแถวเดิมและยังไม่จบ', () => {
  assert.deepEqual(openReworkRows(req().items).map((r) => r.id), ['DRI-2']);
  // จบแล้วไม่นับ — ใบที่ลูกค้าคอนเฟิร์มรอบสองแล้วต้องไม่ค้างขั้นแจ้งวันตลอดกาล
  assert.equal(openReworkRows([reworkRow({ answerStatus: 'done', outcome: 'confirmed' })]).length, 0);
  // แถวรอบแรกไม่ใช่รอบแก้ แม้จะยังไม่จบ
  assert.equal(openReworkRows([{ id: 'x', answerStatus: 'pending' }]).length, 0);
});

test('⭐ แถวรอบแก้เกิดหลังแจ้งวัน = วันที่ถืออยู่เป็นของรอบก่อน', () => {
  assert.equal(dueIsStale(req(), req().items), true);
});

test('แจ้งวันหลังเกิดแถวรอบแก้แล้ว = ไม่ค้างอีก', () => {
  const after = req({ committedDueDate: '2026-09-05', dueCommittedAt: '2026-08-21T03:00:00.000Z' });
  assert.equal(dueIsStale(after, after.items), false);
});

test('🔴 ใบเก่าที่ไม่มี dueCommittedAt (ก่อน mig 0288) ต้องไม่ค้าง', () => {
  // ตีความอีกทางแล้วใบเก่าทุกใบที่มีรอบแก้จะเด้งกลับขั้น "แจ้งวันส่ง" พร้อมกัน
  // ในวันที่ deploy โดยที่ไม่มีใครสั่ง
  const legacy = req({ dueCommittedAt: null });
  assert.equal(dueIsStale(legacy, legacy.items), false);
});

test('ยังไม่เคยแจ้งวันเลย = ไม่ใช่ "ค้างจากรอบก่อน" (ไม่มีรอบก่อนให้ค้าง)', () => {
  const never = req({ committedDueDate: null, dueCommittedAt: null });
  assert.equal(dueIsStale(never, never.items), false);
  // แต่ยังต้องอยู่ขั้นแจ้งวันตามเดิม
  assert.equal(requestAwaitingDue(never), true);
});

test('⭐ ป้ายสถานะกลับเป็น "รอกำหนดส่ง" เมื่อมีรอบแก้', () => {
  assert.equal(requestAwaitingDue(req()), true);
  assert.equal(requestStatusView(req()).label, 'รอกำหนดส่ง');
  assert.equal(requestStatusView(req()).tone, 'warning');
});

test('ใบที่ไม่มี items ติดมา ตอบเท่าเดิมเป๊ะ — ไม่เดา', () => {
  const bare = { status: 'acknowledged', committedDueDate: '2026-08-14', dueCommittedAt: DUE_SET };
  assert.equal(requestAwaitingDue(bare), false);
});

test('⭐ รางบนหน้ารายละเอียดถอยกลับมาที่ขั้นกำหนดส่ง พร้อมบอกวันของรอบก่อน', () => {
  const { steps, index } = requestRailSteps(req());
  assert.equal(index, 2, 'ต้องหยุดที่ขั้นกำหนดส่ง ไม่ใช่เดินไปขั้นกลาง');
  assert.equal(steps[2].id, 'commitDue');
  assert.match(steps[2].hint, /แจ้งวันของรอบแก้/);
  assert.match(steps[2].hint, /14\/08\/2026/, 'วันของรอบก่อนต้องยังเห็น');
});

test('รางบนตารางก็ถอยตาม — สองรางเล่าขั้นเดียวกันเสมอ', () => {
  const due = requestQueueTrack(req()).steps.find((s) => s.key === 'due');
  assert.equal(due.state, 'now');
  assert.match(due.note, /แจ้งวันรอบแก้/);
});

test('🔴 ใบที่ปิดไปแล้วห้ามเด้งกลับเป็น "now" แม้แถวรอบแก้ยังค้าง', () => {
  const closed = req({ status: 'closed', closedAt: '2026-08-22', answeredAt: '2026-08-22' });
  const due = requestQueueTrack(closed).steps.find((s) => s.key === 'due');
  assert.equal(due.state, 'done');
});

test('คิวขึ้นป้าย "รอกำหนดส่ง" ให้ฝ่าย', () => {
  const next = requestNextStep(req());
  assert.equal(next.owner, 'dept');
  assert.equal(next.label, 'รอกำหนดส่ง');
});

test('⭐ ด่าน: รอบแก้เปิด commit-due ใหม่ · และปิด reschedule ไม่ให้เขียนว่า "เลื่อน"', () => {
  assert.equal(commitDueRequestError(req(), { committedDueDate: '2026-09-05' }), null);
  assert.match(
    rescheduleRequestError(req(), { committedDueDate: '2026-09-05' }),
    /รอบแก้นี้ยังไม่ได้แจ้งวันส่ง/,
  );
});

test('ไม่มีรอบแก้ — ด่านคู่เดิมยังทำงานเหมือนเดิมทุกตัวอักษร', () => {
  const plain = req({ items: [doneRow({ outcome: 'confirmed' })] });
  assert.match(
    commitDueRequestError(plain, { committedDueDate: '2026-09-05' }),
    /แจ้งกำหนดส่งไปแล้ว/,
  );
  assert.equal(rescheduleRequestError(plain, { committedDueDate: '2026-09-05' }), null);
});
