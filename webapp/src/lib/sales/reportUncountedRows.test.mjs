// ── รายงานยอดขาย × ใบที่ "โชว์แต่ไม่นับ" (มติเจ้าของ 20/11/2026 · mig 0439 + ใบค่าสรรพสามิต mig 0414) ─────────────
//
// ล็อกไว้:
//   1. ใบ "ไม่นับ Actual" (actualMode 'none') ที่อนุมัติในงวด — ขึ้นในรายการใบ (uncountedOrders) ยอดที่นับ 0 + ป้าย + เหตุผล ·
//      ยอดเก็บ/ค้างชำระตามจริง · "ไม่คิดเงิน" ตัดสินจากยอดของใบ ไม่ใช่จาก 0
//   2. ใบค่าสรรพสามิตที่อนุมัติในงวด — ขึ้นแบบเดียวกัน · ทีม/สาย/ประเภทดีล = ดีลของ SO ต้นทาง · เจ้าของ = ownerId ของใบเอง ·
//      หาต้นทางไม่เจอ = ทีมว่าง · ลิสต์ต้นทางยิงผ่าน .in('id', chunk)
//   3. ตัวเลขทุกตัว (บริษัท/ทีม/คน · orders[] · รออนุมัติ · byDay · summary) เท่ากับตอนไม่มีใบสองชนิดนี้ทุกไบต์ ·
//      ไม่มีแถวคน/ทีมศูนย์ล้วนของเจ้าของที่มีแต่ใบไม่นับ
//   4. Excel — ชีตใบสั่งขายมีแถวพวกนี้ ยอดที่นับ 0 + หมายเหตุ · แถวรวมยอดที่นับเท่าเดิม · ใบปกติหมายเหตุเท่าเดิม
// ⛔ ไม่ต่อฐานจริง — ตัวจำลอง supabase ข้างล่าง (AGENTS.md "เทสต์ห้ามต่อฐานข้อมูลจริง")
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { loadSalesReportData } from './salesReportData.js';
import { parseReportPeriod } from './reportPeriod.js';
import {
  REPORT_ACTUAL_NONE_LABEL, REPORT_EXCISE_LABEL, buildReportRows, isUncountedReportRow, reportActualRows,
  reportOrderTeam, uncountedReportCount, uncountedReportLabel,
} from './reportRows.js';
import { summarizeSalesReport } from './reportSummary.js';
import { buildSalesReportBuffer, orderSheetRow } from './salesReportWorkbook.js';

/* ── ตัวจำลอง supabase: ตัวกรองเท่าที่ตัวโหลดใช้ (eq · lt · gte · lte · in · not is null · or) ── */
const parseValue = (raw) => String(raw).replace(/^"(.*)"$/, '$1');
const cmp = (a, b) => {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  return String(a ?? '').localeCompare(String(b ?? ''));
};
const OPS = {
  eq: (v, x) => String(v) === String(x),
  lt: (v, x) => v != null && cmp(v, x) < 0,
  gte: (v, x) => v != null && cmp(v, x) >= 0,
  lte: (v, x) => v != null && cmp(v, x) <= 0,
};
function fakeSupabase(tables) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    const call = { table, select: '', eq: [], in: [] };
    calls.push(call);
    const builder = {
      select(cols) { call.select = cols; return builder; },
      eq(col, v) { call.eq.push([col, v]); filters.push((r) => OPS.eq(r[col], v)); return builder; },
      lt(col, v) { filters.push((r) => OPS.lt(r[col], v)); return builder; },
      gte(col, v) { filters.push((r) => OPS.gte(r[col], v)); return builder; },
      lte(col, v) { filters.push((r) => OPS.lte(r[col], v)); return builder; },
      in(col, list) { call.in.push([col, list]); filters.push((r) => list.includes(r[col])); return builder; },
      not(col, op, v) { if (op === 'is' && v === null) filters.push((r) => r[col] != null); return builder; },
      or(expr) {
        const parts = expr.split(/,(?=[a-zA-Z"]+\.)/).map((part) => {
          const [col, op, ...rest] = part.split('.');
          return { col: parseValue(col), op, value: parseValue(rest.join('.')) };
        });
        filters.push((r) => parts.some(({ col, op, value }) => OPS[op](r[col], value)));
        return builder;
      },
      order() { return builder; },
      range(start, end) {
        const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
      },
    };
    return builder;
  };
  return { calls, from, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } };
}

