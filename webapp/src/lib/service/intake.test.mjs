// ── คิวงานเข้าใหม่ (เฟส 4) ────────────────────────────────────────────────
//
// เคสอ้างอิงคือรูที่ทำให้ 102 จุดที่จ่ายเงินแล้วไม่มีคิวบริการ: ไม่มีอะไรพา
// ใบสั่งขายมาถึงฝ่าย TS · และรูที่สอง 25 จุดที่ยังวิ่งอยู่ทั้งที่รอบจบไปแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindQueue, bindTargetError, intakeCounts, orderBusinessLine, orderReadiness, orderReceivable, planQueue, visitQueue } from './intake.js';
import { isLiveVisit } from './visitStatus.js';
import { ORIGIN_HISTORICAL, ORIGIN_PIPELINE } from '../sales/historicalOrders.js';

const projects = new Map([
  ['PJ-S', { id: 'PJ-S', line: 'SERVICE' }],
  ['PJ-P', { id: 'PJ-P', line: 'PRODUCT' }],
  ['PJ-0', { id: 'PJ-0', line: null }],
]);
const deals = new Map([
  ['DL-S', { id: 'DL-S', line: 'SERVICE' }],
  ['DL-0', { id: 'DL-0', line: null }],
]);
const ctx = { projectsById: projects, dealsById: deals };

const so = (over = {}) => ({ id: 'SO1', orderNumber: 'SO-2608001', status: 'approved', supersededById: null, approvedAt: '2026-08-20T03:00:00Z', ...over });

test('สายธุรกิจถามโครงการก่อน แล้วค่อยดีล', () => {
  assert.equal(orderBusinessLine(so({ projectId: 'PJ-S' }), ctx), 'SERVICE');
  assert.equal(orderBusinessLine(so({ projectId: 'PJ-P', dealId: 'DL-S' }), ctx), 'PRODUCT');
  assert.equal(orderBusinessLine(so({ dealId: 'DL-S' }), ctx), 'SERVICE');
});

test('⭐ ตอบไม่ได้ = null ห้ามเดาเป็นสายใดสายหนึ่ง', () => {
  assert.equal(orderBusinessLine(so({ projectId: 'PJ-0', dealId: 'DL-0' }), ctx), null);
  assert.equal(orderBusinessLine(so({}), ctx), null);
});

test('รับได้เฉพาะใบที่อนุมัติและยังไม่ถูก Rev. ทับ', () => {
  assert.equal(orderReceivable(so()), true);
  assert.equal(orderReceivable(so({ status: 'submitted' })), false);
  assert.equal(orderReceivable(so({ supersededById: 'SO2' })), false);
});

const lines = [
  { id: 'L1', salesOrderId: 'SO1', qty: 2, unit: 'แพ็ค', fgCode: 'FG-1' },
  { id: 'L2', salesOrderId: 'SO1', qty: 1, unit: 'แพ็ค', fgCode: 'FG-2' },
  { id: 'L3', salesOrderId: 'SO2', qty: 1, unit: 'แพ็ค' },
];

test('⭐ ใบสายบริการที่ยังมีบรรทัดไม่ผูกโซน ขึ้นคิว — บรรทัดที่ผูกแล้วหายจากคิว', () => {
  const q = bindQueue({
    orders: [so({ projectId: 'PJ-S' })],
    lines,
    terms: [{ salesOrderLineId: 'L1' }],
    ...ctx,
  });
  assert.equal(q.rows.length, 1);
  assert.equal(q.rows[0].pendingLines, 1);
  assert.equal(q.rows[0].lines[0].id, 'L2');
});

test('ใบที่ผูกครบทุกบรรทัดแล้ว ต้องหลุดจากคิวทั้งใบ', () => {
  const q = bindQueue({
    orders: [so({ projectId: 'PJ-S' })],
    lines,
    terms: [{ salesOrderLineId: 'L1' }, { salesOrderLineId: 'L2' }],
    ...ctx,
  });
  assert.equal(q.rows.length, 0);
});

