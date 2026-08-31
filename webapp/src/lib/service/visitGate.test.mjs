// ── ด่านเข้าไซต์ (mig 0302) ───────────────────────────────────────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด (มติผู้ใช้ 2026-08-28):
//   "TS จะไม่สามารถสร้างการเข้าบริการได้เอง จนกว่าจะผ่านด่าน"
// และข้อจำกัดที่สำคัญพอ ๆ กัน: **ด่านต้องไม่กลายเป็นแรงเสียดทานรายวัน** —
// นัดที่ครบเงื่อนไขตั้งแต่แรกต้องขึ้นตารางเอง ไม่ต้องรอคนมากดปล่อยทีละใบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_EXEMPT_KINDS,
  evaluateVisitGate,
  gateBlocker,
  gatePassed,
  gateReasons,
  gateSummary,
  initialVisitStatus,
} from './visitGate.js';

// ไซต์เข้าได้ จ–ศ 09:00–17:00
const site = {
  id: 'S1', name: 'Jim Thompson Outlet 93',
  accessDays: [1, 2, 3, 4, 5], accessFrom: '09:00', accessTo: '17:00',
};
// 2026-08-27 = วันพฤหัส · 2026-08-29 = วันเสาร์
const ok = { assigneeId: 'U1', assigneeName: 'ต้า', scheduledDate: '2026-08-27', startTime: '10:00', endTime: '12:00', kind: 'refill' };

/* ── บริบทของด่าน ①② ตั้งแต่ PR-C (2026-08-31) ─────────────────────────────
   ⚠️ **ไม่ส่งบริบทมา = ติด ไม่ใช่ผ่าน** — ไซต์ที่ไม่มีโซน/ไม่มีรอบขาย แปลว่า
   ไม่มีอะไรที่ได้รับอนุญาตให้ไปทำ · การเดาว่าผ่านคือที่มาของ "ส่งเจ้าหน้าที่ไปที่ที่
   หมดสัญญา 25 จุด" ที่ด่านนี้เกิดมาเพื่อแก้ */
const zones = [{ id: 'Z1', name: 'โซน A' }];
const terms = [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', startDate: '2026-01-01', endDate: '2027-12-31' }];
const ordersById = { SO1: { id: 'SO1', status: 'approved', serviceContractId: 'CT1' } };
const contractsById = { CT1: { id: 'CT1', status: 'signed' } };
const installmentsByOrderId = {
  SO1: [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-09-30', dueDate: '2026-08-01' }],
};
const full = { site, zones, terms, ordersById, contractsById, installmentsByOrderId };

test('ครบทุกข้อ = ขึ้นตารางเลย ไม่ต้องให้คนมากดปล่อย', () => {
  const items = evaluateVisitGate(ok, full);
  assert.equal(gatePassed(items), true);
  assert.equal(initialVisitStatus(ok, full), 'scheduled');
  assert.equal(gateBlocker(items), '');
});

test('ไม่มีเจ้าหน้าที่ = จอดเป็นร่าง และบอกว่าเป็นงานของ TS', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, full);
  assert.equal(initialVisitStatus({ ...ok, assigneeId: '' }, full), 'draft');
  const assignee = items.find((i) => i.key === 'assignee');
  assert.equal(assignee.state, 'blocked');
  assert.equal(assignee.owner, 'TS');
  assert.equal(assignee.fix, 'assignee');
});

test('นัดวันเสาร์ทั้งที่ไซต์ให้เข้า จ–ศ = ไม่ผ่านข้อช่วงเวลา', () => {
  const weekend = { ...ok, scheduledDate: '2026-08-29' };
  const items = evaluateVisitGate(weekend, full);
  const access = items.find((i) => i.key === 'access');
  assert.equal(access.state, 'blocked');
  assert.ok(access.detail);
  assert.equal(initialVisitStatus(weekend, full), 'draft');
});

test('⭐ ปุ่มที่กดไม่ได้ต้องบอก **ทุกข้อที่ขาดในครั้งเดียว** ไม่ใช่ทีละข้อ', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-08-29' }, full);
  const msg = gateBlocker(items);
  assert.match(msg, /ยังไม่มอบหมาย/);
  assert.match(msg, /เสาร์|ไซต์|เข้า/);
  assert.equal(msg.split(' · ').length >= 2, true);
});

/* ═══════════════════════════════════════════════════════════════════════
   ด่าน ①② ตรวจจริงแล้ว (PR-C · 2026-08-31) — เลิก parked
   ═══════════════════════════════════════════════════════════════════════ */

/* 🔴 ไม่มีโซน/ไม่มีรอบขาย = **ติด** ไม่ใช่ผ่าน — ไม่มีอะไรที่ได้รับอนุญาตให้ไปทำ */
test('⭐ ไม่มีบริบทสัญญาเลย = ติด ไม่ใช่ผ่านเงียบ ๆ', () => {
  const items = evaluateVisitGate(ok, { site });
  assert.equal(gatePassed(items), false);
  assert.equal(items.find((i) => i.key === 'contract').state, 'blocked');
  assert.equal(items.filter((i) => i.state === 'parked').length, 0, 'ไม่มี parked เหลืออีกแล้ว');
});

test('ใบสั่งขายที่ยังไม่ผูกสัญญา = ติดข้อสัญญา และเป็นงานของ SA', () => {
  const items = evaluateVisitGate(ok, { ...full, ordersById: { SO1: { id: 'SO1', status: 'approved' } } });
  const c = items.find((i) => i.key === 'contract');
  assert.equal(c.state, 'blocked');
  assert.equal(c.owner, 'SA');
  assert.match(c.detail, /ยังไม่ผูกสัญญา/);
});

