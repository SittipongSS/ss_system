// ── ตาราง "สรุปทั้งใบ" สองสาย (ม-165 PR-2) ─────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { devRowResult, devRowSettled, dropInheritedSpec, groupResultText, liftSharedSpec, rowLineage } from './devBoardRows.js';
import { formulaDevBoard } from './formulaDevBoard.js';
import { briefBoard } from './briefBoard.js';

test('สายพันธุ์: รอบแก้ตามหลังตัวแม่ทันที · depth ≤ 1 · childCount ของแม่ · พ่อไม่อยู่ในชุด = ราก', () => {
  const rows = rowLineage([
    { id: 'a' }, { id: 'b' }, { id: 'a1', parentId: 'a' }, { id: 'a2', parentId: 'a' }, { id: 'a11', parentId: 'a1' },
    { id: 'x', parentId: 'gone' },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.depth, r.childCount]), [
    ['a', 0, 2], ['a1', 1, 1], ['a11', 1, 0], ['a2', 1, 0], ['b', 0, 0], ['x', 0, 0],
  ]);
});

test('⭐ ป้ายผลลูกค้า — คำเดียวกับการ์ด (ยืนยัน · ขอแก้ · ไม่เอา · รอลูกค้าตอบ) + บรรทัดรองบอกก้าวต่อไป', () => {
  assert.deepEqual(devRowResult({ outcome: 'confirmed', stage: 'done' }), { label: 'ยืนยัน', tone: 'success', sub: 'เสร็จแล้ว' });
  assert.deepEqual(devRowResult({ outcome: 'confirmed', stage: 'awaiting_ingredients' }).sub, 'รอ Ingredient List');
  assert.deepEqual(devRowResult({ outcome: 'confirmed', stage: 'awaiting_price', freebie: true }).label, 'ยืนยัน · แถม');
  assert.deepEqual(devRowResult({ outcome: 'revise', stage: 'revised', childCount: 2 }), { label: 'ขอแก้', tone: 'info', sub: 'แก้ 2 ตัว ↓' });
  assert.equal(devRowResult({ outcome: 'revise', stage: 'revised', childCount: 0 }).sub, 'ยังไม่มีรอบแก้');
  assert.deepEqual(devRowResult({ outcome: 'rejected', stage: 'declined' }), { label: 'ไม่เอา', tone: 'neutral', sub: null });
  assert.equal(devRowResult({ stage: 'sent' }).label, 'รอลูกค้าตอบ');
  assert.equal(devRowResult({ stage: 'developing' }).label, 'กำลังทำ');
  assert.equal(devRowResult({ stage: 'awaiting_ack' }).label, 'รอรับเรื่อง');
});

test('แถวจบแล้วสำหรับจอ — ไม่เอา/เสร็จแล้ว/ขอแก้ที่แตกรอบแก้แล้ว · ยืนยันที่ยังรอราคาไม่จบ', () => {
  assert.equal(devRowSettled({ stage: 'declined' }), true);
  assert.equal(devRowSettled({ stage: 'done', outcome: 'confirmed' }), true);
  assert.equal(devRowSettled({ outcome: 'revise', stage: 'revised', childCount: 1 }), true);
  assert.equal(devRowSettled({ outcome: 'revise', stage: 'revised', childCount: 0 }), false);
  assert.equal(devRowSettled({ outcome: 'confirmed', stage: 'awaiting_price' }), false);
  assert.equal(devRowSettled({ stage: 'sent' }), false);
});

test('⭐ สเปก PDR ขึ้นครั้งเดียว — ทุกแถวเหมือนกันเท่านั้น · แถวเดียว/ต่างกัน = ไม่ยก', () => {
  const pdr = 'ตามแบบฟอร์ม PDR: ไม่ระบุขนาด — ราคาที่ลูกค้าคาดหวังซื้อ 1500 บาท';
  const lifted = liftSharedSpec([{ id: 1, spec: pdr }, { id: 2, spec: ` ${pdr} ` }]);
  assert.equal(lifted.shared, pdr);
  assert.deepEqual(lifted.rows.map((r) => r.spec), [null, null]);
  assert.equal(liftSharedSpec([{ id: 1, spec: pdr }]).shared, null);
  const mixed = liftSharedSpec([{ id: 1, spec: pdr }, { id: 2, spec: 'อื่น' }]);
  assert.equal(mixed.shared, null);
  assert.deepEqual(mixed.rows.map((r) => r.spec), [pdr, 'อื่น']);
  assert.equal(liftSharedSpec([{ id: 1, spec: null }, { id: 2, spec: null }]).shared, null);
});