test('⭐ สายสินค้าไม่เข้าคิวเลย · สายที่ตอบไม่ได้ไปถังของมันเอง ไม่ใช่หายเงียบ', () => {
  const q = bindQueue({
    orders: [
      so({ id: 'SO1', projectId: 'PJ-P' }),
      so({ id: 'SO2', projectId: 'PJ-0', dealId: 'DL-0' }),
    ],
    lines: [{ id: 'L1', salesOrderId: 'SO1' }, { id: 'L3', salesOrderId: 'SO2' }],
    terms: [],
    ...ctx,
  });
  assert.equal(q.rows.length, 0);
  assert.equal(q.unknownLine.length, 1);
  assert.equal(q.unknownLine[0].orderId, 'SO2');
});

test('ใบที่ยังไม่อนุมัติผูกโซนไม่ได้ — snapshot จากยอดที่ยังขยับได้คือของปลอม', () => {
  const q = bindQueue({
    orders: [so({ status: 'submitted', projectId: 'PJ-S' })],
    lines, terms: [], ...ctx,
  });
  assert.equal(q.rows.length, 0);
});

const orders = new Map([['SO1', so()]]);
const zones = [
  { id: 'Z1', siteId: 'S1', name: 'Lobby' },
  { id: 'Z2', siteId: 'S2', name: 'Reception' },
];
const sites = [{ id: 'S1', name: 'ไซต์ A' }, { id: 'S2', name: 'ไซต์ B' }];

test('⭐ โซนที่ขายแล้วแต่ไซต์ยังไม่มีรอบ = 102 จุดที่หายไป', () => {
  const q = planQueue({
    zones, sites,
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }, { id: 'T2', zoneId: 'Z2', salesOrderId: 'SO1' }],
    plans: [{ id: 'PL1', siteId: 'S2', salesOrderId: 'SO1', isActive: true }],
    ordersById: orders,
    todayIso: '2026-08-28',
  });
  assert.equal(q.length, 1);
  assert.equal(q[0].siteId, 'S1');
  assert.equal(q[0].zones[0].name, 'Lobby');
});

test('รอบที่ปิดใช้งานไม่นับว่ามีรอบ — ไซต์ต้องกลับเข้าคิว', () => {
  const q = planQueue({
    zones, sites,
    terms: [{ id: 'T2', zoneId: 'Z2', salesOrderId: 'SO1' }],
    plans: [{ id: 'PL1', siteId: 'S2', salesOrderId: 'SO1', isActive: false }],
    ordersById: orders, todayIso: '2026-08-28',
  });
  assert.deepEqual(q.map((r) => r.siteId), ['S2']);
});

test('รอบขายที่หมดอายุแล้วไม่ทวงให้ตั้งรอบ — ของหมดสัญญาต้องไม่ชวนให้ส่งเจ้าหน้าที่ไป', () => {
  const q = planQueue({
    zones, sites,
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', endDate: '2025-12-31' }],
    plans: [], ordersById: orders, todayIso: '2026-08-28',
  });
  assert.equal(q.length, 0);
});

test('⭐ ครบรอบยังไม่มีนัด — นับเฉพาะนัดที่ยังมีชีวิตและอยู่ข้างหน้า', () => {
  const plans = [{ id: 'PL1', siteId: 'S1', kind: 'refill', everyDays: 30, isActive: true }];
  const args = { plans, sites, isLive: isLiveVisit, todayIso: '2026-08-28' };
  assert.equal(visitQueue({ ...args, visits: [] }).length, 1, 'ไม่มีนัดเลย = เข้าคิว');
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', planId: 'PL1', status: 'scheduled', scheduledDate: '2026-09-05' }] }).length, 0);
  // นัดที่ผ่านไปแล้วไม่ช่วยอะไร รอบข้างหน้ายังว่างอยู่
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', planId: 'PL1', status: 'done', scheduledDate: '2026-08-01' }] }).length, 1);
  // ร่างยังไม่ผ่านด่าน = ยังไม่ใช่นัด
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', planId: 'PL1', status: 'draft', scheduledDate: '2026-09-05' }] }).length, 1);
  // ยกเลิก/เลื่อนก็ไม่ใช่นัดที่จะมีใครไป
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', planId: 'PL1', status: 'cancelled', scheduledDate: '2026-09-05' }] }).length, 1);
});

