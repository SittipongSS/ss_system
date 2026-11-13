// หน้าลูกค้าศูนย์รวม งวด H1 (มติเจ้าของ 13/11/2026 · docs/customer-hub-plan.md)
// ล็อก: เส้นดีล→QT→SO→ชำระ · สถิติการสั่งรายสินค้า · ตัวเลขบนหัวตามสิทธิ์ · ด่านสิทธิ์รายโมดูลของตัวโหลด
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDealRows, currentOrder, currentQuote, followUps, hubFacts, installmentState, matchesQuery, monthlyActual,
  productOrderStats, recentEvents, dealRowText,
} from './customerHub.js';
import { customerHubRelations } from './customerHubData.js';

const TODAY = '2026-11-13';

/* ── เส้นดีล ─────────────────────────────────────────────────────────────────────────── */
test('ใบเสนอราคาของแถว: ใบที่รับแล้วมาก่อน · ไม่มีใบรับ = ฉบับล่าสุด · ฉบับเก่านับเป็น Rev. เก่า', () => {
  const quotes = [
    { id: 'Q0', quoteNumber: 'QT-1-0', baseNumber: 'QT-1', revisionNo: 0, status: 'revised', createdAt: '2026-10-01' },
    { id: 'Q1', quoteNumber: 'QT-1-1', baseNumber: 'QT-1', revisionNo: 1, status: 'revised', createdAt: '2026-10-02' },
    { id: 'Q2', quoteNumber: 'QT-1-2', baseNumber: 'QT-1', revisionNo: 2, status: 'accepted', createdAt: '2026-10-03' },
  ];
  assert.equal(currentQuote(quotes).id, 'Q2');
  assert.equal(currentQuote([{ ...quotes[0], status: 'sent' }]).id, 'Q0');
  assert.equal(currentQuote([]), null);
  const [row] = buildDealRows({ deals: [{ id: 'D1', createdAt: '2026-10-01' }], quotations: quotes.map((q) => ({ ...q, dealId: 'D1' })) }, TODAY);
  assert.equal(row.quote.id, 'Q2');
  assert.equal(row.olderQuotes, 2);
});

test('ใบสั่งขายของแถว: ใบที่ยังมีผลล่าสุด · ใบที่ถูกแทน/ยกเลิกไม่นับ Actual', () => {
  const orders = [
    { id: 'S0', dealId: 'D1', status: 'revised', supersededById: 'S1', createdAt: '2026-10-01', origin: 'pipeline', actualAmount: 900 },
    { id: 'S1', dealId: 'D1', status: 'approved', createdAt: '2026-10-02', origin: 'pipeline', actualAmount: 1000, actualMode: 'order' },
  ];
  assert.equal(currentOrder(orders).id, 'S1');
  assert.equal(currentOrder([{ id: 'X', status: 'cancelled', createdAt: '2026-10-01' }]).id, 'X', 'ใบเดียวที่ยกเลิก = ยังโชว์ให้เห็นว่ายกเลิก');
  const [row] = buildDealRows({ deals: [{ id: 'D1', createdAt: '2026-10-01' }], orders }, TODAY);
  assert.equal(row.order.id, 'S1');
  assert.equal(row.actual, 1000);
});

test('ใบค่าสรรพสามิตไม่อยู่ในแถวดีล (อยู่แท็บสรรพสามิต · มติ 6)', () => {
  const [row] = buildDealRows({
    deals: [{ id: 'D1', createdAt: '2026-10-01' }],
    orders: [{ id: 'E1', dealId: 'D1', origin: 'excise', status: 'approved', createdAt: '2026-10-05' }],
  }, TODAY);
  assert.equal(row.order, null);
});

test('งวดชำระ: ค้าง = ยังไม่ชำระของใบที่มีผล · เกินกำหนดเทียบวันไทย · จ่ายรอใบอนุมัติ/รอบัญชีตรวจ ไม่นับค้าง', () => {
  const order = { id: 'S1', status: 'approved' };
  assert.deepEqual(installmentState({ status: 'pending', dueDate: '2026-11-12' }, order, TODAY), { display: 'pending', outstanding: true, overdue: true });
  assert.equal(installmentState({ status: 'pending', dueDate: '2026-11-13' }, order, TODAY).overdue, false, 'ครบกำหนดวันนี้ยังไม่เกิน');
  assert.equal(installmentState({ status: 'confirmed' }, order, TODAY).outstanding, false);
  assert.equal(installmentState({ status: 'reported' }, order, TODAY).outstanding, false);
  assert.equal(installmentState({ status: 'pending', paidOn: '2026-11-01', evidence: [{}] }, order, TODAY).outstanding, false);
  assert.equal(installmentState({ status: 'pending' }, { status: 'cancelled' }, TODAY).outstanding, false, 'งวดของใบยกเลิกไม่ใช่ค้างชำระ');
});