const NOW = new Date('2026-10-20T05:00:00Z'); // 20 ต.ค. 2026 เวลาไทย
const periodOf = (input) => parseReportPeriod(input, { today: '2026-10-20' });

const so = (over = {}) => ({
  id: 'SO-A', orderNumber: 'SO-26100001-0', quotationId: 'QT1', dealId: 'D1', projectId: null,
  customerName: 'ลูกค้า A', customerId: 'C1', orderDate: '2026-10-05', approvedAt: '2026-10-05T03:00:00Z',
  ownerId: 'u1', ownerName: 'หนึ่ง', subtotal: 100000, discountAmount: 0, vatAmount: 7000, totalAmount: 107000,
  actualAmount: 100000, financeStatus: 'pending', status: 'approved', origin: 'pipeline', actualMode: 'order',
  actualCountedAmount: 0, actualSubmittedAmount: 0, actualNoneReason: null, metadata: { quoteNumber: 'QT-26100001' },
  deal: { team: 'KA', id: 'D1', line: 'PRODUCT', dealType: 'NPD', stage: 'won' },
  ...over,
});
const REASON = 'งานแถมตามสัญญาเดิม ไม่ใช่ยอดขายใหม่ของไตรมาสนี้';
const noneOrder = so({
  id: 'SO-N', orderNumber: 'SO-26100002-0', dealId: 'D2', ownerId: 'u2', ownerName: 'สอง', approvedAt: '2026-10-08T03:00:00Z',
  vatAmount: 3500, totalAmount: 53500, actualAmount: 50000, actualMode: 'none', actualNoneReason: `  ${REASON}  `,
  metadata: { quoteNumber: 'QT-26100002' },
  deal: { team: 'ODM', id: 'D2', line: 'SERVICE', dealType: 'RE-ORDER', stage: 'won' },
});
// ใบไม่นับ Actual ที่ส่วนลดเต็มใบ — "ไม่คิดเงิน" จริง (ยอดของใบ 0)
const noneFree = so({
  id: 'SO-NF', orderNumber: 'SO-26100005-0', dealId: 'D5', ownerId: 'u2', ownerName: 'สอง', approvedAt: '2026-10-09T03:00:00Z',
  discountAmount: 100000, vatAmount: 0, totalAmount: 0, actualAmount: 0, actualMode: 'none', actualNoneReason: REASON,
  deal: { team: 'ODM', id: 'D5', line: 'SERVICE', dealType: 'RE-ORDER', stage: 'won' },
});
const excise = (over = {}) => ({
  id: 'SO-X', orderNumber: 'SO-26100003-0', quotationId: 'QT-X', dealId: null, projectId: null,
  customerName: 'ลูกค้า A', customerId: 'C1', orderDate: '2026-10-10', approvedAt: '2026-10-10T03:00:00Z',
  ownerId: 'u3', ownerName: 'สาม', discountAmount: 0, vatAmount: 700, totalAmount: 10700, actualAmount: 0,
  financeStatus: 'pending', status: 'approved', origin: 'excise', actualMode: 'order', sourceSalesOrderId: 'SO-OLD',
  metadata: { quoteNumber: 'QT-X-1' }, deal: null,
  ...over,
});
// SO ต้นทางของใบค่าสรรพสามิต — อนุมัตินอกงวด (ต้องหาเจอด้วย id ไม่ใช่จากก้อนใบในงวด)
const sourceOrder = so({
  id: 'SO-OLD', orderNumber: 'SO-26050001-0', dealId: 'D9', approvedAt: '2025-05-05T03:00:00Z', ownerId: 'u9',
  deal: { team: 'KA', id: 'D9', line: 'PRODUCT', dealType: 'SCENT', stage: 'won' },
});
const inst = (over = {}) => ({
  id: 'P1', salesOrderId: 'SO-A', seq: 1, amount: 0, status: 'pending', frozenAt: '2026-10-05T03:00:00Z',
  actualStatus: null, actualAmount: null, actualApprovedAt: null, actualSubmittedAt: null, ...over,
});