test('⭐ ห้ามเขียนนิยาม "นัดที่ยังมีชีวิต" ขึ้นใหม่ในคิวนี้', () => {
  assert.throws(() => visitQueue({ plans: [], visits: [], sites: [] }), /ตัวตัดสินกลาง/);
});

test('รอบที่จบไปแล้วไม่ทวงหานัด', () => {
  const q = visitQueue({
    plans: [{ id: 'PL1', siteId: 'S1', isActive: true, endDate: '2026-06-30' }],
    visits: [], sites, isLive: isLiveVisit, todayIso: '2026-08-28',
  });
  assert.equal(q.length, 0);
});

test('ตัวนับบนแท็บนับถังที่ตอบไม่ได้แยกจากคิวจริง', () => {
  const counts = intakeCounts({
    bind: { rows: [1, 2], unknownLine: [3] },
    plan: [1],
    visit: [],
  });
  assert.deepEqual(counts, { bind: 2, plan: 1, visit: 0, unknownLine: 1 });
});

/* ── ชิปความพร้อมของใบ (PR-C · 2026-08-31) ──────────────────────────────────
   TS ต้องรู้ตั้งแต่ตอนรับงานว่าใบนี้พอจัดสรรแล้วจะเดินต่อได้ไหม
   ⚠️ **ไม่ใช่ด่าน** — ด่านจริงคือ `visitGate` ตอนนัดจะขึ้นตาราง */
test('ความพร้อมของใบ: สัญญาที่มีผล + จ่ายถึง', () => {
  const order = { id: 'SO1', serviceContractId: 'CT1' };
  const ctx = {
    contractsById: new Map([['CT1', { id: 'CT1', contractNo: 'CT-SR-26080001-0', status: 'signed' }]]),
    installmentsByOrderId: new Map([['SO1', [
      { status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-09-30', dueDate: '2026-08-01' },
    ]]]),
    todayIso: '2026-09-10',
  };
  const r = orderReadiness(order, ctx);
  assert.equal(r.hasContract, true);
  assert.equal(r.contractNo, 'CT-SR-26080001-0');
  assert.equal(r.paidThrough, '2026-09-30');
  assert.equal(r.coveredToday, true);
});

/* ⚠️ สัญญาที่ยังไม่ผ่านการรับรอง **ไม่นับว่ามี** — ป้ายที่บอกว่ามีสัญญาทั้งที่ยังใช้ไม่ได้
   จะทำให้ TS วางแผนบนของที่ยังไม่ผูกพัน */
test('สัญญาที่ยังไม่ signed ไม่นับว่ามี · ไม่มีงวดรับรอง = ยังไม่จ่ายถึงไหน', () => {
  const ctx = {
    contractsById: new Map([['CT1', { id: 'CT1', contractNo: 'X', status: 'awaiting_approval' }]]),
    installmentsByOrderId: new Map([['SO1', [{ status: 'reported', coversTo: '2026-12-31' }]]]),
    todayIso: '2026-09-10',
  };
  const r = orderReadiness({ id: 'SO1', serviceContractId: 'CT1' }, ctx);
  assert.equal(r.hasContract, false);
  assert.equal(r.contractNo, null);
  assert.equal(r.paidThrough, null, '"แจ้งแล้ว" ไม่นับ — ต้องบัญชีรับรอง');
  assert.equal(r.coveredToday, false);
});

test('ใบที่ไม่ผูกสัญญาเลย = ยังไม่พร้อม แต่ไม่ระเบิด', () => {
  const r = orderReadiness({ id: 'SO1' }, {});
  assert.equal(r.hasContract, false);
  assert.equal(r.paidThrough, null);
});

/* ── หน่วยของคิว "รอตั้งรอบ" คือ (ไซต์, ใบ) ไม่ใช่ไซต์ ─────────────────────
   🔴 ของเดิมเป็น Set ของ siteId ⇒ ไซต์ที่มีรอบของใบ A หลุดจากคิวตลอดกาล
   แม้ใบ B ขายรอบใหม่ที่ไซต์เดิม · คิวคือช่องทางเดียวที่บอก TS ว่ามีงานใหม่ */
const so2 = () => ({ id: 'SO2', orderNumber: 'SO-26090002-0', status: 'approved', supersededById: null });
const orders2 = new Map([['SO1', so()], ['SO2', so2()]]);

test('🔴 ไซต์เดียวสองใบ: รอบของใบ A ต้องไม่ปิดคิวให้ใบ B', () => {
  const q = planQueue({
    zones, sites, ordersById: orders2, todayIso: '2026-08-28',
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }, { id: 'T2', zoneId: 'Z1', salesOrderId: 'SO2' }],
    plans: [{ id: 'PL1', siteId: 'S1', salesOrderId: 'SO1', isActive: true }],
  });
  assert.deepEqual(q.map((r) => r.salesOrderId), ['SO2'], 'ใบ B ต้องยังอยู่ในคิว');
  assert.equal(q[0].siteId, 'S1');
  assert.equal(q[0].orderNumber, 'SO-26090002-0', 'แถวต้องบอกได้ว่าเป็นของใบไหน');
});

