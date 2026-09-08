import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNASSIGNED, compareBoardRows, isOverdue, perfumerBoardRows, perfumerBoardTotals, perfumerGroups,
  rowPerfumerKey,
} from './perfumerBoard.js';

const TODAY = '2026-09-08';

// direction หนึ่งแถวของบรีฟ — เท่าที่ `rowStage` ต้องใช้
const dir = (over = {}) => ({ id: 'IT-1', requestId: 'RQ-1', lineKind: 'scent_dev', briefId: 'B-1', ...over });

const request = (over = {}) => ({
  id: 'RQ-1',
  docNo: 'DR-26090001',
  title: 'พัฒนากลิ่นสำหรับ FG ใหม่',
  customerName: 'บริษัท ก',
  status: 'acknowledged',
  committedDueDate: '2026-09-20',
  briefs: [{ id: 'B-1', label: 'กลิ่นที่ 1', sortOrder: 0 }],
  items: [],
  ...over,
});

test('หนึ่งแถวคือหนึ่งกลิ่น ไม่ใช่หนึ่งใบ', () => {
  const rows = perfumerBoardRows([request({
    briefs: [
      { id: 'B-1', label: 'กลิ่นที่ 1' },
      { id: 'B-2', label: 'กลิ่นที่ 2' },
      { id: 'B-3', label: 'กลิ่นที่ 3' },
    ],
  })]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.label), ['กลิ่นที่ 1', 'กลิ่นที่ 2', 'กลิ่นที่ 3']);
  for (const row of rows) assert.equal(row.docNo, 'DR-26090001', 'บริบทของใบต้องติดมากับทุกแถว');
});

/* ⚠️ แถวกำพร้าจากข้อมูลเก่าไม่ใช่กลิ่นที่แจกได้ — ถ้าหลุดเข้ามา หัวหน้าจะเห็นแถวที่
   กดแจกแล้วเขียนอะไรไม่ได้เลย (ไม่มี id ของบรีฟให้เขียนลง) */
test('ก้อน "ยังไม่ผูกบรีฟ" ไม่ขึ้นในตาราง', () => {
  const rows = perfumerBoardRows([request({ items: [dir({ briefId: null })] })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].briefId, 'B-1');
});

test('ยังไม่แจก = คีย์กองกลาง ไม่ใช่ชื่อว่าง', () => {
  const [row] = perfumerBoardRows([request()]);
  assert.deepEqual(row.perfumer, { id: null, name: '', assignedAt: null });
  assert.equal(rowPerfumerKey(row), UNASSIGNED);
});

test('แจกแล้ว = อ่านชื่อและคีย์ได้จากแถว', () => {
  const [row] = perfumerBoardRows([request({
    briefs: [{ id: 'B-1', label: 'กลิ่นที่ 1', perfumerId: 'u1', perfumerName: 'ริสา', assignedAt: 'x' }],
  })]);
  assert.equal(row.perfumer.name, 'ริสา');
  assert.equal(rowPerfumerKey(row), 'u1');
});

/* ถ้อยคำผู้ใช้: "เปลี่ยนได้ จนกว่า จะส่งกลิ่น" — แถวต้องบอกจอได้ว่าปิดปุ่มหรือยัง */
test('กลิ่นที่ผลิตออกไปแล้วติดธง sent', () => {
  const [row] = perfumerBoardRows([request({
    items: [dir({ ackAt: '2026-09-01', readyAt: '2026-09-05', producedScentId: 'SC-1' })],
  })]);
  assert.equal(row.sent, true);
  assert.equal(row.directions, 1);
});

test('ยังไม่มี direction เลย = ยังไม่ส่ง และนับเป็นงานที่ยังไม่ลงมือ', () => {
  const [row] = perfumerBoardRows([request()]);
  assert.equal(row.sent, false);
  assert.equal(row.untouched, true);
});

/* ⚠️ ใบที่ยังไม่แจ้งกำหนดส่งต้องยังเรียงตามวันได้ ไม่ใช่ว่างเปล่าจนกว่าจะมีคนแจ้ง */
test('ไม่มีวันที่ฝ่ายรับปาก ให้ถอยไปวันที่ผู้ขอต้องการ', () => {
  const [row] = perfumerBoardRows([request({ committedDueDate: null, requestedDueDate: '2026-09-12' })]);
  assert.equal(row.dueDate, '2026-09-12');
  assert.equal(row.committed, false);
});

/* ── เลยกำหนด ─────────────────────────────────────────────────────────────── */

test('เลยกำหนดวัดจากวันไทยที่ผู้เรียกส่งมา', () => {
  assert.equal(isOverdue({ dueDate: '2026-09-07' }, TODAY), true);
  assert.equal(isOverdue({ dueDate: '2026-09-08' }, TODAY), false);
  assert.equal(isOverdue({ dueDate: null }, TODAY), false);
  assert.equal(isOverdue({ dueDate: '2026-09-07' }, null), false, 'ไม่รู้วันนี้ = ไม่ตัดสิน');
});

