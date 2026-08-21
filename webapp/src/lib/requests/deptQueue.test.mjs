// ── คิวของฝ่าย + ใกล้ถึงกำหนด (P2) ──────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPT_QUEUE_TAB_KEYS, deptQueueRows, deptQueueTabs, dueSoonRows } from './queueBoard.js';
import { DEPTS_WITH_OWN_MODULE, deptHasOwnModule, deptsInSharedQueue } from './modules.js';

const row = (over = {}) => ({
  id: 'DR-1', dept: 'RD', status: 'acknowledged', items: [], ...over,
});

test('คิวฝ่ายกรองด้วยฝ่ายก่อนเสมอ — ไม่ดู _mine เลย', () => {
  const rows = [
    row({ id: 'A' }),
    row({ id: 'B', dept: 'PC' }),
    // ⚠️ ใบของฝ่ายเราที่คนอื่นเปิด ต้องอยู่ในคิว — คิวเป็นของฝ่าย ไม่ใช่ของคน
    row({ id: 'C', _mine: false }),
  ];
  const ids = deptQueueRows(rows, { dept: 'RD', tab: 'todo' }).map((r) => r.id);
  assert.deepEqual(ids, ['A', 'C']);
});

test('ใบร่างไม่เข้าคิวฝ่ายไม่ว่ากรณีใด — ยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย', () => {
  for (const tab of DEPT_QUEUE_TAB_KEYS) {
    assert.deepEqual(deptQueueRows([row({ status: 'draft' })], { dept: 'RD', tab }), []);
  }
});

test('สามแท็บแบ่งใบไม่ให้ซ้ำกัน — ใบหนึ่งอยู่ได้แท็บเดียว', () => {
  const rows = [
    row({ id: 'todo', status: 'pending' }),
    row({ id: 'waiting', items: [{ answerStatus: 'done', lineKind: 'document', pickedUpAt: null, readyAt: '2026-08-01' }] }),
    row({ id: 'done', status: 'closed' }),
  ];
  const seen = new Map();
  for (const key of DEPT_QUEUE_TAB_KEYS) {
    for (const r of deptQueueRows(rows, { dept: 'RD', tab: key })) {
      assert.equal(seen.has(r.id), false, `${r.id} โผล่ทั้ง ${seen.get(r.id)} และ ${key}`);
      seen.set(r.id, key);
    }
  }
  assert.equal(seen.get('todo'), 'todo');
  assert.equal(seen.get('done'), 'history');
});

test('ใกล้ถึงกำหนดนับจากวันที่ฝ่ายรับปาก ไม่ใช่วันที่ผู้ขออยากได้', () => {
  const rows = [
    row({ id: 'soon', committedDueDate: '2026-08-10' }),
    row({ id: 'late', committedDueDate: '2026-08-01' }),
    row({ id: 'far', committedDueDate: '2026-09-30' }),
    // ⚠️ มีแต่ความหวังของผู้ขอ ยังไม่มีใครรับปาก → ไม่ใช่ "ใกล้ถึงกำหนด"
    row({ id: 'noPromise', requestedDueDate: '2026-08-08' }),
  ];
  const ids = dueSoonRows(rows, { dept: 'RD', todayIso: '2026-08-07', days: 7 }).map((r) => r.id);
  assert.deepEqual(ids, ['late', 'soon'], 'เรียงจากที่ถึงกำหนดก่อน');
});

test('ลิสต์ฝ่ายที่มีโมดูลของตัวเองคุมทั้งสองจอจากที่เดียว', () => {
  assert.ok(DEPTS_WITH_OWN_MODULE.includes('RD'));
  assert.equal(deptHasOwnModule('RD'), true);
  // FN เข้าลิสต์ 2026-08-22 พร้อมกฎข้อ 9 — บ้านของเขาคือ /finance/requests
  assert.equal(deptHasOwnModule('FN'), true);
  // PC ยังไม่มีโมดูล จึงต้องอยู่ในคิวรวมต่อไป (อย่าเผลอยัดเข้าลิสต์ตามฝ่ายอื่น)
  assert.equal(deptHasOwnModule('PC'), false);
  // คิวรวมของ /requests ต้องไม่เหลือฝ่ายที่มีบ้านของตัวเองแล้ว
  assert.deepEqual(deptsInSharedQueue(['RD', 'PC', 'FN']), ['PC']);
});

/* ⭐ **แท็บพูดชื่อฝ่ายจริง** (มติผู้ใช้ 2026-08-20: *"ฝ่ายคืออะไร ไม่สวยเลย"*) —
   หน้าคิวของแต่ละฝ่ายเรียกฟังก์ชันนี้ด้วยฝ่ายของตัวเอง ⇒ ป้ายไม่ใช่คำกลางอีกต่อไป
   ⚠️ ฝั่งตรงข้ามยังเป็น "ผู้ขอ" เพราะแท็บรวมใบของหลายฝ่ายผู้เปิดไว้ด้วยกัน */
test('แท็บคิวฝ่ายพกชื่อฝ่ายจริง — คีย์คงเดิมทุกฝ่าย', () => {
  assert.deepEqual(deptQueueTabs('RD').map((t) => t.label), ['รอ RD ตอบ', 'รอผู้ขอทำต่อ', 'ประวัติ']);
  assert.deepEqual(deptQueueTabs('FN').map((t) => t.label)[0], 'รอ FN ตอบ');
  assert.deepEqual(deptQueueTabs().map((t) => t.key), DEPT_QUEUE_TAB_KEYS);
  // ไม่รู้ฝ่าย (ผู้เรียกลืมส่ง) ต้องยังอ่านออก ไม่ใช่ "รอ  ตอบ"
  assert.equal(deptQueueTabs('').map((t) => t.label)[0], 'รอฝ่ายเราตอบ');
});
