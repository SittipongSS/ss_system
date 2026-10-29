// ── รายงานยอดขาย × ใบสั่งขาย "Actual รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026) ──────────────────────
//
// ล็อกไว้:
//   1. ใบทั้งใบ (ทุกใบวันนี้) — ผลของรายงานเท่าเดิมทุกไบต์: แถวยอดเป็นออบเจกต์เดิม ลำดับเดิม · รูปแถวใบไม่มีช่องเพิ่ม ·
//      แถวบริษัท/ทีม/คน เท่าไม้บรรทัด (ตัวคัดเดิม + buildReportRows) · ไม่ยิงคำถามงวดเพิ่ม · รออนุมัติเท่าเดิม
//   2. ใบรายงวด — หนึ่งแถวต่อ (ใบ, เดือนที่นับ) · ยอด = งวดที่นับในเดือนนั้น · เงินของแถว = งวดในแถว ·
//      ใบที่อนุมัติก่อนงวดยังโผล่ในเดือนที่นับงวด · ช่วงวันคัดทีละงวด · รวมทุกแถว = ยอดที่นับแล้วของใบ (ไม่ซ้ำ)
//   3. ส่วนรออนุมัติรวมงวดที่ยื่นแล้ว (เจ้าของที่ตรึงบนใบ · ทีมบนดีล) · ไฟล์ Excel บอกงวดในหมายเหตุ
// ⛔ ไม่ต่อฐานจริง — ตัวจำลอง supabase ข้างล่าง (AGENTS.md "เทสต์ห้ามต่อฐานข้อมูลจริง")
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSalesReportData, reportOrderDay } from './salesReportData.js';
import { parseReportPeriod } from './reportPeriod.js';
import { buildReportRows, installmentSeqText, reportActualRows, reportOrderMonth } from './reportRows.js';
import { reportPendingApproval } from './reportPendingApproval.js';
import { orderSheetRow } from './salesReportWorkbook.js';