test('แถวดีลสรุปงวด: จำนวน · จ่ายแล้ว · ยอดค้าง · เกินกำหนด', () => {
  const [row] = buildDealRows({
    deals: [{ id: 'D1', createdAt: '2026-10-01' }],
    orders: [{ id: 'S1', dealId: 'D1', status: 'approved', origin: 'pipeline', createdAt: '2026-10-02' }],
    installments: [
      { id: 'I1', salesOrderId: 'S1', status: 'confirmed', amount: 500 },
      { id: 'I2', salesOrderId: 'S1', status: 'pending', amount: 700, dueDate: '2026-11-01' },
    ],
  }, TODAY);
  assert.deepEqual(row.payment, { count: 2, paid: 1, outstanding: 700, overdue: true });
});

/* ── สถิติการสั่งรายสินค้า ─────────────────────────────────────────────────────────── */
test('การสั่งรายสินค้า: นับใบ (ไม่ใช่บรรทัด) · เฉพาะใบอนุมัติที่มีผล · ไม่รวมใบค่าสรรพสามิต · บรรทัดกรอกเองแยกกอง', () => {
  const orders = [
    { id: 'S1', status: 'approved', origin: 'pipeline', orderDate: '2026-08-16' },
    { id: 'S2', status: 'approved', origin: 'pipeline', orderDate: '2026-10-28' },
    { id: 'S3', status: 'pending_approval', origin: 'pipeline', orderDate: '2026-11-01' },
    { id: 'S4', status: 'approved', origin: 'excise', orderDate: '2026-11-02' },
    { id: 'S5', status: 'approved', origin: 'historical', orderDate: '2025-12-01' },
  ];
  const lines = [
    { salesOrderId: 'S1', productId: 'P1', lineTotal: 25500 },
    { salesOrderId: 'S2', productId: 'P1', lineTotal: 17000 },
    { salesOrderId: 'S2', productId: 'P1', lineTotal: 8500 },
    { salesOrderId: 'S3', productId: 'P1', lineTotal: 99999 },
    { salesOrderId: 'S4', productId: 'P1', lineTotal: 1 },
    { salesOrderId: 'S5', productId: 'P2', lineTotal: 300 },
    { salesOrderId: 'S1', productId: null, fgCode: 'FG-148-04-004', description: 'ขวด', lineTotal: 1500 },
  ];
  const stats = productOrderStats(lines, orders);
  assert.deepEqual(stats.byProduct.get('P1'), { productId: 'P1', fgCode: null, description: null, orders: 2, lastDate: '2026-10-28', total: 51000 });
  assert.equal(stats.byProduct.get('P2').orders, 1, 'ใบย้อนหลังที่อนุมัติแล้ว = การสั่งจริงในอดีต');
  assert.equal(stats.manual.length, 1);
  assert.equal(stats.manual[0].fgCode, 'FG-148-04-004');
});

/* ── ตัวเลขบนหัว ───────────────────────────────────────────────────────────────────────── */
test('ตัวเลขบนหัว: Actual จากตัวแบ่งยอดกลาง · ดีลเปิด · ค้างชำระ · คำร้องค้าง', () => {
  const facts = hubFacts({
    sales: {
      visible: true,
      deals: [{ id: 'D1', stage: 'won', projectValue: 100 }, { id: 'D2', stage: 'quotation', projectValue: 90000 }],
      orders: [
        { id: 'S1', status: 'approved', origin: 'pipeline', actualAmount: 16500, actualMode: 'order' },
        { id: 'S2', status: 'pending_approval', origin: 'pipeline', actualAmount: 500 },
        { id: 'H1', status: 'approved', origin: 'historical', actualAmount: 9999 },
      ],
    },
    finance: { visible: true, installments: [{ salesOrderId: 'S1', status: 'pending', amount: 17655, dueDate: '2026-11-01' }] },
    requests: { visible: true, rows: [{ status: 'acknowledged', dept: 'RD' }, { status: 'closed', dept: 'RD' }, { status: 'pending', dept: 'FN' }] },
  }, TODAY);
  assert.deepEqual(facts.actual, { amount: 16500, orders: 1, pending: 500 });
  assert.deepEqual(facts.openDeals, { count: 1, value: 90000 });
  assert.equal(facts.outstanding.amount, 17655);
  assert.equal(facts.outstanding.overdue, 1);
  assert.deepEqual(facts.openRequests, { count: 2, byDept: { RD: 1, FN: 1 } });
});

