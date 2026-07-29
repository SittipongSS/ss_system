// ของเข้า PM/RM (mig 0176) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditDeliveries,
  canViewDeliveries,
  deliveriesForSalesOrder,
  deliveriesFromComponents,
  deliveryRollup,
  normalizeDeliveryInput,
  productionReadiness,
} from './deliveries.js';

const ae = { id: 'u-ae', role: 'ae', team: 'KA' };
const pc = { id: 'u-pc', role: 'staff', department: 'PC' };
const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const viewer = { id: 'u-v', role: 'viewer' };
const project = { id: 'PRJ-1', team: 'KA', ownerId: 'u-ae' };

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
test('⭐ PC ต้องแก้กำหนดของเข้าได้ ทั้งที่ pmEditScope ของ staff = none', () => {
  // ถ้ากั้นด้วย scope ของ PM อย่างเดียว คนที่รู้กำหนดจริงจะเป็นคนเดียวที่แก้ไม่ได้
  // (บทเรียนเดียวกับ /api/pm/my-work ที่ PC ไม่เคยเห็นคิวตัวเอง — #790)
  assert.equal(canEditDeliveries(pc, project), true);
});

test('ฝ่ายขายในทีมโครงการแก้ได้ · ทีมอื่น/ผู้อ่านอย่างเดียวแก้ไม่ได้', () => {
  assert.equal(canEditDeliveries(ae, project), true);
  assert.equal(canEditDeliveries({ ...ae, team: 'GT' }, project), false);
  assert.equal(canEditDeliveries(viewer, project), false);
});

test('RD ไม่ใช่เจ้าของของเข้า — ตอบราคาได้แต่ไม่ได้เป็นคนสั่งของ', () => {
  assert.equal(canEditDeliveries(rd, project), false);
});

test('อ่านได้ทุกคนที่เห็นโครงการ (ของเข้าเป็นกำหนดการ ไม่ใช่ต้นทุน)', () => {
  assert.equal(canViewDeliveries(ae), true);
  assert.equal(canViewDeliveries(pc), true);
});

// ── ตรวจข้อมูล ───────────────────────────────────────────────────────────
const base = { kind: 'PM', label: 'ขวดแก้ว 200ml' };

test('ต้องมีชนิดวัสดุที่ถูกต้องและชื่อ', () => {
  assert.equal(normalizeDeliveryInput({ ...base, kind: 'labor' }).error, 'ชนิดวัสดุไม่ถูกต้อง');
  assert.equal(normalizeDeliveryInput({ kind: 'PM', label: '   ' }).error, 'ต้องระบุชื่อวัสดุ');
  assert.equal(normalizeDeliveryInput(base).error, null);
});

test('จำนวนว่าง = ยังไม่รู้ยอด ไม่ใช่ 0', () => {
  // ⚠️ Number(null) = 0 เคยทำให้ "ยังไม่รู้ราคา" กลายเป็น "ฟรี" มาแล้ว
  assert.equal(normalizeDeliveryInput(base).value.qty, null);
  assert.equal(normalizeDeliveryInput({ ...base, qty: '' }).value.qty, null);
  assert.equal(normalizeDeliveryInput({ ...base, qty: 500 }).value.qty, 500);
  assert.equal(normalizeDeliveryInput({ ...base, qty: 0 }).error, 'จำนวนต้องเป็นตัวเลขมากกว่า 0');
  assert.equal(normalizeDeliveryInput({ ...base, qty: -5 }).error, 'จำนวนต้องเป็นตัวเลขมากกว่า 0');
});

test('ปีพิมพ์ผิดถูกจับ — ของจริงบน prod เคยมีปี 2202', () => {
  assert.match(normalizeDeliveryInput({ ...base, dueDate: '2202-08-06' }).error, /นอกช่วงปี/);
  assert.equal(normalizeDeliveryInput({ ...base, dueDate: '06/08/2026' }).error, 'กำหนดถึงไม่ถูกต้อง');
  assert.equal(normalizeDeliveryInput({ ...base, dueDate: '2026-08-06' }).error, null);
});

test('ของมาก่อนกำหนดได้ (ปกติมาก) — ไม่บล็อก', () => {
  const { error } = normalizeDeliveryInput({ ...base, dueDate: '2026-09-01', arrivedAt: '2026-08-20' });
  assert.equal(error, null);
});

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

// ── กางจากใบขอราคาผลิต ──────────────────────────────────────────────────
const comp = (over = {}) => ({ id: 'C1', kind: 'PM', label: 'ขวด', unitBasis: 'per_piece', ...over });

test('กาง: ตัดบรรทัดค่าดำเนินการ (labor) ออก — ไม่ใช่ของที่ต้องรอเข้า', () => {
  const { rows } = deliveriesFromComponents([
    comp({ id: 'C1' }),
    comp({ id: 'C2', kind: 'labor', unitBasis: 'per_piece' }),
    comp({ id: 'C3', kind: 'RM_F', unitBasis: 'per_kg' }),
  ]);
  assert.deepEqual(rows.map((r) => r.componentId), ['C1', 'C3']);
});

test('กาง: หน่วยตามชนิด — RM เป็นกิโล PM เป็นชิ้น', () => {
  const { rows } = deliveriesFromComponents([
    comp({ id: 'C1', kind: 'PM', unitBasis: 'per_piece' }),
    comp({ id: 'C2', kind: 'RM_FB', unitBasis: 'per_kg' }),
  ]);
  assert.deepEqual(rows.map((r) => r.unit), ['ชิ้น', 'กก.']);
});

test('⭐ กางซ้ำไม่ได้แถวซ้ำ และบอกว่าข้ามไปกี่แถว', () => {
  const components = [comp({ id: 'C1' }), comp({ id: 'C2' })];
  const { rows, skipped } = deliveriesFromComponents(components, { existingComponentIds: ['C1'] });
  assert.deepEqual(rows.map((r) => r.componentId), ['C2']);
  assert.equal(skipped, 1);
  // กางซ้ำทั้งชุด = ไม่มีอะไรใหม่ แต่ไม่ควรเป็น error (ผู้ใช้กดสองครั้งเป็นเรื่องปกติ)
  const again = deliveriesFromComponents(components, { existingComponentIds: ['C1', 'C2'] });
  assert.deepEqual(again.rows, []);
  assert.equal(again.skipped, 2);
});

test('กาง: บรรทัดซ้ำ id เดียวกันในชุดเดียวนับครั้งเดียว', () => {
  const { rows } = deliveriesFromComponents([comp({ id: 'C1' }), comp({ id: 'C1' })]);
  assert.equal(rows.length, 1);
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

test('salesOrderId ผ่าน normalize ได้ และว่าง = ยังไม่ผูก', () => {
  assert.equal(normalizeDeliveryInput({ kind: 'PM', label: 'x' }).value.salesOrderId, null);
  assert.equal(normalizeDeliveryInput({ kind: 'PM', label: 'x', salesOrderId: 'SO-1' }).value.salesOrderId, 'SO-1');
});
