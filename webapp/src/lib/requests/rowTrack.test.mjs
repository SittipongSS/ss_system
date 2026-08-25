// ── รางขั้น + อายุงานของแถว (มติผู้ใช้ 2026-08-25) ────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { rowTrackSteps, rowIdle, rowIdleLabel } from './rowTrack.js';

const TODAY = '2026-08-25';
const dev = (over = {}) => ({ id: 'r', lineKind: 'scent_dev', answerStatus: 'pending', ...over });
const doc = (over = {}) => ({ id: 'd', lineKind: 'document', answerStatus: 'pending', ...over });
const states = (row) => rowTrackSteps(row).map((s) => s.state).join(',');

test('สายพัฒนา 5 ขั้น · สายเอกสาร 3 ขั้น — เอกสารไม่มีลูกค้าอยู่ในเส้นทาง', () => {
  assert.equal(rowTrackSteps(dev()).length, 5);
  assert.equal(rowTrackSteps(doc()).length, 3);
  // ยัดห้าขั้นให้เอกสาร = สองจุดเทาค้างตลอดกาลในทุกใบขอเอกสาร
  assert.deepEqual(rowTrackSteps(doc()).map((s) => s.key), ['awaiting_ack', 'developing', 'ready']);
});

test('หมุดเดินตามขั้นของแถว — ก่อนหน้าเขียว ตอนนี้ now ที่เหลือ todo', () => {
  assert.equal(states(dev()), 'now,todo,todo,todo,todo');
  assert.equal(states(dev({ ackAt: '2026-08-01' })), 'done,now,todo,todo,todo');
  assert.equal(states(dev({ ackAt: '2026-08-01', readyAt: '2026-08-05' })), 'done,done,now,todo,todo');
  assert.equal(
    states(dev({ ackAt: '2026-08-01', readyAt: '2026-08-05', pickedUpAt: '2026-08-06' })),
    'done,done,done,now,todo',
  );
  assert.equal(
    states(dev({ ackAt: '2026-08-01', readyAt: '2026-08-05', pickedUpAt: '2026-08-06', sentAt: '2026-08-07' })),
    'done,done,done,done,now',
  );
});

test('ขั้นปลายทางทุกแบบ = รางเต็ม · ยกเว้นไม่ถูกเลือกที่จุดท้ายเป็นแดง', () => {
  const base = { ackAt: '2026-08-01', readyAt: '2026-08-05', sentAt: '2026-08-07' };
  assert.equal(states(dev({ ...base, answerStatus: 'done' })), 'done,done,done,done,done');
  assert.equal(states(dev({ ...base, outcome: 'confirmed' })), 'done,done,done,done,done');
  assert.equal(states(dev({ ...base, outcome: 'revise' })), 'done,done,done,done,done');
  // 🔴 ย้อมแดงทั้งเส้นแล้วอ่านเหมือนไม่มีอะไรเกิดขึ้นเลย ทั้งที่เดินผ่านมาจริง
  assert.equal(states(dev({ ...base, answerStatus: 'declined' })), 'done,done,done,done,bad');
});

test('⭐ "ค้างมา" นับจากก้าวล่าสุด — เกิน 7 วันถือว่าค้าง', () => {
  assert.deepEqual(rowIdle(dev({ ackAt: '2026-08-24' }), TODAY), { days: 1, settled: false, late: false });
  assert.deepEqual(rowIdle(dev({ ackAt: '2026-08-18' }), TODAY), { days: 7, settled: false, late: false });
  assert.deepEqual(rowIdle(dev({ ackAt: '2026-08-10' }), TODAY), { days: 15, settled: false, late: true });
  // ก้าวใหม่กว่าชนะ — แถวที่เพิ่งถูกส่งไม่ใช่แถวที่ค้างมา 15 วัน
  assert.equal(rowIdle(dev({ ackAt: '2026-08-10', readyAt: '2026-08-24' }), TODAY).days, 1);
});

test('แถวที่จบแล้วบอก "จบใน N วัน" ไม่ใช่อายุนับถึงวันนี้', () => {
  const done = dev({ ackAt: '2026-08-01', readyAt: '2026-08-05', sentAt: '2026-08-07', outcomeAt: '2026-08-09', answerStatus: 'done' });
  assert.deepEqual(rowIdle(done, TODAY), { days: 8, settled: true, late: false });
  assert.equal(rowIdleLabel(done, TODAY), 'จบใน 8 วัน');
});

test('เปิดปิดวันเดียว = "จบวันเดียว" ไม่ใช่ "จบใน 0 วัน" (อ่านเหมือนตัวเลขผิด)', () => {
  const sameDay = dev({ ackAt: '2026-08-20', readyAt: '2026-08-20', answerStatus: 'done' });
  assert.equal(rowIdleLabel(sameDay, TODAY), 'จบวันเดียว');
});

test('ป้ายพร้อมใช้ — จอไม่ประกอบคำเอง', () => {
  assert.equal(rowIdleLabel(dev({ ackAt: TODAY }), TODAY), 'วันนี้');
  assert.equal(rowIdleLabel(dev({ ackAt: '2026-08-20' }), TODAY), '5 วัน');
  assert.equal(rowIdleLabel(dev({}), TODAY), null, 'ไม่มีวันสักช่อง = ไม่มีอะไรให้บอก');
});

test('🔴 ห้ามอ่านนาฬิกาเอง — ไม่ส่ง today มาต้องคืน null ไม่ใช่เดาวันนี้', () => {
  assert.equal(rowIdle(dev({ ackAt: '2026-08-10' })), null);
  assert.equal(rowIdleLabel(dev({ ackAt: '2026-08-10' })), null);
});
