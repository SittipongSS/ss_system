// ── ทะเบียนการชำระ × รอบวางบิล (mig 0389 · มติเจ้าของ 25–26/09 · ม็อก D ของ mockups/billing-cycle) ───────────
// ⭐ ตรึงสามเรื่องที่พังเงียบได้:
//   1. whitelist ของ `ledgerRow` / `groupLedgerByOrder` — ค่าใหม่มาถึง server ผ่าน select('*') แล้วตายที่ literal ถ้าลืมเติม
//   2. "ขอใบแล้ว" = ผูกคำร้อง **และคำร้องยังไม่ตาย** (ยกเลิกคำร้องไม่ล้างลิงก์บนงวด)
//   3. วันวางบิลที่ผ่านไปแล้ว = "เลยรอบวางบิล" ไม่ใช่ "เลยกำหนด" — สองธงแยกกันเสมอ
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_BILLING_FILTERS, LEDGER_BILLING_REQUESTED_TAG, LEDGER_BILLING_RULE_UNSET, LEDGER_BILLING_UNREQUESTED_TAG,
  LEDGER_BILLING_WAITING_TAG, LEDGER_BILLING_WINDOW_DAYS, LEDGER_COLUMNS, billingRequestAlive,
  filterLedger, groupInstallmentNote, groupLedgerByOrder, ledgerBillingFilter, ledgerBillingTally, ledgerBillingWhen, ledgerRow,
  ledgerSummary, stampOrderInstallmentCount,
} from './paymentLedger.js';

const TODAY = '2026-09-25'; // ศ. 25 ก.ย. 2026 — "วันนี้" ของม็อก
const RULE_5_25 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };

const make = (extra = {}, { request = null, customer = {}, order = {} } = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.seq || 1}`, seq: 1, label: 'มัดจำ', percent: 50, amount: 1000, status: 'pending', evidence: [],
    ...extra,
  },
  order: { id: 'SOR-1', orderNumber: 'SO-26080050-0', customerId: 'CUS-267', ...order },
  quotation: null,
  customer: { id: 'CUS-267', name: 'บริษัท เจอร์นัล แล็บ จำกัด', arCode: 'AR-267', billingRule: RULE_5_25, ...customer },
  todayIso: TODAY,
  billingRequest: request,
});

// ── 1. whitelist ของแถว ──────────────────────────────────────────────────────────────────────────
test('🔴 ledgerRow พกวันวางบิล · เหตุการณ์ · คำร้อง · สถานะ · รอบของลูกค้า มาถึงจอ (whitelist ตกแล้วหายเงียบ)', () => {
  const r = make({ billingDate: '2026-10-05', billingRequestId: 'RQ-1' }, { request: { id: 'RQ-1', status: 'pending' } });
  assert.equal(r.billingDate, '2026-10-05');
  assert.equal(r.billingEvent, '');
  assert.equal(r.billingRequestId, 'RQ-1');
  assert.equal(r.billingRequested, true);
  assert.equal(r.billingStateKey, 'requested');
  assert.equal(r.billingDays, 10);
  assert.equal(r.billingStatusLabel, 'ขอใบวางบิลแล้ว');
  assert.equal(r.customerId, 'CUS-267');
  assert.equal(r.billingRuleText, 'วางบิลทุกวันที่ 5 · เงินเข้า 25');

  const waiting = make({ billingEvent: 'ก่อนส่งสินค้า' });
  assert.equal(waiting.billingDate, null);
  assert.equal(waiting.billingEvent, 'ก่อนส่งสินค้า');
  assert.equal(waiting.billingStateKey, 'waiting');
  assert.equal(waiting.billingStatusLabel, 'รอเหตุการณ์ (ก่อนส่งสินค้า)');

  // ก่อนรัน 0389: คอลัมน์ไม่มี (undefined) ⇒ ค่าว่าง ไม่พัง · ลูกค้าไม่มีรอบ = ''
  const legacy = ledgerRow({
    installment: { id: 'i', seq: 1, status: 'pending' }, order: { id: 'SOR-9', orderNumber: 'SO-9' }, todayIso: TODAY,
  });
  assert.equal(legacy.billingDate, null);
  assert.equal(legacy.billingRequestId, null);
  assert.equal(legacy.billingRequested, false);
  assert.equal(legacy.billingStateKey, 'none');
  assert.equal(legacy.billingRuleText, '');
  assert.equal(legacy.customerId, null);
});

// ── 2. ขอใบแล้ว = คำร้องยังไม่ตาย ─────────────────────────────────────────────────────────────────
test('🔴 "ขอใบแล้ว" นับเฉพาะคำร้องที่ยังไม่ตาย — ยกเลิก/ตีกลับ/หาไม่เจอ/คนละใบ = ยังไม่ขอ', () => {
  const late = { billingDate: '2026-09-05', billingRequestId: 'RQ-1' };
  assert.equal(make(late, { request: { id: 'RQ-1', status: 'acknowledged' } }).billingRequested, true);
  for (const request of [
    { id: 'RQ-1', status: 'cancelled' }, // ยกเลิกคำร้องไม่ล้างลิงก์บนงวด (วันนี้)
    { id: 'RQ-1', status: 'draft' }, // ร่างยังไม่ส่งถึงบัญชี = ยังไม่ขอ (billingRequestLive)
    null, // คำร้องถูกลบ
    { id: 'RQ-2', status: 'pending' }, // ผู้เรียกส่งผิดแถว — ไม่เชื่อ
  ]) {
    const r = make(late, { request });
    assert.equal(r.billingRequested, false, JSON.stringify(request));
    // ⭐ คำร้องตาย ⇒ งวดที่ผ่านวันวางบิลกลับมาเป็น "เลยรอบ" (ไม่หลุดคิวเงียบ ๆ)
    assert.equal(r.billingLate, true, JSON.stringify(request));
  }
  // ไม่มีลิงก์ แม้ส่งคำร้องมา = ยังไม่ขอ
  assert.equal(make({ billingDate: '2026-09-05' }, { request: { id: 'RQ-1', status: 'pending' } }).billingRequested, false);
  assert.equal(billingRequestAlive({ id: 'RQ-1', status: 'draft' }), false);
  assert.equal(billingRequestAlive({ id: 'RQ-1', status: 'closed' }), true);
  assert.equal(billingRequestAlive({ status: 'pending' }), false);
  assert.equal(billingRequestAlive(null), false);
});

// ── 3. ธงของตัวกรอง ──────────────────────────────────────────────────────────────────────────────
test('ธงรอบวางบิล: 7 วัน (0..7 รวมหัวท้าย) · เดือนนี้ (รวมวันที่ผ่านแล้ว) · เลยรอบ (ยังไม่ขอ + ยังไม่แจ้งชำระ)', () => {
  const flags = (extra, opts) => {
    const r = make(extra, opts);
    return { in7: r.billingIn7Days, month: r.billingThisMonth, late: r.billingLate };
  };
  assert.deepEqual(flags({ billingDate: '2026-09-25' }), { in7: true, month: true, late: false }); // วันนี้
  assert.deepEqual(flags({ billingDate: '2026-10-02' }), { in7: true, month: false, late: false }); // +7 = ยังอยู่ในช่วง
  assert.deepEqual(flags({ billingDate: '2026-10-03' }), { in7: false, month: false, late: false }); // +8
  assert.deepEqual(flags({ billingDate: '2026-09-05' }), { in7: false, month: true, late: true }); // ผ่านแล้ว ยังไม่ขอ
  assert.deepEqual(flags({ billingDate: '2026-08-05' }), { in7: false, month: false, late: true }); // เดือนก่อน
  // ขอใบแล้ว: ไม่ใช่เลยรอบ · ยังนับในช่วง 7 วัน/เดือนนี้ (ม็อก D นับทั้งที่ขอแล้วและยังไม่ขอ)
  const req = { request: { id: 'RQ-1', status: 'pending' } };
  assert.deepEqual(flags({ billingDate: '2026-09-05', billingRequestId: 'RQ-1' }, req), { in7: false, month: true, late: false });
  assert.deepEqual(flags({ billingDate: '2026-09-30', billingRequestId: 'RQ-1' }, req), { in7: true, month: true, late: false });
  // แจ้งชำระ/รับเงิน/คืนเงินแล้ว = ไม่มีงานวางบิลเหลือ
  for (const status of ['reported', 'confirmed']) {
    assert.deepEqual(flags({ billingDate: '2026-09-05', status }), { in7: false, month: false, late: false }, status);
  }
  assert.deepEqual(flags({ billingDate: '2026-09-26', status: 'confirmed', refundedAt: '2026-09-20T00:00:00Z' }),
    { in7: false, month: false, late: false });
  // ตีกลับ = ยังต้องเก็บ ⇒ ยังมีงานวางบิล
  assert.deepEqual(flags({ billingDate: '2026-09-05', status: 'rejected' }), { in7: false, month: true, late: true });
  // งวดยกมาไม่มีรอบวางบิล (0374 · 0389) · รอเหตุการณ์ไม่มีวัน = ไม่เข้าตัวกรองไหนเลย
  assert.deepEqual(flags({ billingDate: '2026-09-26', kind: 'opening' }), { in7: false, month: false, late: false });
  assert.deepEqual(flags({ billingEvent: 'หลังติดตั้ง' }), { in7: false, month: false, late: false });
  // ไม่รู้วันนี้ = ไม่ตัดสิน (ไม่เดาจากนาฬิกาเครื่อง)
  const noToday = ledgerRow({ installment: { id: 'x', seq: 1, status: 'pending', billingDate: '2026-09-05' }, order: { id: 'o' } });
  assert.equal(noToday.billingLate || noToday.billingIn7Days || noToday.billingThisMonth, false);
  assert.equal(LEDGER_BILLING_WINDOW_DAYS, 7);
});

test('🔴 เลยรอบวางบิล ≠ เลยกำหนด — วันวางบิลผ่านแล้วแต่กำหนดชำระยังไม่ถึง ต้องไม่แดง (AR-267 · SO-26080050-0)', () => {
  const r = make({ billingDate: '2026-09-05', dueDate: '2026-10-25' });
  assert.equal(r.billingLate, true);
  assert.equal(r.overdue, false, 'แดงอ่านกำหนดชำระช่องเดียว');
  // กลับกัน: เลยกำหนดชำระแล้ว แต่ยังไม่ถึงรอบวางบิล (ข้อมูลเก่าที่ SA กรอกวันวางบิลลงกำหนดชำระ) — สองธงไม่ยุ่งกัน
  const old = make({ dueDate: '2026-09-05', billingDate: '2026-10-05' });
  assert.equal(old.overdue, true);
  assert.equal(old.billingLate, false);
  assert.match(make({ billingDate: '2026-09-05' }).billingStatusLabel, /^เลยรอบวางบิล 20 วัน/);
});

// ── 4. ตัวกรอง · ตัวนับ · ส่วนที่ซ่อน ──────────────────────────────────────────────────────────────
const fixture = () => [
  make({ id: 'a1', seq: 1, billingDate: '2026-09-28', amount: 100 }), // 7 วัน · เดือนนี้
  make({ id: 'a2', seq: 2, billingDate: '2026-09-10', amount: 200 }), // เลยรอบ · เดือนนี้
  make({ id: 'a3', seq: 3, billingDate: '2026-10-05', amount: 400 }), // ไกล
  make({ id: 'a4', seq: 4, amount: 800 }), // ยังไม่มีวันวางบิล
  make({ id: 'a5', seq: 5, billingEvent: 'ก่อนส่งสินค้า', amount: 1600 }), // รอเหตุการณ์ — ไม่มีวันเหมือนกัน
  make({ id: 'a6', seq: 6, status: 'confirmed', amount: 3200 }), // จบแล้ว — ไม่ใช่งานวางบิล
];

test('filterLedger: billing = 7d | month | late · ค่าว่าง/ไม่รู้จัก = ไม่กรอง', () => {
  const rows = fixture();
  const ids = (billing) => filterLedger(rows, { billing }).map((r) => r.id);
  assert.deepEqual(ids('7d'), ['a1']);
  assert.deepEqual(ids('month'), ['a1', 'a2']);
  assert.deepEqual(ids('late'), ['a2']);
  assert.equal(ids('').length, rows.length);
  assert.equal(ids('next-week').length, rows.length, 'ลิงก์พิมพ์ผิดต้องไม่ทำให้ทะเบียนว่าง');
  assert.equal(ledgerBillingFilter('late'), 'late');
  assert.equal(ledgerBillingFilter('LATE'), '');
  // `soon` (ชุดของกระดิ่ง · รอบสอง 26/09) มีเทสต์ของตัวเองที่ paymentLedgerBillingSoon.test.mjs
  assert.deepEqual(LEDGER_BILLING_FILTERS.map((f) => f.value), ['soon', '7d', 'month', 'late']);
  // ประกอบกับตัวกรองอื่นได้ (และ)
  assert.deepEqual(filterLedger(rows, { billing: 'month', q: 'มัดจำ' }).map((r) => r.id), ['a1', 'a2']);
  assert.deepEqual(filterLedger(rows, { billing: 'month', status: ['confirmed'] }), []);
});

test('ledgerSummary: การ์ด "ถึงรอบวางบิล 7 วัน" นับงวด + ยอด · เลยรอบนับแยก (คนละแกนกับเลยกำหนด)', () => {
  const s = ledgerSummary(fixture());
  assert.equal(s.billingIn7DaysCount, 1);
  assert.equal(s.billingIn7DaysAmount, 100);
  assert.equal(s.billingThisMonthCount, 2);
  assert.equal(s.billingLateCount, 1);
  assert.equal(s.billingLateAmount, 200);
  assert.equal(s.overdueCount, 0);
});

test('ledgerBillingTally: ตัวนับไม่ขึ้นกับตัวกรองรอบวางบิลเอง · ส่วนที่ซ่อน = งวดที่ยังมีงานวางบิลแต่ไม่มีวันวางบิล', () => {
  const rows = fixture();
  const idle = ledgerBillingTally(rows, {});
  assert.deepEqual(idle.counts, { soon: 0, '7d': 1, month: 2, late: 1 });
  assert.deepEqual(idle.hidden, { count: 0, amount: 0 }, 'ไม่ได้กรองรอบวางบิล = ไม่มีอะไรถูกซ่อน');

  const on7 = ledgerBillingTally(rows, { billing: '7d' });
  assert.deepEqual(on7.counts, { soon: 0, '7d': 1, month: 2, late: 1 }, 'กรอง 7 วันอยู่ ตัวเลือก "เดือนนี้" ยังบอก 2');
  // a4 (ยังไม่เลือก) + a5 (รอเหตุการณ์) — a6 จบแล้ว ไม่ใช่งานที่ถูกซ่อน
  assert.deepEqual(on7.hidden, { count: 2, amount: 2400 });

  // เคารพตัวกรองอื่น: ค้นงวดเดียวแล้วตัวนับ/ส่วนที่ซ่อนเหลือเฉพาะงวดนั้น
  const narrowed = ledgerBillingTally(rows, { billing: 'late', q: 'SO-26080050-0', status: ['pending'] });
  assert.deepEqual(narrowed.counts, { soon: 0, '7d': 1, month: 2, late: 1 });
  assert.equal(ledgerBillingTally(rows, { billing: 'late', status: ['confirmed'] }).hidden.count, 0);
  assert.equal(ledgerBillingTally(rows, { billing: 'bogus' }).hidden.count, 0, 'ค่าที่ไม่รู้จัก = ไม่ได้กรอง');
});

test('🔴 ส่วนที่ซ่อน: ไม่นับงวดของลูกค้าที่ไม่มีรอบและไม่มีใครเลือกอะไร (สถานะปกติ · "บางที่ไม่มีรอบวาง")', () => {
  const noRule = { customer: { billingRule: null } };
  const rows = [
    make({ id: 'n1', seq: 1, amount: 100 }, noRule), // ไม่มีรอบ ไม่มีวัน = ปกติ — ห้ามนับ (ใบเก่าไม่ถูกเติมย้อนหลัง)
    make({ id: 'n2', seq: 2, billingEvent: 'หลังติดตั้ง', amount: 200 }, noRule), // รอเหตุการณ์ = งานวางบิลจริง — นับ
    make({ id: 'n3', seq: 3, amount: 400 }), // ลูกค้ามีรอบแต่งวดยังไม่เลือกวัน = ลืม — นับ
    make({ id: 'n4', seq: 4, billingDate: '2026-09-28', amount: 800 }, noRule), // มีวัน = ไม่ถูกซ่อน
  ];
  assert.deepEqual(ledgerBillingTally(rows, { billing: '7d' }).hidden, { count: 2, amount: 600 });
});

// ── 5. ชุดค้น ────────────────────────────────────────────────────────────────────────────────────
test('🔴 ค้นด้วยรอบวางบิลที่ตาเห็นใต้ชื่อลูกค้าต้องเจอ · ลูกค้าที่ยังไม่ตั้งค้นด้วยคำเดียวกับที่แถวโชว์', () => {
  const withRule = make({ id: 'r1' });
  const without = make({ id: 'r2' }, { customer: { billingRule: null, arCode: 'AR-726', name: 'บริษัท กิติธัญ จำกัด' } });
  const rows = [withRule, without];
  assert.deepEqual(filterLedger(rows, { q: 'วางบิลทุกวันที่ 5' }).map((r) => r.id), ['r1']);
  assert.deepEqual(filterLedger(rows, { q: 'เงินเข้า 25' }).map((r) => r.id), ['r1']);
  assert.deepEqual(filterLedger(rows, { q: LEDGER_BILLING_RULE_UNSET }).map((r) => r.id), ['r2']);
});

test('🔴 คำในเซลล์ "วางบิลถัดไป" ค้นเจอ: ชื่อเหตุการณ์ · ขอใบแล้ว/ยังไม่ขอ (ป้ายเดียวกับจอ)', () => {
  const rows = [
    make({ id: 'w1', seq: 1, billingEvent: 'ก่อนส่งสินค้า' }),
    make({ id: 'w2', seq: 2, billingDate: '2026-09-28', billingRequestId: 'RQ-1' }, { request: { id: 'RQ-1', status: 'pending' } }),
    make({ id: 'w3', seq: 3, billingDate: '2026-09-28' }),
    make({ id: 'w4', seq: 4, billingDate: '2026-09-28', status: 'confirmed' }), // จบแล้ว — เซลล์ไม่โชว์ป้าย
  ];
  const ids = (q) => filterLedger(rows, { q }).map((r) => r.id);
  assert.deepEqual(ids('ก่อนส่งสินค้า'), ['w1']);
  assert.deepEqual(ids(LEDGER_BILLING_WAITING_TAG), ['w1']);
  assert.deepEqual(ids(LEDGER_BILLING_REQUESTED_TAG), ['w2']);
  assert.deepEqual(ids(LEDGER_BILLING_UNREQUESTED_TAG), ['w3']);
});

// ── 6. ก้อนของใบ ──────────────────────────────────────────────────────────────────────────────────
test('🔴 ก้อนของใบ: วางบิลถัดไป = งวดที่ยังมีงานวางบิลและมีวันใกล้สุด · ข้ามงวดที่ขอใบแล้วและวางไปแล้ว', () => {
  const req = (id) => ({ request: { id, status: 'pending' } });
  const rows = [
    make({ id: 'b1', seq: 1, billingDate: '2026-08-25', status: 'confirmed' }), // จบแล้ว
    make({ id: 'b2', seq: 2, billingDate: '2026-09-20', billingRequestId: 'RQ-2' }, req('RQ-2')), // วางไปแล้ว รอเงิน
    make({ id: 'b3', seq: 3, billingDate: '2026-10-25' }),
    make({ id: 'b4', seq: 4, billingDate: '2026-11-25' }),
  ];
  const [group] = groupLedgerByOrder(rows);
  assert.deepEqual(group.nextBilling, {
    id: 'b3', seq: 3, label: 'มัดจำ', billingDate: '2026-10-25', state: { key: 'upcoming', days: 30 }, requested: false,
  });
  assert.equal(group.billingBilled, 1);
  assert.equal(group.customerId, 'CUS-267');
  assert.equal(group.billingRuleText, 'วางบิลทุกวันที่ 5 · เงินเข้า 25');

  // ขอใบแล้วแต่ยังไม่ถึงวัน = ยังเป็นรอบถัดไป (ป้าย "ขอใบแล้ว")
  const [soon] = groupLedgerByOrder([
    make({ id: 'c1', seq: 1, billingDate: '2026-09-28', billingRequestId: 'RQ-9' }, req('RQ-9')),
    make({ id: 'c2', seq: 2, billingDate: '2026-09-26' }),
  ]);
  assert.equal(soon.nextBilling.id, 'c2', 'วันใกล้สุดก่อน ไม่ใช่งวดที่น้อยกว่า');
  assert.equal(soon.nextBilling.state.key, 'soon');
  assert.equal(soon.billingIn7Days, 2);

  // เลยรอบ ยังไม่ขอ = ยังเป็นรอบถัดไป (งานที่ต้องตาม)
  const [late] = groupLedgerByOrder([make({ id: 'd1', seq: 1, billingDate: '2026-09-05' })]);
  assert.equal(late.nextBilling.state.key, 'late');
  assert.equal(late.nextBilling.state.days, -20);
  assert.equal(late.billingLate, 1);
});

test('🔴 จำนวนงวดของทั้งใบประทับก่อนกรอง — กรองรอบวางบิลเหลือหนึ่งงวด ต้องไม่อ่านว่า "ชำระครั้งเดียว"', () => {
  const all = Array.from({ length: 12 }, (_, i) => make({
    id: `p${i + 1}`, seq: i + 1, billingDate: `2026-${String(i + 1).padStart(2, '0')}-28`,
  }));
  all.push(make({ id: 'x1', seq: 1 }, { order: { id: 'SOR-2', orderNumber: 'SO-2' } }));
  stampOrderInstallmentCount(all);
  assert.equal(all[0].orderInstallmentCount, 12);
  assert.equal(all[12].orderInstallmentCount, 1);

  // เส้นทางของกระดิ่ง FN: ?billing=7d เหลือ ก.ย. งวดเดียวของใบ 12 งวด
  const shown = filterLedger(all, { billing: '7d' });
  const [group] = groupLedgerByOrder(shown);
  assert.equal(group.count, 1);
  assert.equal(group.planCount, 12);
  assert.equal(groupInstallmentNote(group, { filtering: true }), 'แสดง 1 จาก 12 งวด');

  // ไม่กรอง = ทรงของใบ · ใบงวดเดียว = ชำระครั้งเดียว
  const groups = groupLedgerByOrder(all);
  const twelve = groups.find((g) => g.orderId === 'SOR-1');
  const single = groups.find((g) => g.orderId === 'SOR-2');
  assert.equal(groupInstallmentNote(twelve, { filtering: false }), 'แบ่ง 12 งวด');
  assert.equal(groupInstallmentNote(single, { filtering: true }), 'ชำระครั้งเดียว', 'เห็นครบแล้ว ไม่ต้องบอก "แสดง 1 จาก 1"');

  // ผู้เรียกไม่ได้ประทับ (ประกอบแถวเอง) = ถอยไปนับในก้อน · ค่าประทับต่ำกว่าแถวที่เห็นไม่ชนะ
  const [bare] = groupLedgerByOrder([make({ id: 'q1', seq: 1 }), make({ id: 'q2', seq: 2 })]);
  assert.equal(bare.planCount, 2);
  assert.equal(groupInstallmentNote(bare, { filtering: true }), 'แบ่ง 2 งวด');
  const stale = [make({ id: 's1', seq: 1 }), make({ id: 's2', seq: 2 })].map((r) => ({ ...r, orderInstallmentCount: 1 }));
  assert.equal(groupLedgerByOrder(stale)[0].planCount, 2);
});

test('ก้อนของใบที่ไม่มีรอบถัดไป: บอกงวดที่ยังไม่เลือกวัน / รอเหตุการณ์ / วางบิลแล้วรอเงินเข้า', () => {
  const [unset] = groupLedgerByOrder([
    make({ id: 'e1', seq: 1 }),
    make({ id: 'e2', seq: 2, billingEvent: 'ก่อนส่งสินค้า' }),
    make({ id: 'e3', seq: 3, kind: 'opening', status: 'confirmed' }), // งวดยกมา — ไม่ใช่งวดที่ต้องเลือกรอบ
  ]);
  assert.equal(unset.nextBilling, null);
  assert.equal(unset.billingUnset, 1);
  assert.deepEqual(unset.billingWaiting, { seq: 2, event: 'ก่อนส่งสินค้า' });
  assert.equal(unset.billingBilled, 0);

  const [done] = groupLedgerByOrder([make({ id: 'f1', seq: 1, status: 'confirmed', billingDate: '2026-09-05' })]);
  assert.equal(done.nextBilling, null);
  assert.equal(done.billingUnset, 0);
  assert.equal(done.billingWaiting, null);
});

test('คำบอกระยะบนเซลล์ "วางบิลถัดไป" — สั้น ไม่ซ้ำกับป้ายขอใบแล้ว/ยังไม่ขอ', () => {
  assert.equal(ledgerBillingWhen({ key: 'late', days: -3 }), 'เลยรอบวางบิล 3 วัน');
  assert.equal(ledgerBillingWhen({ key: 'today', days: 0 }), 'ถึงรอบวันนี้');
  assert.equal(ledgerBillingWhen({ key: 'soon', days: 2 }), 'ถึงรอบใน 2 วัน');
  assert.equal(ledgerBillingWhen({ key: 'upcoming', days: 10 }), 'อีก 10 วัน');
  assert.equal(ledgerBillingWhen({ key: 'requested', days: 5 }), 'อีก 5 วัน');
  assert.equal(ledgerBillingWhen({ key: 'waiting', days: null }), '');
  assert.doesNotMatch(ledgerBillingWhen({ key: 'late', days: -3 }), /ขอใบ/);
});

// ── 7. ไฟล์ Excel ────────────────────────────────────────────────────────────────────────────────
test('🔴 ไฟล์ Excel มี "วันวางบิล" (รูปวันที่) ต่อจากยอดงวด ก่อนกำหนดชำระ + "สถานะวางบิล" เป็นคำ', () => {
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  const col = Object.fromEntries(LEDGER_COLUMNS.map((c) => [c.key, c]));
  assert.equal(col.billingDate.label, 'วันวางบิล');
  assert.equal(col.billingDate.date, true);
  assert.equal(col.billingStatusLabel.label, 'สถานะวางบิล');
  assert.notEqual(col.billingStatusLabel.date, true, 'ข้อความห้ามยัดรูปวันที่');
  assert.ok(keys.indexOf('amount') < keys.indexOf('billingDate'));
  assert.ok(keys.indexOf('billingDate') < keys.indexOf('dueDate'));
  // ไม่มีคอลัมน์ boolean (ลง Excel เป็น TRUE/FALSE)
  assert.ok(!keys.includes('billingRequested') && !keys.includes('billingLate'));
});
