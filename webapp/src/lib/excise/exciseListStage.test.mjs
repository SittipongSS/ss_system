// มติเจ้าของ 03/11/2026: ทะเบียนใบสั่งขายมีแท็บ "สรรพสามิต" (ใบ SO ค่าสรรพสามิตอย่างเดียว) + ป้าย "สรรพสามิต · ขั้น" บนแถว SO ลูกค้า
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exciseListStage, loadExciseListStages, orderHasExciseLines } from './exciseListStage.js';
import { EMPTY_SALES_ORDER_FILTERS, EXCISE_LINE_VIEW, salesOrderPassesListFilters } from '../sales/salesOrderListFilter.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TYPES = [
  { mainCategoryCode: '01', typeCode: '002', isExcise: true },
  { mainCategoryCode: '03', typeCode: '010', isExcise: false },
];
const so = (over = {}) => ({ id: 'SO-C', orderNumber: 'SO-26100349-0', origin: 'pipeline', status: 'approved', exciseNotBilledKind: null, ...over });

test('มีสินค้าสรรพสามิตไหม: หมวดจากรหัส FG (ตัดช่องว่าง/แท็บท้าย) หรือหมวดของบรรทัดพิมพ์เอง × ธง isExcise', () => {
  assert.equal(orderHasExciseLines([{ fgCode: 'FG-108-01-002-0738\t\t' }], TYPES), true);
  assert.equal(orderHasExciseLines([{ fgCode: 'FG-332-03-010' }], TYPES), false);
  assert.equal(orderHasExciseLines([{ fgCode: null, categoryCode: '01-002' }], TYPES), true);
  assert.equal(orderHasExciseLines([], TYPES), false);
});

test('SO ลูกค้า: ไม่มีสินค้าสรรพสามิต = ไม่มีป้าย · ยังไม่อนุมัติ = บอกว่ามี · อยู่ในคิว SA = รอออกใบ (โทน SA)', () => {
  assert.equal(exciseListStage(so(), { needsExcise: false }), null);
  assert.deepEqual(exciseListStage(so({ status: 'pending_approval' }), { needsExcise: true }),
    { text: 'มีสินค้าสรรพสามิต · ออกใบค่าสรรพสามิตได้หลังอนุมัติ', tone: 'neutral' });
  assert.deepEqual(exciseListStage(so(), { needsExcise: true, awaiting: true }), { text: 'รอออกใบค่าสรรพสามิต', tone: 'warning' });
  assert.equal(exciseListStage(so(), { needsExcise: true, awaiting: true, rounds: [{ quote: { status: 'accepted' } }] }).text, 'รอออกใบค่าสรรพสามิตรอบถัดไป');
});

test('SO ลูกค้า: รอบล่าสุดบอกขั้น — ใบค่าสรรพสามิต → Won → SO ค่าสรรพสามิต → RA', () => {
  const quote = { quoteNumber: 'QT-26100568-2', status: 'sent', approvalStatus: 'approved' };
  assert.deepEqual(exciseListStage(so(), { needsExcise: true, rounds: [{ quote }] }),
    { text: 'ใบค่าสรรพสามิต QT-26100568-2 · อนุมัติแล้ว รอ Won', tone: 'info' });
  assert.equal(exciseListStage(so(), { needsExcise: true, rounds: [{ quote: { quoteNumber: 'QT-1', status: 'draft' } }] }).tone, 'warning', 'ร่าง = ตา SA');
  assert.deepEqual(exciseListStage(so(), { needsExcise: true, rounds: [{ quote: { ...quote, status: 'accepted' } }] }),
    { text: 'ใบค่าสรรพสามิต QT-26100568-2 Won · รอออก SO ค่าสรรพสามิต', tone: 'warning' });
  const exciseOrder = { id: 'SO-E', orderNumber: 'SO-26110390-0', status: 'approved' };
  assert.deepEqual(exciseListStage(so(), { needsExcise: true, rounds: [{ quote: { ...quote, status: 'accepted' }, exciseOrder }] }),
    { text: 'SO ค่าสรรพสามิต SO-26110390-0 · รอ RA ยื่นกรม', tone: 'info' });
  const two = [{ quote, exciseOrder, filing: { status: 'complete' } }, { quote, exciseOrder, filing: { status: 'filing' } }];
  assert.deepEqual(exciseListStage(so(), { needsExcise: true, rounds: two }), { text: 'รอบที่ 2 · ค่าสรรพสามิต · RA กำลังยื่น', tone: 'info' });
  assert.equal(exciseListStage(so(), { needsExcise: true, rounds: [{ quote, exciseOrder, filing: { status: 'complete' } }] }).tone, 'success');
});

