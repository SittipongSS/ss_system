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