test('🔴 คีย์ของแถวต้องไม่ซ้ำเมื่อไซต์เดียวมีสองใบ (จอใช้เป็น React key)', () => {
  const q = planQueue({
    zones, sites, ordersById: orders2, todayIso: '2026-08-28',
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }, { id: 'T2', zoneId: 'Z1', salesOrderId: 'SO2' }],
    plans: [],
  });
  assert.equal(q.length, 2);
  assert.equal(new Set(q.map((r) => r.key)).size, 2, 'สองแถวต้องได้คนละคีย์');
  // เรียงต้องคงที่ ไม่สลับที่กันทุกครั้งที่โหลด
  assert.deepEqual(q.map((r) => r.salesOrderId), ['SO1', 'SO2']);
});

/* ⚠️ รอบที่ไม่ผูกใบเดินอยู่จริงที่ไซต์ — เงียบไว้ TS จะกดสร้างรอบซ้อนของเดิม
   (กติกาเดียวกับ hasForeignPlan ของ #1594: เตือน ไม่ใช่ซ่อนงาน) */
test('รอบที่ไม่ผูกใบไม่ปิดคิวให้ใคร แต่ต้องเตือนว่ามีอยู่', () => {
  const q = planQueue({
    zones, sites, ordersById: orders2, todayIso: '2026-08-28',
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }],
    plans: [{ id: 'PL0', siteId: 'S1', salesOrderId: null, isActive: true }],
  });
  assert.equal(q.length, 1, 'รอบกำพร้าไม่ครอบใบไหน ⇒ ใบยังต้องอยู่ในคิว');
  assert.equal(q[0].unboundPlans, 1, 'แต่ต้องบอกว่าไซต์นี้มีรอบที่ยังไม่ผูกใบอยู่');
});

/* ⭐ เคสที่พบบ่อยที่สุดของ "หลายใบต่อไซต์" คือออก Rev. — ไม่มีโค้ดไหนย้าย
   service_plans.salesOrderId ไปใบใหม่เลยทั้งระบบ ⇒ รอบชี้ใบที่ตายแล้วตลอดไป */
test('⭐ ออก Rev. แล้วใบใหม่ต้องเข้าคิว ทั้งที่ไซต์มีรอบของใบเก่าอยู่', () => {
  const revised = new Map([
    ['SO1', { ...so(), supersededById: 'SO2' }],
    ['SO2', so2()],
  ]);
  const q = planQueue({
    zones, sites, ordersById: revised, todayIso: '2026-08-28',
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }, { id: 'T2', zoneId: 'Z1', salesOrderId: 'SO2' }],
    plans: [{ id: 'PL1', siteId: 'S1', salesOrderId: 'SO1', isActive: true }],
  });
  assert.deepEqual(q.map((r) => r.salesOrderId), ['SO2'],
    'term ของใบเก่าตายเอง ส่วนใบใหม่ยังไม่มีรอบของตัวเอง ⇒ ต้องขึ้นคิว');
});