test('ป้ายหัวกลุ่มบรีฟ — ศูนย์ไม่พิมพ์', () => {
  assert.equal(groupResultText({ total: 5, confirmed: 1, revise: 1, rejected: 3 }), '5 direction · ยืนยัน 1 · ขอแก้ 1 · ไม่เอา 3');
  assert.equal(groupResultText({ total: 2 }), '2 direction');
});

/* ⭐ WHITE TEA 02 (RQ-FD-26090194) — ตารางพัฒนาสูตรเคยเป็นแถวแบน (#1.1 #1.2 ลอยใต้กลิ่นอื่น) ⇒ ซ้อนใต้ #1 แล้ว */
test('⭐ ตารางพัฒนาสูตร: รอบแก้ (+ direction เพิ่ม ม-157) ซ้อนใต้ตัวแม่ · ลำดับกลิ่นเดิมคงอยู่', () => {
  const f = (id, sortOrder, over = {}) => ({ id, sortOrder, lineKind: 'product_dev', label: 'หัวน้ำหอม · PF2810201 WHITE TEA 02', answerStatus: 'pending', ...over });
  const rows = formulaDevBoard([
    f('wt', 1, { outcome: 'revise', sentAt: '2026-09-30' }),
    f('hr', 2, { label: 'หัวน้ำหอม · PF2810101 HOME RETREAT 01', outcome: 'revise', sentAt: '2026-09-30' }),
    f('wt1', 4, { derivedFromItemId: 'wt', sentAt: '2026-10-14' }),
    f('hr1', 5, { label: 'หัวน้ำหอม · PF2810101 HOME RETREAT 01', derivedFromItemId: 'hr', sentAt: '2026-10-14' }),
    f('wt2', 6, { derivedFromItemId: 'wt', directionOfItemId: 'wt1', sentAt: '2026-10-14' }),
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.depth, r.childCount]), [
    ['wt', 0, 2], ['wt1', 1, 0], ['wt2', 1, 0], ['hr', 0, 1], ['hr1', 1, 0],
  ]);
  assert.deepEqual(devRowResult(rows[0]), { label: 'ขอแก้', tone: 'info', sub: 'แก้ 2 ตัว ↓' });
  assert.equal(devRowResult(rows[1]).label, 'รอลูกค้าตอบ');
});

test('ตารางพัฒนากลิ่น: แถวมี freebie · childCount มาจากสายพันธุ์ตัวเดียวกัน', () => {
  const groups = briefBoard([{ id: 'B1', label: 'ON MY WAY' }], [
    { id: 'p', briefId: 'B1', lineKind: 'scent_dev', label: 'ALMOST HERE', outcome: 'revise' },
    { id: 'c', briefId: 'B1', lineKind: 'scent_dev', label: 'ALMOST HERE #1', derivedFromItemId: 'p', outcome: 'confirmed', freebieReason: 'แถม' },
  ]);
  assert.deepEqual(groups[0].directions.map((d) => [d.id, d.depth, d.childCount, d.freebie]), [['p', 0, 1, false], ['c', 1, 0, true]]);
});

test('รอบแก้ที่สเปกเหมือนตัวแม่ไม่พิมพ์ซ้ำ — สเปกต่างจากแม่ยังอยู่ (RQ-FD-26090194: สเปกสองแบบตามกลุ่มกลิ่น)', () => {
  const rows = dropInheritedSpec([
    { id: 'wt', spec: 'A' }, { id: 'wt1', parentId: 'wt', spec: 'A' }, { id: 'wt2', parentId: 'wt', spec: 'A ใหม่' },
    { id: 'hr', spec: 'B' }, { id: 'hr1', parentId: 'hr', spec: 'B' },
  ]);
  assert.deepEqual(rows.map((r) => r.spec), ['A', null, 'A ใหม่', 'B', null]);
});

