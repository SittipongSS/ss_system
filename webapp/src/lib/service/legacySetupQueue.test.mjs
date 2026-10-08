// ── ถัง "รอฝ่ายขายตั้งงานบริการ (ใบเดิม)" (mig 0392 · PR-A · D14/D25/D28) ─────────────────────────────
//
// ⭐ แทนถังผูกโซนของ TS ที่ปลดแล้ว — ใบเดิมที่อนุมัติก่อนฝ่ายขายตั้งงานบริการเอง รอฝ่ายขายตั้งย้อนหลัง
//   แล้วผู้จัดการฝ่ายขายตรวจ · TS ดูอย่างเดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_SETUP_FILTERS,
  LEGACY_SETUP_NO_SITE_SUB,
  LEGACY_SETUP_SELECT_ERROR,
  legacySetupFilterCounts,
  legacySetupHaystack,
  legacySetupQueue,
  legacySetupStatusView,
} from './legacySetupQueue.js';
import { ORIGIN_HISTORICAL } from '../sales/historicalOrders.js';

const dealsById = new Map([
  ['DL-S', { id: 'DL-S', line: 'SERVICE', ownerName: 'Lalida Chaiwanna' }],
  ['DL-P', { id: 'DL-P', line: 'PRODUCT', ownerName: 'Kamonrat Pipattanapong' }],
  ['DL-0', { id: 'DL-0', line: null, ownerName: 'Kamonrat Pipattanapong' }],
]);
const projectsById = new Map();

/* ใบเดิม: อนุมัติแล้ว · ยังไม่ประทับ · สายบริการ — select ของ route พกคอลัมน์ 0392 ครบ */
const so = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26090242-0', status: 'approved', supersededById: null, origin: 'pipeline',
  customerId: 'C1', customerName: 'บริษัท โออิชิ ราเมน จำกัด', dealId: 'DL-S', projectId: null,
  approvedAt: '2026-09-25T03:00:00Z', updatedAt: '2026-09-27T09:30:00Z', serviceContractId: null,
  serviceTermsOpenedAt: null, serviceSetupState: null,
  serviceSetupSubmittedAt: null, serviceSetupSubmittedByName: null,
  serviceSetupRejectedAt: null, serviceSetupRejectedByName: null, serviceSetupRejectedReason: null,
  servicePeriodFrom: null,
  ...over,
});
/* บรรทัดพิมพ์เองไม่มีหมวด (ต้องเลือก) + บรรทัด FG หมวดบริการ */
const manual = (over = {}) => ({ id: 'L1', salesOrderId: 'SO1', fgCode: null, productId: null, description: 'ค่าบริการน้ำหอม', qty: 12, unit: 'แพ็คเกจ', metadata: {}, serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over });
const fgPackage = (over = {}) => ({ id: 'L2', salesOrderId: 'SO1', fgCode: 'FG-0521-02-001-00012', productId: 'P12', description: 'แพ็คเกจ SDS', qty: 12, unit: 'แพ็ค', metadata: {}, serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over });
const fgOther = (over = {}) => ({ id: 'L3', salesOrderId: 'SO1', fgCode: 'FG-0521-03-002-00007', productId: 'P7', description: 'น้ำหอมขวด', qty: 2, unit: 'ขวด', metadata: {}, serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over });

const run = (args) => legacySetupQueue({ projectsById, dealsById, ...args });

test('🔴 select ของใบต้องพก "serviceTermsOpenedAt" — ไม่มี = โยน (ใบที่ประทับแล้วห้ามโผล่เงียบ ๆ)', () => {
  const order = so();
  delete order.serviceTermsOpenedAt;
  assert.throws(() => run({ orders: [order], lines: [manual()] }), (e) => e.message === LEGACY_SETUP_SELECT_ERROR);
  // ค่าที่เป็น null (มีคีย์) ผ่าน
  assert.equal(run({ orders: [so()], lines: [manual()] }).rows.length, 1);
});

test('⭐ ใบที่ประทับแล้ว (เปิดงานให้ TS แล้ว) ไม่อยู่ในถังเลย', () => {
  const q = run({ orders: [so({ serviceTermsOpenedAt: '2026-09-28T03:00:00Z' })], lines: [manual()] });
  assert.equal(q.rows.length, 0);
  assert.equal(q.unknownLine.length, 0);
});

test('⭐ ใบที่ทุกบรรทัดตัดสินได้ว่าไม่ใช่งานบริการ ไม่ขึ้นที่ไหนเลย (D25)', () => {
  const q = run({ orders: [so()], lines: [fgOther(), fgOther({ id: 'L4', metadata: {} })] });
  assert.deepEqual(q.rows, []);
  // บรรทัดพิมพ์เองที่มีหมวดอื่น (#1844) ก็ไม่ใช่งานบริการเหมือนกัน
  const q2 = run({ orders: [so()], lines: [manual({ metadata: { categoryCode: '03-002' } })] });
  assert.deepEqual(q2.rows, []);
});

test('🔴 ใบที่ย้อนอนุมัติแล้วแต่ค้างสถานะ "submitted" ไม่อยู่ในถัง (ไม่ใช่ใบที่รับได้ · D28)', () => {
  for (const status of ['approval_revoked', 'revised', 'cancelled', 'pending_approval']) {
    const q = run({ orders: [so({ status, serviceSetupState: 'submitted' })], lines: [manual()] });
    assert.equal(q.rows.length, 0, status);
  }
  // ถูก Rev. ทับ (supersededById) ก็เช่นกัน
  assert.equal(run({ orders: [so({ supersededById: 'SO2', serviceSetupState: 'submitted' })], lines: [manual()] }).rows.length, 0);
});

test('ใบย้อนหลัง (historical) · สายสินค้า ไม่เข้าถังนี้ · สายที่ตอบไม่ได้ไปถังของมันเอง', () => {
  const q = run({
    orders: [
      so({ id: 'SOH', origin: ORIGIN_HISTORICAL }),
      so({ id: 'SOP', dealId: 'DL-P' }),
      so({ id: 'SO0', dealId: 'DL-0' }),
    ],
    lines: [manual({ salesOrderId: 'SOH' }), manual({ id: 'LP', salesOrderId: 'SOP' }), manual({ id: 'L0', salesOrderId: 'SO0' })],
  });
  assert.deepEqual(q.rows, []);
  assert.deepEqual(q.unknownLine.map((r) => r.orderId), ['SO0']);
  assert.equal(q.unknownLine[0].line, null);
  assert.deepEqual(q.unknownLine[0].progress, { done: 0, total: 1 });
});

