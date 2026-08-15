import test from 'node:test';
import assert from 'node:assert/strict';

import { allBucketsCollapsed, bucketList, toggleBucketKey } from './listGrouping.js';

const items = [
  { id: 'A', owner: 'U-1', ownerName: 'Nida', team: 'SV', value: 300 },
  { id: 'B', owner: null, ownerName: '', team: null, value: 50 },
  { id: 'C', owner: 'U-2', ownerName: 'Somchai', team: 'KA', value: 200 },
  { id: 'D', owner: 'U-1', ownerName: 'Nida', team: 'SV', value: 100 },
];

const byOwner = (item) => ({
  key: item.owner,
  label: item.ownerName || 'ไม่ระบุผู้ดูแล',
  sub: item.team,
  weight: item.value,
});

test('ไม่ส่ง describe = ไม่จัดกลุ่ม (null ไม่ใช่ถังเดียว)', () => {
  assert.equal(bucketList(items), null);
  assert.equal(bucketList(items, null), null);
});

test('รวมสมาชิกที่กุญแจเดียวกัน พร้อมนับจำนวนและรวมยอด', () => {
  const buckets = bucketList(items, byOwner);
  const nida = buckets.find((b) => b.label === 'Nida');
  assert.equal(nida.count, 2);
  assert.equal(nida.total, 400);
  assert.equal(nida.sub, 'SV');
  assert.deepEqual(nida.items.map((i) => i.id), ['A', 'D']);
});

/* 🔴 ผู้ใช้เพิ่งเลือกวิธีเรียงไป — ถ้าจัดกลุ่มแล้วลำดับพลิกเป็นอย่างอื่น
   เท่ากับปุ่ม "เรียง" ถูกยกเลิกเงียบ ๆ */
test('ลำดับถังตามลำดับที่สมาชิกตัวแรกโผล่ในรายการที่เรียงมาแล้ว', () => {
  const buckets = bucketList(items, byOwner);
  assert.deepEqual(buckets.map((b) => b.label), ['Nida', 'Somchai', 'ไม่ระบุผู้ดูแล']);

  // สลับให้ Somchai มาก่อน ⇒ ลำดับถังต้องพลิกตาม ไม่ใช่คงที่ตามชื่อถัง
  const resorted = bucketList([items[2], items[0], items[1], items[3]], byOwner);
  assert.deepEqual(resorted.map((b) => b.label), ['Somchai', 'Nida', 'ไม่ระบุผู้ดูแล']);
});

test('ถัง "ไม่ระบุ" อยู่ท้ายเสมอ แม้สมาชิกจะโผล่มาก่อน', () => {
  const buckets = bucketList([items[1], items[0]], byOwner);
  assert.equal(buckets.at(-1).label, 'ไม่ระบุผู้ดูแล');
  assert.ok(buckets.at(-1).missing);
});

/* ⚠️ ชื่อซ้ำกันได้ — กุญแจต้องเป็น id ไม่ใช่ชื่อ (คนละคนต้องไม่ถูกยุบรวม) */
test('กุญแจเดียวกันคือถังเดียวกัน แม้ชื่อจะซ้ำกันข้ามถัง', () => {
  const twins = [
    { id: '1', owner: 'U-1', ownerName: 'Somchai', value: 1 },
    { id: '2', owner: 'U-2', ownerName: 'Somchai', value: 1 },
  ];
  assert.equal(bucketList(twins, byOwner).length, 2);
});

test('บรรทัดรองเอาค่าแรกที่มีจริง — สมาชิกตัวแรกอาจยังไม่มีรหัส', () => {
  const rows = [
    { id: '1', owner: 'U-1', ownerName: 'Nida', team: null, value: 0 },
    { id: '2', owner: 'U-1', ownerName: 'Nida', team: 'SV', value: 0 },
  ];
  assert.equal(bucketList(rows, byOwner)[0].sub, 'SV');
});

test('ยอดที่ไม่ใช่ตัวเลขไม่ทำให้ยอดรวมเป็น NaN', () => {
  const rows = [{ id: '1', owner: 'U-1', ownerName: 'Nida', value: null }];
  assert.equal(bucketList(rows, byOwner)[0].total, 0);
});

test('รายการว่างได้ถังว่าง ไม่ใช่พัง', () => {
  assert.deepEqual(bucketList([], byOwner), []);
  assert.deepEqual(bucketList(undefined, byOwner), []);
});

// ── ตัวช่วยของปุ่มย่อ/ขยาย ────────────────────────────────────────────────
test('ย่อครบทุกกลุ่มถึงจะนับว่าย่อหมด', () => {
  const buckets = bucketList(items, byOwner);
  assert.equal(allBucketsCollapsed(buckets, new Set()), false);
  assert.equal(allBucketsCollapsed(buckets, new Set(['U-1'])), false);
  assert.equal(allBucketsCollapsed(buckets, new Set(buckets.map((b) => b.key))), true);
  // ไม่มีถังเลย = ยังไม่ถือว่าย่อหมด (ปุ่มไม่ควรพลิกเป็น "ขยายทุกกลุ่ม")
  assert.equal(allBucketsCollapsed([], new Set()), false);
  assert.equal(allBucketsCollapsed(null, new Set()), false);
});

test('สลับสถานะย่อคืน Set ใหม่เสมอ (React ต้องเห็นว่าเปลี่ยน)', () => {
  const before = new Set(['A']);
  const opened = toggleBucketKey(before, 'A');
  assert.notEqual(opened, before);
  assert.equal(opened.has('A'), false);
  assert.equal(toggleBucketKey(opened, 'B').has('B'), true);
});
