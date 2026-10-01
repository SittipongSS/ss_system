// ── ทะเบียนการชำระ: วันตัดรอบ `?billing=cutoff&on=` + รอบของลูกค้าบนแถว (v5 ปฏิทินรายปี · มติเจ้าของ 29/09 · contract §5) ──
// ⭐ ตรึงสี่เรื่อง:
//   1. `cutoff` ต้องมีวันประกอบ — ไม่มี/ผิดรูป = ไม่กรอง (ลิงก์พิมพ์ผิดต้องไม่ทำให้ทะเบียนว่าง) · ไม่อยู่ในเมนูตามปกติ
//   2. ⭐ ชุดที่ลิงก์เปิด = ชุดที่หัวข้อแถว FN ของกระดิ่งวันตัดรอบนับ (เช้าที่ยิง) — ธงมาจาก `billingCutoffOnIndex` แบบเดียวกับ route
//   3. แถวลูกค้า: "รอบถัดไป" (`nextRunInfo`) + แถบ "ขอปฏิทิน YYYY" เมื่อถึงช่วงเตือน · เซลล์วางบิลถัดไป: บรรทัดตัดรอบ / "ยังไม่มีปฏิทิน"
//   4. สายไฟ route → ledgerRow → groupLedgerByOrder → หน้า (whitelist ทุกชั้น)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEDGER_BILLING_CUTOFF, LEDGER_BILLING_FILTERS, filterLedger, groupLedgerByOrder, ledgerBillingFilter,
  ledgerBillingFilterOptions, ledgerBillingTally, ledgerCustomerOutlook, ledgerCutoffFilterOption, ledgerCutoffOn,
  ledgerCutoffText, ledgerRow,
} from './paymentLedger.js';
import { billingCutoffNotices, billingCutoffOnIndex } from '@/lib/sales/billingDueNotify';

const MEEMETTA_TABLE = [
  [1, 9, 15, 22, 30], [2, 6, 16, 19, 27], [3, 6, 16, 23, 31], [4, 2, 16, 22, 30],
  [5, 8, 15, 21, 29], [6, 8, 15, 22, 30], [7, 8, 15, 23, 30], [8, 10, 17, 21, 31],
  [9, 8, 15, 22, 30], [10, 8, 15, 21, 30], [11, 9, 16, 20, 30], [12, 8, 15, 22, 30],
];
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const RUNS = MEEMETTA_TABLE.flatMap(([m, c1, p1, c2, p2]) => [{ cutoff: d26(m, c1), pay: d26(m, p1) }, { cutoff: d26(m, c2), pay: d26(m, p2) }]);
const meemetta = (creditDays) => ({
  v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays, runs: { kind: 'calendar', cutoffTime: '16:00', years: { 2026: { runs: RUNS } } },
});
const MEE = 'บริษัท มีเมตตา จำกัด';
const TODAY = '2026-10-20';