test('สถานะ: ยังไม่เริ่ม · กำลังตั้ง (มีช่วงบริการ) · รอผู้จัดการตรวจ · ตีกลับ', () => {
  const q = run({
    orders: [
      so({ id: 'A' }),
      so({ id: 'B', servicePeriodFrom: '2026-10-01' }),
      so({ id: 'C', serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-28T02:00:00Z', serviceSetupSubmittedByName: 'Lalida Chaiwanna' }),
      so({ id: 'D', serviceSetupState: 'rejected', serviceSetupRejectedAt: '2026-09-27T05:00:00Z', serviceSetupRejectedByName: 'Patcharapit Jueajan', serviceSetupRejectedReason: 'ขาดโซน Bakery 17 สาขา' }),
    ],
    lines: ['A', 'B', 'C', 'D'].map((id) => manual({ id: `L-${id}`, salesOrderId: id })),
  });
  const byId = Object.fromEntries(q.rows.map((r) => [r.orderId, r]));
  assert.equal(byId.A.state, 'not_started');
  assert.equal(byId.A.stateLabel, 'ยังไม่เริ่ม');
  assert.equal(byId.A.lastEditedAt, null);
  assert.equal(byId.B.state, 'editing');
  assert.equal(byId.B.stateLabel, 'ฝ่ายขายกำลังตั้ง');
  assert.equal(byId.B.lastEditedAt, '2026-09-27T09:30:00Z', 'แก้ล่าสุด = updatedAt ที่ RPC บันทึกขยับ');
  assert.equal(byId.C.state, 'submitted');
  assert.equal(byId.C.stateLabel, 'รอผู้จัดการตรวจ');
  assert.equal(byId.C.submitted.byName, 'Lalida Chaiwanna');
  assert.equal(byId.C.rejected, null);
  assert.equal(byId.D.state, 'rejected');
  assert.deepEqual(byId.D.rejected, { at: '2026-09-27T05:00:00Z', byName: 'Patcharapit Jueajan', reason: 'ขาดโซน Bakery 17 สาขา' });
  assert.equal(byId.D.submitted, null);
});

test('กำลังตั้ง = มีของที่ฝ่ายขายบันทึกแล้ว (ชนิด · แพ็คเกจ · โซน) · จำนวนรอบอย่างเดียวไม่นับ', () => {
  const stateOf = (lines, allocations = []) => run({ orders: [so()], lines, allocations }).rows[0].state;
  assert.equal(stateOf([manual({ serviceRounds: 12 })]), 'not_started', 'รอบของใบเดิมกรอกได้ตั้งแต่ 0326 — ไม่ใช่การเริ่มตั้ง');
  assert.equal(stateOf([manual({ serviceKind: 'package' })]), 'editing');
  assert.equal(stateOf([manual({ serviceKind: 'package', serviceProductId: 'P12', serviceFgCode: 'FG-0521-02-001-00012' })]), 'editing');
  assert.equal(stateOf([fgPackage()], [{ id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 1 }]), 'editing');
});

test('⭐ ความคืบหน้า 1/2 — ครบ = FG · รอบ · ≥1 โซน · แพ็คต่อรอบทุกโซน · บรรทัดไม่ใช่งานบริการที่ตัดสินเองได้ไม่นับ', () => {
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }], ['Z2', { id: 'Z2', siteId: 'S1' }]]);
  const q = run({
    orders: [so({ servicePeriodFrom: '2026-10-01' })],
    lines: [
      fgPackage({ serviceRounds: 12 }),                // ครบ
      manual({ serviceKind: 'package', serviceRounds: 12 }), // ยังไม่มีแพ็คเกจ/โซน
      fgOther(),                                       // ไม่ใช่งานบริการ (ตัดสินเอง) — ไม่นับ
    ],
    allocations: [{ id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 2 }],
    zonesById,
  });
  assert.deepEqual(q.rows[0].progress, { done: 1, total: 2 });
  // โซนที่ยังไม่ใส่แพ็คต่อรอบ = ยังไม่ครบ
  const partial = run({
    orders: [so()],
    lines: [fgPackage({ serviceRounds: 12 })],
    allocations: [
      { id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 2 },
      { id: 'A2', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z2', packsPerRound: null },
    ],
    zonesById,
  });
  assert.deepEqual(partial.rows[0].progress, { done: 0, total: 1 });
});

test('ฝ่ายขายเลือก "ไม่ใช่งานบริการ" ให้บรรทัดที่ต้องตัดสิน = ตัดสินแล้ว (นับเป็นเสร็จ ไม่หลุดจากตัวหาร)', () => {
  const q = run({
    orders: [so()],
    lines: [manual({ serviceKind: 'not_service' }), manual({ id: 'L9' })],
  });
  assert.deepEqual(q.rows[0].progress, { done: 1, total: 2 });
  /* ทุกบรรทัดถูกฝ่ายขายเลือกเป็นไม่ใช่งานบริการ = การตัดสินที่ผู้จัดการยังต้องตรวจ ⇒ **ยังอยู่ในถัง** จนอนุมัติ (ประทับ 0 โซน)
     🐞 เดิมหลุดจากถังทันทีที่บันทึก (กดแผ่นผิดครั้งเดียว = ใบบริการหายจาก TS ไม่มีใครตรวจ) */
  const all = run({ orders: [so()], lines: [manual({ serviceKind: 'not_service' })] });
  assert.equal(all.rows.length, 1);
  assert.deepEqual(all.rows[0].progress, { done: 1, total: 1 });
  // สายว่าง: ถังของมันเองก็ถามชนิดที่บรรทัดตัดสินได้เองเหมือนกัน
  const unknown = run({ orders: [so({ dealId: 'DL-0' })], lines: [manual({ serviceKind: 'not_service' })] });
  assert.equal(unknown.unknownLine.length, 1);
});

