// ── ตารางสรุปทั้งใบ ──────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefBoard, briefBoardTotals } from './briefBoard.js';

const dir = (over = {}) => ({
  id: 'DRI-1', lineKind: 'scent_dev', label: 'SC-001 ทะเลเช้า', briefId: 'B1',
  producedScentId: 'SCENT-1', answerStatus: 'pending',
  ackAt: '2026-08-01', readyAt: '2026-08-01', ...over,
});
const briefs = [
  { id: 'B1', label: 'แนวสดชื่น', brief: 'โทนทะเล' },
  { id: 'B2', label: '' },
];

test('จัดกลุ่มตามบรีฟ · บรีฟที่ยังไม่มี direction ติดธง untouched', () => {
  const board = briefBoard(briefs, [dir()]);
  assert.deepEqual(board.map((g) => g.id), ['B1', 'B2']);
  assert.equal(board[0].directions.length, 1);
  assert.equal(board[0].untouched, false);
  assert.equal(board[1].untouched, true);
  // บรีฟที่ไม่ได้ตั้งชื่อต้องมีป้ายเสมอ ไม่ใช่หัวแถวว่าง
  assert.equal(board[1].label, 'กลิ่นที่ 2');
});

test('⚠️ direction ที่ยังไม่ผูกบรีฟต้องไม่หายไปจากตาราง', () => {
  // ของจริงบน prod: แถวที่เกิดก่อน mig 0213 และแถวรอบแก้ที่เกิดก่อน #1049
  const board = briefBoard(briefs, [dir({ id: 'DRI-9', briefId: null })]);
  const orphan = board.find((g) => g.id === null);
  assert.ok(orphan, 'ต้องมีก้อน "ยังไม่ผูกบรีฟ"');
  assert.equal(orphan.directions.length, 1);

  // briefId ที่ชี้ไปก้อนที่ไม่มีอยู่แล้วก็ต้องตกมาที่ก้อนนี้ ไม่ใช่หายเงียบ
  const stale = briefBoard(briefs, [dir({ briefId: 'B-ไม่มีแล้ว' })]);
  assert.equal(stale.find((g) => g.id === null).directions.length, 1);
});

test('ไม่นับแถวของสายอื่นที่บังเอิญอยู่ในใบเดียวกัน', () => {
  const board = briefBoard(briefs, [dir(), { id: 'X', lineKind: 'material', label: 'วัสดุ' }]);
  assert.equal(briefBoardTotals(board).directions, 1);
});

test('ผลลัพธ์และสถานะแปลเป็นป้ายไทยพร้อมโทน', () => {
  const [g] = briefBoard(briefs, [dir({
    pickedUpAt: '2026-08-02', sentAt: '2026-08-03',
    outcome: 'confirmed', outcomeAt: '2026-08-05', confirmedQty: 25,
  })]);
  const d = g.directions[0];
  assert.equal(d.outcomeLabel, 'ลูกค้าคอนเฟิร์ม');
  assert.equal(d.outcomeTone, 'success');
  assert.equal(d.confirmedQty, 25);
  assert.equal(d.stage, 'awaiting_price');
  assert.equal(d.stageLabel, 'รอใส่ราคา');

  // ยังไม่ถึงตาลูกค้า = ยังไม่มีผลลัพธ์ ไม่ใช่ผลลัพธ์ว่าง
  const [g2] = briefBoard(briefs, [dir()]);
  assert.equal(g2.directions[0].outcomeLabel, null);
  assert.equal(g2.directions[0].stageLabel, 'รอไปรับ');
});

test('รอบแก้ต้องอ่านออกจากตาราง ไม่ต้องเปิดการ์ดดู', () => {
  const [g] = briefBoard(briefs, [dir({ derivedFromItemId: 'DRI-0' })]);
  assert.equal(g.directions[0].rework, true);
  assert.equal(briefBoard(briefs, [dir()])[0].directions[0].rework, false);
});

test('ยอดรวมนับตามขั้นจริง ไม่ใช่ตาม answerStatus', () => {
  const board = briefBoard(briefs, [
    dir({ id: 'a', pickedUpAt: '1', sentAt: '2' }),                                   // รอลูกค้าตอบ
    dir({ id: 'b', pickedUpAt: '1', sentAt: '2', outcome: 'confirmed', outcomeAt: '3', confirmedQty: 5 }),
    dir({ id: 'c', pickedUpAt: '1', sentAt: '2', outcome: 'revise', outcomeAt: '3' }),
    dir({ id: 'd', answerStatus: 'done' }),
    dir({ id: 'e', briefId: 'B2' }),
  ]);
  const t = briefBoardTotals(board);
  assert.deepEqual(
    { briefs: t.briefs, directions: t.directions, untouched: t.untouched },
    { briefs: 2, directions: 5, untouched: 0 },
  );
  assert.equal(t.waitingCustomer, 1);
  assert.equal(t.confirmed, 1);
  assert.equal(t.revised, 1);
  assert.equal(t.awaitingPrice, 1);
  assert.equal(t.done, 1);
});

test('ใบที่ยังไม่มีบรีฟและไม่มีแถว — ตารางว่าง ไม่ระเบิด', () => {
  assert.deepEqual(briefBoard(), []);
  assert.equal(briefBoardTotals().directions, 0);
  assert.equal(briefBoardTotals(briefBoard([], [])).briefs, 0);
});

