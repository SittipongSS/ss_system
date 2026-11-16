// ด่านปิดเรื่อง: ประโยคต้องบอกว่าแถวค้างที่ใคร ปุ่มชื่ออะไร กี่แถว (16/11/2026)
//
// 🐞 ของเดิมตอบ `ตอบให้ครบหรือกด "ตอบไม่ได้" ก่อน` ทุกกรณี — เป็นคำของฝ่าย แต่คนอ่านคือผู้ขอ
//   ⇒ ใบที่คิวขึ้น "รอ SA ทำต่อ" RD บอก SA ให้ปิด · SA กดแล้วอ่านว่ารอ RD (44 ใบบน prod 16/11)
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeRequestError, closeRowsPendingReason } from './stages.js';
import { nextByStageFor, requestPendingSteps, rowStage } from './rowStage.js';

const req = (over = {}) => ({
  id: 'R1', kind: 'scent_dev', status: 'acknowledged', dept: 'RD', requesterDept: 'SA', ...over,
});
// แถวพัฒนาที่เดินถึงขั้นต่าง ๆ — ช่องที่กรอกแล้วตัดสินขั้น (rowStage)
const atAck = () => ({ answerStatus: 'pending' });
const developing = () => ({ answerStatus: 'pending', ackAt: '2026-11-01' });
const ready = () => ({ ...developing(), readyAt: '2026-11-02' });
const pickedUp = () => ({ ...ready(), pickedUpAt: '2026-11-03' });
const sent = () => ({ ...pickedUp(), sentAt: '2026-11-04' });
const awaitingPrice = () => ({ ...sent(), outcome: 'confirmed', outcomeAt: '2026-11-05', confirmedQty: 1 });
const done = () => ({ ...sent(), answerStatus: 'done' });

test('แถวค้างที่ผู้ขอล้วน — บอกชื่อปุ่มของผู้ขอ ไม่มีคำของฝ่าย', () => {
  const msg = closeRequestError(req(), [sent(), sent(), ready(), done()]);
  assert.equal(
    msg,
    'ยังมีรายการที่ยังเดินไม่จบ — รอ SA กด “รับของ” 1 รายการ · “บันทึกคำตอบ” 2 รายการ — ปุ่มอยู่ที่แถวในตารางรายการ',
  );
  assert.doesNotMatch(msg, /ตอบไม่ได้/, 'ปุ่ม "ตอบไม่ได้" เป็นของฝ่าย — ห้ามโผล่ในประโยคที่ผู้ขออ่าน');
});

test('แถวค้างที่ฝ่ายล้วน — บอกว่ารอฝ่ายทำอะไร ไม่ชี้ปุ่มให้ผู้ขอ', () => {
  const msg = closeRequestError(req(), [developing(), awaitingPrice(), done()]);
  assert.equal(msg, 'ยังมีรายการที่ยังเดินไม่จบ — รอ RD ส่งงาน 1 รายการ · รอ RD ใส่ราคา 1 รายการ');
});

test('ปนสองฝั่ง — ฝั่งผู้ขอ (คนกดปิด) มาก่อน แล้วตามด้วยฝ่าย', () => {
  const msg = closeRequestError(req(), [developing(), pickedUp(), atAck()]);
  assert.equal(
    msg,
    'ยังมีรายการที่ยังเดินไม่จบ — รอ SA กด “ส่งให้ลูกค้า” 1 รายการ · รอ RD รับเรื่อง 1 รายการ · รอ RD ส่งงาน 1 รายการ — ปุ่มอยู่ที่แถวในตารางรายการ',
  );
});

test('ใบเก่าที่ไม่มี requesterDept — ถอยไปคำว่า "ผู้ขอ" แบบไม่เว้นวรรค (กติกาเดียวกับป้ายคิว)', () => {
  const msg = closeRequestError(req({ requesterDept: null }), [sent()]);
  assert.match(msg, /รอผู้ขอกด “บันทึกคำตอบ” 1 รายการ/);
});

test('แถวเอกสาร — ปุ่มของผู้ขอคือ "ได้รับแล้ว" (ตารางสายเอกสาร)', () => {
  const row = { ...ready(), lineKind: 'document' };
  // ตั้งต้นจากตารางจริง ไม่เขียนคำเอง — ถ้าวันหน้าชื่อปุ่มเปลี่ยน เทสต์นี้ตามไปเอง
  const label = nextByStageFor(row)[rowStage(row)]?.label;
  const msg = closeRowsPendingReason(req({ kind: 'document' }), [row]);
  if (label === 'ได้รับแล้ว') assert.match(msg, /รอ SA กด “ได้รับแล้ว” 1 รายการ/);
  else assert.match(msg, new RegExp(`“${label}”`));
});

test('ชื่อปุ่มในประโยคมาจากตารางก้าวเดียวกับปุ่มบนแถว', () => {
  for (const make of [ready, pickedUp, sent, developing, awaitingPrice, atAck]) {
    const row = make();
    const next = nextByStageFor(row)[rowStage(row)];
    const [step] = requestPendingSteps([row]);
    assert.deepEqual(step, { owner: next.owner, label: next.label, count: 1 });
  }
});

test('แถวจบครบ — ไม่มีก้าวค้าง · ด่านปิดผ่าน', () => {
  assert.deepEqual(requestPendingSteps([done(), done()]), []);
  assert.equal(closeRequestError(req(), [done()]), null);
});
