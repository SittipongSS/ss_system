// ── คิวงานเข้าใหม่ (เฟส 4) ────────────────────────────────────────────────
//
// เคสอ้างอิงคือรูที่ทำให้ 102 จุดที่จ่ายเงินแล้วไม่มีคิวบริการ: ไม่มีอะไรพา
// ใบสั่งขายมาถึงฝ่าย TS · และรูที่สอง 25 จุดที่ยังวิ่งอยู่ทั้งที่รอบจบไปแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindQueue, intakeCounts, orderBusinessLine, orderReadiness, orderReceivable, planQueue, visitQueue } from './intake.js';
import { isLiveVisit } from './visitStatus.js';

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
    plans: [{ id: 'PL1', siteId: 'S2', isActive: true }],
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
    plans: [{ id: 'PL1', siteId: 'S2', isActive: false }],
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
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', status: 'scheduled', scheduledDate: '2026-09-05' }] }).length, 0);
  // นัดที่ผ่านไปแล้วไม่ช่วยอะไร รอบข้างหน้ายังว่างอยู่
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', status: 'done', scheduledDate: '2026-08-01' }] }).length, 1);
  // ร่างยังไม่ผ่านด่าน = ยังไม่ใช่นัด
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', status: 'draft', scheduledDate: '2026-09-05' }] }).length, 1);
  // ยกเลิก/เลื่อนก็ไม่ใช่นัดที่จะมีใครไป
  assert.equal(visitQueue({ ...args, visits: [{ siteId: 'S1', status: 'cancelled', scheduledDate: '2026-09-05' }] }).length, 1);
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
