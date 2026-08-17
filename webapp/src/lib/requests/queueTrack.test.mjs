// ── รางสี่ขั้นของคำร้อง ───────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestQueueTrack } from './queueTrack.js';

const stateOf = (track, key) => track.steps.find((s) => s.key === key)?.state;

test('ร่างที่ยังไม่เคยส่ง — ขั้นส่งเป็นตาผู้ขอ ที่เหลือยังไม่ถึงคิว', () => {
  const track = requestQueueTrack({ status: 'draft' });
  assert.equal(track.cancelled, false);
  assert.deepEqual(track.steps.map((s) => s.key), ['send', 'ack', 'answer', 'close']);
  assert.equal(stateOf(track, 'send'), 'now');
  assert.equal(stateOf(track, 'ack'), 'todo');
  assert.equal(stateOf(track, 'answer'), 'todo');
  assert.equal(stateOf(track, 'close'), 'todo');
});

test('🐞 ใบตีกลับเป็น draft เหมือนกัน — ต้องเป็นธงแดงที่ขั้นส่ง ไม่ใช่ "ยังไม่ได้ส่ง"', () => {
  const track = requestQueueTrack({
    status: 'draft', bouncedAt: '2026-08-16T03:00:00Z', bounceReason: 'ระบุกลิ่นไม่ครบ',
  });
  const send = track.steps.find((s) => s.key === 'send');
  assert.equal(send.state, 'bad');
  assert.equal(send.note, 'ระบุกลิ่นไม่ครบ');
  // ตีกลับแล้วยังไม่มีใครรับเรื่อง — ขั้นถัดไปต้องถอยกลับเป็น "ยังไม่ถึงคิว"
  assert.equal(stateOf(track, 'ack'), 'todo');
});

test('ส่งแล้วยังไม่มีใครรับ — ขั้นรับเรื่องเป็นตาฝ่ายผู้รับ', () => {
  const track = requestQueueTrack({ status: 'pending', submittedAt: '2026-08-14' });
  assert.equal(stateOf(track, 'send'), 'done');
  assert.equal(stateOf(track, 'ack'), 'now');
  assert.equal(track.steps.find((s) => s.key === 'ack').note, 'ยังไม่มีใครรับ');
});

test('รับเรื่องแล้ว — ชื่อคนรับอยู่ใต้ขั้น · คืบหน้ารายบรรทัดอยู่ใต้ขั้นตอบ', () => {
  const track = requestQueueTrack({
    status: 'acknowledged',
    acknowledgedAt: '2026-08-15',
    acknowledgedByName: 'ปทิตญา',
    items: [{ answerStatus: 'done' }, {}, {}],
  });
  assert.equal(stateOf(track, 'ack'), 'done');
  assert.equal(track.steps.find((s) => s.key === 'ack').note, 'ปทิตญา');
  assert.equal(stateOf(track, 'answer'), 'now');
  assert.equal(track.steps.find((s) => s.key === 'answer').note, '1/3 รายการ');
});

test('⭐ ตอบครบแล้วแต่ผู้ขอยังไม่ปิด — ขั้นปิดต้องเป็นงานค้างที่มองเห็น', () => {
  const track = requestQueueTrack({ status: 'answered', answeredAt: '2026-08-16' });
  assert.equal(stateOf(track, 'answer'), 'done');
  assert.equal(stateOf(track, 'close'), 'now');
  assert.equal(track.steps.find((s) => s.key === 'close').note, 'รอผู้ขอปิดเรื่อง');
});

test('ปิดแล้วทั้งรางเป็นสีเดียว — ขั้นก่อนหน้าห้ามถอยกลับแม้ไม่มี timestamp', () => {
  const track = requestQueueTrack({ status: 'closed', closedAt: '2026-08-16' });
  assert.deepEqual(track.steps.map((s) => s.state), ['done', 'done', 'done', 'done']);
});

test('ใบยกเลิกไม่มีราง — หน้าเว็บโชว์ป้ายแทน', () => {
  const track = requestQueueTrack({ status: 'cancelled', cancelledAt: '2026-08-15' });
  assert.equal(track.cancelled, true);
  assert.deepEqual(track.steps, []);
});

test('ไม่มีข้อมูลเลย (undefined) ต้องไม่ระเบิด — คิวมีแถวแปลก ๆ ได้เสมอ', () => {
  const track = requestQueueTrack();
  assert.equal(track.cancelled, false);
  assert.equal(track.steps.length, 4);
});