test('กลิ่นที่ส่งไปแล้วไม่นับว่าเลยกำหนด — งานจบไปแล้ว', () => {
  assert.equal(isOverdue({ dueDate: '2026-01-01', sent: true }, TODAY), false);
});

/* ── จัดกลุ่ม ─────────────────────────────────────────────────────────────── */

test('กอง "ยังไม่แจก" ขึ้นก่อนเสมอ — เป็นงานของหัวหน้าที่เปิดหน้านี้', () => {
  const rows = perfumerBoardRows([request({
    briefs: [
      { id: 'B-1', label: 'ก1', perfumerId: 'u1', perfumerName: 'ริสา' },
      { id: 'B-2', label: 'ก2', perfumerId: 'u1', perfumerName: 'ริสา' },
      { id: 'B-3', label: 'ก3' },
    ],
  })]);
  const groups = perfumerGroups(rows, { todayIso: TODAY });
  assert.equal(groups[0].key, UNASSIGNED);
  assert.equal(groups[0].name, 'ยังไม่แจก');
  assert.equal(groups[0].total, 1);
  assert.equal(groups[1].name, 'ริสา');
  assert.equal(groups[1].total, 2);
});

test('คนที่ถือเยอะกว่าขึ้นก่อน ชื่อไทยเรียงถูกเมื่อเท่ากัน', () => {
  const rows = [
    { briefId: 'a', perfumer: { id: 'u2', name: 'ธนกร' } },
    { briefId: 'b', perfumer: { id: 'u1', name: 'ริสา' } },
    { briefId: 'c', perfumer: { id: 'u1', name: 'ริสา' } },
  ];
  assert.deepEqual(perfumerGroups(rows).map((g) => g.name), ['ริสา', 'ธนกร']);
});

/* ── ยอดเหนือตาราง ────────────────────────────────────────────────────────── */

test('ทุกช่องนับเป็นกลิ่นหน่วยเดียวกัน', () => {
  const rows = [
    { briefId: 'a', perfumer: { id: null, name: '' }, dueDate: '2026-09-01', sent: false },
    { briefId: 'b', perfumer: { id: 'u1', name: 'ริสา' }, dueDate: '2026-09-01', sent: true },
    { briefId: 'c', perfumer: { id: 'u1', name: 'ริสา' }, dueDate: '2026-09-30', sent: false },
  ];
  assert.deepEqual(perfumerBoardTotals(rows, { todayIso: TODAY }), {
    scents: 3, unassigned: 1, overdue: 1, sent: 1,
  });
});

/* ── ลำดับแถว ─────────────────────────────────────────────────────────────── */

test('ใกล้ครบกำหนดก่อน · ไม่มีวันไปท้าย · ส่งแล้วท้ายสุด', () => {
  const rows = [
    { briefId: 'd', dueDate: null, sent: false },
    { briefId: 'a', dueDate: '2026-09-20', sent: false },
    { briefId: 'z', dueDate: '2026-09-01', sent: true },
    { briefId: 'b', dueDate: '2026-09-10', sent: false },
  ];
  assert.deepEqual([...rows].sort(compareBoardRows).map((r) => r.briefId), ['b', 'a', 'd', 'z']);
});

test('ลำดับนิ่งเมื่อทุกอย่างเท่ากัน — ไม่สลับที่เองทุกครั้งที่โหลด', () => {
  const rows = [
    { briefId: 'b2', dueDate: '2026-09-10', sent: false },
    { briefId: 'b1', dueDate: '2026-09-10', sent: false },
  ];
  assert.deepEqual([...rows].sort(compareBoardRows).map((r) => r.briefId), ['b1', 'b2']);
});

/* ── เหตุที่แจกไม่ได้ ต้องมาจากด่านเดียวกับ API ─────────────────────────────── */

test('แถวปกติไม่มีเหตุกั้น', () => {
  const [row] = perfumerBoardRows([request()]);
  assert.equal(row.blocker, '');
});

test('กลิ่นที่ส่งแล้วพกเหตุมาด้วย เพื่อให้ปุ่มบอกได้ตอนกด', () => {
  const [row] = perfumerBoardRows([request({
    items: [dir({ ackAt: '2026-09-01', readyAt: '2026-09-05', producedScentId: 'SC-1' })],
  })]);
  assert.match(row.blocker, /ส่งออกไปแล้ว/);
});

test('ใบที่ปิดไปแล้วก็กั้นเหมือนกัน — ด่านเดียวตอบทั้งสองเรื่อง', () => {
  const [row] = perfumerBoardRows([request({ status: 'closed' })]);
  assert.match(row.blocker, /ปิดไปแล้ว/);
});