const baseTables = () => ({
  sales_orders: [so(), sourceOrder],
  sales_order_lines: [{ salesOrderId: 'SO-A', id: 'L1' }, { salesOrderId: 'SO-N', id: 'L2' }, { salesOrderId: 'SO-X', id: 'L3' }],
  sales_order_installments: [
    inst({ id: 'P1', amount: 53500, status: 'confirmed' }),
    inst({ id: 'PN1', salesOrderId: 'SO-N', amount: 26750, status: 'confirmed' }),
    inst({ id: 'PN2', salesOrderId: 'SO-N', seq: 2, amount: 26750, status: 'reported' }),
    inst({ id: 'PX1', salesOrderId: 'SO-X', amount: 10700, status: 'confirmed' }),
  ],
  sales_targets: [{ id: 'T1', period: '2026-10', periodType: 'month', team: 'KA', ownerId: 'u1', targetAmount: 200000 }],
  sales_history: [],
  sales_deals: [],
});
const withUncounted = () => {
  const tables = baseTables();
  tables.sales_orders.push(
    noneOrder,
    noneFree,
    excise(),
    excise({ id: 'SO-Y', orderNumber: 'SO-26100004-0', sourceSalesOrderId: 'SO-GONE', approvedAt: '2026-10-12T03:00:00Z' }),
    // ไม่เข้า: ยังไม่อนุมัติ · อนุมัติก่อนแกน · ใบไม่นับ Actual ที่อนุมัติก่อนแกน
    excise({ id: 'SO-XP', status: 'pending_approval', approvedAt: null }),
    excise({ id: 'SO-XO', approvedAt: '2025-12-30T03:00:00Z' }),
    so({ id: 'SO-NO', actualMode: 'none', actualNoneReason: REASON, approvedAt: '2025-12-30T03:00:00Z' }),
  );
  return tables;
};

const OLD_ORDER_KEYS = [
  'id', 'orderNumber', 'quoteNumber', 'quotationId', 'dealId', 'customerId', 'customerName', 'ownerId', 'ownerName',
  'team', 'line', 'dealType', 'month', 'day', 'approvedAt', 'lineCount', 'amount', 'vatAmount', 'totalAmount',
  'collectedAmount', 'awaitingAmount', 'outstandingAmount', 'installmentCount', 'discountAmount', 'free', 'financeStatus',
];
const UNCOUNTED_KEYS = [...OLD_ORDER_KEYS, 'actualMode', 'actualNone', 'actualNoneReason', 'excise'];

/* ── 1. ตัวแตกแถว + ตัวสร้างแถวยอด ───────────────────────────────────────────────────────────────── */
test('reportActualRows: ใบไม่นับ Actual / ค่าสรรพสามิต = สำเนายอด 0 + ธง · ใบเดิมไม่ถูกแตะ · ใบปกติคืนตัวเดิม', () => {
  const order = so();
  const exciseRow = excise();
  const rows = reportActualRows([order, noneOrder, exciseRow]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0], order, 'ใบปกติ = ออบเจกต์เดิม');
  assert.equal(rows[1].actualAmount, 0);
  assert.equal(rows[1].orderActualAmount, 50000);
  assert.equal(rows[1].actualNone, true);
  assert.equal(rows[1].excise, undefined);
  assert.equal(noneOrder.actualAmount, 50000, 'ใบต้นทางไม่ถูกแก้');
  assert.equal(rows[2].excise, true);
  assert.equal(rows[2].actualAmount, 0);
  assert.deepEqual(rows.map(isUncountedReportRow), [false, true, true]);
  assert.deepEqual(rows.map(uncountedReportLabel), [null, REPORT_ACTUAL_NONE_LABEL, REPORT_EXCISE_LABEL]);
  assert.equal(REPORT_ACTUAL_NONE_LABEL, 'ไม่นับ Actual');
  assert.equal(REPORT_EXCISE_LABEL, 'ค่าสรรพสามิต · ไม่นับ Actual');
  assert.equal(uncountedReportCount(rows), 2);
  // ตัวคัดใช้กับสำเนา (วันอนุมัติใบ) เหมือนใบทั้งใบ
  assert.deepEqual(reportActualRows([noneOrder, exciseRow], { keep: (o) => o.approvedAt < '2026-10-09' }).map((o) => o.id), ['SO-N']);
  // ใบรายงวด/ใบย้อนหลังไม่ใช่ใบไม่นับ Actual ของตัวเลือกนี้ (ตัวตัดสินของ salesOrderActualMode)
  assert.equal(isUncountedReportRow(reportActualRows([so({ actualMode: 'order' })])[0]), false);
});

