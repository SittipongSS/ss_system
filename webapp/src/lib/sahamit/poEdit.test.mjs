import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedLinesMessage, diffPoLines, lineLockReason, poDeleteBlock } from './poEdit';

// ── ล็อกรายบรรทัด ──
test('lineLockReason: บรรทัดปกติแก้ได้', () => {
  assert.equal(lineLockReason({ id: 'L1', status: 'open' }), null);
});

test('lineLockReason: บรรทัดที่ผูกอะไรแล้วถูกล็อก', () => {
  assert.match(lineLockReason({ id: 'L1', splitFromPoLineId: 'L0' }), /แบ่งส่ง/);
  assert.match(lineLockReason({ id: 'L1' }, { isSplitParent: true }), /แบ่งส่งไปแล้ว/);
  assert.match(lineLockReason({ id: 'L1', actualDeliveredDate: '2026-07-01' }), /ส่งของแล้ว/);
  assert.match(lineLockReason({ id: 'L1', status: 'cancelled' }), /cancelled/);
  assert.match(lineLockReason({ id: 'L1', status: 'open' }, { hasMaterial: true }), /วัสดุ/);
});

// ── ลบทั้ง PO ──
test('poDeleteBlock: PO ที่ไม่ผูกอะไร ลบได้', () => {
  assert.equal(poDeleteBlock({}), null);
});

test('poDeleteBlock: บอกครบทุกอย่างที่ติดอยู่ (ไม่ใช่แค่อันแรก)', () => {
  const msg = poDeleteBlock({ projectId: 'PRJ-1', settledDealCount: 2, splitChildCount: 1, materialLineCount: 3 });
  assert.match(msg, /โครงการ PM/);
  assert.match(msg, /2 ดีล/);
  assert.match(msg, /1 PO ยอดเหลือ/);
  assert.match(msg, /3 รายการที่มีข้อมูลวัสดุ/);
});

// ── diff บรรทัดตอนแก้ ──
const existing = [
  { id: 'L1', fgCode: 'FG-A', qty: 10, status: 'open' },
  { id: 'L2', fgCode: 'FG-B', qty: 20, status: 'open' },
];

test('diffPoLines: เพิ่ม/แก้/ลบ พร้อมกันในบันทึกครั้งเดียว', () => {
  const r = diffPoLines(existing, [
    { id: 'L1', fgCode: 'FG-A', qty: 15 },   // แก้จำนวน
    { fgCode: 'FG-C', qty: 5 },              // เพิ่มใหม่ (ไม่มี id)
  ]);                                         // L2 หายไป = ลบ
  assert.deepEqual(r.update, [{ id: 'L1', qty: 15 }]);
  assert.deepEqual(r.insert, [{ fgCode: 'FG-C', qty: 5 }]);
  assert.deepEqual(r.remove, ['L2']);
  assert.deepEqual(r.blocked, []);
});

test('diffPoLines: จำนวนเท่าเดิม = ไม่เขียน DB', () => {
  const r = diffPoLines(existing, [
    { id: 'L1', fgCode: 'FG-A', qty: 10 },
    { id: 'L2', fgCode: 'FG-B', qty: 20 },
  ]);
  assert.deepEqual(r, { insert: [], update: [], remove: [], blocked: [] });
});

test('diffPoLines: แถวจำนวน <= 0 หรือไม่มีรหัส ถูกทิ้ง (เหมือนตอนสร้าง)', () => {
  const r = diffPoLines([], [{ fgCode: 'FG-A', qty: 0 }, { fgCode: '', qty: 5 }, { fgCode: 'FG-B', qty: -2 }]);
  assert.deepEqual(r.insert, []);
});

test('diffPoLines: บรรทัดที่ล็อก แก้/ลบไม่ได้ แต่ตัวอื่นในใบเดียวกันยังผ่าน', () => {
  const lockOf = (l) => (l.id === 'L1' ? 'มีข้อมูลวัสดุแล้ว' : null);
  const r = diffPoLines(existing, [{ id: 'L1', fgCode: 'FG-A', qty: 99 }], lockOf);
  // L1 ถูกล็อก → แก้ไม่ได้; L2 ไม่ได้ส่งมา + ไม่ล็อก → ลบได้ตามปกติ
  assert.deepEqual(r.update, []);
  assert.deepEqual(r.remove, ['L2']);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.blocked[0].action, 'แก้จำนวน');
  assert.match(blockedLinesMessage(r.blocked), /FG-A.*วัสดุ/);
});

test('diffPoLines: ลบบรรทัดที่ล็อกอยู่ = blocked ไม่ใช่ลบเงียบ ๆ', () => {
  const lockOf = (l) => (l.id === 'L2' ? 'ส่งของแล้ว' : null);
  const r = diffPoLines(existing, [{ id: 'L1', fgCode: 'FG-A', qty: 10 }], lockOf);
  assert.deepEqual(r.remove, []);
  assert.equal(r.blocked[0].action, 'ลบ');
});

test('diffPoLines: id แปลกปลอม (ของ PO อื่น) ถือเป็นบรรทัดใหม่ ไม่ใช่แก้ข้ามใบ', () => {
  const r = diffPoLines(existing, [{ id: 'L-อื่น', fgCode: 'FG-Z', qty: 3 }]);
  assert.deepEqual(r.insert, [{ fgCode: 'FG-Z', qty: 3 }]);
  assert.deepEqual(r.update, []);
});

test('blockedLinesMessage: ไม่มีอะไรถูกบล็อก = null', () => {
  assert.equal(blockedLinesMessage([]), null);
});
