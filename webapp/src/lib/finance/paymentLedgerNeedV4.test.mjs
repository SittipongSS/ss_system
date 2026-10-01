// ── ทะเบียนการชำระ × "ต้องวางบิลไหม" (รุ่นสี่ · system-design §6 · มติเจ้าของ 28–29/09) ────────────────────────────
// ⭐ ตรึง:
//   1. ลูกค้า/งวดที่ไม่ต้องวางบิลไม่มีสถานะวางบิลให้เห็น — ไม่มีเลยรอบ · ไม่มีคำชวน "ยังไม่มีวันวางบิล" · คำขอใบวางบิลเป็นขีด
//      (วันวางบิลที่เก็บอยู่แล้ว = ข้อยกเว้น "งวดนี้ต้องวางบิล" ยังขึ้นครบ ไม่ถูกซ่อน)
//   2. `?billing=missing` = ต้องวางบิลจริงแต่ยังไม่มีวัน — ไม่นับรูปเดิม { credit:false } · งวดที่ติ๊ก · รอเหตุการณ์
//   3. `?due=soon` = ชุดของกระดิ่ง "ครบกำหนดชำระ" เป๊ะ (ธงมาจากตัวคัดของกระดิ่ง) — รวมงวดที่รวมเข้ากระดิ่งวางบิล
//   4. คอลัมน์ "คำขอใบวางบิล" (ร่าง / ส่งแล้ว / ยังไม่ขอ / —) ทั้งจอ ชุดค้น และไฟล์ Excel · ลำดับคอลัมน์ของจอ
//   5. สายไฟ route → หน้า ของตัวกรองใหม่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEDGER_BILLING_DRAFT_TAG, LEDGER_BILLING_FILTERS, LEDGER_BILLING_MISSING_TAG, LEDGER_BILLING_REQUESTED_TAG,
  LEDGER_BILLING_RULE_UNSET, LEDGER_BILLING_UNREQUESTED_TAG, LEDGER_COLUMNS, LEDGER_DUE_FILTERS,
  filterLedger, groupLedgerByOrder, ledgerBillingFilter, ledgerBillingTally, ledgerDueFilter, ledgerDueTally, ledgerReport,
  ledgerRow, ledgerSummary,
} from './paymentLedger.js';
import { DUE_SOON_FN_HREF, dueSoonCandidates } from '@/lib/sales/billingDueNotify';
import { NO_BILLING_TEXT, UNKNOWN_TEXT } from '@/lib/sales/billingRule';

const TODAY = '2026-10-02'; // ศ. 2 ต.ค. 2026
const NONE = { v: 4, need: 'none' };
const NO_TIMING = { v: 4, need: 'required', billing: null };
const CREDIT30 = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
const SAME_DAY = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null };
const LEGACY = { credit: false };