const ORDERS = [
  { id: 'A', orderNumber: 'SO-A', status: 'approved', origin: 'pipeline', quotationId: 'QT-A', totalAmount: 100000, customerId: 'C-281', customerName: MEE },
  { id: 'Z', orderNumber: 'SO-Z', status: 'cancelled', origin: 'pipeline', quotationId: 'QT-Z', totalAmount: 100000, customerId: 'C-281', customerName: MEE },
  { id: 'S', orderNumber: 'SO-S', status: 'approved', origin: 'pipeline', quotationId: 'QT-S', totalAmount: 100000, customerId: 'C-109', customerName: 'สหมิตร' },
];
const QUOTES = new Map(['A', 'Z', 'S'].map((id) => [`QT-${id}`, { id: `QT-${id}`, status: 'accepted', quoteNumber: `QT-${id}` }]));
const CUSTOMERS = new Map([
  ['C-281', { id: 'C-281', arCode: 'AR-281', name: MEE, billingRule: meemetta(0) }],
  ['C-109', { id: 'C-109', arCode: 'AR-109', name: 'สหมิตร', billingRule: meemetta(0) }],
]);
const REQUESTS = new Map([['RQ-SENT', { id: 'RQ-SENT', status: 'pending' }]]);
const inst = (id, salesOrderId, over = {}) => ({
  id, salesOrderId, seq: 1, label: '', amount: 1000, status: 'pending', kind: 'regular', frozenAt: '2026-09-20T03:00:00Z',
  refundedAt: null, billingDate: '2026-10-21', billingEvent: null, dueDate: null, billingRequestId: null, ...over,
});
const INSTALLMENTS = [
  inst('in-1', 'A', { seq: 1 }),
  inst('in-2', 'A', { seq: 2, billingDate: '2026-10-15' }), // เลยวันวางบิล ยังรอรอบ 21 ต.ค.
  inst('out-sent', 'A', { seq: 3, billingRequestId: 'RQ-SENT' }),
  inst('out-next', 'A', { seq: 4, billingDate: '2026-11-09' }),
  inst('out-dead', 'Z'), // ใบยกเลิก — ทะเบียนตัดเป็นงวดโมฆะ กระดิ่งก็ไม่นับ
  inst('out-saha', 'S'), // สหมิตร — เงินนอกระบบ (แถวยังอยู่ในทะเบียน แต่ไม่อยู่ในชุดของกระดิ่ง)
  inst('gap', 'A', { seq: 5, billingDate: '2026-12-23' }), // ตกปี 2027 ที่ยังไม่มีปฏิทิน
];
const ordersById = new Map(ORDERS.map((o) => [o.id, { ...o, quotation: QUOTES.get(o.quotationId) || null }]));
const bellCtx = { todayIso: TODAY, ordersById, customersById: CUSTOMERS, requestsById: REQUESTS, skipArCodes: ['AR-109'] };

/* แบบเดียวกับ route: ธงจากตัวคัดของกระดิ่ง ครั้งเดียว → ledgerRow */
function ledger(todayIso = TODAY) {
  const cutoffOnById = billingCutoffOnIndex(INSTALLMENTS, { ...bellCtx, todayIso });
  return INSTALLMENTS
    .filter((row) => row.salesOrderId !== 'Z') // route ตัดงวดโมฆะของใบยกเลิกก่อน ledgerRow
    .map((installment) => {
      const o = ORDERS.find((row) => row.id === installment.salesOrderId);
      return ledgerRow({
        installment, order: o, quotation: QUOTES.get(o.quotationId), customer: CUSTOMERS.get(o.customerId), todayIso,
        billingRequest: REQUESTS.get(installment.billingRequestId) || null, cutoffOn: cutoffOnById.get(installment.id) || null,
      });
    });
}

test('`cutoff` ต้องมีวันที่ใช้ได้ — ไม่มี/ผิดรูป/วันที่ไม่มีจริง = ไม่กรอง · ไม่อยู่ในเมนูตามปกติ', () => {
  assert.equal(ledgerBillingFilter('cutoff', '2026-10-21'), LEDGER_BILLING_CUTOFF);
  for (const on of ['', '2026-10-32', '21/10/2026', null, undefined]) assert.equal(ledgerBillingFilter('cutoff', on), '', String(on));
  assert.equal(ledgerBillingFilter('soon', '2026-10-21'), 'soon', 'ค่าเดิมไม่ขึ้นกับ on');
  assert.equal(ledgerCutoffOn('2026-02-30'), '');
  assert.equal(LEDGER_BILLING_FILTERS.some((f) => f.value === 'cutoff'), false, 'เปิดได้ทางลิงก์ของกระดิ่งเท่านั้น');
  assert.deepEqual(ledgerBillingFilterOptions('', ''), [...LEDGER_BILLING_FILTERS]);
  assert.deepEqual(ledgerBillingFilterOptions('cutoff', 'bogus'), [...LEDGER_BILLING_FILTERS]);
  const options = ledgerBillingFilterOptions('cutoff', '2026-10-21');
  assert.equal(options.at(-1).value, 'cutoff', 'กรองอยู่ = มีตัวเลือกให้เห็นและกดถอด');
  assert.equal(ledgerCutoffFilterOption('2026-10-21').label, 'วางบิลให้ทันรอบภายใน พ. 21 ต.ค. 2026 · ยังไม่ขอใบ');
  assert.ok(ledgerCutoffFilterOption('2026-10-21').empty && ledgerCutoffFilterOption('2026-10-21').hint);
  assert.equal(ledgerCutoffFilterOption(''), null);
});

