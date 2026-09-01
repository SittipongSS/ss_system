// ── รอบแก้ต้องแจ้งวันส่งใหม่ (มติผู้ใช้ 2026-08-25) ────────────────────────
//
// ครอบทั้งตัวตัดสิน (`dueIsStale`) และผลที่มันมีต่อ **ทุกจอที่เล่าขั้นเดียวกัน** —
// ป้ายสถานะ · รางบนหน้ารายละเอียด · รางบนตาราง · ด่านฝั่ง server · คิว
// ⚠️ เทสต์ตัวตัดสินอย่างเดียวไม่พอ: บั๊กที่ผู้ใช้เจอคือ "จอหนึ่งบอกผ่านแล้ว อีกจอบอก
// ยังค้าง" ซึ่งเกิดตอนผู้เรียกคนใดคนหนึ่งลืมถามตัวตัดสิน ไม่ใช่ตอนตัวตัดสินผิด
import test from 'node:test';
import assert from 'node:assert/strict';

import { dueIsStale, liveDueDate, openReworkRows } from './dueRound.js';
import { requestAwaitingDue, requestStatusView } from './statuses.js';
import { commitDueRequestError, rescheduleRequestError } from './stages.js';
import { requestRailSteps } from './requestRail.js';
import { requestQueueTrack } from './queueTrack.js';
import { requestNextStep, requestDueText, requestGroupKey, matchesQueueCount } from './queueBoard.js';
import { requestDueTone } from './queue.js';

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

/* ⭐ **ขั้นกำหนดส่งค้าง แต่ไม่ดึงไฮไลต์กลับ** (มติผู้ใช้ 2026-09-01) — รอบแก้ทำให้
   ใบไม่มีวันของงานชิ้นใหม่ ⇒ ขั้นนี้ต้อง "ยังไม่ทำ" · แต่ RD ลงมือแก้ของรอบใหม่ได้เลย
   โดยไม่ต้องแจ้งวันก่อน ⇒ ไฮไลต์อยู่ที่ขั้นกลางที่เล่างานจริง */
test('⭐ รางบนหน้ารายละเอียด: ขั้นกำหนดส่งค้าง พร้อมบอกวันของรอบก่อน — แต่ไม่กั้นขั้นกลาง', () => {
  const { steps, index } = requestRailSteps(req());
  assert.equal(index, 3, 'ไฮไลต์อยู่ที่ขั้นกลาง — แจ้งวันไม่ใช่ด่านของการลงมือทำ');
  assert.equal(steps[2].id, 'commitDue');
  assert.equal(steps[2].state, 'pending', 'ค้าง = หมุดกลวง ห้ามติ๊กว่าผ่านแล้ว');
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


/* ── รอบสอง: ช่องว่างที่เจอตอนตรวจย้อนหลัง 2026-08-26 ─────────────────────
   ทั้งสามข้อเป็นเรื่องเดียวกัน — "ใครเป็นคนตัดสินว่าวันยังใช้ได้อยู่ไหม" */

test('🔴 รอบแก้ที่ RD ส่งไปแล้ว ต้องไม่ค้างที่ขั้น "แจ้งวันส่ง" อีก', () => {
  /* วันส่งคือคำสัญญาว่า *จะส่งเมื่อไร* ⇒ ส่งแล้วคำถามจบ
     🐞 เดิมกรองด้วย `!isRowSettled` ซึ่งไม่รวม `awaiting_price` ⇒ แถวที่ส่งแล้ว
     ลูกค้าคอนเฟิร์มแล้ว เหลือแค่รอใส่ราคา ยังถูกนับว่า "ค้างวัน" ⇒ รางค้างที่ขั้น 2
     และคิวขึ้น "รอกำหนดส่ง" ทับป้าย "รอใส่ราคา" ซึ่งเป็นขั้นที่ `middleStep` ตั้งใจ
     ให้เห็นเป็นพิเศษ ("ใบค้างถาวรถ้าไม่มีใครเห็น") */
  const delivered = (over) => req({ items: [doneRow(), reworkRow({ readyAt: '2026-08-22', ...over })] });

  const ready = delivered({});
  assert.equal(dueIsStale(ready, ready.items), false, 'ส่งงานแล้ว = ไม่ค้างวัน');

  const priced = delivered({ pickedUpAt: '2026-08-23', sentAt: '2026-08-24', outcome: 'confirmed' });
  assert.equal(dueIsStale(priced, priced.items), false, 'รอใส่ราคา = ไม่ค้างวัน');
  assert.equal(requestRailSteps(priced).index, 3, 'รางต้องเดินไปขั้นกลาง ไม่ค้างที่ 2');
  // ⚠️ ยืนยัน **สิ่งที่ห้ามเกิด** ไม่ใช่ล็อกคำที่ป้ายระดับใบใช้ — ป้ายนั้นเป็นของ
  //    `baseNextStep` ซึ่งสรุปทั้งใบ ("รอ RD ทำต่อ") ไม่ใช่ก้าวรายแถว
  assert.notEqual(requestNextStep(priced).label, 'รอกำหนดส่ง', 'ห้ามทับด้วย "รอกำหนดส่ง"');

  // ยังไม่ส่ง = ยังค้างวันตามเดิม
  const undelivered = req();
  assert.equal(dueIsStale(undelivered, undelivered.items), true);
});

test('⭐ liveDueDate — วันของรอบก่อนไม่ใช่คำสัญญาที่ยังอยู่', () => {
  assert.equal(liveDueDate(req()), null, 'มีรอบแก้ค้าง = ไม่มีวัน');
  const fresh = req({ committedDueDate: '2026-09-05', dueCommittedAt: '2026-08-21T03:00:00.000Z' });
  assert.equal(liveDueDate(fresh), '2026-09-05');
  assert.equal(liveDueDate({ status: 'acknowledged' }), null, 'ไม่มีวันเลย = null');
});

test('🔴 คิวต้องไม่ขึ้น "เลยกำหนด" ให้ใบที่รอแจ้งวันของรอบใหม่', () => {
  /* 🐞 รอบแรกแก้แค่ `requestAwaitingDue` ⇒ รางบนหน้ารายละเอียดบอก "รอ RD แจ้งวันของ
     รอบแก้" แต่ใบเดียวกันในคิวยังขึ้นป้ายแดง ตกกลุ่ม "เลยกำหนด" และถูกนับเข้าแถบ
     ตัวเลข — สองจอพูดคนละเรื่องเกี่ยวกับใบเดียวกัน ซึ่งเป็นอาการที่งานนี้ตั้งใจปิด */
  const today = '2026-08-26';
  const stale = req();                       // committedDueDate 14/08 = เลยไปแล้ว
  assert.equal(requestDueTone(stale, today).label, 'รอกำหนดส่ง');
  assert.equal(requestGroupKey(stale, { todayIso: today }), 'open');
  assert.equal(matchesQueueCount(stale, 'overdue', { todayIso: today }), false);
  assert.equal(matchesQueueCount(stale, 'undated', { todayIso: today }), true);
  assert.equal(requestDueText(stale, { todayIso: today }), null);

  // ใบปกติที่เลยกำหนดจริงต้องยังแดงเหมือนเดิมทุกตัวอักษร
  const real = req({ items: [doneRow({ outcome: 'confirmed' })] });
  assert.equal(requestDueTone(real, today).label, 'เลยกำหนด');
  assert.equal(requestGroupKey(real, { todayIso: today }), 'overdue');
  assert.equal(matchesQueueCount(real, 'overdue', { todayIso: today }), true);
  assert.equal(requestDueText(real, { todayIso: today }).overdue, true);
});