test('สัญญาที่ยังไม่ผ่านการรับรอง ไม่นับว่ามีผล', () => {
  for (const st of ['draft', 'awaiting_signature', 'awaiting_approval', 'cancelled']) {
    const items = evaluateVisitGate(ok, { ...full, contractsById: { CT1: { id: 'CT1', status: st } } });
    assert.equal(items.find((i) => i.key === 'contract').state, 'blocked', st);
  }
});

/* 🔴 **แต่ละข้อบล็อกด้วยเหตุของตัวเอง** — นัดที่ติดเพราะเงิน ต้องไม่ขึ้นว่าติดสัญญา
   เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย (SA เปิดไปดูสัญญาแล้วไม่เจออะไรผิด) */
test('⭐ เกินช่วงจ่ายถึง = ติดข้อเงินข้อเดียว ไม่ลามไปข้อสัญญา', () => {
  const items = evaluateVisitGate({ ...ok, scheduledDate: '2026-11-10' }, full);
  assert.equal(items.find((i) => i.key === 'payment').state, 'blocked');
  assert.equal(items.find((i) => i.key === 'contract').state, 'ok');
  assert.equal(items.find((i) => i.key === 'payment').owner, 'SA → FN');
});

/* ⚠️ "แจ้งแล้ว" ไม่ปลดด่าน — ปลดเมื่อบัญชี "รับรองแล้ว" เท่านั้น */
test('งวดที่ยังไม่ถูกบัญชีรับรอง ไม่ปลดด่านเงิน', () => {
  for (const st of ['pending', 'reported', 'rejected']) {
    const rows = [{ status: st, coversFrom: '2026-08-01', coversTo: '2026-09-30', dueDate: '2026-08-01' }];
    const items = evaluateVisitGate(ok, { ...full, installmentsByOrderId: { SO1: rows } });
    assert.equal(items.find((i) => i.key === 'payment').state, 'blocked', st);
  }
});

/* ⭐ ไซต์เดียวโดนหลาย SO ครอบ — จ่ายใบเดียว ⇒ **นัดยังไปได้** แต่ตัดโซนที่ไม่ครอบ
   (มติผู้ใช้ 2026-08-27: "จ่ายมา บาง SO ก็ไปเฉพาะที่ครอบคลุม SO นั้น") */
test('⭐ ติดบางโซน = ใบยังผ่าน แต่แนบผลรายโซนให้ใบส่งงานตัดโซนที่งด', () => {
  const items = evaluateVisitGate(ok, { ...full, zones: [...zones, { id: 'Z2', name: 'โซน B' }] });
  assert.equal(gatePassed(items), true, 'โซนที่จ่ายแล้วยังไปได้');
  assert.deepEqual(items.zoneGates.map((z) => [z.zoneId, z.state]), [['Z1', 'ok'], ['Z2', 'blocked']]);
  assert.match(items.find((i) => i.key === 'contract').detail, /งดบริการ 1 โซน/);
});

/* ⭐ สำรวจพื้นที่เกิด **ก่อนขาย** · ถอนเครื่องเกิด **ตอนสัญญาหมด** ⇒ สองชนิดนี้
   ไม่มีทางผ่านด่าน ①② ได้เลย · ไม่ข้าม = เครื่องของบริษัทค้างที่ลูกค้าตลอดกาล */
/* ⚠️ ใช้ชนิด `remove` ที่มีอยู่ ไม่เพิ่มชนิดใหม่ — "ถอด" กับ "ถอน" ต่างกันตัวเดียว */
test('⭐ สำรวจพื้นที่กับถอนเครื่องข้ามด่านสัญญา/เงิน แต่ยังต้องผ่าน ③④', () => {
  assert.deepEqual([...GATE_EXEMPT_KINDS], ['survey', 'remove']);
  for (const kind of GATE_EXEMPT_KINDS) {
    const bare = evaluateVisitGate({ ...ok, kind }, { site });
    assert.equal(gatePassed(bare), true, `${kind}: ข้ามด่านสัญญา/เงินได้`);
    // ยังต้องมีคนรับผิดชอบ
    const noOne = evaluateVisitGate({ ...ok, kind, assigneeId: '' }, { site });
    assert.equal(gatePassed(noOne), false, `${kind}: ยังต้องมอบหมายคน`);
  }
});

test('ไม่รู้จักไซต์ = ตรวจข้อช่วงเวลาไม่ได้ ต้องไม่ระเบิดและไม่แกล้งบล็อก', () => {
  const items = evaluateVisitGate(ok, { ...full, site: null });
  assert.equal(items.find((i) => i.key === 'access').state, 'ok');
  assert.equal(gatePassed(items), true);
});

test('นับผลรวมได้ครบ 4 ข้อเสมอ — จอไหนก็เห็นเท่ากัน', () => {
  const s = gateSummary(evaluateVisitGate({}, { site }));
  assert.equal(s.total, 4);
  assert.equal(s.parked, 0, 'ไม่มีข้อไหน parked แล้วตั้งแต่ PR-C');
  assert.equal(s.blocked >= 1, true);
});

test('รายการเหตุแยกจากประโยคเต็ม — จอที่บอกบริบทอยู่แล้วไม่ต้องอ่านขีดซ้อนสามชั้น', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, full);
  // บริบทสัญญา/เงินครบแล้ว ⇒ เหลือเหตุเดียวคือเรื่องคน
  assert.deepEqual(gateReasons(items), ['ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยเข้าคิว']);
  assert.equal(gateBlocker(items), 'ยังเข้าคิวไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยเข้าคิว');
  // นัดที่ผ่านครบ = ไม่มีเหตุเลย (บริบทครบต้องส่งมาด้วย ไม่งั้นติดที่ข้อสัญญา)
  assert.deepEqual(gateReasons(evaluateVisitGate(ok, full)), []);
});