test('⭐ ลิงก์ของแถว FN เปิดมาเจอเท่าที่หัวข้อนับ (เช้าที่ยิง) — ทุกเหตุที่กระดิ่งตัด ทะเบียนก็ตัด', () => {
  const { fn, candidates } = billingCutoffNotices(INSTALLMENTS, { ...bellCtx, holidays: null, directory: new Map([['F1', { id: 'F1', role: 'finance', department: 'FN' }]]) });
  assert.equal(fn.length, 1);
  const url = new URL(fn[0].href, 'http://x');
  assert.equal(url.pathname, '/finance/payments');
  const billing = url.searchParams.get('billing');
  const on = url.searchParams.get('on');
  assert.equal(ledgerBillingFilter(billing, on), LEDGER_BILLING_CUTOFF, 'ค่าในลิงก์ต้องเป็นตัวกรองที่ทะเบียนรู้จัก');
  const opened = filterLedger(ledger(), { billing, on }).map((r) => r.id).sort();
  assert.deepEqual(opened, candidates.map((c) => c.installment.id).sort());
  assert.deepEqual(opened, ['in-1', 'in-2']);
  assert.match(fn[0].title, new RegExp(`· ${opened.length} งวด `));
  // เปิดวันหลัง (ธงไม่ใช่ "ยิงวันนี้") ได้ชุดเดียวกันจนกว่าจะมีคนขอใบ
  assert.deepEqual(filterLedger(ledger('2026-10-26'), { billing, on }).map((r) => r.id).sort(), opened);
  // วันผิดรูป = ไม่กรอง (ทะเบียนเต็ม ไม่ใช่ว่าง)
  assert.equal(filterLedger(ledger(), { billing, on: 'bogus' }).length, ledger().length);
});

test('ตัวนับของตัวเลือกวันตัดรอบ + ไม่มี "ส่วนที่ซ่อน" (งวดไม่มีวันวางบิลไม่ใช่งวดของรอบนี้) · เคารพตัวกรองอื่น', () => {
  const rows = [...ledger(), ledgerRow({
    installment: inst('undated', 'A', { seq: 9, billingDate: null }), order: ORDERS[0], customer: CUSTOMERS.get('C-281'), todayIso: TODAY,
  })];
  const tally = ledgerBillingTally(rows, { billing: 'cutoff', on: '2026-10-21' });
  assert.equal(tally.counts.cutoff, 2);
  assert.deepEqual(tally.hidden, { count: 0, amount: 0 });
  assert.equal(ledgerBillingTally(rows, {}).counts.cutoff, 0, 'ไม่มีวัน = 0');
  assert.equal(ledgerBillingTally(rows, { billing: 'cutoff', on: '2026-10-21', q: 'ไม่มีคำนี้' }).counts.cutoff, 0);
  assert.ok(ledgerBillingTally(rows, { billing: 'late' }).hidden.count > 0, 'ตัวกรองเดิมยังบอกส่วนที่ซ่อนเหมือนเดิม');
});