test('🐞 direction ที่ยังไม่ผูกบรีฟต้องถูกนับในยอดรวมด้วย', () => {
  // ตัวนับเดิม (`scentBriefSummary` — ถอดออกพร้อมใบนี้) นับเฉพาะแถวที่มี briefId
  // ⇒ direction ที่ผูกบรีฟไม่ติด (ของก่อน 0213 · รอบแก้ก่อน #1049) หายจากยอดเงียบ ๆ
  const board = briefBoard([{ id: 'B1' }], [dir(), dir({ id: 'x', briefId: null })]);
  assert.equal(briefBoardTotals(board).directions, 2);
});

// ── สายพันธุ์ของงาน + สรุปต่อบรีฟ (ทางเลือก ก+ · มติผู้ใช้ 2026-08-10) ────
//
// รูปร่างจริงที่ผู้ใช้ยืนยัน: 1 บรีฟ → 2-3 direction · ลูกค้าขอแก้ → พัฒนาต่ออีก 2-3
// ที่ผูกกลับไปหาตัวต้นทาง ⇒ ใบ 25 บรีฟที่เดินครบสองรอบมีได้ ~150 แถว
// ถ้าเรียงตาม sortOrder เฉย ๆ ตัวที่แก้มาจาก FR-02 จะไปอยู่ท้ายสุด อ่านไม่ออกว่า
// เกี่ยวกับใคร ทั้งที่ฐานเก็บ `derivedFromItemId` ไว้แล้ว
test('⭐ รอบแก้ต้องอยู่ต่อจากตัวต้นทางทันที และเยื้องหนึ่งชั้น', () => {
  const items = [
    dir({ id: 'D1', label: 'FR-01', sortOrder: 1 }),
    dir({ id: 'D2', label: 'FR-02', sortOrder: 2 }),
    dir({ id: 'D3', label: 'FR-03', sortOrder: 3 }),
    // เกิดทีหลังสุด แต่เป็นรอบแก้ของ FR-02
    dir({ id: 'D4', label: 'FR-04', sortOrder: 4, derivedFromItemId: 'D2' }),
  ];
  const [g] = briefBoard([{ id: 'B1', label: 'แนวสดชื่น' }], items);
  assert.deepEqual(g.directions.map((d) => d.name), ['FR-01', 'FR-02', 'FR-04', 'FR-03']);
  assert.deepEqual(g.directions.map((d) => d.depth), [0, 0, 1, 0]);
  assert.equal(g.directions.find((d) => d.name === 'FR-04').parentId, 'D2');
});

test('รอบแก้ของรอบแก้ยังเยื้องชั้นเดียว — คอลัมน์แรกต้องไม่หมดที่', () => {
  const items = [
    dir({ id: 'D1', label: 'FR-01', sortOrder: 1 }),
    dir({ id: 'D2', label: 'FR-02', sortOrder: 2, derivedFromItemId: 'D1' }),
    dir({ id: 'D3', label: 'FR-03', sortOrder: 3, derivedFromItemId: 'D2' }),
  ];
  const [g] = briefBoard([{ id: 'B1', label: 'ก' }], items);
  assert.deepEqual(g.directions.map((d) => d.name), ['FR-01', 'FR-02', 'FR-03']);
  assert.deepEqual(g.directions.map((d) => d.depth), [0, 1, 1]);
});

test('⚠️ พ่อไม่ได้อยู่ในบรีฟเดียวกัน (ข้อมูลเก่าก่อน #1049) ต้องไม่หายไป', () => {
  const items = [dir({ id: 'D9', label: 'FR-09', derivedFromItemId: 'ไม่มีตัวนี้ในบรีฟ' })];
  const [g] = briefBoard([{ id: 'B1', label: 'ก' }], items);
  assert.equal(g.directions.length, 1, 'แถวกำพร้าต้องยังขึ้น');
  assert.equal(g.directions[0].depth, 0, 'ไม่มีพ่อให้เกาะ = ถือเป็นราก');
});

test('สรุปต่อบรีฟบอกได้ว่าก้อนนี้ยังต้องลงมือไหม โดยไม่ต้องกาง', () => {
  const sent = dir({ id: 'D1', label: 'FR-01', outcome: 'confirmed', sentAt: '2026-08-05' });
  const [g] = briefBoard([{ id: 'B1', label: 'ก' }], [sent]);
  assert.equal(g.summary.total, 1);
  assert.equal(g.summary.confirmed, 1);
  // ⚠️ needsAction = รอ **ฝั่งเรา** ทำอะไร ไม่ใช่ "ยังไม่จบ" — ตัวที่ส่งไปแล้วรอ
  // ลูกค้าตอบไม่ใช่ของที่เราต้องลงมือ ก้อนนั้นพับได้
  assert.equal(typeof g.summary.needsAction, 'boolean');
  const [empty] = briefBoard([{ id: 'B9', label: 'ว่าง' }], []);
  assert.equal(empty.summary.total, 0);
  assert.equal(empty.summary.needsAction, false);
  assert.equal(empty.untouched, true);
});

test('ยอดรวมทั้งใบยังตรงกับตารางหลังเพิ่มสายพันธุ์', () => {
  const items = [
    dir({ id: 'D1', label: 'FR-01', outcome: 'confirmed' }),
    dir({ id: 'D2', label: 'FR-02', derivedFromItemId: 'D1' }),
  ];
  const groups = briefBoard([{ id: 'B1', label: 'ก' }, { id: 'B2', label: 'ข' }], items);
  const totals = briefBoardTotals(groups);
  assert.equal(totals.directions, 2, 'ห้ามนับซ้ำหรือตกหล่นจากการจัดสายพันธุ์');
  assert.equal(totals.untouched, 1);
  assert.equal(totals.confirmed, 1);
});