test('ตัวเลขบนหัว: กลุ่มที่ไม่มีสิทธิ์ = null (จอไม่วาดช่อง · มติ 4)', () => {
  const facts = hubFacts({ sales: { visible: false }, finance: { visible: false }, requests: { visible: false } }, TODAY);
  assert.deepEqual(facts, { actual: null, openDeals: null, outstanding: null, openRequests: null });
});

/* ── ค้นช่องเดียว ─────────────────────────────────────────────────────────────────────── */
test('ค้น: ทุกคำต้องเจอ · ค้นเลข PO ลูกค้า (referenceDoc) เจอแม้ไม่ได้อยู่บนแถว', () => {
  const [row] = buildDealRows({
    deals: [{ id: 'D1', code: 'DL-261000725', title: 'Re-Order 10.2026', createdAt: '2026-10-26' }],
    quotations: [{ id: 'Q1', dealId: 'D1', quoteNumber: 'QT-26100538-2', status: 'accepted', createdAt: '2026-10-26' }],
    orders: [{ id: 'S1', dealId: 'D1', orderNumber: 'SO-26100357-0', referenceDoc: 'YK2610002', status: 'approved', origin: 'pipeline', createdAt: '2026-10-28' }],
  }, TODAY);
  const hay = dealRowText(row);
  assert.ok(matchesQuery(hay, 'yk2610002'));
  assert.ok(matchesQuery(hay, '0538 re-order'));
  assert.ok(!matchesQuery(hay, '0538 sachet'));
  assert.ok(matchesQuery(hay, '  '), 'คำค้นว่าง = ผ่านทุกแถว');
});

