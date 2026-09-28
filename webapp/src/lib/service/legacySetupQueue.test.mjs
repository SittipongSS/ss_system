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

test('⭐ สรุปของใบที่ยื่นแล้ว: 6 โซนใน 5 ไซต์ · 7 แพ็ค/รอบ (นับเฉพาะบรรทัดแพ็คเกจ)', () => {
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
  assert.equal(legacySetupStatusView(row).sub, 'ยื่นเมื่อ 28/09/2026 · 6 โซนใน 5 ไซต์ · 7 แพ็ค/รอบ');
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

test('เรียงใหม่สุดก่อน (วันอนุมัติ) · เท่ากันเรียงตามเลขที่ใบ', () => {
  const q = run({
    orders: [
      so({ id: 'A', orderNumber: 'SO-26090191-0', approvedAt: '2026-09-16T03:00:00Z' }),
      so({ id: 'B', orderNumber: 'SO-26090244-0', approvedAt: '2026-09-25T03:00:00Z' }),
      so({ id: 'C', orderNumber: 'SO-26090227-0', approvedAt: '2026-09-25T03:00:00Z' }),
    ],
    lines: ['A', 'B', 'C'].map((id) => manual({ id: `L-${id}`, salesOrderId: id })),
  });
  assert.deepEqual(q.rows.map((r) => r.orderId), ['C', 'B', 'A']);
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