test('แถวลูกค้า: "รอบถัดไป" ของตัวคิด (เวลาตัดรอบเฉพาะเครดิต 0) · แถบ "ขอปฏิทิน 2027" เมื่อถึงช่วงเตือน · ปฏิทินหมด = คำของช่องว่าง', () => {
  assert.deepEqual(ledgerCustomerOutlook(meemetta(0), '2026-09-28'), {
    nextRunText: 'วางบิลภายใน พฤ. 8 ต.ค. 2026 ก่อน 16:00 น. → กำหนดชำระ พฤ. 15 ต.ค. 2026 · ตามปฏิทินลูกค้า', calendarRequest: '',
  });
  assert.equal(ledgerCustomerOutlook(meemetta(30), '2026-09-28').nextRunText.includes('16:00'), false, 'เครดิต N ไม่พูดเวลา');
  assert.equal(ledgerCustomerOutlook(meemetta(0), '2026-11-23').calendarRequest, 'ขอปฏิทิน 2027');
  assert.equal(ledgerCustomerOutlook(meemetta(0), '2026-11-20').calendarRequest, '', 'ก่อนช่วงเตือน');
  assert.equal(ledgerCustomerOutlook(meemetta(0), '2026-12-23').nextRunText, 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้');
  assert.deepEqual(ledgerCustomerOutlook(null, '2026-09-28'), { nextRunText: '', calendarRequest: '' }, 'ไม่มีรอบ = ไม่มีบรรทัด');
  assert.deepEqual(ledgerCustomerOutlook(meemetta(0), null), { nextRunText: '', calendarRequest: '' });
  // ค่าที่ route คิดมาแล้ว (ครั้งเดียวต่อลูกค้า) ชนะการคิดสด
  const row = ledgerRow({
    installment: inst('x', 'A'), order: ORDERS[0], todayIso: TODAY,
    customer: { ...CUSTOMERS.get('C-281'), billingOutlook: { nextRunText: 'คิดที่ route', calendarRequest: 'ขอปฏิทิน 2027' } },
  });
  assert.deepEqual([row.customerNextRun, row.customerCalendarRequest], ['คิดที่ route', 'ขอปฏิทิน 2027']);
  const [group] = groupLedgerByOrder([row]);
  assert.deepEqual([group.customerNextRun, group.customerCalendarRequest], ['คิดที่ route', 'ขอปฏิทิน 2027']);
  // ตาเห็นบนแถว = ต้องค้นเจอ — "ขอปฏิทิน" หาลูกค้าที่ต้องทวงปฏิทินได้
  assert.equal(filterLedger([row], { q: 'ขอปฏิทิน' }).length, 1);
});

test('เซลล์วางบิลถัดไป: บรรทัดตัดรอบ (เครดิต 0 + เวลา / เครดิต N "ทันรอบจ่าย") · วันวางบิลตกปีที่ยังไม่มีปฏิทิน = "ยังไม่มีปฏิทิน 2027"', () => {
  assert.equal(ledgerCutoffText({ date: '2026-10-21', time: '16:00', kind: 'cutoffDay' }), 'ตัดรอบ พ. 21 ต.ค. ก่อน 16:00 น.');
  assert.equal(ledgerCutoffText({ date: '2026-10-21', kind: 'cutoffDay' }), 'ตัดรอบ พ. 21 ต.ค.');
  assert.equal(ledgerCutoffText({ date: '2026-10-10', kind: 'lastBillingDay' }), 'วางบิลภายใน ส. 10 ต.ค. ทันรอบจ่าย');
  assert.equal(ledgerCutoffText({}), '');
  const [c0] = groupLedgerByOrder([ledgerRow({ installment: inst('x', 'A'), order: ORDERS[0], customer: CUSTOMERS.get('C-281'), todayIso: TODAY })]);
  assert.equal(c0.nextBilling.cutoffText, 'ตัดรอบ พ. 21 ต.ค. ก่อน 16:00 น.');
  assert.equal(c0.nextBilling.calendarGap, '');
  const credit30 = { ...CUSTOMERS.get('C-281'), billingRule: meemetta(30) };
  const [c30] = groupLedgerByOrder([ledgerRow({ installment: inst('x', 'A', { billingDate: '2026-10-09' }), order: ORDERS[0], customer: credit30, todayIso: '2026-10-05' })]);
  assert.equal(c30.nextBilling.cutoffText, 'วางบิลภายใน ส. 10 ต.ค. ทันรอบจ่าย', 'เครดิต N ไม่พูดเวลา');
  const gapRow = ledgerRow({ installment: inst('gap', 'A', { billingDate: '2026-12-23' }), order: ORDERS[0], customer: CUSTOMERS.get('C-281'), todayIso: TODAY });
  assert.equal(gapRow.billingCalendarGap, 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้');
  assert.equal(gapRow.billingCutoffDate, null);
  assert.equal(groupLedgerByOrder([gapRow])[0].nextBilling.calendarGap, 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้');
  assert.equal(filterLedger([gapRow], { q: 'ยังไม่มีปฏิทิน' }).length, 1, 'ตาเห็นบนแถว = ต้องค้นเจอ');
  // ขอใบแล้วยังเห็นรอบ (ข้อเท็จจริงของรอบ) แต่ไม่อยู่ในชุดของตัวกรอง
  const sent = ledger().find((r) => r.id === 'out-sent');
  assert.equal(sent.billingCutoffDate, '2026-10-21');
  assert.equal(sent.billingCutoffOn, null);
});

test('route: ธงวันตัดรอบจากตัวคัดของกระดิ่ง (วัตถุดิบชุดเดียวกับ cron) · รอบของลูกค้าคิดครั้งเดียวต่อลูกค้า · `on` อยู่ใน literal ของตัวกรอง', () => {
  const route = readFileSync(new URL('../../app/api/finance/payments/route.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = route.slice(route.indexOf('const cutoffOnById = billingCutoffOnIndex(rows, {'), route.indexOf('const ledger = rows'));
  assert.ok(block.length > 0, 'route ไม่ถามตัวคัดของกระดิ่งวันตัดรอบ');
  assert.match(block, /todayIso,/);
  assert.match(block, /quotation: quoteById\.get\(o\.quotationId\) \|\| null/);
  assert.match(block, /customersById: customerById,/);
  assert.match(block, /requestsById: billingRequestById,/);
  assert.match(block, /skipArCodes: \[SAHAMIT_AR_CODE\],/);
  assert.match(route, /cutoffOn: cutoffOnById\.get\(installment\.id\) \|\| null,/);
  assert.match(route, /billingOutlook: ledgerCustomerOutlook\(c\.billingRule \?\? null, todayIso, \{ holidays \}\)/);
  assert.match(route, /loadLedgerCustomers\(supabase, customerIds\), holidaySet\(\),/);
  assert.match(route, /on: url\.searchParams\.get\('on'\) \|\| '',/);
});

test('หน้า: เซลล์วางบิลถัดไปวาดบรรทัดตัดรอบ/ช่องว่างปฏิทิน · แถวลูกค้าวาดรอบถัดไป + แถบขอปฏิทิน (ลิงก์ใส่ปฏิทินเฉพาะคนที่แก้ได้) · แจ้งตัวกรองวันตัดรอบ', () => {
  const page = readFileSync(new URL('../../app/finance/payments/page.js', import.meta.url), 'utf8');
  assert.match(page, /next\.calendarGap\s*\n?\s*\? <span className=\{`cell-sub \$\{styles\.billWarn\}`\}>\{next\.calendarGap\}<\/span>/);
  assert.match(page, /next\.cutoffText \? <span className="cell-sub">\{next\.cutoffText\}<\/span> : null/);
  assert.match(page, /group\.customerNextRun \? <span className="cell-sub">รอบถัดไป: \{group\.customerNextRun\}<\/span> : null/);
  assert.match(page, /<StatusBadge size="sm" tone="warning" label=\{group\.customerCalendarRequest\} \/>/);
  assert.match(page, /\{canSetBillingRule && group\.customerId \? \(\s*<>\s*\{" "\}\s*<Link[\s\S]{0,200}#billing-rule/);
  assert.match(page, /\{cutoffOption && \(\s*<StatusNotice tone="info"/);
});