/* ── ตัวโหลด: ด่านสิทธิ์รายโมดูล ───────────────────────────────────────────────────────── */
function query(getRows) {
  const filters = [];
  const chain = {
    eq(col, val) { filters.push((r) => r[col] === val); return chain; },
    in(col, vals) { filters.push((r) => vals.includes(r[col])); return chain; },
    order() { return chain; },
    range(from, to) { chain.window = [from, to + 1]; return chain; },
    then(resolve, reject) {
      let data = getRows().filter((r) => filters.every((f) => f(r)));
      if (chain.window) data = data.slice(...chain.window);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
}
const fake = (rows) => ({ from: (table) => ({ select: () => query(() => rows[table] || []) }) });

const ROWS = {
  sales_deals: [
    { id: 'D1', customerId: 'C1', team: 'KA', ownerId: 'u-ae', leadId: 'L1', stage: 'won', createdAt: '2026-10-01' },
    { id: 'D2', customerId: 'C1', team: 'OTHER', ownerId: 'u-x', stage: 'quotation', createdAt: '2026-10-02' },
  ],
  sales_leads: [{ id: 'L1', company: 'WWG' }],
  quotations: [
    { id: 'Q1', customerId: 'C1', dealId: 'D1', quoteNumber: 'QT-1', status: 'accepted', createdAt: '2026-10-03' },
    { id: 'Q2', customerId: 'C1', dealId: 'D2', quoteNumber: 'QT-2', status: 'sent', createdAt: '2026-10-04' },
    { id: 'QE', customerId: 'C1', dealId: null, origin: 'excise', sourceSalesOrderId: 'S1', quoteNumber: 'QT-E', status: 'accepted', createdAt: '2026-10-05' },
  ],
  sales_orders: [
    { id: 'S1', customerId: 'C1', dealId: 'D1', origin: 'pipeline', status: 'approved', createdAt: '2026-10-06' },
    { id: 'S2', customerId: 'C1', dealId: 'D2', origin: 'pipeline', status: 'draft', createdAt: '2026-10-07' },
    { id: 'SE', customerId: 'C1', dealId: null, origin: 'excise', sourceSalesOrderId: 'S1', status: 'approved', createdAt: '2026-10-08' },
  ],
  sales_order_installments: [{ id: 'I1', salesOrderId: 'S1' }, { id: 'I2', salesOrderId: 'S2' }],
  sales_order_lines: [{ id: 'L1', salesOrderId: 'S1', productId: 'P1' }, { id: 'L2', salesOrderId: 'S2', productId: 'P1' }],
  sales_contracts: [{ id: 'K1', customerId: 'C1', dealId: 'D2', contractNo: 'CT-1', createdAt: '2026-10-09' }],
  dept_requests: [
    { id: 'R1', customerId: 'C1', status: 'acknowledged', dept: 'RD', requestedById: 'u-ae', team: 'KA' },
    { id: 'R2', customerId: 'C1', status: 'draft', dept: 'RD', requestedById: 'u-other', team: 'KA' },
  ],
};

test('ตัวโหลด: AE เห็นเฉพาะดีล/ใบ/งวด/บรรทัดในขอบเขตตัวเอง · ใบค่าสรรพสามิตตัดสินด้วยดีลของ SO ต้นทาง', async () => {
  const ae = { id: 'u-ae', role: 'ae', team: 'KA', teams: ['KA'] };
  const hub = await customerHubRelations(fake(ROWS), 'C1', ae);
  assert.deepEqual(hub.sales.deals.map((d) => d.id), ['D1']);
  assert.deepEqual(hub.sales.leads.map((l) => l.id), ['L1'], 'ลีดขึ้นผ่านดีลที่ผูกลีด (มติ 3)');
  assert.deepEqual(hub.sales.quotations.map((q) => q.id).sort(), ['Q1', 'QE']);
  assert.deepEqual(hub.sales.orders.map((o) => o.id).sort(), ['S1', 'SE']);
  assert.deepEqual(hub.finance.installments.map((i) => i.id), ['I1'], 'งวดของใบที่เห็นได้เท่านั้น');
  assert.deepEqual(hub.orderLines.map((l) => l.id), ['L1']);
  assert.deepEqual(hub.sales.contracts, [], 'สัญญาของดีลนอกขอบเขตไม่ขึ้น');
  assert.deepEqual(hub.excise.orders.map((o) => o.id), ['SE']);
  assert.deepEqual(hub.requests.rows.map((r) => r.id), ['R1'], 'ร่างของคนอื่นไม่ขึ้น');
});

test('ตัวโหลด: ไม่มีสิทธิ์สายขาย = กลุ่มขาย/การเงินว่างและ visible:false (ไม่ใช่ลิสต์ว่างเงียบ)', async () => {
  const wh = { id: 'u-wh', role: 'wh' };
  const hub = await customerHubRelations(fake(ROWS), 'C1', wh);
  assert.equal(hub.sales.visible, false);
  assert.equal(hub.finance.visible, false);
  assert.deepEqual(hub.sales.orders, []);
  assert.deepEqual(hub.finance.installments, []);
});

test('ตัวโหลด: RA เห็นใบค่าสรรพสามิตของลูกค้าแม้ไม่มีสิทธิ์สายขาย (คิว /tax ไม่มี row scope)', async () => {
  const ra = { id: 'u-ra', role: 'ra' };
  const hub = await customerHubRelations(fake(ROWS), 'C1', ra);
  assert.equal(hub.sales.visible, false);
  assert.deepEqual(hub.excise.orders.map((o) => o.id), ['SE']);
});

test('ตัวโหลด: query พัง = throw ไม่ใช่ลิสต์ว่าง', async () => {
  const broken = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error('boom') }) }) }) }) }) }) };
  await assert.rejects(() => customerHubRelations(broken, 'C1', { id: 'a', role: 'admin' }), /boom/);
});