test('SO ลูกค้าไม่เรียกเก็บ: บอกเหตุ · เหตุที่ RA ยังยื่น = ขั้นของ RA · ไม่ต้องยื่น = จบ', () => {
  assert.deepEqual(exciseListStage(so({ exciseNotBilledKind: 'collected_outside' }), { needsExcise: true }),
    { text: 'ไม่เรียกเก็บในระบบ · เก็บเงินลูกค้านอกระบบแล้ว · รอ RA ยื่นกรม', tone: 'info' });
  assert.deepEqual(exciseListStage(so({ exciseNotBilledKind: 'collected_outside' }), { needsExcise: true, filing: { status: 'complete' } }),
    { text: 'ไม่เรียกเก็บในระบบ · เก็บเงินลูกค้านอกระบบแล้ว · ชำระกรมแล้ว', tone: 'success' });
  assert.deepEqual(exciseListStage(so({ exciseNotBilledKind: 'paid_before_launch' }), { needsExcise: true }),
    { text: 'ไม่เรียกเก็บในระบบ · จ่ายกรมไปแล้วก่อนเปิดระบบ', tone: 'success' });
  assert.equal(exciseListStage(so(), { needsExcise: true }).text, 'ไม่มีรายการที่ต้องยื่นภาษี', 'อนุมัติแล้ว ไม่อยู่ในคิว ไม่มีรอบ');
});

test('SO ค่าสรรพสามิต: บอกว่าเป็นของ SO ไหน + ขั้นของ RA', () => {
  const excise = { id: 'SO-E', origin: 'excise', status: 'approved' };
  assert.deepEqual(exciseListStage(excise, { sourceOrderNumber: 'SO-26080009-0' }), { text: 'ของ SO-26080009-0 · รอ RA ยื่นกรม', tone: 'info' });
  assert.deepEqual(exciseListStage(excise, { sourceOrderNumber: 'SO-26080009-0', filing: { status: 'complete' } }),
    { text: 'ของ SO-26080009-0 · ชำระกรมแล้ว', tone: 'success' });
});

test('แท็บ "สรรพสามิต" = ใบ SO ค่าสรรพสามิตอย่างเดียว · แท็บสายธุรกิจเดิมไม่เปลี่ยน', () => {
  const tab = { ...EMPTY_SALES_ORDER_FILTERS, lineView: EXCISE_LINE_VIEW };
  assert.equal(salesOrderPassesListFilters({ origin: 'excise', businessLine: null }, tab), true);
  assert.equal(salesOrderPassesListFilters({ origin: 'pipeline', businessLine: 'PRODUCT' }, tab), false);
  assert.equal(salesOrderPassesListFilters({ origin: 'excise', businessLine: null }, { ...EMPTY_SALES_ORDER_FILTERS, lineView: 'PRODUCT' }), false);
  const page = read('../../app/sales-planning/sales-orders/page.js');
  assert.match(page, /\{ value: EXCISE_LINE_VIEW, label: "สรรพสามิต \(Excise\)" \}/, 'ป้ายไทย + อังกฤษแบบแท็บสายธุรกิจ');
  assert.doesNotMatch(page, /SalesOrderBundleButton|type="checkbox"/, 'ชุดเอกสารโหลดที่รายงานยอดขายที่เดียว (มติ 03/11)');
  assert.match(page, /\.concat\(row\.exciseStage \? `สรรพสามิต \$\{row\.exciseStage\.text\}` : null\)/, 'ตาเห็นบนแถว = ต้องค้นเจอ');
  const route = read('../../app/api/sales-planning/sales-orders/route.js');
  assert.match(route, /exciseStage: exciseStages\.get\(row\.id\) \|\| null,/);
});

// ฐานจำลองแบบเล็ก (อ่านอย่างเดียว) — กรอง eq/in · ไม่มีวันแตะฐานจริง
function fakeDb(tables) {
  const run = (q) => ({
    data: (tables[q.table] || []).filter((row) => q.filters.every(([op, column, value]) => (op === 'in' ? value.includes(row[column]) : row[column] === value))),
    error: null,
  });
  return {
    from: (table) => {
      const q = { table, filters: [] };
      const builder = {
        select: () => builder, order: () => builder, range: () => builder,
        eq: (column, value) => { q.filters.push(['eq', column, value]); return builder; },
        in: (column, value) => { q.filters.push(['in', column, value]); return builder; },
        then: (resolve, reject) => Promise.resolve(run(q)).then(resolve, reject),
      };
      return builder;
    },
  };
}

