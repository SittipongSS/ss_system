// หน้าสินค้าศูนย์รวม งวด S1 (มติเจ้าของ 18/11/2026 · docs/product-hub-plan.md)
// ล็อก: ใบที่นับ = ตัวเดียวกับแท็บสินค้าหน้าลูกค้า · มูลค่า/จำนวน (แพ็ค × จำนวน) · ใบค่าสรรพสามิตไม่ใช่การขาย ·
//       ใบเสนอราคานับฉบับล่าสุด · ด่านสิทธิ์ของตัวโหลด = ด่านหน้าลูกค้า · query พัง = throw
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  productFollowUps, productMonthlyOrders, productOrderRows, productQuoteRows, productRecentEvents, productSalesFacts, productOrderText,
} from './productHub.js';
import { productOrderStats } from './customerHub.js';
import { productSalesRelations } from './productHubData.js';

const line = (over) => ({ qty: 3000, unitPrice: 32.8, lineTotal: 98400, unit: 'ชิ้น', ...over });

/* ── ตัวเลขบนหัว ─────────────────────────────────────────────────────────────────────── */
test('ยอดสั่งซื้อ: นับเฉพาะใบอนุมัติที่ยังมีผล (รวมใบย้อนหลัง) · ไม่นับรออนุมัติ/ถูกแทน/ยกเลิก/ค่าสรรพสามิต', () => {
  const sales = {
    visible: true,
    quotations: [],
    orders: [
      { id: 'S1', status: 'approved', origin: 'pipeline', orderDate: '2026-11-06', lines: [line()] },
      { id: 'S2', status: 'approved', origin: 'historical', orderDate: '2026-08-17', lines: [line({ qty: 1000, lineTotal: 32800 })] },
      { id: 'S3', status: 'pending_approval', origin: 'pipeline', orderDate: '2026-11-10', lines: [line()] },
      { id: 'S4', status: 'revised', supersededById: 'S1', origin: 'pipeline', orderDate: '2026-11-01', lines: [line()] },
      { id: 'S5', status: 'cancelled', origin: 'pipeline', orderDate: '2026-10-01', lines: [line()] },
      { id: 'SE', status: 'approved', origin: 'excise', orderDate: '2026-11-07', lines: [line({ lineTotal: 15000 })] },
    ],
  };
  const facts = productSalesFacts(sales);
  assert.deepEqual(facts.ordered, { amount: 131200, qty: 4000, orders: 2, lastDate: '2026-11-06' });
  const rows = productOrderRows(sales);
  assert.deepEqual(rows.map((r) => r.id), ['S3', 'S1', 'S4', 'S5', 'S2'], 'ใบค่าสรรพสามิตไม่ขึ้นแท็บการขาย · ใหม่ก่อน');
  assert.deepEqual(rows.filter((r) => r.counted).map((r) => r.id), ['S1', 'S2']);
});

test('ยอดของ FG บนหน้าสินค้า = ยอดของ FG เดียวกันบนแท็บสินค้าหน้าลูกค้า (ตัวตัดสินใบเดียวกัน)', () => {
  const orders = [
    { id: 'S1', status: 'approved', origin: 'pipeline', orderDate: '2026-11-06' },
    { id: 'S2', status: 'approved', origin: 'historical', orderDate: '2026-08-17' },
    { id: 'S3', status: 'pending_approval', origin: 'pipeline' },
    { id: 'SE', status: 'approved', origin: 'excise' },
  ];
  const lines = [
    { salesOrderId: 'S1', productId: 'P1', ...line() },
    { salesOrderId: 'S2', productId: 'P1', ...line({ lineTotal: 50000 }) },
    { salesOrderId: 'S3', productId: 'P1', ...line() },
    { salesOrderId: 'SE', productId: 'P1', ...line({ lineTotal: 999 }) },
  ];
  const customerSide = productOrderStats(lines, orders).byProduct.get('P1');
  const productSide = productSalesFacts({
    visible: true,
    quotations: [],
    orders: orders.map((o) => ({ ...o, lines: lines.filter((l) => l.salesOrderId === o.id) })),
  }).ordered;
  assert.equal(productSide.amount, customerSide.total);
  assert.equal(productSide.orders, customerSide.orders);
  assert.equal(productSide.lastDate, customerSide.lastDate);
});

