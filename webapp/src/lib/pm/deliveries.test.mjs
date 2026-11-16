// ของเข้า PM/RM (mig 0176) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveriesForSalesOrder,
  deliveryRollup,
  productionReadiness,
} from './deliveries.js';

// ── สรุปขึ้นขั้นไทม์ไลน์ ─────────────────────────────────────────────────
const row = (over = {}) => ({ id: 'MDL-1', kind: 'PM', label: 'x', dueDate: null, arrivedAt: null, ...over });

test('สรุป: นับมาแล้ว/ยังไม่มา และหาวันที่ช้าที่สุดของของที่ยังไม่มา', () => {
  const sum = deliveryRollup([
    row({ id: 'a', arrivedAt: '2026-08-01', dueDate: '2026-08-05' }),
    row({ id: 'b', dueDate: '2026-09-10' }),
    row({ id: 'c', dueDate: '2026-08-20' }),
  ], '2026-08-25');
  assert.equal(sum.total, 3);
  assert.equal(sum.arrived, 1);
  assert.equal(sum.open, 2);
  assert.equal(sum.complete, false);
  // ช้าสุดของ "ที่ยังไม่มา" = 09-10 (ของที่มาแล้วไม่นับ ไม่งั้นวันจะค้างอยู่ในอดีต)
  assert.equal(sum.lastDue, '2026-09-10');
  // เลยกำหนดแล้วยังไม่มา = 1 แถว (c ครบ 08-20 ไปแล้ว)
  assert.equal(sum.late, 1);
});

test('สรุป: มาครบแล้ว = complete · ไม่มีแถวเลย = ไม่ complete', () => {
  assert.equal(deliveryRollup([row({ arrivedAt: '2026-08-01' })], '2026-08-25').complete, true);
  assert.equal(deliveryRollup([], '2026-08-25').complete, false);
  assert.equal(deliveryRollup([], '2026-08-25').lastDue, null);
});

// ── ผูกกับใบสั่งขาย (mig 0177) ───────────────────────────────────────────
// มติผู้ใช้: "PR RM เข้า มันจะเชื่อมกับ SO เพราะว่ามันติดตามเพื่อสู่การผลิต"
const soRow = (over = {}) => ({ id: 'MDL-1', kind: 'PM', label: 'x', salesOrderId: 'SO-1', dueDate: null, arrivedAt: null, ...over });

test('ของของ SO ใบอื่นไม่ปนกัน — โครงการเดียวมี SO ได้หลายใบ (re-order)', () => {
  const rows = [soRow({ id: 'a' }), soRow({ id: 'b', salesOrderId: 'SO-2' }), soRow({ id: 'c', salesOrderId: null })];
  assert.deepEqual(deliveriesForSalesOrder(rows, 'SO-1').map((r) => r.id), ['a']);
  assert.deepEqual(deliveriesForSalesOrder(rows, 'SO-2').map((r) => r.id), ['b']);
});

test('⚠️ แถวที่ยังไม่ผูก SO ไม่ถูกเดาให้ใบไหน — เดาผิด = ใบที่ยังไม่พร้อมดูเหมือนพร้อม', () => {
  const rows = [soRow({ id: 'c', salesOrderId: null })];
  assert.deepEqual(deliveriesForSalesOrder(rows, 'SO-1'), []);
  assert.deepEqual(deliveriesForSalesOrder(rows, null), []);
});

test('พร้อมผลิต: ของครบแล้ว = ready', () => {
  const r = productionReadiness([soRow({ arrivedAt: '2026-08-01' })], '2026-08-25');
  assert.equal(r.state, 'ready');
  assert.equal(r.tone, 'success');
});

test('พร้อมผลิต: มีของเลยกำหนดแล้วยังไม่มา = blocked (สำคัญกว่าแค่ "รอ")', () => {
  const r = productionReadiness([
    soRow({ id: 'a', arrivedAt: '2026-08-01' }),
    soRow({ id: 'b', dueDate: '2026-08-10' }),
  ], '2026-08-25');
  assert.equal(r.state, 'blocked');
  assert.equal(r.tone, 'danger');
  assert.match(r.label, /เลยกำหนดแล้ว 1 รายการ/);
});

test('พร้อมผลิต: ยังไม่ถึงกำหนด = waiting พร้อมบอกวันที่ครบ', () => {
  const r = productionReadiness([soRow({ dueDate: '2026-09-15' })], '2026-08-25');
  assert.equal(r.state, 'waiting');
  assert.match(r.label, /2026-09-15/);
});

test('พร้อมผลิต: ไม่มีรายการเลย = unknown ไม่ใช่ ready', () => {
  // ⚠️ ของยังไม่ถูกกางเข้าระบบ ≠ ของครบแล้ว — ตอบ ready ตรงนี้คือบอกให้เริ่มผลิตผิด
  const r = productionReadiness([], '2026-08-25');
  assert.equal(r.state, 'unknown');
  assert.equal(r.tone, 'neutral');
});
