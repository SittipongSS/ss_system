// ── ทะเบียนการชำระ `?billing=soon` = ชุดของกระดิ่ง "ถึงรอบวางบิล" เป๊ะ (กำหนดวางบิล รอบสอง · 26/09 · มติเจ้าของ ข้อ 4) ──
// 🐞 ก่อนรอบสอง: แถว FN บอก "ถึงรอบวางบิลใน 3 วัน · 2 งวด" แต่ลิงก์เปิด `?billing=7d` ซึ่งรวมงวดที่ขอใบแล้ว + 4–7 วัน
//    ⇒ เปิดมาเจอ 6 งวด ไม่มีใครบอกได้ว่าสองงวดไหน
// ⭐ ตรึง: ธงของแถวมาจากตัวคัดของกระดิ่ง (`billingDueCandidates`) ไม่ใช่คิดซ้ำ ⇒ ทุกกรณีที่กระดิ่งตัด (ขอใบแล้ว · ร่างที่ QT
//    ถูกถอด Won · ใบย้อนหลังยังไม่อนุมัติ · ลูกค้าสหมิตร · 4 วันขึ้นไป) ทะเบียนก็ตัด · และสายไฟจาก route ถึงหน้าไม่ขาด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEDGER_BILLING_FILTERS, filterLedger, ledgerBillingFilter, ledgerBillingTally, ledgerRow,
} from './paymentLedger.js';
import { BILLING_DUE_FN_HREF, billingDueCandidates } from '@/lib/sales/billingDueNotify';
import { BILLING_REMIND_DAYS } from '@/lib/sales/billingRule';

const TODAY = '2026-10-02'; // ศ. 2 ต.ค. 2026 (ตัวอย่างของม็อก E)

const order = (id, over = {}) => ({
  id, orderNumber: `SO-${id}`, status: 'approved', origin: 'pipeline', quotationId: `QT-${id}`, totalAmount: 100000,
  customerId: 'C-267', customerName: 'บริษัท เจอร์นัล แล็บ จำกัด', ...over,
});
const inst = (id, salesOrderId, over = {}) => ({
  id, salesOrderId, seq: 1, label: 'มัดจำ', amount: 1000, status: 'pending', kind: 'regular',
  frozenAt: '2026-08-20T03:00:00Z', refundedAt: null, billingDate: '2026-10-05', billingEvent: null, billingRequestId: null,
  ...over,
});

/* โลกเล็ก ๆ ที่มีครบทุกเหตุที่กระดิ่งตัด — ทะเบียนต้องตัดตรงกันทุกข้อ */
const ORDERS = [
  order('A'),
  order('DEAD', { status: 'draft', quotationId: 'QT-DEAD' }), // ร่างที่ QT ถูกถอด Won แล้ว
  order('HIST', { origin: 'historical', status: 'pending_approval', quotationId: null }), // ใบย้อนหลังยังไม่อนุมัติ
  order('SAHA', { customerId: 'C-109' }), // สหมิตร — เงินเก็บนอกระบบ
];
const QUOTES = new Map([
  ['QT-A', { id: 'QT-A', status: 'accepted' }],
  ['QT-DEAD', { id: 'QT-DEAD', status: 'sent' }],
  ['QT-SAHA', { id: 'QT-SAHA', status: 'accepted' }],
]);
const CUSTOMERS = new Map([
  ['C-267', { id: 'C-267', arCode: 'AR-267', name: 'บริษัท เจอร์นัล แล็บ จำกัด' }],
  ['C-109', { id: 'C-109', arCode: 'AR-109', name: 'สหมิตร' }],
]);
const REQUESTS = new Map([
  ['RQ-SENT', { id: 'RQ-SENT', status: 'pending' }],
  ['RQ-DRAFT', { id: 'RQ-DRAFT', status: 'draft' }],
  ['RQ-GONE', { id: 'RQ-GONE', status: 'cancelled' }],
]);
const INSTALLMENTS = [
  inst('in-today', 'A', { billingDate: '2026-10-02' }), // วันนี้ → เตือน
  inst('in-3d', 'A', { seq: 2, billingDate: '2026-10-05' }), // +3 → เตือน
  inst('out-4d', 'A', { seq: 3, billingDate: '2026-10-06' }), // +4 → ยังไม่เตือน (แต่อยู่ใน 7 วัน)
  inst('out-sent', 'A', { seq: 4, billingRequestId: 'RQ-SENT' }), // ขอใบแล้ว
  inst('in-draft', 'A', { seq: 5, billingRequestId: 'RQ-DRAFT' }), // ร่าง = ยังไม่ขอ → เตือน
  inst('in-gone', 'A', { seq: 6, billingRequestId: 'RQ-GONE' }), // คำร้องยกเลิก = ลิงก์ตาย → เตือน
  inst('out-reported', 'A', { seq: 7, status: 'reported' }), // แจ้งชำระแล้ว
  inst('out-late', 'A', { seq: 8, billingDate: '2026-09-28' }), // เลยรอบ = ป้าย ไม่ใช่กระดิ่ง
  inst('out-zero', 'A', { seq: 9, amount: 0 }), // ยอด 0
  inst('out-dead-qt', 'DEAD'),
  inst('out-hist', 'HIST'),
  inst('out-saha', 'SAHA'),
];