const make = (extra = {}, { rule = CREDIT30, request = null, order = {}, dueRemind = false } = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.seq || 1}`, seq: 1, label: 'มัดจำ', percent: 50, amount: 1000, status: 'pending', evidence: [], ...extra,
  },
  order: { id: 'SOR-1', orderNumber: 'SO-26090230-0', customerId: 'CUS-1', ...order },
  quotation: null,
  customer: { id: 'CUS-1', name: 'บริษัท ตัวอย่าง จำกัด', arCode: 'AR-015', billingRule: rule },
  todayIso: TODAY,
  billingRequest: request,
  dueRemind,
});

// ── 1. ไม่ต้องวางบิล ────────────────────────────────────────────────────────────────────────────────
test('🔴 ลูกค้าไม่ต้องวางบิล: สถานะ "ไม่ต้องวางบิล" · ไม่ชวน · คำขอเป็นขีด · ไม่เข้าตัวกรองรอบวางบิลใด ๆ · ไม่ถูกนับว่าซ่อน', () => {
  const rows = [
    make({ id: 'n1', seq: 1, dueDate: '2026-10-04' }, { rule: NONE }),
    make({ id: 'n2', seq: 2, billingEvent: 'หลังส่งสินค้า' }, { rule: NONE }),
  ];
  const [a, b] = rows;
  assert.equal(a.billingStateKey, 'notNeeded');
  assert.equal(a.billingStatusLabel, NO_BILLING_TEXT);
  assert.equal(a.billingNeed, 'none');
  assert.equal(a.billingMissing, false);
  assert.equal(a.billingRuleActive, false);
  assert.equal(a.billingRuleText, NO_BILLING_TEXT);
  assert.equal(a.billingRequestState, '');
  assert.equal(a.billingRequestLabel, '—');
  assert.equal(b.billingStateKey, 'notNeeded', 'รอเหตุการณ์ของลูกค้าไม่ต้องวางบิล = เหตุการณ์ของกำหนดชำระ ไม่ใช่ของวางบิล');
  for (const value of LEDGER_BILLING_FILTERS.map((f) => f.value)) {
    assert.deepEqual(filterLedger(rows, { billing: value }), [], value);
  }
  assert.deepEqual(ledgerBillingTally(rows, { billing: '7d' }).hidden, { count: 0, amount: 0 });
  const [group] = groupLedgerByOrder(rows);
  assert.equal(group.nextBilling, null);
  assert.equal(group.billingMissing, 0);
  assert.equal(group.billingUnset, 0, 'ตัวนับดิบก็ไม่นับงวดที่ไม่ต้องวางบิล');
  assert.equal(group.billingWaiting, null, 'รอเหตุการณ์ไม่ขึ้นในเซลล์วางบิล');
  assert.deepEqual(group.dueWaiting, { seq: 2, event: 'หลังส่งสินค้า' }, 'พูดที่ช่องกำหนดชำระแทน (dueCellText)');
  assert.equal(group.billingNotNeeded, 2);
  assert.deepEqual(group.billingRequest, { state: '', label: '', seq: null });
  // คำที่ตาเห็นค้นเจอ
  assert.deepEqual(filterLedger(rows, { q: NO_BILLING_TEXT }).map((r) => r.id), ['n1', 'n2']);
});

test('⭐ ข้อยกเว้น "งวดนี้ต้องวางบิล" (ลูกค้าไม่ต้องวางบิลแต่งวดมีวันวางบิล) — สถานะวางบิลขึ้นครบ ไม่ถูกซ่อน', () => {
  const r = make({ billingDate: '2026-10-04' }, { rule: NONE });
  assert.equal(r.billingStateKey, 'soon');
  assert.equal(r.billingOverride, 'billing');
  assert.equal(r.billingRequestState, 'none');
  assert.equal(r.billingRequestLabel, LEDGER_BILLING_UNREQUESTED_TAG);
  assert.deepEqual(filterLedger([r], { billing: '7d' }).map((x) => x.id), ['SOI-1']);
});

test('🔴 งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" — ไม่ต้องวางบิลเฉพาะงวดนั้น · ไม่ชวน · งวดอื่นของใบยังชวน', () => {
  const skip = make({ id: 's1', seq: 1, billingSkip: true }, { rule: CREDIT30 });
  const other = make({ id: 's2', seq: 2 }, { rule: CREDIT30 });
  assert.equal(skip.billingSkip, true);
  assert.equal(skip.billingOverride, 'skip');
  assert.equal(skip.billingStateKey, 'notNeeded');
  assert.equal(skip.billingMissing, false);
  assert.equal(other.billingMissing, true);
  assert.deepEqual(filterLedger([skip, other], { billing: 'missing' }).map((r) => r.id), ['s2']);
  assert.equal(groupLedgerByOrder([skip, other])[0].billingMissing, 1);
});

// ── 2. ยังไม่มีวันวางบิล ────────────────────────────────────────────────────────────────────────────
test('⭐ `?billing=missing` = ต้องวางบิลจริง ไม่มีวัน ไม่รอเหตุการณ์ งวดรอชำระ — รูปเดิม/ยังไม่ระบุ/ไม่ต้องวางบิล ไม่นับ', () => {
  const rows = [
    make({ id: 'm1', seq: 1 }, { rule: CREDIT30 }), // ✓
    make({ id: 'm2', seq: 2 }, { rule: NO_TIMING }), // ✓ ต้องวางบิล · ยังไม่ตั้งรอบ
    make({ id: 'm3', seq: 3 }, { rule: LEGACY }), // รูปเดิม = ไม่ชวน (เท่า prod จนกว่า backfill)
    make({ id: 'm4', seq: 4 }, { rule: null }), // ยังไม่ระบุ
    make({ id: 'm5', seq: 5 }, { rule: NONE }),
    make({ id: 'm6', seq: 6, billingEvent: 'ก่อนผลิต' }, { rule: CREDIT30 }), // รอเหตุการณ์
    make({ id: 'm7', seq: 7, billingDate: '2026-10-20' }, { rule: CREDIT30 }), // มีวันแล้ว
    make({ id: 'm8', seq: 8, status: 'reported' }, { rule: CREDIT30 }), // แจ้งชำระแล้ว
  ];
  assert.equal(ledgerBillingFilter('missing'), 'missing');
  assert.deepEqual(filterLedger(rows, { billing: 'missing' }).map((r) => r.id), ['m1', 'm2']);
  assert.equal(ledgerBillingTally(rows, {}).counts.missing, 2);
  assert.deepEqual(ledgerBillingTally(rows, { billing: 'missing' }).hidden, { count: 0, amount: 0 }, 'ตัวกรองนี้คือชุดนั้นเอง');
  assert.equal(ledgerSummary(rows).billingMissingCount, 2);
  assert.equal(filterLedger(rows, { q: LEDGER_BILLING_MISSING_TAG }).length, 2, 'คำชวนที่ตาเห็นค้นเจอ');
  const option = LEDGER_BILLING_FILTERS.find((f) => f.value === 'missing');
  assert.equal(option.label, LEDGER_BILLING_MISSING_TAG);
  assert.ok(option.empty && option.hint);
  // ใบรูปเดิม: ตัวนับดิบยังนับ แต่ไม่ชวน (ธงรายงวด)
  const [legacy] = groupLedgerByOrder([rows[2]]);
  assert.equal(legacy.billingUnset, 1);
  assert.equal(legacy.billingMissing, 0);
});

test('ลูกค้าที่ยังไม่ระบุ: บรรทัดใต้ชื่อ = "ยังไม่ระบุว่าต้องวางบิลไหม" (คำเดียวกับการ์ดลูกค้า) · ค้นเจอ', () => {
  assert.equal(LEDGER_BILLING_RULE_UNSET, UNKNOWN_TEXT);
  const r = make({}, { rule: null });
  assert.equal(r.billingRuleText, '');
  assert.deepEqual(filterLedger([r], { q: 'ยังไม่ระบุว่าต้องวางบิลไหม' }).length, 1);
});

// ── 3. ครบกำหนด 0..3 วัน = ชุดของกระดิ่ง ──────────────────────────────────────────────────────────────
const ORDERS = new Map([
  ['A', { id: 'A', orderNumber: 'SO-A', status: 'approved', origin: 'pipeline', quotationId: 'QT-A', totalAmount: 100000, customerId: 'C-1' }],
  ['SAHA', { id: 'SAHA', orderNumber: 'SO-SAHA', status: 'approved', origin: 'pipeline', quotationId: 'QT-S', totalAmount: 100000, customerId: 'C-109' }],
]);
const CUSTOMERS = new Map([
  ['C-1', { id: 'C-1', arCode: 'AR-622', name: 'ลูกค้า', billingRule: SAME_DAY }],
  ['C-109', { id: 'C-109', arCode: 'AR-109', name: 'สหมิตร', billingRule: null }],
]);
const REQUESTS = new Map([['RQ-SENT', { id: 'RQ-SENT', status: 'pending' }]]);
const inst = (id, salesOrderId, over = {}) => ({
  id, salesOrderId, seq: 1, label: 'งวด', amount: 1000, status: 'pending', kind: 'regular', frozenAt: '2026-09-01T00:00:00Z',
  refundedAt: null, billingDate: null, billingEvent: null, dueDate: '2026-10-04', billingRequestId: null, ...over,
});
const INSTALLMENTS = [
  inst('in-plain', 'A'), // กำหนดชำระอย่างเดียว
  inst('in-merged', 'A', { seq: 2, billingDate: '2026-10-03', dueDate: '2026-10-03' }), // รวมกับกระดิ่งวางบิล — ยังอยู่ในชุด
  inst('in-sent', 'A', { seq: 3, billingDate: '2026-09-20', billingRequestId: 'RQ-SENT' }), // ขอใบแล้ว ยังเตือน
  inst('out-4d', 'A', { seq: 4, dueDate: '2026-10-06' }),
  inst('out-event', 'A', { seq: 5, billingEvent: 'หลังติดตั้ง' }), // รอเหตุการณ์ = เงียบ
  inst('out-reported', 'A', { seq: 6, status: 'reported' }),
  inst('out-saha', 'SAHA'),
];
function ledger() {
  const ids = new Set(dueSoonCandidates(INSTALLMENTS, {
    todayIso: TODAY, ordersById: ORDERS, customersById: CUSTOMERS, requestsById: REQUESTS, skipArCodes: ['AR-109'],
  }).map(({ installment }) => installment.id));
  return INSTALLMENTS.map((installment) => {
    const order = ORDERS.get(installment.salesOrderId);
    return ledgerRow({
      installment, order, customer: CUSTOMERS.get(order.customerId), todayIso: TODAY,
      billingRequest: REQUESTS.get(installment.billingRequestId) || null, dueRemind: ids.has(installment.id),
    });
  });
}

test('🔴 `?due=soon` = ชุดของกระดิ่งครบกำหนดเป๊ะ — รวมงวดที่รวมเข้ากระดิ่งวางบิล · ขอใบแล้วยังนับ · รอเหตุการณ์/สหมิตรไม่นับ', () => {
  const rows = ledger();
  const expected = ['in-plain', 'in-merged', 'in-sent'];
  assert.deepEqual(filterLedger(rows, { due: 'soon' }).map((r) => r.id).sort(), [...expected].sort());
  assert.equal(ledgerDueTally(rows, {}).counts.soon, 3);
  assert.equal(ledgerDueTally(rows, { due: 'soon', q: 'SO-SAHA' }).counts.soon, 0, 'เคารพตัวกรองอื่น');
  assert.equal(ledgerSummary(filterLedger(rows, { due: 'soon' })).dueSoonCount, 3);
  assert.equal(rows.find((r) => r.id === 'out-event').dueStateKey, 'waiting');
  // ไม่ส่งธง = ไม่อยู่ในชุด (ไม่เดาเอง)
  assert.equal(ledgerRow({ installment: inst('x', 'A'), order: ORDERS.get('A'), todayIso: TODAY }).dueSoon, false);
  // ค่าที่ไม่รู้จัก = ไม่กรอง
  assert.equal(filterLedger(rows, { due: 'week' }).length, rows.length);
  assert.equal(ledgerDueFilter('SOON'), '');
  const option = LEDGER_DUE_FILTERS.find((f) => f.value === 'soon');
  assert.equal(option.label, 'ครบกำหนดใน 3 วัน');
  assert.ok(option.empty && option.hint);
  // ก้อนของใบบอกจำนวนงวดที่ครบกำหนด (บรรทัดรองของ "กำหนดถัดไป")
  assert.equal(groupLedgerByOrder(rows.filter((r) => r.orderId === 'A'))[0].dueSoon, 3);
});

test('🔴 ลิงก์ของแถว FN "ครบกำหนดชำระ" ชี้ตัวกรองที่มีอยู่จริง — ค่าที่ไม่รู้จักถูกเมิน = ทะเบียนเปิดมาไม่กรองเลย', () => {
  const url = new URL(DUE_SOON_FN_HREF, 'http://x');
  assert.equal(url.pathname, '/finance/payments');
  assert.equal(ledgerDueFilter(url.searchParams.get('due')), 'soon');
});

// ── 4. คำขอใบวางบิล ──────────────────────────────────────────────────────────────────────────────
test('⭐ คำขอใบวางบิล: ส่งแล้ว / ร่าง / ยังไม่ขอ / — (ไม่มีวันวางบิล = ขีด ไม่ชวน) · ยกเลิกแล้ว = ไม่มีคำร้อง', () => {
  const dated = { billingDate: '2026-10-20', billingRequestId: 'RQ-1' };
  const state = (extra, request, rule) => make(extra, { request, rule }).billingRequestState;
  assert.equal(state(dated, { id: 'RQ-1', status: 'acknowledged' }), 'sent');
  assert.equal(state(dated, { id: 'RQ-1', status: 'draft' }), 'draft');
  assert.equal(state(dated, { id: 'RQ-1', status: 'cancelled' }), 'none');
  assert.equal(state(dated, null), 'none', 'คำร้องถูกลบ');
  assert.equal(state({ billingDate: '2026-10-20' }, null), 'none');
  assert.equal(state({}, null), '', 'ไม่มีวันวางบิล = ขีด');
  assert.equal(state({ billingDate: '2026-09-01', status: 'confirmed' }, null), '', 'งวดจบแล้ว');
  // คำร้องเป็นข้อเท็จจริง — ขึ้นแม้งวดไม่มีวันวางบิล/ลูกค้าเปลี่ยนเป็นไม่ต้องวางบิลทีหลัง
  assert.equal(state({ billingRequestId: 'RQ-1' }, { id: 'RQ-1', status: 'pending' }, NONE), 'sent');
  assert.equal(make(dated, { request: { id: 'RQ-1', status: 'draft' } }).billingRequestLabel, LEDGER_BILLING_DRAFT_TAG);
  assert.equal(make(dated, { request: { id: 'RQ-1', status: 'pending' } }).billingRequestLabel, LEDGER_BILLING_REQUESTED_TAG);
  // ร่าง ≠ ขอแล้ว — "เลยรอบ ยังไม่ขอใบ" ยังนับ
  assert.equal(make({ billingDate: '2026-09-20', billingRequestId: 'RQ-1' }, { request: { id: 'RQ-1', status: 'draft' } }).billingLate, true);
});

test('คำขอระดับใบ = คำขอของงวดในเซลล์ "วางบิลถัดไป" · วางบิลแล้วรอเงิน = ส่งแล้ว · ค้นด้วยคำในคอลัมน์ได้', () => {
  const draft = { request: { id: 'RQ-D', status: 'draft' } };
  const rows = [
    make({ id: 'r1', seq: 1, billingDate: '2026-10-10', billingRequestId: 'RQ-D' }, draft),
    make({ id: 'r2', seq: 2, billingDate: '2026-11-10' }),
  ];
  const [group] = groupLedgerByOrder(rows);
  assert.equal(group.nextBilling.id, 'r1');
  assert.deepEqual(group.billingRequest, { state: 'draft', label: LEDGER_BILLING_DRAFT_TAG, seq: 1 });
  const [billed] = groupLedgerByOrder([
    make({ id: 'b1', seq: 1, billingDate: '2026-09-10', billingRequestId: 'RQ-S' }, { request: { id: 'RQ-S', status: 'pending' } }),
  ]);
  assert.equal(billed.nextBilling, null);
  assert.equal(billed.billingRequest.state, 'sent');
  assert.deepEqual(filterLedger(rows, { q: LEDGER_BILLING_DRAFT_TAG }).map((r) => r.id), ['r1']);
  assert.deepEqual(filterLedger(rows, { q: LEDGER_BILLING_UNREQUESTED_TAG }).map((r) => r.id), ['r2']);
});

test('🔴 ไฟล์ Excel: "คำขอใบวางบิล" ต่อจากกำหนดชำระ เป็นคำ (ไม่ใช่ boolean) · ค่าออกมาจริงในรายงาน', () => {
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  assert.equal(keys.indexOf('billingRequestLabel'), keys.indexOf('dueDate') + 1);
  const col = LEDGER_COLUMNS.find((c) => c.key === 'billingRequestLabel');
  assert.equal(col.label, 'คำขอใบวางบิล');
  assert.ok(!col.date && !col.num && !col.money);
  const report = ledgerReport([make({ billingDate: '2026-10-20' }), make({ seq: 2 }, { rule: NONE })]);
  assert.deepEqual(report.rows.map((r) => r.billingRequestLabel), [LEDGER_BILLING_UNREQUESTED_TAG, '—']);
  assert.ok(!keys.includes('dueSoon') && !keys.includes('billingMissing'), 'ธง boolean ลง Excel เป็น TRUE/FALSE');
});

// ── 5. สายไฟ ─────────────────────────────────────────────────────────────────────────────────────────
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('route: ธง `dueSoon` มาจากตัวคัดของกระดิ่งด้วยวัตถุดิบชุดเดียวกับ `billing=soon` แล้วถึง ledgerRow · ตัวนับถึงหน้า', () => {
  const route = read('../../app/api/finance/payments/route.js');
  const block = route.slice(route.indexOf('const dueRemindIds = new Set(dueSoonCandidates(rows, {'), route.indexOf('const ledger = rows'));
  assert.ok(block.length > 0, 'route ไม่ถามตัวคัดของกระดิ่งครบกำหนด');
  assert.match(block, /quotation: quoteById\.get\(o\.quotationId\) \|\| null/);
  assert.match(block, /customersById: customerById,/);
  assert.match(block, /requestsById: billingRequestById,/);
  assert.match(block, /skipArCodes: \[SAHAMIT_AR_CODE\],/);
  assert.match(route, /dueRemind: dueRemindIds\.has\(installment\.id\),/);
  assert.match(route, /const dueTally = ledgerDueTally\(all, filters\);/);
  assert.match(route.slice(route.indexOf('return ok({')), /\bdueTally,/);
  const page = read('../../app/finance/payments/page.js');
  assert.match(page, /dueTally: body\.dueTally \|\| null,/);
  assert.match(page, /key: "due", label: "ครบกำหนดชำระ"/);
});

test('หน้า: คอลัมน์ วางบิลถัดไป → กำหนดถัดไป → คำขอใบวางบิล → ค้างรับ · colSpan ตรงจำนวนคอลัมน์', () => {
  const page = read('../../app/finance/payments/page.js');
  const head = page.slice(page.indexOf('<thead>'), page.indexOf('</thead>'));
  const labels = [...head.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1].trim());
  const at = (label) => labels.indexOf(label);
  assert.ok(at('วางบิลถัดไป') >= 0 && at('วางบิลถัดไป') < at('กำหนดถัดไป'));
  assert.equal(at('คำขอใบวางบิล'), at('กำหนดถัดไป') + 1);
  assert.equal(at('ค้างรับ'), at('คำขอใบวางบิล') + 1);
  for (const [, n] of page.matchAll(/colSpan=\{(\d+)\}/g)) assert.equal(Number(n), labels.length, 'colSpan ต้องเท่าจำนวนคอลัมน์');
  // แถวเรียงเซลล์ตามหัวเดียวกัน: เซลล์คำขออยู่ระหว่างกำหนดถัดไปกับค้างรับ
  const row = page.slice(page.indexOf('const orderRow = (group) =>'), page.indexOf('return (\n    <Workspace'));
  assert.ok(row.indexOf('group.nextDue') < row.indexOf('<BillingRequestCell') && row.indexOf('<BillingRequestCell') < row.indexOf('group.summary.outstandingAmount'));
});