test('F19: ลูกค้าไม่มีไซต์ในทะเบียน = บอก TS ว่าต้องเพิ่มไซต์ก่อน (ฝ่ายขายเลือกโซนไม่ได้) · ไม่ส่งชุดไซต์มา = ไม่เดา', () => {
  const orders = [so(), so({ id: 'SO2', orderNumber: 'SO-26090243-0', customerId: 'C2' })];
  const lines = [manual(), manual({ id: 'L8', salesOrderId: 'SO2' })];
  const q = run({ orders, lines, customersWithSite: new Set(['C2']) });
  const byId = Object.fromEntries(q.rows.map((row) => [row.orderId, row]));
  assert.equal(byId.SO1.noSite, true);
  assert.equal(byId.SO2.noSite, false);
  const view = legacySetupStatusView(byId.SO1);
  assert.equal(view.tone, 'warning');
  assert.equal(view.label, 'ยังไม่เริ่ม');
  assert.equal(view.sub, LEGACY_SETUP_NO_SITE_SUB);
  assert.match(legacySetupHaystack(byId.SO1), /ยังไม่มีไซต์ในทะเบียน/);
  assert.equal(legacySetupStatusView(byId.SO2).sub, null);
  // กำลังตั้ง: ต่อท้ายบรรทัดรอง · ยื่นแล้ว/ตีกลับ ไม่แตะ
  const editing = run({ orders: [so({ servicePeriodFrom: '2026-10-01' })], lines: [manual()], customersWithSite: new Set() }).rows[0];
  assert.equal(legacySetupStatusView(editing).sub, `แก้ล่าสุด 27/09/2026 · ${LEGACY_SETUP_NO_SITE_SUB}`);
  const submitted = run({ orders: [so({ serviceSetupState: 'submitted' })], lines: [manual()], customersWithSite: new Set() }).rows[0];
  assert.doesNotMatch(legacySetupStatusView(submitted).sub, /ทะเบียน/);
  // ผู้เรียกที่ไม่ส่งชุดไซต์ = ไม่บอกว่าไม่มีไซต์ (ไม่เดา)
  assert.equal(run({ orders, lines }).rows.every((row) => row.noSite === false), true);
});