const ordersById = new Map(ORDERS.map((o) => [o.id, { ...o, quotation: QUOTES.get(o.quotationId) || null }]));
const candidateIds = () => billingDueCandidates(INSTALLMENTS, {
  todayIso: TODAY, ordersById, customersById: CUSTOMERS, requestsById: REQUESTS, skipArCodes: ['AR-109'],
}).map(({ installment }) => installment.id);

/* แบบเดียวกับ route: ถามตัวคัดของกระดิ่งครั้งเดียว แล้วส่งผลเข้า ledgerRow */
function ledger() {
  const remind = new Set(candidateIds());
  return INSTALLMENTS.map((installment) => {
    const o = ORDERS.find((row) => row.id === installment.salesOrderId);
    return ledgerRow({
      installment, order: o, quotation: QUOTES.get(o.quotationId) || null, customer: CUSTOMERS.get(o.customerId),
      todayIso: TODAY, billingRequest: REQUESTS.get(installment.billingRequestId) || null,
      billingRemind: remind.has(installment.id),
    });
  });
}

test('🔴 `soon` = ชุดของกระดิ่งเป๊ะ — ทุกเหตุที่กระดิ่งตัด ทะเบียนก็ตัด', () => {
  const expected = ['in-today', 'in-3d', 'in-draft', 'in-gone'];
  assert.deepEqual(candidateIds().sort(), [...expected].sort());
  assert.deepEqual(filterLedger(ledger(), { billing: 'soon' }).map((r) => r.id).sort(), [...expected].sort());
});

test('`soon` แคบกว่า `7d` โดยนิยาม — 7 วันยังนับงวดที่ขอใบแล้วและ 4–7 วัน', () => {
  const in7 = filterLedger(ledger(), { billing: '7d' }).map((r) => r.id);
  assert.ok(in7.includes('out-4d') && in7.includes('out-sent'));
  assert.ok(!filterLedger(ledger(), { billing: 'soon' }).some((r) => r.id === 'out-4d' || r.id === 'out-sent'));
});

test('ตัวนับบนตัวเลือก `soon` เท่าจำนวนแถวที่ตัวกรองเปิด · ไม่ขึ้นกับตัวกรองรอบวางบิลเอง · เคารพตัวกรองอื่น', () => {
  const rows = ledger();
  assert.equal(ledgerBillingTally(rows, {}).counts.soon, 4);
  assert.equal(ledgerBillingTally(rows, { billing: 'late' }).counts.soon, 4);
  assert.equal(ledgerBillingTally(rows, { billing: 'soon', q: 'SO-DEAD' }).counts.soon, 0);
});

test('ตัวเลือก `soon` อยู่ในชุดตัวกรอง (ตัวตัดสิน · เมนู · คำว่าง/คำอธิบาย) · ป้ายบอกหน้าต่างวันของกระดิ่ง', () => {
  assert.equal(ledgerBillingFilter('soon'), 'soon');
  const option = LEDGER_BILLING_FILTERS.find((f) => f.value === 'soon');
  assert.equal(option.label, `ถึงรอบใน ${BILLING_REMIND_DAYS} วัน · ยังไม่ขอใบ`);
  assert.ok(option.empty && option.hint);
  // ไม่ส่งธง = ไม่อยู่ในชุด (ไม่เดาเอง)
  const bare = ledgerRow({ installment: inst('x', 'A', { billingDate: TODAY }), order: order('A'), todayIso: TODAY });
  assert.equal(bare.billingSoon, false);
});

test('🔴 ลิงก์ของแถว FN ชี้ตัวกรอง `soon` ที่มีอยู่จริง — ค่าที่ไม่รู้จักถูกเมิน = ทะเบียนเปิดมาไม่กรองเลย', () => {
  const value = new URL(BILLING_DUE_FN_HREF, 'http://x').searchParams.get('billing');
  assert.equal(value, 'soon');
  assert.equal(ledgerBillingFilter(value), value);
  assert.equal(new URL(BILLING_DUE_FN_HREF, 'http://x').pathname, '/finance/payments');
});

test('route: ธง `soon` มาจากตัวคัดของกระดิ่งด้วยวัตถุดิบชุดเดียวกับ cron แล้วถึง ledgerRow', () => {
  const route = readFileSync(new URL('../../app/api/finance/payments/route.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const block = route.slice(route.indexOf('const remindIds = new Set(billingDueCandidates(rows, {'), route.indexOf('const ledger = rows'));
  assert.ok(block.length > 0, 'route ไม่ถามตัวคัดของกระดิ่ง');
  assert.match(block, /todayIso,/);
  assert.match(block, /quotation: quoteById\.get\(o\.quotationId\) \|\| null/, 'ขาดสถานะ QT = ร่างที่ QT ตายหลุดเข้าชุด');
  assert.match(block, /customersById: customerById,/);
  assert.match(block, /requestsById: billingRequestById,/);
  assert.match(block, /skipArCodes: \[SAHAMIT_AR_CODE\],/);
  assert.match(route, /billingRemind: remindIds\.has\(installment\.id\),/);
  // ตัวคัดต้องได้งวดครบก่อนตัด (ใช้ `rows` ดิบ ไม่ใช่แถวที่กรองแล้ว) และต้องคิดก่อนสร้างแถว
  assert.ok(route.indexOf('const remindIds') < route.indexOf('const ledger = rows'));
});