/* ── "มีนัดข้างหน้าแล้ว" ต้องถามรายรอบ ไม่ใช่รายไซต์ ────────────────────── */
test('🔴 นัดของรอบ A ต้องไม่ปิดคิวให้รอบ B ที่ไซต์เดียวกัน', () => {
  const q = visitQueue({
    sites, isLive: isLiveVisit, todayIso: '2026-08-28',
    plans: [
      { id: 'PL1', siteId: 'S1', salesOrderId: 'SO1', kind: 'refill', everyDays: 30, isActive: true },
      { id: 'PL2', siteId: 'S1', salesOrderId: 'SO2', kind: 'refill', everyDays: 30, isActive: true },
    ],
    visits: [{ siteId: 'S1', planId: 'PL1', status: 'scheduled', scheduledDate: '2026-09-05' }],
  });
  assert.deepEqual(q.map((r) => r.planId), ['PL2']);
  assert.equal(q[0].salesOrderId, 'SO2', 'แถวต้องบอกใบได้ ไม่งั้นสองแถวหน้าตาเหมือนกัน');
});

test('งานซ่อมนอกรอบ (planId ว่าง) ไม่ครอบรอบไหนเลย', () => {
  const q = visitQueue({
    sites, isLive: isLiveVisit, todayIso: '2026-08-28',
    plans: [{ id: 'PL1', siteId: 'S1', kind: 'repair', everyDays: 30, isActive: true }],
    visits: [{ siteId: 'S1', planId: null, status: 'scheduled', scheduledDate: '2026-09-05' }],
  });
  assert.equal(q.length, 1, 'นัดที่ไม่ได้เกิดจากรอบ ไม่นับเป็นรอบตามข้อผูกพัน');
});

/* ── ใบสั่งขายย้อนหลังในคิว (mig 0360 · มติข้อ 17: TS ผูกโซนให้ใบย้อนหลังในคิวนี้) ─────────────────
   ใบย้อนหลังไม่มีโครงการ (มติข้อ 7) และดีลภาชนะเป็นสายบริการเสมอ (CHECK) · approvedAt = เวลาที่คีย์ */
const hso = (over = {}) => so({
  id: 'SOH', orderNumber: 'SO-26090191-0', origin: ORIGIN_HISTORICAL, projectId: null, dealId: 'DL-S', customerId: 'C1',
  historicalQuoteRef: 'Q#250313-0004-D', historicalInvoiceRef: 'IV6801041', ...over,
});
const hLines = [
  { id: 'HL1', salesOrderId: 'SOH', qty: 2, unit: 'แพ็คเกจ', fgCode: 'FG-1', installationPoint: 'Empire Tower · ล็อบบี้' },
  { id: 'HL2', salesOrderId: 'SOH', qty: 1, unit: 'แพ็คเกจ', fgCode: 'FG-1', installationPoint: 'สาขาสีลม' },
];

test('⭐ ใบย้อนหลัง (ไม่มีโครงการ · ดีลสายบริการ) ขึ้นคิวพร้อม origin · เลขเดิม · จุดติดตั้ง', () => {
  const q = bindQueue({ orders: [hso()], lines: hLines, terms: [], ...ctx });
  assert.equal(q.rows.length, 1);
  const [row] = q.rows;
  assert.equal(row.origin, ORIGIN_HISTORICAL);
  assert.deepEqual(row.historicalRefs, ['Q#250313-0004-D', 'IV6801041']);
  assert.deepEqual(row.installationPoints, ['Empire Tower · ล็อบบี้', 'สาขาสีลม']);
  assert.equal(row.fgKinds, 2, 'FG เดียวกันคนละจุด = คนละกลุ่ม');
});

test('ใบย้อนหลังที่ดีลตอบสายไม่ได้ ไปถังของมันเอง ไม่หายเงียบ', () => {
  const q = bindQueue({ orders: [hso({ dealId: 'DL-0' })], lines: hLines, terms: [], ...ctx });
  assert.equal(q.rows.length, 0);
  assert.equal(q.unknownLine.length, 1);
  assert.equal(q.unknownLine[0].origin, ORIGIN_HISTORICAL);
});

