// ── คอลัมน์ "กำหนดส่ง" ในตารางรายการ (มติผู้ใช้ 2026-08-26) ───────────────
//
// ⭐ ผู้ใช้เลือก "วันของทั้งใบ" หลังเห็นตัวเลขว่าช่องวันรายแถว (`items.dueAt`) มีค่า
// จริงแค่ 6 จาก 69 แถว และไม่มีจอไหนอ่านมันเลย
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueCellTracker, requestDueCell, rowOwesDue } from './dueCell.js';

const TODAY = '2026-08-26';
const doneRow = (over = {}) => ({
  id: 'a', lineKind: 'scent_dev', answerStatus: 'done', outcome: 'revise',
  ackAt: '2026-08-01', createdAt: '2026-08-01T03:00:00Z', ...over,
});
const reworkRow = (over = {}) => ({
  id: 'b', lineKind: 'scent_dev', answerStatus: 'pending', derivedFromItemId: 'a',
  ackAt: '2026-08-01', createdAt: '2026-08-20T03:00:00Z', ...over,
});
// แถวที่ฝ่ายยังทำอยู่ (รับเรื่องแล้ว ยังไม่ส่ง) = ตาฝ่าย ⇒ ใบยังผูกกับกำหนดส่ง
const devRow = (over = {}) => ({
  id: 'd', lineKind: 'scent_dev', answerStatus: 'pending', ackAt: '2026-08-01', createdAt: '2026-08-01T03:00:00Z', ...over,
});
const req = (over = {}) => ({
  id: 'R', dept: 'RD', status: 'acknowledged', acknowledgedAt: '2026-08-01T03:00:00Z',
  committedDueDate: '2026-08-30', dueCommittedAt: '2026-08-05T03:00:00Z',
  items: [doneRow({ outcome: 'confirmed' }), devRow()], ...over,
});

test('มีวันจริง — โชว์วันที่เฉย ๆ ไม่ต้องมีโน้ต', () => {
  assert.deepEqual(requestDueCell(req(), TODAY), { text: '30/08/2026', note: null, tone: null });
});

test('เลยกำหนดแล้ว = แดง พร้อมบอกว่าเลยมากี่วัน', () => {
  const c = requestDueCell(req({ committedDueDate: '2026-08-20' }), TODAY);
  assert.deepEqual(c, { text: '20/08/2026', note: 'เลยกำหนด 6 วัน', tone: 'late' });
});

test('ครบกำหนดวันนี้ = เหลือง', () => {
  const c = requestDueCell(req({ committedDueDate: TODAY }), TODAY);
  assert.equal(c.note, 'ครบกำหนดวันนี้');
  assert.equal(c.tone, 'wait');
});

test('⭐ ใบที่มีรอบแก้ค้าง — ไม่โชว์วันของรอบก่อน แต่บอกว่ารอแจ้งวัน', () => {
  /* 🔴 โชว์วันของรอบก่อนเมื่อไร ตารางจะขัดกับรางในหน้าเดียวกัน ซึ่งเป็นอาการที่
     งานชุดนี้ตั้งใจปิดมาตั้งแต่ต้น */
  const c = requestDueCell(req({ committedDueDate: '2026-08-14', items: [doneRow(), reworkRow()] }), TODAY);
  assert.deepEqual(c, { text: 'รอแจ้งวันรอบแก้', note: null, tone: 'wait' });
});

test('ยังไม่เคยแจ้งวันเลย ≠ รอแจ้งวันรอบแก้ — คนละเรื่อง คนละสี', () => {
  const c = requestDueCell(req({ committedDueDate: null, dueCommittedAt: null }), TODAY);
  assert.deepEqual(c, { text: 'ยังไม่แจ้ง', note: null, tone: null });
});