test('จำนวน = แพ็ค × จำนวน (บรรทัดแพ็ค/เดือน) · สินค้าเดียวกันหลายบรรทัดบนใบเดียวรวมกัน · หลายราคา = null', () => {
  const [row] = productOrderRows({
    orders: [{
      id: 'S1', status: 'approved', origin: 'pipeline', orderDate: '2026-11-01',
      lines: [
        { qty: 12, packQty: 2, unitPrice: 3500, lineTotal: 84000, unit: 'เดือน' },
        { qty: 1, unitPrice: 1000, lineTotal: 1000, unit: 'เดือน' },
      ],
    }],
  });
  assert.equal(row.qty, 25);
  assert.equal(row.amount, 85000);
  assert.equal(row.unitPrice, null);
  assert.equal(row.packed, true);
});

test('ใบเสนอราคา: นับฉบับล่าสุดของสาย Rev. · Won = ฉบับล่าสุดที่รับแล้ว · ราคาล่าสุดจากฉบับล่าสุดที่ใหม่สุด', () => {
  const sales = {
    visible: true,
    orders: [],
    quotations: [
      { id: 'Q0', quoteNumber: 'QT-1-0', baseNumber: 'QT-1', revisionNo: 0, status: 'revised', quoteDate: '2026-11-06', createdAt: '2026-11-06T04:26:00Z', lines: [line({ unitPrice: 30 })] },
      { id: 'Q1', quoteNumber: 'QT-1-1', baseNumber: 'QT-1', revisionNo: 1, status: 'accepted', quoteDate: '2026-11-06', createdAt: '2026-11-06T04:31:00Z', lines: [line()] },
      { id: 'Q2', quoteNumber: 'QT-2-0', baseNumber: 'QT-2', revisionNo: 0, status: 'closed', quoteDate: '2026-08-17', createdAt: '2026-08-17T07:00:00Z', lines: [line({ unitPrice: 31 })] },
      { id: 'QE', quoteNumber: 'QT-E-0', baseNumber: 'QT-E', revisionNo: 0, origin: 'excise', status: 'accepted', quoteDate: '2026-11-10', lines: [line({ unitPrice: 5 })] },
    ],
  };
  const facts = productSalesFacts(sales);
  assert.deepEqual(facts.quotes, { count: 2, won: 1, lastPrice: 32.8, lastDate: '2026-11-06' });
  const rows = productQuoteRows(sales);
  assert.deepEqual(rows.map((r) => [r.id, r.latest]), [['Q1', true], ['Q0', false], ['Q2', true]]);
});

test('ไม่มีสิทธิ์โมดูลขาย = ไม่มีตัวเลข (null) ไม่ใช่ศูนย์', () => {
  assert.equal(productSalesFacts({ visible: false, quotations: [], orders: [] }), null);
  assert.equal(productSalesFacts(null), null);
});

test('ค้นเจอทั้งเลข SO · เลข PO ลูกค้า · รหัสดีล · ชื่อลูกค้าบนใบ', () => {
  const [row] = productOrderRows({ orders: [{ id: 'S1', orderNumber: 'SO-26110403-0', referenceDoc: 'PO6911262', customerName: 'สหมิตร', status: 'approved', lines: [] }] });
  const hay = productOrderText(row, 'DL-26080350');
  for (const q of ['so-26110403', 'po6911262', 'dl-26080350', 'สหมิตร']) assert.ok(hay.includes(q), q);
});

/* ── ตัวโหลด: ด่านสิทธิ์ = ด่านหน้าลูกค้า ─────────────────────────────────────────────────── */
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
    { id: 'D1', code: 'DL-1', team: 'KA', ownerId: 'u-ae', stage: 'won' },
    { id: 'D2', code: 'DL-2', team: 'OTHER', ownerId: 'u-x', stage: 'quotation' },
  ],
  quotations: [
    { id: 'Q1', dealId: 'D1', quoteNumber: 'QT-1', status: 'accepted' },
    { id: 'Q2', dealId: 'D2', quoteNumber: 'QT-2', status: 'sent' },
    { id: 'Q9', dealId: 'D1', quoteNumber: 'QT-9', status: 'sent' },
  ],
  sales_orders: [
    { id: 'S1', dealId: 'D1', origin: 'pipeline', status: 'approved' },
    { id: 'S2', dealId: 'D2', origin: 'pipeline', status: 'approved' },
    { id: 'SE', dealId: null, origin: 'excise', sourceSalesOrderId: 'S1', status: 'approved' },
  ],
  quotation_lines: [
    { id: 'QL1', quotationId: 'Q1', productId: 'P1' },
    { id: 'QL2', quotationId: 'Q2', productId: 'P1' },
    { id: 'QL9', quotationId: 'Q9', productId: 'P-other' },
  ],
  sales_order_lines: [
    { id: 'SL1', salesOrderId: 'S1', productId: 'P1' },
    { id: 'SL1b', salesOrderId: 'S1', productId: 'P1' },
    { id: 'SL2', salesOrderId: 'S2', productId: 'P1' },
    { id: 'SLE', salesOrderId: 'SE', productId: 'P1' },
  ],
};