test('buildReportRows: แถวที่ไม่นับไม่เข้าบริษัท/ทีม/คน และไม่สร้างแถวคน/ทีมศูนย์ล้วน', () => {
  const months = ['2026-10'];
  const counted = [so()];
  const ruler = buildReportRows({ months, orders: counted });
  const rows = buildReportRows({ months, orders: [...counted, ...reportActualRows([noneOrder, excise()])] });
  assert.deepEqual(rows, ruler);
  assert.deepEqual(rows.people.map((p) => p.ownerId), ['u1'], 'u2 (ใบไม่นับ) · u3 (ค่าสรรพสามิต) ไม่มีแถวคน');
  assert.deepEqual(rows.teams.map((t) => t.team), ['KA'], 'ไม่มีแถวทีม ODM ศูนย์ล้วน');
  // ทีมของใบค่าสรรพสามิต = ดีลของ SO ต้นทาง (sourceDeal) · ใบปกติ = ดีลของใบเหมือนเดิม
  assert.equal(reportOrderTeam({ deal: null, sourceDeal: { team: 'ODM' } }), 'ODM');
  assert.equal(reportOrderTeam({ deal: { team: 'KA' }, sourceDeal: { team: 'ODM' } }), 'KA');
  assert.equal(reportOrderTeam({ deal: null, sourceDeal: null }), null);
});

/* ── 2–3. ตัวโหลด ──────────────────────────────────────────────────────────────────────────────── */
test('ตัวโหลด: ใบไม่นับ Actual + ค่าสรรพสามิตขึ้นใน uncountedOrders · ยอด 0 · ยอดเก็บตามจริง · ทีมจาก SO ต้นทาง', async () => {
  const fake = fakeSupabase(withUncounted());
  const data = await loadSalesReportData(fake, periodOf({ mode: 'month', month: '2026-10' }), { now: NOW });

  assert.deepEqual(data.orders.map((o) => o.id), ['SO-A'], 'orders[] = ใบที่นับเท่านั้น');
  assert.deepEqual(data.uncountedOrders.map((o) => o.id), ['SO-N', 'SO-NF', 'SO-X', 'SO-Y']);
  for (const o of data.uncountedOrders) assert.deepEqual(Object.keys(o), UNCOUNTED_KEYS, `${o.id} รูปแถว`);

  const none = data.uncountedOrders.find((o) => o.id === 'SO-N');
  assert.equal(none.amount, 0);
  assert.equal(none.actualMode, 'none');
  assert.equal(none.actualNone, true);
  assert.equal(none.excise, false);
  assert.equal(none.actualNoneReason, REASON, 'เหตุผลตัดช่องว่างแล้ว');
  assert.equal(none.free, false, 'ยอด 0 เพราะไม่นับ ไม่ใช่ "ไม่คิดเงิน"');
  assert.equal(none.totalAmount, 53500);
  assert.equal(none.vatAmount, 3500);
  assert.equal(none.collectedAmount, 26750);
  assert.equal(none.awaitingAmount, 26750);
  assert.equal(none.outstandingAmount, 26750);
  assert.equal(none.installmentCount, 2);
  assert.equal(none.lineCount, 1);
  assert.equal(none.team, 'ODM');
  assert.equal(none.line, 'SERVICE');
  assert.equal(none.dealType, 'RE-ORDER');
  assert.equal(none.ownerId, 'u2');
  assert.equal(none.month, '2026-10');
  assert.equal(none.day, '2026-10-08');
  assert.equal(none.quoteNumber, 'QT-26100002');
  assert.equal(data.uncountedOrders.find((o) => o.id === 'SO-NF').free, true, 'ส่วนลดเต็มใบ = ไม่คิดเงินจริง');

  const x = data.uncountedOrders.find((o) => o.id === 'SO-X');
  assert.equal(x.amount, 0);
  assert.equal(x.excise, true);
  assert.equal(x.actualNone, false);
  assert.equal(x.actualNoneReason, null);
  assert.equal(x.actualMode, 'order');
  assert.equal(x.free, false);
  assert.equal(x.team, 'KA', 'ทีมบนดีลของ SO ต้นทาง');
  assert.equal(x.line, 'PRODUCT');
  assert.equal(x.dealType, 'SCENT');
  assert.equal(x.dealId, null, 'ใบค่าสรรพสามิตไม่มีดีลของตัวเอง');
  assert.equal(x.ownerId, 'u3', 'เจ้าของ = ownerId ของใบค่าสรรพสามิต');
  assert.equal(x.ownerName, 'สาม');
  assert.equal(x.collectedAmount, 10700);
  assert.equal(x.outstandingAmount, 0);
  assert.equal(x.installmentCount, 1);
  assert.equal(x.lineCount, 1);
  const y = data.uncountedOrders.find((o) => o.id === 'SO-Y');
  assert.equal(y.team, null, 'หา SO ต้นทางไม่เจอ = ทีมว่าง');
  assert.equal(y.line, null);
  assert.equal(y.dealType, null);
  assert.equal(y.outstandingAmount, 10700, 'ยังไม่มีงวด = ค้างเต็มใบ');

  // คำถาม: ใบอนุมัติก้อนเดิมพก actualNoneReason · ใบค่าสรรพสามิตกรอง origin ในคิวรี · ต้นทางถามด้วย id ทีละก้อน
  const approved = fake.calls.find((c) => c.table === 'sales_orders' && c.eq.some(([col, v]) => col === 'origin' && v === 'pipeline') && c.eq.some(([, v]) => v === 'approved'));
  assert.match(approved.select, /"actualNoneReason"/);
  const exciseCall = fake.calls.find((c) => c.table === 'sales_orders' && c.eq.some(([col, v]) => col === 'origin' && v === 'excise'));
  assert.ok(exciseCall.eq.some(([col, v]) => col === 'status' && v === 'approved'));
  assert.match(exciseCall.select, /"sourceSalesOrderId"/);
  const sourceCall = fake.calls.find((c) => c.table === 'sales_orders' && c.in.some(([col]) => col === 'id'));
  assert.equal(sourceCall.select, 'id, deal:sales_deals(id, team, line, "dealType")');
  assert.deepEqual(sourceCall.in[0][1], ['SO-OLD', 'SO-GONE'], 'เฉพาะใบค่าสรรพสามิตในงวดที่โชว์ · ไม่ซ้ำ');
});

