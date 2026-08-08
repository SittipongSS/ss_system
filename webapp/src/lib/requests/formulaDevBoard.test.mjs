// ── ตารางสรุปของพัฒนาสูตร (P4) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { formulaDevBoard, formulaDevTotals } from './formulaDevBoard.js';

const row = (over = {}) => ({ id: 'DRI-1', lineKind: 'product_dev', label: 'เทียนหอม · SC-2611', ...over });

test('นับเฉพาะแถวของหัวข้อนี้ — แถวรูปร่างอื่นในใบเดียวกันต้องไม่ปน', () => {
  const rows = formulaDevBoard([row(), { id: 'x', lineKind: 'document', label: 'COA' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'เทียนหอม · SC-2611');
});

test('ส่งแล้ว = แถวที่มีสูตรออกมาแล้ว · รอ = ยังไม่มีและยังเดินอยู่', () => {
  const rows = formulaDevBoard([
    row({ id: 'a', producedFormulaId: 'FML-1', readyAt: '2026-08-18' }),
    row({ id: 'b' }),
    // ⚠️ แถวที่ลูกค้าขอแก้ **จบในเชิงงานแล้ว** งานย้ายไปแถวใหม่ ⇒ ไม่นับเป็น "รอ"
    // ไม่งั้นใบที่แก้ครั้งเดียวจะค้างตัวเลขไว้ตลอดกาล (โรคเดียวกับที่ stages.js เตือน)
    row({ id: 'c', outcome: 'revise' }),
  ]);
  const t = formulaDevTotals(rows);
  assert.equal(t.asked, 3);
  assert.equal(t.delivered, 1);
  assert.equal(t.pending, 1);
  assert.equal(t.revised, 1);
});

test('รอบแก้อ่านออกจากตารางโดยไม่ต้องเปิดการ์ด', () => {
  const [r] = formulaDevBoard([row({ derivedFromItemId: 'DRI-0' })]);
  assert.equal(r.rework, true);
});

test('ขั้นกับป้ายมาจาก rowStage ที่เดียว — ขัดกับคิวไม่ได้', () => {
  const [r] = formulaDevBoard([row({ outcome: 'confirmed' })]);
  assert.equal(r.stage, 'awaiting_price');
  assert.equal(r.stageLabel, 'รอใส่ราคา');
  assert.equal(formulaDevTotals([r]).awaitingPrice, 1);
});

// ── รวบส่งของหลายแถว (ช่องว่างข้อ 3 ของแบบ) ─────────────────────────────
test('bulkReadyRows — เอาเฉพาะแถวพัฒนาสูตรที่รับเรื่องแล้วแต่ยังไม่ส่ง', async () => {
  const { bulkReadyRows } = await import('./formulaDevBoard.js');
  const rows = bulkReadyRows([
    { id: 'A', lineKind: 'product_dev', ackAt: '2026-08-01' },                          // developing ✓
    { id: 'B', lineKind: 'product_dev' },                                               // awaiting_ack — รอบแก้ที่ยังไม่รับ
    { id: 'C', lineKind: 'product_dev', ackAt: '2026-08-01', readyAt: '2026-08-02' },   // ส่งแล้ว
    { id: 'D', lineKind: 'document', ackAt: '2026-08-01' },                             // คนละหัวข้อ
    { id: 'E', lineKind: 'product_dev', ackAt: '2026-08-01', answerStatus: 'done' },    // จบแล้ว
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['A']);
  assert.deepEqual(bulkReadyRows([]), []);
  assert.deepEqual(bulkReadyRows(null), []);
});

test('แถวที่ผ่านขั้นราคา — ราคาโผล่บนตารางสรุป (ช่องว่างข้อ 5)', async () => {
  const { formulaDevBoard } = await import('./formulaDevBoard.js');
  const [row] = formulaDevBoard([{
    id: 'A', lineKind: 'product_dev', label: 'เทียน · Amber', ackAt: 'x',
    producedFormulaId: 'F1',
    pricedResult: { kind: 'RM_FB', price: 1850, perUnit: 'กก.', validUntil: '2026-12-31' },
  }]);
  assert.equal(row.priced.price, 1850);
  assert.equal(row.priced.perUnit, 'กก.');
  // แถวที่ยังไม่ถึงขั้นราคา = null ไม่ใช่ undefined (จอเช็ค ?. ได้เสมอ)
  const [bare] = formulaDevBoard([{ id: 'B', lineKind: 'product_dev', label: 'x' }]);
  assert.equal(bare.priced, null);
});