test('ตัวโหลด: AE เห็นเฉพาะใบในขอบเขตตัวเอง · ใบหาจากบรรทัดของสินค้า · ติดบรรทัดของสินค้านี้ให้ทุกใบ', async () => {
  const ae = { id: 'u-ae', role: 'ae', team: 'KA', teams: ['KA'] };
  const sales = await productSalesRelations(fake(ROWS), 'P1', ae);
  assert.equal(sales.visible, true);
  assert.deepEqual(sales.quotations.map((q) => q.id), ['Q1'], 'Q9 ไม่มีสินค้านี้ · Q2 อยู่นอกขอบเขต');
  assert.deepEqual(sales.orders.map((o) => o.id).sort(), ['S1', 'SE'], 'ใบค่าสรรพสามิตตัดสินด้วยดีลของ SO ต้นทาง');
  assert.deepEqual(sales.orders.find((o) => o.id === 'S1').lines.map((l) => l.id), ['SL1', 'SL1b']);
  assert.deepEqual(sales.deals.map((d) => d.id), ['D1'], 'ไม่ส่งดีลของใบที่ถูกกรองทิ้ง');
});

test('ตัวโหลด: ไม่มีสิทธิ์โมดูลขาย = visible:false และไม่แตะฐาน', async () => {
  const touched = [];
  const spy = { from: (table) => { touched.push(table); return fake(ROWS).from(table); } };
  const sales = await productSalesRelations(spy, 'P1', { id: 'u-wh', role: 'wh' });
  assert.deepEqual(sales, { visible: false, quotations: [], orders: [], deals: [] });
  assert.deepEqual(touched, []);
});

test('ตัวโหลด: query พัง = throw ไม่ใช่ลิสต์ว่าง', async () => {
  const broken = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error('boom') }) }) }) }) }) };
  await assert.rejects(() => productSalesRelations(broken, 'P1', { id: 'a', role: 'admin' }), /boom/);
});

/* ── แท็บภาพรวม (S2 · มติ 4) ─────────────────────────────────────────────────────────────────── */
test('รายเดือน: 12 เดือนล่าสุดตามเวลาไทย · เดือนอนุมัติ (ถอย orderDate) · ใบที่นับเท่านั้น · มีทั้งมูลค่าและจำนวน', () => {
  const now = new Date('2026-11-18T05:00:00Z');
  const sales = {
    visible: true,
    quotations: [],
    orders: [
      // อนุมัติ 31 ต.ค. 20:00 UTC = 1 พ.ย. ตี 3 เวลาไทย ⇒ พ.ย.
      { id: 'S1', status: 'approved', origin: 'pipeline', approvedAt: '2026-10-31T20:00:00Z', lines: [line()] },
      { id: 'S2', status: 'approved', origin: 'historical', orderDate: '2026-08-17', lines: [line({ qty: 1000, lineTotal: 32800 })] },
      { id: 'S3', status: 'pending_approval', origin: 'pipeline', orderDate: '2026-11-10', lines: [line()] },
      { id: 'S4', status: 'approved', origin: 'pipeline', approvedAt: '2025-10-01T03:00:00Z', lines: [line()] },
    ],
  };
  const m = productMonthlyOrders(sales, { now });
  assert.equal(m.months.length, 12);
  assert.equal(m.months[0].month, '2025-12');
  assert.equal(m.months[11].month, '2026-11');
  assert.deepEqual(m.months[11], { month: '2026-11', amount: 98400, qty: 3000, orders: 1 });
  assert.deepEqual(m.months.find((x) => x.month === '2026-08'), { month: '2026-08', amount: 32800, qty: 1000, orders: 1 });
  assert.deepEqual(m.total, { amount: 131200, qty: 4000, orders: 2 }, 'ใบเก่ากว่า 12 เดือนไม่เข้ากราฟ · รออนุมัติไม่นับ');
});

