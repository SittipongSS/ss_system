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

test('⭐ ตารางอ่านง่าย (2026-09-15): ป้ายสิ่งที่ขอจากกลิ่นสด · รอบแก้บอกว่าแก้จากสูตรไหน · คอมเมนต์ขอให้แก้ไม่พิมพ์ซ้ำ', () => {
  const stale = 'ครีมทามือ · - CHAO PHRAYA THAI CONTEMPORARY 01 REV 3 → 6731108202601';
  const scent = { id: 'SCT-1', code: 'PF319010103', name: 'CHAO PHRAYA THAI CONTEMPORARY 01 REV 3' };
  const note = 'ลูกค้า Feedback อยากให้กลิ่นฟุ้งกว่านี้';
  const [parent, rework] = formulaDevBoard([
    row({
      id: 'P', label: stale, refScent: scent, producedFormulaId: 'FML-1', ackAt: 'x', readyAt: 'x', pickedUpAt: 'x', sentAt: 'x',
      outcome: 'revise', outcomeNote: note, refFormula: { id: 'FML-1', code: 'PF319010103-P3', name: 'HAND CREAM' },
    }),
    row({ id: 'K', label: stale, refScent: scent, derivedFromItemId: 'P', ackAt: 'x' }),
  ]);
  // ไม่มีรหัสเก่า/ลูกศรในป้าย
  assert.equal(parent.name, 'ครีมทามือ · PF319010103 CHAO PHRAYA THAI CONTEMPORARY 01 REV 3');
  assert.equal(rework.name, parent.name);
  // รอบแก้รู้ว่าแก้จากสูตรไหน (ค่าสด)
  assert.equal(rework.reworkOf, 'PF319010103-P3');
  assert.equal(parent.reworkOf, null);
  // คอมเมนต์โชว์ที่รอบแก้ (โจทย์) ที่เดียว
  assert.equal(parent.outcomeNote, null);
  assert.equal(rework.reworkBrief, note);
  // แถวขอให้แก้ที่ยังไม่มีแถวรอบแก้ (ข้อมูลเก่า) ยังเห็นคอมเมนต์ที่ตัวเอง
  const [lonely] = formulaDevBoard([row({ id: 'L', outcome: 'revise', outcomeNote: note })]);
  assert.equal(lonely.outcomeNote, note);
});

test('รอบแก้ที่แถวต้นทางไม่มีสูตรในทะเบียน = ไม่อ้างสูตร · ลบแถวรอบแก้แล้วคอมเมนต์กลับมาที่แถวต้นทาง', () => {
  const note = 'ขอหวานขึ้น';
  const [, rework] = formulaDevBoard([
    row({ id: 'P', outcome: 'revise', outcomeNote: note }),
    row({ id: 'K', derivedFromItemId: 'P' }),
  ]);
  assert.equal(rework.reworkOf, null);
  // แถวรอบแก้ถูกลบ = ไม่มีที่อื่นโชว์คอมเมนต์ ⇒ ต้องกลับมาโชว์ที่แถวต้นทาง
  const [parentAlone] = formulaDevBoard([row({ id: 'P', outcome: 'revise', outcomeNote: note })]);
  assert.equal(parentAlone.outcomeNote, note);
});