/* ── แท็บภาพรวม (H2) ───────────────────────────────────────────────────────────────────── */
test('Actual รายเดือน: เดือนอนุมัติตามเวลาไทย · ใบรายงวดนับตามงวดที่อนุมัติ · ไม่นับใบย้อนหลัง/ค่าสรรพสามิต/ยังไม่อนุมัติ', () => {
  const now = new Date('2026-11-13T05:00:00Z');
  const orders = [
    // อนุมัติ 31 ต.ค. 20:00 UTC = 1 พ.ย. ตี 3 เวลาไทย ⇒ เดือน พ.ย.
    { id: 'S1', status: 'approved', origin: 'pipeline', actualMode: 'order', actualAmount: 1000, approvedAt: '2026-10-31T20:00:00Z' },
    { id: 'S2', status: 'approved', origin: 'pipeline', actualMode: 'order', actualAmount: 500, approvedAt: '2026-08-10T03:00:00Z' },
    { id: 'S3', status: 'approved', origin: 'pipeline', actualMode: 'installment', actualAmount: 900, approvedAt: '2026-09-01T03:00:00Z' },
    { id: 'H1', status: 'approved', origin: 'historical', actualAmount: 7777, approvedAt: '2026-10-01T03:00:00Z' },
    { id: 'E1', status: 'approved', origin: 'excise', actualAmount: 0, approvedAt: '2026-10-01T03:00:00Z' },
    { id: 'P1', status: 'pending_approval', origin: 'pipeline', actualAmount: 4444 },
  ];
  const installments = [
    { id: 'I1', salesOrderId: 'S3', seq: 1, actualStatus: 'approved', actualAmount: 300, actualApprovedAt: '2026-09-15T03:00:00Z' },
    { id: 'I2', salesOrderId: 'S3', seq: 2, actualStatus: 'approved', actualAmount: 600, actualApprovedAt: '2026-10-05T03:00:00Z' },
  ];
  const { months, total } = monthlyActual(orders, installments, { months: 4, now });
  assert.deepEqual(months.map((m) => m.month), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(months.map((m) => m.amount), [500, 300, 600, 1000]);
  assert.equal(total, 2400);
});

test('ต้องตามต่อ: เกินกำหนดก่อน → คำร้องค้าง → SO ยังไม่อนุมัติ → ดีลเปิด · ลิงก์ตรงไปที่ใบ', () => {
  const items = followUps({
    sales: {
      visible: true,
      deals: [{ id: 'D1', code: 'DL-1', stage: 'quotation', projectValue: 90000, createdAt: '2026-10-01' }, { id: 'D2', stage: 'won' }],
      orders: [
        { id: 'S1', orderNumber: 'SO-1', status: 'approved' },
        { id: 'S2', orderNumber: 'SO-2', status: 'pending_approval', createdAt: '2026-11-01' },
        { id: 'S3', orderNumber: 'SO-3', status: 'draft', supersededById: 'S9' },
      ],
    },
    finance: { visible: true, installments: [{ id: 'I1', salesOrderId: 'S1', seq: 2, status: 'pending', amount: 700, dueDate: '2026-11-01' }] },
    requests: { visible: true, rows: [{ id: 'R1', docNo: 'RQ-1', status: 'acknowledged', dept: 'RD' }, { id: 'R2', status: 'closed' }] },
  }, '2026-11-13');
  assert.deepEqual(items.map((i) => i.kind), ['overdue', 'request', 'order', 'deal']);
  assert.deepEqual(items.map((i) => i.href), ['/sa/sales-orders/S1', '/requests/R1', '/sa/sales-orders/S2', '/sa/deals/D1']);
  assert.equal(items[0].amount, 700);
});

test('ต้องตามต่อ: กลุ่มที่ไม่มีสิทธิ์ไม่มีรายการ (มติ 4)', () => {
  assert.deepEqual(followUps({ sales: { visible: false }, finance: { visible: false }, requests: { visible: false } }), []);
});

test('ล่าสุด: เรียงใหม่ไปเก่า · ตัดตาม limit · ใบที่ยังไม่รับ/งวดที่ยังไม่รับรองไม่ขึ้น', () => {
  const ev = recentEvents({
    sales: {
      deals: [{ id: 'D1', code: 'DL-1', title: 'A', createdAt: '2026-10-01T00:00:00Z' }],
      quotations: [
        { id: 'Q1', quoteNumber: 'QT-1', dealId: 'D1', status: 'accepted', acceptedAt: '2026-10-05T00:00:00Z' },
        { id: 'Q2', quoteNumber: 'QT-2', dealId: 'D1', status: 'sent', acceptedAt: null },
      ],
      orders: [{ id: 'S1', orderNumber: 'SO-1', approvedAt: '2026-10-10T00:00:00Z' }],
    },
    finance: { installments: [{ id: 'I1', salesOrderId: 'S1', seq: 1, status: 'confirmed', confirmedAt: '2026-10-12T00:00:00Z' }, { id: 'I2', salesOrderId: 'S1', status: 'pending' }] },
    requests: { rows: [{ id: 'R1', docNo: 'RQ-1', title: 'x', status: 'closed', submittedAt: '2026-10-02T00:00:00Z', closedAt: '2026-10-20T00:00:00Z' }] },
  }, { limit: 4 });
  assert.deepEqual(ev.map((e) => e.key), ['rc:R1', 'i:I1', 'o:S1', 'q:Q1']);
});