test('⭐ สรุปของใบที่ยื่นแล้ว: 6 โซนใน 5 ไซต์ · ครั้งละ 7 แพ็ค (นับเฉพาะบรรทัดแพ็คเกจ · คำของมติ 29/09)', () => {
  const zonesById = new Map([
    ['Z1', { id: 'Z1', siteId: 'S1' }], ['Z2', { id: 'Z2', siteId: 'S1' }], ['Z3', { id: 'Z3', siteId: 'S2' }],
    ['Z4', { id: 'Z4', siteId: 'S3' }], ['Z5', { id: 'Z5', siteId: 'S4' }], ['Z6', { id: 'Z6', siteId: 'S5' }],
  ]);
  const alloc = (id, lineId, zoneId, packs) => ({ id, salesOrderId: 'SO1', salesOrderLineId: lineId, zoneId, packsPerRound: packs });
  const q = run({
    orders: [so({ serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-28T02:00:00Z', serviceSetupSubmittedByName: 'Lalida Chaiwanna' })],
    lines: [
      fgPackage({ serviceRounds: 12 }),
      manual({ serviceKind: 'package', serviceProductId: 'P12', serviceFgCode: 'FG-0521-02-001-00012', serviceRounds: 12 }),
      fgOther(),
    ],
    allocations: [
      alloc('A1', 'L2', 'Z1', 2), alloc('A2', 'L2', 'Z2', 1), alloc('A3', 'L2', 'Z3', 1),
      alloc('A4', 'L1', 'Z4', 1), alloc('A5', 'L1', 'Z5', 1), alloc('A6', 'L1', 'Z6', 1),
    ],
    zonesById,
  });
  const [row] = q.rows;
  assert.deepEqual(row.submitted, { at: '2026-09-28T02:00:00Z', byName: 'Lalida Chaiwanna', zones: 6, sites: 5, packsPerRound: 7 });
  assert.deepEqual(row.progress, { done: 2, total: 2 });
  assert.equal(legacySetupStatusView(row).sub, 'ยื่นเมื่อ 28/09/2026 · 6 โซนใน 5 ไซต์ · ครั้งละ 7 แพ็ค');
});

test('แถวพกผู้ดูแลฝ่ายขาย (เจ้าของดีลปัจจุบัน) · ชิปสัญญา · ไม่มียอดเงิน', () => {
  const contractsById = new Map([['CT1', { id: 'CT1', contractNo: 'CT-SR-26090001-0', status: 'signed' }]]);
  const [row] = run({ orders: [so({ serviceContractId: 'CT1', totalAmount: 261936 })], lines: [manual()], contractsById }).rows;
  assert.equal(row.ownerName, 'Lalida Chaiwanna');
  assert.deepEqual(row.readiness, { contractNo: 'CT-SR-26090001-0', hasContract: true });
  assert.equal(row.code, 'SO-26090242-0');
  assert.equal(row.line, 'SERVICE');
  assert.ok(!JSON.stringify(row).includes('261936'), '🔒 ยอดของใบไม่ออกไปกับแถว');
  const [bare] = run({ orders: [so()], lines: [manual()] }).rows;
  assert.deepEqual(bare.readiness, { contractNo: null, hasContract: false });
});

/* 🔁 มติเจ้าของ 08/10 ("ตามงานค้าง"): ถังนี้เคยเรียง **อนุมัติล่าสุดก่อน** (เทสต์เดิมชื่อ "เรียงใหม่สุดก่อน (วันอนุมัติ)" ยึดลำดับ C · B · A)
   ⇒ ใบที่ค้างนานสุด (ตรวจข้อมูลจริง 08/10: 56 วัน) ไปอยู่ท้ายสุดของแท็บ · เจ้าของสั่งตามงานค้าง ⇒ ลำดับตั้งต้นกลับเป็น **ค้างนานสุดก่อน**
   · นาฬิกาที่ใช้เรียง = นาฬิกาเดียวกับชิป "ค้าง n วัน" (ไม่ใช่วันอนุมัติเสมอไป — เปิดแก้/ถูกตีกลับ/ยื่นตรวจนับจากเหตุการณ์นั้น)
   · เท่ากันเรียงตามเลขที่ใบเหมือนเดิม · แท็บนี้ไม่มีตัวเลือกเรียงของผู้ใช้ (ไม่มีลำดับที่ผู้ใช้เลือกให้ทับ) */
test('เรียงค้างนานสุดก่อน (นาฬิกาของชิป "ค้าง n วัน") · เท่ากันเรียงตามเลขที่ใบ · ไม่มีนาฬิกาอยู่ท้าย — มติเจ้าของ 08/10', () => {
  const orders = [
    so({ id: 'A', orderNumber: 'SO-26090191-0', approvedAt: '2026-09-16T03:00:00Z' }),
    so({ id: 'B', orderNumber: 'SO-26090244-0', approvedAt: '2026-09-25T03:00:00Z' }),
    so({ id: 'C', orderNumber: 'SO-26090227-0', approvedAt: '2026-09-25T03:00:00Z' }),
  ];
  const lines = (ids) => ids.map((id) => manual({ id: `L-${id}`, salesOrderId: id }));
  // ชุดเดิมของเทสต์นี้: เดิมได้ C · B · A (ใหม่สุดก่อน) — ตอนนี้ใบที่อนุมัติ 16/09 (ค้างนานสุด) ขึ้นก่อน แล้วเลขที่ใบ
  assert.deepEqual(run({ orders, lines: lines(['A', 'B', 'C']), todayIso: '2026-10-08' }).rows.map((r) => r.orderId), ['A', 'C', 'B']);
  // ไม่ส่งวันนี้ (ผู้เรียกเก่า) ลำดับเท่ากัน — ตัวเรียงใช้จุดเวลาเริ่ม ไม่ใช่จำนวนวัน
  assert.deepEqual(run({ orders, lines: lines(['A', 'B', 'C']) }).rows.map((r) => r.orderId), ['A', 'C', 'B']);

  // นาฬิกาไม่ใช่วันอนุมัติเสมอไป: ใบเก่าที่เพิ่งเปิดแก้ / เพิ่งถูกตีกลับ ค้างน้อยกว่าใบที่ยื่นตรวจมานาน
  const mixed = [
    so({ id: 'OLD', orderNumber: 'SO-26080010-0', approvedAt: '2026-08-13T03:00:00Z' }),                                              // รอฝ่ายขาย 56 วัน
    so({ id: 'REOPEN', orderNumber: 'SO-26080011-0', approvedAt: '2026-08-13T03:00:00Z', serviceSetupReopenedAt: '2026-10-01T04:00:00Z' }), // เปิดแก้ 7 วัน
    so({ id: 'SENT', orderNumber: 'SO-26080012-0', approvedAt: '2026-08-13T03:00:00Z', serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-29T02:00:00Z' }), // รอผู้จัดการ 9 วัน
    so({ id: 'BACK', orderNumber: 'SO-26080013-0', approvedAt: '2026-08-13T03:00:00Z', serviceSetupState: 'rejected', serviceSetupRejectedAt: '2026-10-05T09:00:00Z' }),   // ตีกลับ 3 วัน
    so({ id: 'NOCLOCK', orderNumber: 'SO-26080001-0', approvedAt: null }),                                                             // ไม่มีนาฬิกา = ท้าย
  ];
  const q = run({ orders: mixed, lines: lines(['OLD', 'REOPEN', 'SENT', 'BACK', 'NOCLOCK']), todayIso: '2026-10-08' });
  assert.deepEqual(q.rows.map((r) => [r.orderId, r.aging.waitingOn, r.aging.days]), [
    ['OLD', 'sales', 56], ['SENT', 'manager', 9], ['REOPEN', 'sales', 7], ['BACK', 'sales', 3], ['NOCLOCK', 'sales', null],
  ]);
  // ถังของใบที่ยังไม่ระบุสายเรียงแบบเดียวกัน
  const unknown = run({
    orders: [
      so({ id: 'U1', orderNumber: 'SO-26090300-0', dealId: 'DL-0', approvedAt: '2026-09-25T03:00:00Z' }),
      so({ id: 'U2', orderNumber: 'SO-26090301-0', dealId: 'DL-0', approvedAt: '2026-09-01T03:00:00Z' }),
    ],
    lines: lines(['U1', 'U2']), todayIso: '2026-10-08',
  });
  assert.deepEqual(unknown.unknownLine.map((r) => r.orderId), ['U2', 'U1']);
});

/* ── "ค้าง n วัน" บนแถว (มติเจ้าของ 08/10 "ตามงานค้าง") — TS เห็นอายุเดียวกับที่ฝ่ายขาย/ผู้จัดการเห็นบนทะเบียนและหน้าใบ ───────── */
test('ตามงานค้าง: แถวพก `aging` จากตัวตัดสินกลาง — ใบเดิม (วันอนุมัติ) · เปิดแก้ · ตีกลับ · รอผู้จัดการ (วันที่ยื่นตรวจ) · วันไทย · ไม่ส่งวันนี้ = ไม่มีป้าย', () => {
  const today = '2026-10-08';
  const rowOf = (over, opts = {}) => run({ orders: [so(over)], lines: [manual()], todayIso: today, ...opts }).rows[0];
  const brief = (row) => [row.aging.waitingOn, row.aging.since, row.aging.days, row.aging.tone, row.aging.strong, row.aging.label];

  // ใบเดิม: อนุมัติ 25/09 → 13 วัน (เตือน · ไม่มีจุดนำ) · ป้ายขั้นไม่เปลี่ยน
  const legacy = rowOf({});
  assert.deepEqual(brief(legacy), ['sales', '2026-09-25T03:00:00Z', 13, 'warning', false, 'ค้าง 13 วัน']);
  assert.equal(legacy.aging.title, 'ยังไม่ยื่นตรวจงานบริการ · นับจาก 25/09/2026');
  assert.deepEqual(legacySetupStatusView(legacy), { tone: 'neutral', label: 'ยังไม่เริ่ม', sub: null }, 'ป้าย/บรรทัดรองของขั้นไม่ถูกแตะ — อายุเป็นชิปแยก');
  // ค้างเกิน 30 วัน = เตือน + จุดนำ
  assert.deepEqual(brief(rowOf({ approvedAt: '2026-08-13T03:00:00Z' })).slice(2), [56, 'warning', true, 'ค้าง 56 วัน']);
  // เปิดแก้หลังอนุมัติ (0396): นับจากวันที่เปิดแก้ ไม่ใช่วันอนุมัติ
  const reopened = rowOf({ approvedAt: '2026-08-13T03:00:00Z', ...reopenedCols, serviceSetupReopenedAt: '2026-10-01T04:00:00Z' });
  assert.deepEqual(brief(reopened), ['sales', '2026-10-01T04:00:00Z', 7, 'warning', false, 'ค้าง 7 วัน']);
  // ตีกลับ: นับจากวันที่ถูกตีกลับ (ต่ำกว่า 7 วัน = โทนกลาง)
  const rejected = rowOf({ serviceSetupState: 'rejected', serviceSetupSubmittedAt: '2026-09-29T02:00:00Z', serviceSetupRejectedAt: '2026-10-05T09:00:00Z', serviceSetupRejectedReason: 'ขาดโซน' });
  assert.deepEqual(brief(rejected), ['sales', '2026-10-05T09:00:00Z', 3, 'neutral', false, 'ค้าง 3 วัน']);
  // รอผู้จัดการตรวจ: นับจากวันที่ยื่นตรวจ · คำบอกพูดถึงผู้จัดการ
  const sent = rowOf({ serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-29T02:00:00Z' });
  assert.deepEqual(brief(sent), ['manager', '2026-09-29T02:00:00Z', 9, 'warning', false, 'ค้าง 9 วัน']);
  assert.equal(sent.aging.title, 'รอผู้จัดการฝ่ายขายตรวจตั้งแต่ 29/09/2026');
  // ข้ามตอนยื่น (0404): ตราการข้ามไม่ใช่นาฬิกา — นับจากวันอนุมัติ
  const deferred = rowOf({ approvedAt: '2026-10-06T03:00:00Z', serviceSetupDeferredAt: '2026-10-01T02:30:00Z', serviceSetupDeferredByName: 'Kamonrat Pipattanapong' });
  assert.deepEqual(brief(deferred).slice(0, 3), ['sales', '2026-10-06T03:00:00Z', 2]);
  // 🔴 วันไทย: อนุมัติ 00:30 น. เวลาไทยของวันนี้ (ยังเป็นเมื่อวานของ UTC) = ไม่มีป้าย · 23:59 น. ของเมื่อวาน = 1 วัน
  assert.deepEqual([rowOf({ approvedAt: '2026-10-07T17:30:00Z' }).aging.days, rowOf({ approvedAt: '2026-10-07T17:30:00Z' }).aging.label], [0, null]);
  assert.equal(rowOf({ approvedAt: '2026-10-07T16:59:59Z' }).aging.label, 'ค้าง 1 วัน');
  // ผู้เรียกไม่ส่งวันนี้ = ก้อนที่ไม่มีป้าย (แถวไม่พัง · ยังรู้ว่างานอยู่ที่ใคร)
  const noToday = run({ orders: [so()], lines: [manual()] }).rows[0];
  assert.deepEqual([noToday.aging.waitingOn, noToday.aging.days, noToday.aging.label], ['sales', null, null]);
  // 🔒 ก้อนอายุไม่พกยอดเงิน/ชื่อคน — มีแต่ใคร (ฝ่าย) · เมื่อไร · กี่วัน · โทน · คำ
  assert.deepEqual(Object.keys(legacy.aging).sort(), ['days', 'label', 'level', 'since', 'sinceDay', 'strong', 'title', 'tone', 'waitingOn']);
});

test('ตามงานค้าง: ป้าย "ค้าง n วัน" อยู่ในคำค้นของแถว (ตาเห็นบนแถว = ต้องค้นเจอ) · คำบอกเมื่อชี้ไม่อยู่ · ไม่มีป้าย = ไม่มีคำ', () => {
  const [sent] = run({
    orders: [so({ serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-29T02:00:00Z' })], lines: [manual()], todayIso: '2026-10-08',
  }).rows;
  const hay = legacySetupHaystack(sent);
  assert.ok(hay.includes('ค้าง 9 วัน'), hay);
  assert.ok(!hay.includes('รอผู้จัดการฝ่ายขายตรวจตั้งแต่'), 'คำบอกของป้าย (title) ตาไม่เห็นบนแถว — ไม่อยู่ในคำค้น');
  // พิมพ์ "ค้าง" = เจอทุกใบที่มีป้าย · ใบที่มาถึงวันนี้/ไม่มีวันนี้ไม่มีคำนี้
  const sameDay = run({ orders: [so({ approvedAt: '2026-10-07T17:30:00Z' })], lines: [manual()], todayIso: '2026-10-08' }).rows[0];
  assert.ok(!legacySetupHaystack(sameDay).includes('ค้าง'));
  assert.ok(!legacySetupHaystack(run({ orders: [so()], lines: [manual()] }).rows[0]).includes('ค้าง'));
  // แถวที่ประกอบเองไม่มีคีย์ aging (จอรุ่นเก่า/เทสต์อื่น) = ไม่พัง
  assert.equal(typeof legacySetupHaystack({ state: 'not_started' }), 'string');
});

test('ป้ายเซลล์สถานะ: ตารางกับการ์ดอ่านจากตัวเดียว', () => {
  assert.deepEqual(legacySetupStatusView({ state: 'not_started' }), { tone: 'neutral', label: 'ยังไม่เริ่ม', sub: null });
  assert.deepEqual(
    legacySetupStatusView({ state: 'editing', progress: { done: 1, total: 2 }, lastEditedAt: '2026-09-27T09:30:00Z' }),
    { tone: 'info', label: 'ฝ่ายขายกำลังตั้ง · 1/2 รายการ', sub: 'แก้ล่าสุด 27/09/2026' },
  );
  assert.deepEqual(
    legacySetupStatusView({ state: 'rejected', rejected: { at: '2026-09-27T05:00:00Z', byName: 'Patcharapit Jueajan', reason: 'ขาดโซน Bakery 17 สาขา' } }),
    { tone: 'danger', label: 'ตีกลับ: ขาดโซน Bakery 17 สาขา', sub: 'Patcharapit Jueajan · 27/09/2026' },
  );
  assert.equal(legacySetupStatusView({ state: 'submitted', submitted: null }).label, 'รอผู้จัดการตรวจ');
  // ⚠️ วันไทย — ยื่นหลังเที่ยงคืนเวลาไทย (ยังเป็นวันก่อนหน้าใน UTC) ต้องขึ้นวันไทย
  assert.match(legacySetupStatusView({ state: 'submitted', submitted: { at: '2026-09-27T18:30:00Z', zones: 1, sites: 1, packsPerRound: 1 } }).sub, /^ยื่นเมื่อ 28\/09\/2026/);
});

test('ตัวนับของตัวกรองสถานะ · คำค้นเห็นทุกอย่างที่ตาเห็นบนแถว', () => {
  const rows = [{ state: 'not_started' }, { state: 'editing' }, { state: 'editing' }, { state: 'submitted' }, { state: 'rejected' }];
  assert.deepEqual(legacySetupFilterCounts(rows), { all: 5, not_started: 1, editing: 2, submitted: 1, rejected: 1 });
  assert.deepEqual(LEGACY_SETUP_FILTERS, ['all', 'not_started', 'editing', 'submitted', 'rejected']);
  assert.deepEqual(legacySetupFilterCounts([]), { all: 0, not_started: 0, editing: 0, submitted: 0, rejected: 0 });

  const [row] = run({
    orders: [so({ serviceSetupState: 'rejected', serviceSetupRejectedAt: '2026-09-27T05:00:00Z', serviceSetupRejectedByName: 'Patcharapit Jueajan', serviceSetupRejectedReason: 'ขาดโซน Bakery' })],
    lines: [manual()],
  }).rows;
  const hay = legacySetupHaystack(row);
  for (const needle of ['so-26090242-0', 'โออิชิ', '25/09/2026', 'lalida', 'ตีกลับ', 'bakery', 'patcharapit', '27/09/2026', 'ยังไม่ผูกสัญญา']) {
    assert.ok(hay.includes(needle), needle);
  }
});

/* ══ ใบที่ฝ่ายขายเปิดแก้งานบริการหลังอนุมัติ (mig 0396 · ภาคผนวก A.4) ════════════════════════════════════════════
   ใบประทับแล้ว → ปุ่ม "แก้งานบริการ" ถอนรอบขายจาก TS + ล้างตรา ⇒ ใบกลับมาอยู่ถังนี้ (ยังไม่ประทับ · ต้องตั้ง)
   TS ต้องเห็นว่าใบนี้เคยส่งงานมาแล้ว ใครเปิดแก้ ทำไม (หายจาก "รอตั้งรอบ" เพราะอะไร) */
const reopenedCols = {
  serviceSetupReopenedAt: '2026-09-30T03:15:00Z', serviceSetupReopenedById: 'U-KP',
  serviceSetupReopenedByName: 'Kamonrat Pipattanapong', serviceSetupReopenedReason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน',
};

test('0396: ใบที่เปิดแก้ขึ้น "ฝ่ายขายกำลังแก้ (หลังอนุมัติ)" + วัน/เหตุผลที่เปิดแก้ · รอตรวจนำหน้า "แก้หลังอนุมัติ · " · ค้นเหตุผลเจอ', () => {
  const alloc = { id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 2 };
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }]]);
  const [editing] = run({
    orders: [so({ ...reopenedCols, servicePeriodFrom: '2026-10-22' })], lines: [fgPackage({ serviceRounds: 12 })], allocations: [alloc], zonesById,
  }).rows;
  assert.deepEqual(editing.reopened, {
    at: '2026-09-30T03:15:00Z', byId: 'U-KP', byName: 'Kamonrat Pipattanapong', reason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน',
  });
  assert.equal(editing.state, 'editing', 'ตัวกรองสถานะเดิม (ขั้นของงานไม่เปลี่ยน)');
  assert.deepEqual(legacySetupStatusView(editing), {
    tone: 'info',
    label: 'ฝ่ายขายกำลังแก้ (หลังอนุมัติ) · 1/1 รายการ',
    sub: 'เปิดแก้ 30/09/2026 · SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน · แก้ล่าสุด 27/09/2026',
  });
  assert.ok(legacySetupHaystack(editing).includes('sa คีย์โซนผิด'), 'ตาเห็นเหตุผลบนแถว = ค้นเจอ');

  const [submitted] = run({
    orders: [so({ ...reopenedCols, serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-30T05:00:00Z', servicePeriodFrom: '2026-10-22' })],
    lines: [fgPackage({ serviceRounds: 12 })], allocations: [alloc], zonesById,
  }).rows;
  assert.equal(legacySetupStatusView(submitted).label, 'รอผู้จัดการตรวจ');
  assert.equal(legacySetupStatusView(submitted).sub, 'แก้หลังอนุมัติ · ยื่นเมื่อ 30/09/2026 · 1 โซนใน 1 ไซต์ · ครั้งละ 2 แพ็ค');
  assert.ok(legacySetupHaystack(submitted).includes('sa คีย์โซนผิด'), 'ขั้นรอตรวจไม่มีเหตุผลบนแถว แต่ TS ค้นเจอ');
});

test('0396: คอลัมน์เปิดแก้ค้างหลังผู้จัดการอนุมัติใหม่ (ประทับแล้ว) = ไม่อยู่ในถัง · ใบเดิมที่ไม่เคยเปิดแก้ = reopened null · select เก่าไม่มีคอลัมน์ = ไม่พัง', () => {
  assert.equal(run({ orders: [so({ ...reopenedCols, serviceTermsOpenedAt: '2026-10-01T03:00:00Z' })], lines: [manual()] }).rows.length, 0);
  const [plain] = run({ orders: [so()], lines: [manual()] }).rows;
  assert.equal(plain.reopened, null);
  assert.equal(legacySetupStatusView(plain).label, 'ยังไม่เริ่ม');
  /* ใบย้อนหลังไม่มีทางเปิดแก้ (CHECK ของ 0396: origin = 'pipeline') — ตัวตัดสินกลางตอบ null อยู่แล้ว */
  assert.equal(run({ orders: [so({ ...reopenedCols, origin: 'historical' })], lines: [manual()] }).rows.length, 0);
});

/* ── ใบแยกรายรายการ (mig 0400) — select ของ route พก `servicePeriodMode` + ช่วงของรายการ ────────────────────────────── */
test('0400: ใบที่สลับเป็น "แยกรายรายการ" = ฝ่ายขายเริ่มตั้งแล้ว แม้ช่วงของใบยังว่าง (ไม่เก็บช่วงรวมครึ่งเดียว) · ความคืบหน้านับช่วงของรายการ', () => {
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }], ['Z2', { id: 'Z2', siteId: 'S2' }]]);
  const alloc = (id, lineId, zoneId) => ({ id, salesOrderId: 'SO1', salesOrderLineId: lineId, zoneId, packsPerRound: 1 });
  /* สลับโหมดอย่างเดียว ยังไม่ได้แตะอะไรอื่น */
  const switched = run({ orders: [so({ servicePeriodMode: 'line' })], lines: [fgPackage()] }).rows[0];
  assert.equal(switched.state, 'editing');
  assert.equal(run({ orders: [so({ servicePeriodMode: 'whole' })], lines: [fgPackage()] }).rows[0].state, 'not_started', 'โหมดทั้งใบ = เหมือนเดิม');
  assert.equal(run({ orders: [so()], lines: [fgPackage()] }).rows[0].state, 'not_started', 'select เก่าไม่มีคอลัมน์ = ทั้งใบ');

  /* สองรายการตั้ง FG/รอบ/โซนครบ — รายการเดียวมีช่วง ⇒ ครบ 1/2 (ใบทั้งใบที่ข้อมูลเดียวกัน = 2/2) */
  const lines = [
    fgPackage({ id: 'LA', serviceRounds: 12, servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-01' }),
    fgPackage({ id: 'LB', serviceRounds: 12, servicePeriodFrom: null, servicePeriodTo: null }),
  ];
  const allocations = [alloc('A1', 'LA', 'Z1'), alloc('A2', 'LB', 'Z2')];
  const line = run({ orders: [so({ servicePeriodMode: 'line' })], lines, allocations, zonesById }).rows[0];
  assert.deepEqual(line.progress, { done: 1, total: 2 });
  assert.equal(legacySetupStatusView(line).label, 'ฝ่ายขายกำลังตั้ง · 1/2 รายการ');
  const whole = run({ orders: [so({ servicePeriodFrom: '2026-10-01' })], lines, allocations, zonesById }).rows[0];
  assert.deepEqual(whole.progress, { done: 2, total: 2 });
  /* ใส่ช่วงครบ = 2/2 · ยื่นแล้ว: สรุปโซน/ไซต์/แพ็คเท่าเดิม */
  const filled = lines.map((l) => ({ ...l, servicePeriodFrom: '2026-09-26', servicePeriodTo: '2027-09-25' }));
  const submitted = run({
    orders: [so({ servicePeriodMode: 'line', servicePeriodFrom: '2026-09-26', servicePeriodTo: '2027-09-25', serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-28T02:00:00Z', serviceSetupSubmittedByName: 'Lalida Chaiwanna' })],
    lines: filled, allocations, zonesById,
  }).rows[0];
  assert.deepEqual(submitted.progress, { done: 2, total: 2 });
  assert.deepEqual(submitted.submitted, { at: '2026-09-28T02:00:00Z', byName: 'Lalida Chaiwanna', zones: 2, sites: 2, packsPerRound: 2 });
});

/* ══ ใบที่ฝ่ายขายยื่นโดยยังไม่ตั้งงานบริการ (mig 0404 · มติเจ้าของ 01/10) ═══════════════════════════════════════════
   ใบใหม่ที่อนุมัติแล้วโดยข้ามการตั้งงานบริการ = อนุมัติแล้ว · ยังไม่ประทับ ⇒ เข้าถังนี้ด้วยเกณฑ์เดิม (ไม่มีคิวรีใหม่)
   ชื่อแท็บยังเป็น "(ใบเดิม)" ⇒ แถวต้องบอกเองว่า "ข้ามตอนยื่น" — select ของ route พก `serviceSetupDeferredAt` / `…ByName` */
const deferredCols = { serviceSetupDeferredAt: '2026-10-02T02:30:00Z', serviceSetupDeferredByName: 'Kamonrat Pipattanapong' };
const DEFERRED = { at: '2026-10-02T02:30:00Z', byId: null, byName: 'Kamonrat Pipattanapong', stage: 'approved' };

test('0404: ใบที่ข้ามตอนยื่นอยู่ในถังเดิม · แถวพก `deferred` · ป้ายทุกขั้นนำหน้า "ข้ามตอนยื่น · " · ขั้นที่ฝ่ายขายยังตั้งบอกวันที่ยื่น', () => {
  const alloc = { id: 'A1', salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 2 };
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }]]);

  /* ยังไม่เริ่ม — ฝ่ายขายยังไม่แตะอะไรหลังอนุมัติ */
  const [fresh] = run({ orders: [so(deferredCols)], lines: [manual()] }).rows;
  assert.deepEqual(fresh.deferred, DEFERRED);
  assert.equal(fresh.reopened, null);
  assert.equal(fresh.state, 'not_started', 'ตัวกรองสถานะเดิม (ขั้นของงานไม่เปลี่ยน)');
  assert.deepEqual(legacySetupStatusView(fresh), {
    tone: 'neutral', label: 'ข้ามตอนยื่น · ยังไม่เริ่ม', sub: 'ฝ่ายขายยื่นโดยยังไม่ตั้งงานบริการ 02/10/2026',
  });
  for (const needle of ['ข้ามตอนยื่น', 'ยังไม่ตั้งงานบริการ', '02/10/2026']) assert.ok(legacySetupHaystack(fresh).includes(needle), needle);

  /* กำลังตั้ง — บรรทัดรอง: วันที่ยื่นแบบข้าม ก่อน "แก้ล่าสุด" */
  const [editing] = run({
    orders: [so({ ...deferredCols, servicePeriodFrom: '2026-10-22' })], lines: [fgPackage({ serviceRounds: 12 })], allocations: [alloc], zonesById,
  }).rows;
  assert.deepEqual(legacySetupStatusView(editing), {
    tone: 'info',
    label: 'ข้ามตอนยื่น · ฝ่ายขายกำลังตั้ง · 1/1 รายการ',
    sub: 'ฝ่ายขายยื่นโดยยังไม่ตั้งงานบริการ 02/10/2026 · แก้ล่าสุด 27/09/2026',
  });

  /* รอผู้จัดการตรวจ / ตีกลับ — ป้ายนำหน้าเหมือนกัน · บรรทัดรองเดิม */
  const [submitted] = run({
    orders: [so({ ...deferredCols, serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-10-04T05:00:00Z', servicePeriodFrom: '2026-10-22' })],
    lines: [fgPackage({ serviceRounds: 12 })], allocations: [alloc], zonesById,
  }).rows;
  assert.deepEqual(legacySetupStatusView(submitted), {
    tone: 'accent', label: 'ข้ามตอนยื่น · รอผู้จัดการตรวจ', sub: 'ยื่นเมื่อ 04/10/2026 · 1 โซนใน 1 ไซต์ · ครั้งละ 2 แพ็ค',
  });
  const [rejected] = run({
    orders: [so({ ...deferredCols, serviceSetupState: 'rejected', serviceSetupRejectedAt: '2026-10-05T05:00:00Z', serviceSetupRejectedByName: 'Patcharapit Jueajan', serviceSetupRejectedReason: 'ขาดโซน Bakery' })],
    lines: [manual()],
  }).rows;
  assert.deepEqual(legacySetupStatusView(rejected), {
    tone: 'danger', label: 'ข้ามตอนยื่น · ตีกลับ: ขาดโซน Bakery', sub: 'Patcharapit Jueajan · 05/10/2026',
  });

  /* ลูกค้ายังไม่มีไซต์ — บรรทัดรองพกทั้งสองเรื่อง (ใบข้าม + TS ต้องเพิ่มไซต์) */
  const [noSite] = run({ orders: [so(deferredCols)], lines: [manual()], customersWithSite: new Set() }).rows;
  assert.deepEqual(legacySetupStatusView(noSite), {
    tone: 'warning', label: 'ข้ามตอนยื่น · ยังไม่เริ่ม', sub: `ฝ่ายขายยื่นโดยยังไม่ตั้งงานบริการ 02/10/2026 · ${LEGACY_SETUP_NO_SITE_SUB}`,
  });
});

test('0404: ผู้จัดการอนุมัติแล้ว (ประทับ) = ออกจากถัง · ใบเดิม = deferred null คำเดิม · select เก่าไม่มีคอลัมน์ = ไม่พัง · เปิดแก้ทีหลัง = ป้ายของการเปิดแก้', () => {
  assert.equal(run({ orders: [so({ ...deferredCols, serviceTermsOpenedAt: '2026-10-06T03:00:00Z' })], lines: [manual()] }).rows.length, 0);
  const [plain] = run({ orders: [so()], lines: [manual()] }).rows;
  assert.equal(plain.deferred, null);
  assert.deepEqual(legacySetupStatusView(plain), { tone: 'neutral', label: 'ยังไม่เริ่ม', sub: null });
  assert.ok(!legacySetupHaystack(plain).includes('ข้ามตอนยื่น'));
  /* แถวที่ประกอบเองไม่มีคีย์ deferred (จอรุ่นเก่า/เทสต์อื่น) = คำเดิม */
  assert.deepEqual(legacySetupStatusView({ state: 'not_started' }), { tone: 'neutral', label: 'ยังไม่เริ่ม', sub: null });
  /* ใบย้อนหลัง/สายสินค้า มีตราไม่ได้ และไม่อยู่ในถังอยู่แล้ว */
  assert.equal(run({ orders: [so({ ...deferredCols, origin: 'historical' })], lines: [manual()] }).rows.length, 0);
  assert.equal(run({ orders: [so({ ...deferredCols, dealId: 'DL-P' })], lines: [manual()] }).rows.length, 0);

  /* ข้าม → ตั้ง → ประทับ → ฝ่ายขายกด 'แก้งานบริการ' (0396) ⇒ เหตุการณ์ที่เกิดทีหลังชนะ: แถวพูดเรื่องการเปิดแก้ ไม่พูด "ข้ามตอนยื่น" */
  const reopenedLater = { ...deferredCols, ...reopenedCols, serviceSetupReopenedAt: '2026-10-09T03:15:00Z' };
  const [reopened] = run({ orders: [so(reopenedLater)], lines: [manual()] }).rows;
  assert.equal(reopened.deferred, null);
  assert.equal(reopened.reopened.byName, 'Kamonrat Pipattanapong');
  assert.equal(legacySetupStatusView(reopened).label, 'ฝ่ายขายกำลังแก้ (หลังอนุมัติ) · 0/1 รายการ');
  /* แถวที่พกทั้งสองก้อน (ไม่ควรเกิด — ตัวตัดสินกลางไม่ส่งคู่กัน) ก็ยังใช้ป้ายของการเปิดแก้ */
  const forged = legacySetupStatusView({ ...reopened, deferred: DEFERRED });
  assert.equal(forged.label, 'ฝ่ายขายกำลังแก้ (หลังอนุมัติ) · 0/1 รายการ');
  assert.ok(!String(forged.sub).includes('ยื่นโดยยังไม่ตั้งงานบริการ'));
  /* เคยเปิดแก้ → ยกเลิก → กู้คืน → ยื่นแบบข้าม → อนุมัติ ⇒ "ข้ามตอนยื่น" */
  const deferredLater = { ...reopenedCols, ...deferredCols, serviceSetupDeferredAt: '2026-10-09T03:15:00Z' };
  const [later] = run({ orders: [so(deferredLater)], lines: [manual()] }).rows;
  assert.deepEqual([later.reopened, later.deferred?.stage], [null, 'approved']);
  assert.equal(legacySetupStatusView(later).label, 'ข้ามตอนยื่น · ยังไม่เริ่ม');
});