test('ใบที่ไม่ส่ง origin มา (ตัวนับบนเมนูเลือกคอลัมน์ผอม) = pipeline ไม่มีเลขเดิม/จุดติดตั้ง', () => {
  const q = bindQueue({ orders: [so({ projectId: 'PJ-S' })], lines, terms: [], ...ctx });
  assert.equal(q.rows[0].origin, ORIGIN_PIPELINE);
  assert.deepEqual(q.rows[0].historicalRefs, []);
  assert.deepEqual(q.rows[0].installationPoints, []);
});

test('⭐ ใบปกติขึ้นก่อนใบย้อนหลังเสมอ แม้ใบย้อนหลังอนุมัติ (คีย์) ทีหลัง · ในกองเดียวกันยังเรียงใหม่สุดก่อน', () => {
  const q = bindQueue({
    orders: [
      hso({ id: 'SOH2', approvedAt: '2026-09-14T08:00:00Z' }),
      so({ id: 'SO1', projectId: 'PJ-S', approvedAt: '2026-08-20T03:00:00Z' }),
      hso({ approvedAt: '2026-09-15T08:00:00Z' }),
    ],
    lines: [...lines, ...hLines, { id: 'HL3', salesOrderId: 'SOH2', qty: 1, fgCode: 'FG-9' }],
    terms: [],
    ...ctx,
  });
  assert.deepEqual(q.rows.map((r) => r.orderId), ['SO1', 'SOH', 'SOH2']);
});

/* ── ใบยอด 0 ไม่มีงวดให้เก็บ (มติ 22/09 · mig 0374) ──────────────────────────────────────
   ⭐ ชิปต้องพูดเรื่องเดียวกับ visitGate ข้อ② — ใบยอด 0 ผ่านด่านเงินเอง ⇒ ป้าย "ยังไม่มีงวดที่รับรอง"
      จะส่ง TS ไปทวงเงินที่ไม่มีให้เก็บ · ตัวตัดสินเดียวกับงวดชำระ (`paymentNotRequired`)
   🔄 แทนชิป "ยกเว้นด่านเงิน" ของใบย้อนหลัง (มติข้อ 13 · 0360) ที่ถอดแล้ว */
test('ชิปความพร้อม: ใบยอด 0 = ไม่มีงวดให้เก็บ — ทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง · ไม่รู้ยอด ≠ ยอด 0', () => {
  assert.equal(orderReadiness(so({ totalAmount: 0 }), {}).paymentNotRequired, true);
  assert.equal(orderReadiness(hso({ totalAmount: 0 }), {}).paymentNotRequired, true);
  assert.equal(orderReadiness(hso({ totalAmount: 261936 }), {}).paymentNotRequired, false);
  assert.equal(orderReadiness(so(), {}).paymentNotRequired, false, 'ไม่ได้ select ยอดมา = ไม่รู้ ≠ ยอด 0');
  // ร่องรอยยกเว้นของ 0360 ไม่มีใครอ่านแล้ว — ชิปไม่มีธงนั้นอีก
  const at = '2026-09-15T03:00:00.000Z';
  const r = orderReadiness(hso({ paymentGateExemptAt: at, totalAmount: 144000 }), {});
  assert.equal(r.paymentNotRequired, false);
  assert.equal('paymentGateExempt' in r, false);
});

/* ── ถังตั้งรอบพก "เงินครอบถึง" (มติ 22/09 · ม็อก TsIntake) ──────────────────────────────
   ⭐ ใบย้อนหลังข้ามถังผูกโซน (รอบขายเกิดตอน AE Sup อนุมัติ) ⇒ ถังนี้คือจุดแรกที่ TS เห็นใบ
      และ "เงินครอบถึงวันไหน" คือสิ่งที่บอกว่านัดถึงวันไหนขึ้นตารางได้เลย */