test('ยังไม่รู้วันนี้ (เฟรมแรกก่อน effect) — โชว์วันได้ แต่ไม่ตัดสินว่าเลยกำหนด', () => {
  const c = requestDueCell(req({ committedDueDate: '2026-08-20' }), null);
  assert.deepEqual(c, { text: '20/08/2026', note: null, tone: null });
});

/* ── กติกาข้อ 2: วันธรรมดาพิมพ์แถวเดียว · คำเตือนพิมพ์ทุกแถว ──────────── */
const live = (over = {}) => ({ settled: false, stage: 'developing', ...over });
const open3 = [live(), live(), live()];

test('🐞 วันธรรมดา — พิมพ์แถวแรกแถวเดียว (DC-26080003 เคยขึ้นเลขเดิม 25 บรรทัด)', () => {
  const show = dueCellTracker({ text: '28/08/2026', note: null, tone: null });
  assert.deepEqual(open3.map(show), [true, false, false]);
});

test('⭐ สถานะที่ต้องระวังพิมพ์ทุกแถว — แถวที่ 18 ต้องไม่พลาดสีแดง', () => {
  for (const tone of ['late', 'wait']) {
    const show = dueCellTracker({ text: 'x', note: null, tone });
    assert.deepEqual(open3.map(show), [true, true, true], tone);
  }
});

test('แถวที่จบแล้วไม่นับเข้าโควตา "แถวแรก" — ไม่งั้นวันหายทั้งตาราง', () => {
  /* 🔴 ถ้าแถวจบกินโควตาไป ใบที่แถวแรกจบแล้วจะไม่พิมพ์วันเลยสักแถว */
  const show = dueCellTracker({ text: '28/08/2026', note: null, tone: null });
  assert.deepEqual([{ settled: true, stage: 'done' }, live(), live()].map(show),
    [false, true, false]);
});

/* ── ตรวจทั้งระบบ 23/11/2026 · มติเจ้าของ ──────────────────────────────── */

test('🐞 ใบยกเลิก / ปิดแล้ว / มีฝั่งปิด — ไม่มีคอลัมน์กำหนดส่ง (เดิมแดง "เลย n วัน" ทุกวันหลังจบ)', () => {
  const late = { committedDueDate: '2026-08-20' };
  assert.equal(requestDueCell(req({ ...late, status: 'cancelled', cancelledAt: '2026-08-22T03:00:00Z' }), TODAY), null);
  assert.equal(requestDueCell(req({ ...late, status: 'closed', closedAt: '2026-08-22T03:00:00Z' }), TODAY), null);
  assert.equal(requestDueCell(req({ ...late, closedAt: '2026-08-22T03:00:00Z' }), TODAY), null);
});

test('⭐ ตาผู้ขอทั้งใบ (ฝ่ายส่งครบแล้ว) — ไม่ผูกกับกำหนดส่ง ไม่แดง', () => {
  const sent = devRow({ readyAt: '2026-08-10', pickedUpAt: '2026-08-11', sentAt: '2026-08-12' });
  assert.equal(requestDueCell(req({ committedDueDate: '2026-08-20', items: [sent] }), TODAY), null);
});

test('⭐ แถวที่ฝ่ายส่งแล้วไม่แดง แม้ใบยังเป็นตาฝ่าย — แดงเฉพาะแถวที่ยังเป็นงานของฝ่าย', () => {
  const show = dueCellTracker({ text: 'x', note: 'เลยกำหนด 6 วัน', tone: 'late' });
  const rows = [live({ stage: 'sent' }), live({ stage: 'ready' }), live(), live({ stage: 'awaiting_price' })];
  assert.deepEqual(rows.map(show), [false, false, true, true]);
  assert.equal(rowOwesDue(live({ stage: 'picked_up' })), false);
  assert.equal(rowOwesDue(live({ stage: 'awaiting_ack' })), true);
});

test('🔴 ไม่มี due = ไม่พิมพ์อะไรเลย', () => {
  const show = dueCellTracker(null);
  assert.deepEqual(open3.map(show), [false, false, false]);
});