test('ต้องตามต่อ: ตีกลับก่อน → ทะเบียน → SO รออนุมัติ → รออนุมัติสินค้า → BOM · แต่ละรายการพาไปแท็บของเรื่อง', () => {
  const sales = {
    visible: true, quotations: [],
    orders: [
      { id: 'S1', orderNumber: 'SO-1', status: 'approved', origin: 'pipeline', lines: [line()] },
      { id: 'S2', orderNumber: 'SO-2', status: 'pending_approval', origin: 'pipeline', lines: [line()] },
      { id: 'S3', orderNumber: 'SO-3', status: 'revised', supersededById: 'S1', origin: 'pipeline', lines: [line()] },
    ],
  };
  const items = productFollowUps({
    sales, approval: 'rejected', rejectionReason: 'ราคาผิด',
    exciseRec: { kind: 'unregistered' }, bom: { step: true, status: 'returned', reason: 'สูตรไม่ตรง' },
  });
  assert.deepEqual(items.map((i) => [i.key, i.tab]), [
    ['approval-rejected', 'info'], ['bom-returned', 'bom'], ['excise-unregistered', 'excise'], ['orders-waiting', 'sales'],
  ]);
  assert.match(items[2].detail, /อนุมัติแล้ว 1 ใบ/);
  assert.equal(items[2].tone, 'warning', 'มีใบสั่งขายแล้วแต่ยังไม่ขึ้นทะเบียน = เตือน');
  assert.equal(items[3].title, 'ใบสั่งขายยังไม่อนุมัติ 1 ใบ', 'ใบที่ถูก Rev. แทนไม่นับ');
});

test('ต้องตามต่อ: BOM ยังไม่ส่ง บอกว่าพร้อมส่งหรือติดอะไร · ไม่มีขั้น BOM/ไม่เห็นภาษี/ไม่เห็นการขาย = ไม่มีรายการของเรื่องนั้น', () => {
  assert.deepEqual(productFollowUps({ bom: { step: true, status: null, blockerShort: 'ยังไม่ผูกสูตร' } }).map((i) => [i.key, i.detail]), [['bom-blocked', 'ยังไม่ผูกสูตร']]);
  assert.deepEqual(productFollowUps({ bom: { step: true, status: null, blockerShort: '' } }).map((i) => i.key), ['bom-ready']);
  assert.deepEqual(productFollowUps({ bom: { step: false }, exciseRec: null, sales: { visible: false } }), []);
  assert.equal(productFollowUps({ exciseRec: { kind: 'unregistered' } })[0].tone, 'neutral', 'ยังไม่มีใบสั่งขาย = แค่บอก ไม่เตือน');
});

test('ล่าสุด: ใหม่ไปเก่า · ตัดตาม limit · SO เฉพาะใบอนุมัติที่ยังมีผล · QT เฉพาะที่ลูกค้ารับ · ผู้ไม่เห็นการขายไม่มีเหตุการณ์ QT/SO', () => {
  const product = { fgCode: 'FG-1', createdAt: '2026-07-01T04:00:00Z', approvedAt: '2026-11-02T10:47:00Z', bomSentAt: null };
  const sales = {
    visible: true,
    orders: [
      { id: 'S1', orderNumber: 'SO-1', status: 'approved', origin: 'pipeline', approvedAt: '2026-11-06T04:46:00Z', lines: [line()] },
      { id: 'S2', orderNumber: 'SO-2', status: 'pending_approval', origin: 'pipeline', approvedAt: null, lines: [line()] },
    ],
    quotations: [
      { id: 'Q1', quoteNumber: 'QT-1', status: 'accepted', acceptedAt: '2026-11-06T04:32:00Z', lines: [line()] },
      { id: 'Q2', quoteNumber: 'QT-2', status: 'sent', lines: [line()] },
    ],
  };
  const regs = [{ id: 'R1', customerName: 'สหมิตร', createdAt: '2026-11-03T02:00:00Z' }];
  const events = productRecentEvents({ product, sales, registrations: regs }, { unit: 'ชิ้น' });
  assert.deepEqual(events.map((e) => e.code), ['SO-1', 'QT-1', 'สรรพสามิต', 'FG-1', 'FG-1']);
  assert.equal(events[0].text, 'อนุมัติใบสั่งขาย · 3,000 ชิ้น');
  assert.equal(events[0].href, '/sa/sales-orders/S1');
  assert.equal(productRecentEvents({ product, sales, registrations: regs }, { limit: 2 }).length, 2);
  assert.deepEqual(productRecentEvents({ product, sales: { visible: false }, registrations: [] }).map((e) => e.key), ['p:approved', 'p:created']);
});