test('ตัวโหลด: ตัวเลขทุกตัวเท่ากับตอนไม่มีใบสองชนิดนี้ (orders[] · บริษัท/ทีม/คน · รออนุมัติ · byDay · summary)', async () => {
  const period = periodOf({ mode: 'month', month: '2026-10' });
  const baseFake = fakeSupabase(baseTables());
  const base = await loadSalesReportData(baseFake, period, { now: NOW });
  const next = await loadSalesReportData(fakeSupabase(withUncounted()), period, { now: NOW });
  assert.deepEqual(base.uncountedOrders, []);
  assert.equal(baseFake.calls.filter((c) => c.in.some(([col]) => col === 'id')).length, 0, 'ไม่มีใบค่าสรรพสามิต = ไม่ถามต้นทาง');
  for (const key of ['orders', 'company', 'teams', 'people', 'pendingApproval', 'byDay', 'targetFactor', 'historyDropped']) {
    assert.deepEqual(next[key], base[key], key);
  }
  assert.deepEqual(next.people.map((p) => p.ownerId), ['u1']);
  const strip = ({ uncountedOrders, generatedAt, ...rest }) => rest;
  assert.deepEqual(summarizeSalesReport(strip(next), { now: NOW }), summarizeSalesReport(strip(base), { now: NOW }));
  assert.deepEqual(summarizeSalesReport(next, { now: NOW }), summarizeSalesReport(base, { now: NOW }), 'ตัวสรุปไม่อ่าน uncountedOrders');

  // ทั้งปี: ใบไม่นับ Actual ที่อนุมัติ ธ.ค. 2025 อยู่นอกแกน · ใบในงวดยังอยู่ครบ
  const year = await loadSalesReportData(fakeSupabase(withUncounted()), periodOf({ mode: 'year', year: '2026' }), { now: NOW });
  assert.deepEqual(year.uncountedOrders.map((o) => o.id), ['SO-N', 'SO-NF', 'SO-X', 'SO-Y']);
});