test('ตัวโหลด: ประกอบรอบจากใบค่าสรรพสามิต + SO ค่าสรรพสามิตในทะเบียน + ใบยื่น · คิว SA จากตัวเดียวกับแดชบอร์ด (ไม่ตัด 100 แถว)', async () => {
  const orders = [
    so({ id: 'SO-A', orderNumber: 'SO-A' }),
    so({ id: 'SO-B', orderNumber: 'SO-B' }),
    so({ id: 'SO-N', orderNumber: 'SO-N' }),
    { id: 'SO-E', orderNumber: 'SO-E', origin: 'excise', status: 'approved', quotationId: 'QT-B', sourceSalesOrderId: 'SO-B', supersededById: null },
  ];
  const linesByOrder = new Map([
    ['SO-A', [{ fgCode: 'FG-1-01-002-1' }]], ['SO-B', [{ fgCode: 'FG-1-01-002-2' }]], ['SO-N', [{ fgCode: 'FG-1-03-010-1' }]],
  ]);
  const db = fakeDb({
    product_types: TYPES,
    quotations: [{ id: 'QT-B', quoteNumber: 'QT-B', sourceSalesOrderId: 'SO-B', status: 'accepted' }],
    orders: [{ id: 'F-1', status: 'filing', salesOrderId: 'SO-B', exciseSalesOrderId: 'SO-E' }],
  });
  let limit = null;
  const stages = await loadExciseListStages(db, orders, {
    linesByOrder,
    loadAwaiting: async (_supabase, dealIds, options) => { limit = options.limit; assert.equal(dealIds, null); return [{ id: 'SO-A' }]; },
  });
  assert.equal(limit, Infinity);
  assert.deepEqual(stages.get('SO-A'), { text: 'รอออกใบค่าสรรพสามิต', tone: 'warning' });
  assert.deepEqual(stages.get('SO-B'), { text: 'ค่าสรรพสามิต · RA กำลังยื่น', tone: 'info' });
  assert.equal(stages.has('SO-N'), false, 'ไม่มีสินค้าสรรพสามิต');
  assert.deepEqual(stages.get('SO-E'), { text: 'ของ SO-B · RA กำลังยื่น', tone: 'info' });
});

test('คิวงานของฉัน: ทะเบียนที่ตา SA (ร่าง · ตีกลับ) เข้าคิว "เอกสาร" พาไปทางกลาง /go/registration (มติ 03/11)', async () => {
  const { buildMyQueue } = await import('../salesPlanning/myQueue.js');
  const queue = buildMyQueue({
    registrations: [
      { id: 'REG-1', status: 'rejected', fgCode: 'FG-1-01-002-1', customerName: 'ลูกค้า ก', rejectionReason: 'ขาดฉลาก', updatedAt: '2026-11-01T03:00:00Z' },
      { id: 'REG-2', status: 'draft', fgCode: 'FG-1-01-002-2', customerName: 'ลูกค้า ข', updatedAt: '2026-11-02T03:00:00Z' },
    ],
    todayIso: '2026-11-03',
  });
  const one = queue.find((item) => item.id === 'REG-1');
  assert.equal(one.kind, 'document');
  assert.equal(one.step, 'แก้ทะเบียนสรรพสามิต');
  assert.equal(one.sub, 'FG-1-01-002-1 · รอแก้ไข (ตีกลับ) · ขาดฉลาก');
  assert.equal(one.href, '/go/registration/REG-1');
  assert.equal(queue.find((item) => item.id === 'REG-2').step, 'ส่งทะเบียนสรรพสามิต');
  const route = read('../../app/api/sales-planning/my-dashboard/route.js');
  assert.match(route, /registrations: await loadMyExciseRegistrations\(supabase, \{ user, customerIds: myDeals\.map\(\(deal\) => deal\.customerId\) \}\)/);
  const tab = read('../../components/salesPlanning/dashboard/MyDashboardTab.js');
  assert.match(tab, /registrations: handoff\.registrations \|\| \[\],/);
});