test('⭐ แถวรอตั้งรอบพก paidThrough ของใบ — นับเฉพาะงวดที่บัญชีรับรอง · ใบย้อนหลังพก origin', () => {
  const opening = { status: 'confirmed', kind: 'opening', coversFrom: '2026-01-01', coversTo: '2026-09-30', dueDate: null };
  const nextRow = { status: 'pending', coversFrom: '2026-10-01', coversTo: '2026-12-31', dueDate: '2026-10-01' };
  const q = planQueue({
    zones, sites,
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SOH' }],
    plans: [],
    ordersById: new Map([['SOH', hso({ totalAmount: 261936 })]]),
    installmentsByOrderId: new Map([['SOH', [opening, nextRow]]]),
    todayIso: '2026-09-23',
  });
  assert.equal(q.length, 1);
  assert.equal(q[0].origin, ORIGIN_HISTORICAL);
  assert.equal(q[0].paidThrough, '2026-09-30');
  assert.equal(q[0].coveredToday, true);
  assert.equal(q[0].paymentNotRequired, false);
  // งวดยกมายังรอบัญชี (reported) = ยังไม่ครอบ — "แจ้งแล้ว" ไม่นับ
  const waiting = planQueue({
    zones, sites, terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SOH' }], plans: [],
    ordersById: new Map([['SOH', hso({ totalAmount: 261936 })]]),
    installmentsByOrderId: { SOH: [{ ...opening, status: 'reported' }] },
    todayIso: '2026-09-23',
  });
  assert.equal(waiting[0].paidThrough, null);
  assert.equal(waiting[0].coveredToday, false);
});

test('แถวรอตั้งรอบที่ไม่ได้ส่งงวดมา (ตัวนับบนเมนู) = ยังไม่ครอบ ไม่ระเบิด · ใบยอด 0 = ไม่มีงวดให้เก็บ', () => {
  const q = planQueue({
    zones, sites,
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }, { id: 'T2', zoneId: 'Z2', salesOrderId: 'SO2' }],
    plans: [],
    ordersById: new Map([['SO1', so()], ['SO2', { ...so2(), totalAmount: 0 }]]),
    todayIso: '2026-08-28',
  });
  const bySo = Object.fromEntries(q.map((r) => [r.salesOrderId, r]));
  assert.equal(bySo.SO1.paidThrough, null);
  assert.equal(bySo.SO1.paymentNotRequired, false);
  assert.equal(bySo.SO1.origin, ORIGIN_PIPELINE, 'ไม่ส่ง origin มา = pipeline');
  assert.equal(bySo.SO2.paymentNotRequired, true);
});

test('🔴 ด่านปลายทางของการผูก: ไซต์ลูกค้าคนอื่น · ไม่ใช่ไซต์ลูกค้า · ไซต์/โซนปิดใช้งาน = ตีกลับพร้อมชื่อของ', () => {
  const order = { id: 'SOH', customerId: 'C1' };
  const zone = { id: 'Z1', name: 'ล็อบบี้', siteId: 'S1', isActive: true };
  const site = { id: 'S1', name: 'Empire Tower', customerId: 'C1', kind: 'customer', isActive: true };
  const lineLabel = 'FG-1';
  assert.equal(bindTargetError({ order, zone, site, lineLabel }), null);
  assert.match(bindTargetError({ order, zone, site: { ...site, customerId: 'C2' }, lineLabel }), /^FG-1: .*ลูกค้ารายอื่น/);
  assert.match(bindTargetError({ order, zone, site: { ...site, kind: 'warehouse' }, lineLabel }), /ไม่ใช่ไซต์ลูกค้า/);
  assert.match(bindTargetError({ order, zone, site: { ...site, isActive: false }, lineLabel }), /ไซต์ Empire Tower ถูกปิดใช้งาน/);
  assert.match(bindTargetError({ order, zone: { ...zone, isActive: false }, site, lineLabel }), /โซน ล็อบบี้ ถูกปิดใช้งาน/);
  assert.match(bindTargetError({ order, zone, site: null, lineLabel }), /ไม่พบไซต์ของโซน ล็อบบี้/);
  assert.match(bindTargetError({ order, zone: null, site, lineLabel }), /ไม่พบโซน/);
  assert.match(bindTargetError({ order: { id: 'X' }, zone, site }), /ลูกค้ารายอื่น/, 'ใบไม่มีลูกค้า = ไม่เดาว่าตรง');
});