/* ── ตัวจำลอง supabase: ตัวกรองเท่าที่ตัวโหลดใช้ (eq · lt · gte · lte · in · not is null · or ของ 0412) ── */
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
    const call = { table, select: '', or: null };
    calls.push(call);
    const builder = {
      select(cols) { call.select = cols; return builder; },
      eq(col, v) { filters.push((r) => OPS.eq(r[col], v)); return builder; },
      lt(col, v) { filters.push((r) => OPS.lt(r[col], v)); return builder; },
      gte(col, v) { filters.push((r) => OPS.gte(r[col], v)); return builder; },
      lte(col, v) { filters.push((r) => OPS.lte(r[col], v)); return builder; },
      in(col, list) { filters.push((r) => list.includes(r[col])); return builder; },
      not(col, op, v) { if (op === 'is' && v === null) filters.push((r) => r[col] != null); return builder; },
      or(expr) {
        call.or = expr;
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
  return {
    calls,
    from,
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  };
}

const NOW = new Date('2026-10-20T05:00:00Z'); // 20 ต.ค. 2026 เวลาไทย
const periodOf = (input) => parseReportPeriod(input, { today: '2026-10-20' });

const so = (over = {}) => ({
  id: 'SO-A', orderNumber: 'SO-26080001-0', quotationId: 'QT1', dealId: 'D1', projectId: null,
  customerName: 'ลูกค้า A', customerId: 'C1', orderDate: '2026-08-05', approvedAt: '2026-08-05T03:00:00Z',
  ownerId: 'u1', ownerName: 'หนึ่ง', subtotal: 100000, discountAmount: 0, vatAmount: 7000, totalAmount: 107000,
  actualAmount: 100000, financeStatus: 'pending', status: 'approved', origin: 'pipeline', actualMode: 'order',
  actualCountedAmount: 0, actualSubmittedAmount: 0, metadata: { quoteNumber: 'QT-26080001' },
  project: null, deal: { team: 'KA', id: 'D1', line: 'PRODUCT', dealType: 'NPD', stage: 'won' },
  ...over,
});
const inst = (over = {}) => ({
  id: 'I1', salesOrderId: 'SO-A', seq: 1, amount: 0, status: 'pending', frozenAt: '2026-08-05T03:00:00Z',
  actualStatus: null, actualAmount: null, actualApprovedAt: null, actualSubmittedAt: null, ...over,
});

/* ใบรายงวด: 107,000 รวม VAT (Actual 100,000) สี่งวด — งวด 1 นับตอนอนุมัติใบ (ส.ค.) · งวด 2+3 นับ ต.ค. · งวด 4 ยื่นรอ AE Sup */
const installmentOrder = so({
  id: 'SO-I', orderNumber: 'SO-26080002-0', dealId: 'D2', actualMode: 'installment',
  actualCountedAmount: 75000, actualSubmittedAmount: 25000,
  deal: { team: 'ODM', id: 'D2', line: 'PRODUCT', dealType: 'SCENT', stage: 'won' },
  ownerId: 'u2', ownerName: 'สอง',
});
const installmentRows = [
  inst({ id: 'I1', salesOrderId: 'SO-I', seq: 1, amount: 26750, status: 'confirmed', actualStatus: 'approved', actualAmount: 25000, actualApprovedAt: '2026-08-05T03:00:00Z' }),
  inst({ id: 'I2', salesOrderId: 'SO-I', seq: 2, amount: 26750, status: 'confirmed', actualStatus: 'approved', actualAmount: 25000, actualApprovedAt: '2026-10-02T03:00:00Z' }),
  inst({ id: 'I3', salesOrderId: 'SO-I', seq: 3, amount: 26750, status: 'reported', actualStatus: 'approved', actualAmount: 25000, actualApprovedAt: '2026-10-15T03:00:00Z' }),
  inst({ id: 'I4', salesOrderId: 'SO-I', seq: 4, amount: 26750, status: 'pending', actualStatus: 'submitted', actualSubmittedAt: '2026-10-18T03:00:00Z' }),
];

/* ── 1. ใบทั้งใบ: เท่าเดิมทุกไบต์ ────────────────────────────────────────────────────────── */
const OLD_ORDER_KEYS = [
  'id', 'orderNumber', 'quoteNumber', 'quotationId', 'dealId', 'customerId', 'customerName', 'ownerId', 'ownerName',
  'team', 'line', 'dealType', 'month', 'day', 'approvedAt', 'lineCount', 'amount', 'vatAmount', 'totalAmount',
  'collectedAmount', 'awaitingAmount', 'outstandingAmount', 'installmentCount', 'discountAmount', 'free', 'financeStatus',
];

test('ใบทั้งใบล้วน: แถวยอด/รูปแถวใบ/แถวสรุป/รออนุมัติ เท่าเดิม · ไม่ยิงคำถามงวดของใบรายงวด', async () => {
  const orders = [
    so(),
    so({ id: 'SO-B', orderNumber: 'SO-26100001-0', approvedAt: '2026-10-03T03:00:00Z', ownerId: 'u2', actualAmount: 1234.56, totalAmount: 1320.98, vatAmount: 86.42, actualMode: undefined }),
    so({ id: 'SO-C', orderNumber: 'SO-26090001-0', approvedAt: '2026-09-30T18:00:00Z', ownerId: null, deal: { team: null, id: 'D3', line: null, dealType: null, stage: 'won' } }),
    // นอกงวด (ก่อนแกน) — ใบทั้งใบที่อนุมัติก่อนงวดต้องไม่ถูกโหลดเพราะตัวกรอง .or ของใบรายงวด
    so({ id: 'SO-OLD', approvedAt: '2025-12-30T03:00:00Z' }),
    so({ id: 'SO-PEND', status: 'pending_approval', approvedAt: null, submittedAt: '2026-10-10T03:00:00Z' }),
  ];
  const tables = {
    sales_orders: orders,
    sales_order_lines: [{ salesOrderId: 'SO-A', id: 'L1' }, { salesOrderId: 'SO-B', id: 'L2' }],
    sales_order_installments: [inst({ id: 'P1', amount: 53500, status: 'confirmed' }), inst({ id: 'P2', seq: 2, amount: 53500, status: 'reported' })],
    sales_targets: [],
    sales_history: [],
    sales_deals: [{ id: 'D1', stage: 'won', team: 'KA', line: 'PRODUCT', dealType: 'NPD', ownerId: 'u1', ownerName: 'หนึ่ง' }],
  };
  const fake = fakeSupabase(tables);
  const period = periodOf({ mode: 'year', year: '2026' });
  const data = await loadSalesReportData(fake, period, { now: NOW });

  // ไม้บรรทัด: ตัวคัดเดิม (วันอนุมัติในงวด) + buildReportRows
  const approvedInWindow = orders.filter((o) => o.status === 'approved' && o.approvedAt >= '2026-01-01' && o.approvedAt < '2026-12-31T17:00:00Z');
  const ruler = buildReportRows({ months: period.axis, targets: [], orders: approvedInWindow, history: [], person: () => null });
  assert.deepEqual(data.company, { ...ruler.company, targetFull: ruler.company.target });
  assert.deepEqual(data.teams, ruler.teams);
  assert.deepEqual(data.people, ruler.people);
  // ตัวจำลองไม่เรียงตาม .order() — ลำดับ = ลำดับของคิวรี (ฐานจริงเรียงตาม approvedAt) · ตัวแตกแถวต้องไม่สลับลำดับ
  assert.deepEqual(data.orders.map((o) => o.id), ['SO-A', 'SO-B', 'SO-C']);
  for (const o of data.orders) assert.deepEqual(Object.keys(o), OLD_ORDER_KEYS, `${o.id} รูปแถวต้องเท่าเดิม`);
  const a = data.orders[0];
  assert.equal(a.amount, 100000);
  assert.equal(a.totalAmount, 107000);
  assert.equal(a.collectedAmount, 53500);
  assert.equal(a.awaitingAmount, 53500);
  assert.equal(a.outstandingAmount, 53500);
  assert.equal(a.month, '2026-08');
  assert.equal(data.orders[2].month, '2026-10', 'อนุมัติ 30 ก.ย. 18:00Z = 1 ต.ค. เวลาไทย');
  // ไม่มีใบรายงวด = ไม่ถามงวดของใบรายงวด (คำถามงวดมีแค่ก้อนเงินของใบในงวดเดิม)
  const instCalls = fake.calls.filter((c) => c.table === 'sales_order_installments');
  assert.equal(instCalls.length, 1);
  assert.doesNotMatch(instCalls[0].select, /actualStatus/);
  // รออนุมัติ = ตัวคิดเดิมเมื่อไม่มีใบรายงวด
  const pendingRuler = reportPendingApproval({
    orders: [{ ...orders[4], line: 'PRODUCT' }], deals: tables.sales_deals, months: period.axis, person: () => null, now: NOW,
  });
  assert.deepEqual(data.pendingApproval, pendingRuler);
});

test('reportActualRows: ใบทั้งใบคืนออบเจกต์เดิมตัวเดิม ลำดับเดิม (ตัวคัดเดิม)', () => {
  const orders = [so(), so({ id: 'SO-B', approvedAt: '2026-09-01T03:00:00Z' }), so({ id: 'SO-X', approvedAt: '2027-01-01T03:00:00Z' })];
  const keep = (o) => reportOrderMonth(o) <= '2026-12';
  const rows = reportActualRows(orders, { keep });
  assert.equal(rows.length, 2);
  assert.equal(rows[0], orders[0]);
  assert.equal(rows[1], orders[1]);
  assert.deepEqual(reportActualRows(null), []);
});

/* ── 2. ใบรายงวด: แถวต่อ (ใบ, เดือนที่นับ) ──────────────────────────────────────────────────── */
test('reportActualRows: ใบรายงวดแตกแถวตามเดือนที่นับ · รวมงวดเดือนเดียวกัน · คัดทีละงวด · ไม่มีงวด = ไม่มีแถว', () => {
  const rows = reportActualRows([installmentOrder], { installmentsOf: () => installmentRows });
  assert.deepEqual(rows.map((r) => [r.rowKey, r.actualMonth, r.actualAmount, r.installmentSeqs]), [
    ['SO-I|2026-08', '2026-08', 25000, [1]],
    ['SO-I|2026-10', '2026-10', 50000, [2, 3]],
  ]);
  assert.equal(rows[1].actualAt, '2026-10-15T03:00:00Z', 'เวลานับล่าสุดในแถว');
  assert.equal(rows[1].approvedAt, installmentOrder.approvedAt, 'วันอนุมัติใบคงเดิม');
  assert.equal(rows[1].orderActualAmount, 100000);
  assert.equal(reportOrderMonth(rows[1]), '2026-10');
  assert.equal(reportOrderDay(rows[1]), '2026-10-15');
  // ช่วงวัน 1–10 ต.ค. คลุมแค่งวด 2
  const ranged = reportActualRows([installmentOrder], {
    installmentsOf: () => installmentRows,
    keep: (o) => reportOrderDay(o) >= '2026-10-01' && reportOrderDay(o) <= '2026-10-10',
  });
  assert.deepEqual(ranged.map((r) => [r.actualAmount, r.installmentSeqs]), [[25000, [2]]]);
  assert.deepEqual(reportActualRows([installmentOrder], { installmentsOf: () => [] }), [], 'ไม่มีงวดที่นับ = ไม่มีแถว (ไม่เดาทั้งใบ)');
  // Rev. อนุมัติทีหลัง = งวดที่เคยนับย้ายมาเดือน Rev. (GREATEST)
  const rev = reportActualRows([{ ...installmentOrder, approvedAt: '2026-11-01T03:00:00Z' }], { installmentsOf: () => installmentRows });
  assert.deepEqual(rev.map((r) => [r.actualMonth, r.actualAmount]), [['2026-11', 75000]]);
});

test('ตัวโหลด: ใบรายงวดที่อนุมัติก่อนงวดโผล่ในเดือนที่นับงวด · เงินของแถว = งวดในแถว · แถวสรุปตามเจ้าของที่ตรึง', async () => {
  const fake = fakeSupabase({
    sales_orders: [installmentOrder, so({ id: 'SO-ORDER', approvedAt: '2026-10-05T03:00:00Z' })],
    sales_order_lines: [{ salesOrderId: 'SO-I', id: 'L1' }, { salesOrderId: 'SO-I', id: 'L2' }],
    sales_order_installments: installmentRows,
    sales_targets: [],
    sales_history: [],
    sales_deals: [],
  });
  const oct = await loadSalesReportData(fake, periodOf({ mode: 'month', month: '2026-10' }), { now: NOW });
  const orFilter = fake.calls.find((c) => c.table === 'sales_orders' && c.or);
  assert.match(orFilter.or, /^approvedAt\.gte\."2026-01-01T00:00:00\+07:00",actualMode\.eq\.installment$/);
  const row = oct.orders.find((o) => o.id === 'SO-I');
  assert.ok(row, 'ใบอนุมัติ ส.ค. ต้องโผล่ในรายงาน ต.ค. (งวด 2+3 นับ ต.ค.)');
  assert.equal(oct.orders.filter((o) => o.id === 'SO-I').length, 1, 'เดือนเดียว = แถวเดียวต่อใบ');
  assert.equal(row.amount, 50000);
  assert.equal(row.month, '2026-10');
  assert.equal(row.day, '2026-10-15');
  assert.equal(row.totalAmount, 53500, 'ยอดหน้างวด 2+3 รวม VAT');
  assert.equal(row.vatAmount, 3500);
  assert.equal(row.collectedAmount, 26750, 'งวด 2 บัญชีรับรองแล้ว');
  assert.equal(row.awaitingAmount, 26750, 'งวด 3 แจ้งแล้วรอรับรอง');
  assert.equal(row.outstandingAmount, 26750);
  assert.equal(row.installmentCount, 2);
  assert.equal(row.lineCount, 2);
  assert.equal(row.free, false);
  assert.equal(row.actualMode, 'installment');
  assert.equal(row.rowKey, 'SO-I|2026-10');
  assert.deepEqual(row.installmentSeqs, [2, 3]);
  // แถวสรุป: บริษัท ต.ค. = งวด 2+3 + ใบทั้งใบ · ส.ค. (เดือนนำของทบยอด) = งวด 1 · ตามเจ้าของที่ตรึง (u2) ทีมบนดีล (ODM)
  const AUG = oct.axis.indexOf('2026-08');
  const OCT = oct.axis.indexOf('2026-10');
  assert.equal(oct.company.actual[OCT], 150000);
  assert.equal(oct.company.actual[AUG], 25000);
  const u2 = oct.people.find((p) => p.ownerId === 'u2');
  assert.equal(u2.team, 'ODM');
  assert.equal(u2.actual[OCT], 50000);
  assert.equal(u2.actual[AUG], 25000);
  // งวด 4 ยื่นรอ AE Sup อยู่ในส่วนรออนุมัติ (งวดคลุมวันนี้) — เจ้าของที่ตรึงบนใบ
  assert.equal(oct.pendingApproval.amount, 25000);
  assert.equal(oct.pendingApproval.count, 1);
  assert.deepEqual(oct.pendingApproval.byOwner.map((r) => [r.key, r.amount]), [['owner:ODM:u2', 25000]]);
  const pendingRow = oct.pendingApproval.orders[0];
  assert.equal(pendingRow.id, 'SO-I');
  assert.deepEqual(pendingRow.installmentSeqs, [4]);
  assert.equal(pendingRow.submittedAt, '2026-10-18T03:00:00Z');
  assert.equal(pendingRow.totalAmount, 26750);

  // ส.ค.: แถวเดียวของงวด 1 · ไม่มีรออนุมัติ (งวดไม่คลุมวันนี้)
  const aug = await loadSalesReportData(fakeSupabase({
    sales_orders: [installmentOrder], sales_order_installments: installmentRows,
  }), periodOf({ mode: 'month', month: '2026-08' }), { now: NOW });
  assert.deepEqual(aug.orders.map((o) => [o.id, o.amount, o.installmentSeqs]), [['SO-I', 25000, [1]]]);
  assert.equal(aug.pendingApproval.count, 0);

  // ทั้งปี: สองแถว (ส.ค. · ต.ค.) ของใบเดียว รวมกัน = ยอดที่นับแล้วของใบ (ไม่ซ้ำ)
  const year = await loadSalesReportData(fakeSupabase({
    sales_orders: [installmentOrder], sales_order_installments: installmentRows,
  }), periodOf({ mode: 'year', year: '2026' }), { now: NOW });
  const parts = year.orders.filter((o) => o.id === 'SO-I');
  assert.deepEqual(parts.map((o) => o.rowKey), ['SO-I|2026-08', 'SO-I|2026-10']);
  assert.equal(parts.reduce((s, o) => s + o.amount, 0), installmentOrder.actualCountedAmount);
  assert.equal(new Set(year.orders.map((o) => o.rowKey || o.id)).size, year.orders.length, 'คีย์แถวไม่ซ้ำ');
});

/* review รอบสี่ 26/10: VAT ของแถวงวดเคย = ยอดหน้างวด − ยอดที่นับ (หนีบ 0) — เพี้ยนเมื่อยอดงวดไม่เท่าส่วนแบ่งที่ตรึงตอนนับ
   (ยกเงิน C2b ย้าย Actual ไปแถวที่ยก · ปรับยอดงวดที่นับแล้วตามมติข้อ 9 · งวดที่นับให้เองด้วยส่วนแบ่ง 0 ตามมติข้อ 10)
   ⇒ VAT ของแถว = ยอดหน้างวด × สัดส่วน VAT ของใบ · Σ VAT ทุกแถว = VAT ของใบ (คลาดไม่เกินสตางค์) */
test('ตัวโหลด: VAT ของแถวงวด = สัดส่วน VAT ของใบ — ยกเงิน C2b / งวดที่นับแล้วถูกปรับยอด / งวดนับให้เองส่วนแบ่ง 0 ไม่ทำ VAT เพี้ยน', async () => {
  // ใบ 107,000 (Actual 100,000 · VAT 7,000) · มัดจำ 50,000 ยกมาแทนงวด 1 (Actual 33,333.33 · ส.ค.) · งวด 2 28,500 นับ ก.ย. · งวด 3 28,500 นับ ต.ค. (รับเศษ)
  const carried = so({ id: 'SO-C', orderNumber: 'SO-26080003-0', dealId: 'D3', actualMode: 'installment', actualCountedAmount: 100000,
    deal: { team: 'KA', id: 'D3', line: 'PRODUCT', dealType: 'NPD', stage: 'won' } });
  const carriedRows = [
    inst({ id: 'C1', salesOrderId: 'SO-C', seq: 1, amount: 50000, status: 'confirmed', actualStatus: 'approved', actualAmount: 33333.33, actualApprovedAt: '2026-08-05T03:00:00Z' }),
    inst({ id: 'C2', salesOrderId: 'SO-C', seq: 2, amount: 28500, status: 'pending', actualStatus: 'approved', actualAmount: 26635.51, actualApprovedAt: '2026-09-10T03:00:00Z' }),
    inst({ id: 'C3', salesOrderId: 'SO-C', seq: 3, amount: 28500, status: 'pending', actualStatus: 'approved', actualAmount: 40031.16, actualApprovedAt: '2026-10-10T03:00:00Z' }),
  ];
  const year = await loadSalesReportData(fakeSupabase({ sales_orders: [carried], sales_order_installments: carriedRows }),
    periodOf({ mode: 'year', year: '2026' }), { now: NOW });
  const parts = year.orders.filter((o) => o.id === 'SO-C');
  assert.deepEqual(parts.map((o) => [o.month, o.amount, o.vatAmount, o.totalAmount]), [
    ['2026-08', 33333.33, 3271.03, 50000],
    ['2026-09', 26635.51, 1864.49, 28500],
    ['2026-10', 40031.16, 1864.49, 28500],
  ]);
  const vatSum = Math.round(parts.reduce((s, o) => s + o.vatAmount, 0) * 100) / 100;
  assert.ok(Math.abs(vatSum - 7000) <= 0.02, `Σ VAT ${vatSum} ต้องเท่า VAT ของใบ (คลาดได้แค่สตางค์)`);
  assert.equal(parts.reduce((s, o) => s + o.totalAmount, 0), 107000, 'Σ ยอดหน้างวด = ยอดใบ');
  assert.ok(parts.every((o) => o.vatAmount < o.totalAmount), 'ไม่มีแถวที่ทั้งแถวเป็น VAT');

  // มติข้อ 10: นับที่เหลือทั้งหมดแล้วแบ่งงวด — งวดใหม่นับให้เองด้วยส่วนแบ่ง 0 (ต.ค.) · VAT ของแถวนั้น = ส่วนของ VAT ในยอดหน้างวด ไม่ใช่ทั้งงวด
  const split = so({ id: 'SO-S', orderNumber: 'SO-26080004-0', dealId: 'D4', actualMode: 'installment', actualCountedAmount: 100000,
    deal: { team: 'KA', id: 'D4', line: 'PRODUCT', dealType: 'NPD', stage: 'won' } });
  const splitRows = [
    inst({ id: 'S1', salesOrderId: 'SO-S', seq: 1, amount: 92750, status: 'pending', actualStatus: 'approved', actualAmount: 100000, actualApprovedAt: '2026-08-05T03:00:00Z' }),
    inst({ id: 'S2', salesOrderId: 'SO-S', seq: 2, amount: 14250, status: 'pending', actualStatus: 'approved', actualAmount: 0, actualApprovedAt: '2026-10-10T03:00:00Z' }),
  ];
  const splitYear = await loadSalesReportData(fakeSupabase({ sales_orders: [split], sales_order_installments: splitRows }),
    periodOf({ mode: 'year', year: '2026' }), { now: NOW });
  const splitParts = splitYear.orders.filter((o) => o.id === 'SO-S');
  assert.deepEqual(splitParts.map((o) => [o.month, o.amount, o.vatAmount, o.totalAmount]), [
    ['2026-08', 100000, 6067.76, 92750],
    ['2026-10', 0, 932.24, 14250],
  ]);
  assert.equal(Math.round(splitParts.reduce((s, o) => s + o.vatAmount, 0) * 100) / 100, 7000);
});

/* ── 3. รออนุมัติ + ไฟล์ Excel ──────────────────────────────────────────────────────────────── */
test('รออนุมัติ: งวดที่ยื่นแล้วของใบรายงวด — ดีลต้อง Won · ไม่มีงวดยื่น = ไม่นับ · ไม่ส่ง = พฤติกรรมเดิม', () => {
  const base = { orders: [], deals: [], months: ['2026-10'], person: () => null, now: NOW };
  const withRows = { ...installmentOrder, installments: installmentRows };
  const out = reportPendingApproval({ ...base, installmentOrders: [withRows] });
  assert.equal(out.amount, 25000);
  assert.equal(out.count, 1);
  assert.deepEqual(out.byTeam.map((t) => [t.team, t.amount, t.count]), [['ODM', 25000, 1]]);
  assert.equal(reportPendingApproval({ ...base, installmentOrders: [{ ...withRows, deal: { ...withRows.deal, stage: 'quotation' } }] }).count, 0);
  assert.equal(reportPendingApproval({ ...base, installmentOrders: [{ ...withRows, actualSubmittedAmount: 0, installments: installmentRows.slice(0, 3) }] }).count, 0);
  assert.deepEqual(reportPendingApproval(base), reportPendingApproval({ ...base, installmentOrders: [] }));
  // ไม่มีเจ้าของบนใบ = ยอดบริษัทอย่างเดียว
  const ownerless = reportPendingApproval({ ...base, installmentOrders: [{ ...withRows, ownerId: null }] });
  assert.deepEqual(ownerless.unassigned, { amount: 25000, count: 1 });
  // review รอบสาม 26/10: ใบเดียวยื่นสองงวด (แถวที่ยกมา) = 1 ใบ (ป้าย "n ใบ" · รายการมีแถวเดียวต่อใบ) — ไม่ใช่ 2
  const two = reportPendingApproval({ ...base, installmentOrders: [{ ...withRows,
    installments: [...installmentRows, inst({ id: 'I5', salesOrderId: 'SO-I', seq: 5, amount: 1, status: 'confirmed',
      actualStatus: 'submitted', actualSubmittedAt: '2026-10-19T03:00:00Z' })] }] });
  const twoRows = reportPendingApproval({ ...base, installmentOrders: [{ ...withRows, installments: undefined, actualSubmittedCount: 2 }] });
  for (const out2 of [two, twoRows]) {
    assert.equal(out2.count, 1);
    assert.equal(out2.orders.length, out2.count, 'จำนวน = แถวในรายการ');
  }
});

test('Excel: แถวงวดบอก "Actual รายงวด · งวด …" ในหมายเหตุ · ใบทั้งใบหมายเหตุเท่าเดิม', () => {
  assert.equal(installmentSeqText([2, 3]), 'งวด 2, 3');
  const plain = orderSheetRow({ id: 'SO-A', orderNumber: 'SO-1', month: '2026-10', day: '2026-10-01', amount: 10, installmentCount: 1 }, 0);
  assert.equal(plain.note, '');
  const part = orderSheetRow({
    id: 'SO-I', orderNumber: 'SO-2', month: '2026-10', day: '2026-10-15', amount: 50000, installmentCount: 2,
    actualMode: 'installment', installmentSeqs: [2, 3], awaitingAmount: 0,
  }, 1);
  assert.match(part.note, /^Actual รายงวด · งวด 2, 3 \(ยอดเฉพาะงวดที่นับในเดือนนี้\)$/);
});