/* ── 4. Excel ──────────────────────────────────────────────────────────────────────────────────── */
test('Excel: แถวที่ไม่นับบอกชนิด + เหตุผลในหมายเหตุ · ไม่ต่อ "ไม่นับ · ยอดกรอกทับ" ซ้ำ · ใบปกติเท่าเดิม', () => {
  const overriddenMonths = new Set(['2026-10']);
  const none = orderSheetRow({
    id: 'SO-N', orderNumber: 'SO-2', month: '2026-10', day: '2026-10-08', amount: 0, installmentCount: 2,
    actualMode: 'none', actualNone: true, actualNoneReason: REASON, excise: false, free: false,
  }, 0, { overriddenMonths });
  assert.equal(none.note, `ไม่นับ Actual (${REASON})`);
  assert.equal(none.amount, 0);
  const x = orderSheetRow({
    id: 'SO-X', orderNumber: 'SO-3', month: '2026-10', day: '2026-10-10', amount: 0, installmentCount: 0, ownerId: 'u3',
    actualMode: 'order', actualNone: false, actualNoneReason: null, excise: true, free: false, collectedAmount: 0, outstandingAmount: 10700,
  }, 1, { overriddenMonths });
  assert.equal(x.note, 'ค่าสรรพสามิต · ไม่นับ Actual · ยังไม่มีงวดชำระ');
  assert.equal(x.outstandingAmount, 10700);
  assert.equal(x.team, 'ไม่ระบุทีม', 'มีเจ้าของแต่หาทีมต้นทางไม่เจอ = ป้ายไม่ระบุทีม');
  const plain = orderSheetRow({ id: 'SO-A', orderNumber: 'SO-1', month: '2026-10', day: '2026-10-05', amount: 10, installmentCount: 1 }, 2, { overriddenMonths });
  assert.equal(plain.note, 'ไม่นับ · เดือนนี้ใช้ยอดกรอกย้อนหลัง', 'ใบปกติ = หมายเหตุเดิม');
});

test('Excel: ชีตใบสั่งขายมีแถวที่ไม่นับ · แถวรวมยอดที่นับเท่าเดิม · ชีตสรุปเท่าเดิม', async () => {
  const period = periodOf({ mode: 'month', month: '2026-10' });
  const data = await loadSalesReportData(fakeSupabase(withUncounted()), period, { now: NOW });
  const summary = summarizeSalesReport(data, { now: NOW });
  const readBook = async (input) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await buildSalesReportBuffer(input, summary, { origin: 'https://x.test' }));
    return book;
  };
  const book = await readBook(data);
  const baseBook = await readBook({ ...data, uncountedOrders: [] });
  const sheet = book.getWorksheet('ใบสั่งขาย');
  const header = sheet.getRow(4).values.slice(1);
  const col = (name) => header.indexOf(name);
  const body = [];
  for (let n = 5; n < sheet.rowCount; n += 1) body.push(sheet.getRow(n).values.slice(1));
  assert.deepEqual(body.map((r) => r[col('SO')].text), ['SO-26100001-0', 'SO-26100002-0', 'SO-26100005-0', 'SO-26100003-0', 'SO-26100004-0']);
  const total = sheet.getRow(sheet.rowCount).values.slice(1);
  const baseTotal = baseBook.getWorksheet('ใบสั่งขาย').getRow(baseBook.getWorksheet('ใบสั่งขาย').rowCount).values.slice(1);
  assert.equal(total[col('ยอดที่นับ')], 100000);
  assert.equal(total[col('ยอดที่นับ')], baseTotal[col('ยอดที่นับ')], 'แถวรวมยอดที่นับบวก 0');
  const xRow = body.find((r) => r[col('SO')].text === 'SO-26100003-0');
  assert.equal(xRow[col('ยอดที่นับ')], 0);
  assert.equal(xRow[col('ยอดเก็บจริง')], 10700);
  assert.equal(xRow[col('ทีม')], 'KA');
  assert.match(xRow[col('หมายเหตุ')], /^ค่าสรรพสามิต · ไม่นับ Actual/);
  assert.match(String(sheet.getRow(2).getCell(1).value), /ในนั้นมีใบที่ไม่นับ Actual 4 ใบ/);
  assert.doesNotMatch(String(baseBook.getWorksheet('ใบสั่งขาย').getRow(2).getCell(1).value), /ไม่นับ Actual/, 'ไม่มีใบไม่นับ = บรรทัดหัวเดิม');
  // ชีตที่มาจาก summary ไม่รู้จักก้อนนี้ — ค่าเท่าเดิมทุกเซลล์
  for (const name of ['สรุปรายเดือน', 'รายทีม', 'รายคน']) {
    const a = book.getWorksheet(name);
    const b = baseBook.getWorksheet(name);
    assert.equal(a.rowCount, b.rowCount, name);
    for (let n = 1; n <= a.rowCount; n += 1) assert.deepEqual(a.getRow(n).values, b.getRow(n).values, `${name} แถว ${n}`);
  }
});
