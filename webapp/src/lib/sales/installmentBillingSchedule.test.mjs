// ── กำหนดวางบิลบนงวดของใบ (mig 0389 · มติเจ้าของ 25–26/09 · ม็อก mockups/billing-cycle จอ C) ─────────────
// สามเรื่องที่พังเงียบได้ทั้งหมด:
//   1. ด่านวันงวด (`schedule`) — มติข้อ 4 ให้ฝ่ายบัญชีแก้วันงวดได้ · ปุ่มกับ API ต้องถามตัวเดียวกันด้วยค่าชุดเดียวกัน
//   2. "เติมตามรอบ เดือนละงวด" — server ต้องไม่เชื่อวันจากจอ: คิดเองแล้ว **เท่ากันทุกแถว** ไม่งั้น 409 (จอเก่า)
//   3. freeze ตั้งงวดใหม่ (จำนวนงวดไม่ตรงแผน) ต้องอุ้มวันวางบิล/เหตุการณ์ข้ามไปตามลำดับงวด และ null ต้องไม่ทับค่าจริง
// + ยามต้นทาง (อ่าน source): route/จอ/หน้าใบ ต่อสายครบ — พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้" (ตัดคอมเมนต์ก่อน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BILLING_FILL_STALE_MESSAGE, billingFillCheck, billingFillPatch, billingFillStoppedMessage, billingRedateCheck,
  billingRequestDead, billingRoundIndexOf, installmentActionError, installmentBillingRequested,
} from './salesOrderPayments.js';
import { planMonthlyFill } from './billingRule.js';
import {
  INSTALLMENT_BILLING_SCHEMA_MISSING, INSTALLMENT_REFUND_SCHEMA_MISSING, freezeInstallments,
  installmentBillingSchemaError, installmentRefundSchemaError, writeBillingFill,
} from './salesOrderInstallmentsStore.js';

const SA = { id: 'u-sa', role: 'ae' };
const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const FN_ROLE_ONLY = { id: 'u-fn2', role: 'finance' };            // แผงเก่าไม่ส่งฝ่าย — ถอยไปเดาจาก role
const FINANCE_ROLE_OTHER_DEPT = { id: 'u-x', role: 'finance', department: 'SA' };
const PC = { id: 'u-pc', role: 'pc', department: 'PC' };
const ADMIN = { id: 'u-admin', role: 'admin' };

// ── 1. ด่านวันงวด: ฝ่ายบัญชีแก้ได้ (มติข้อ 4) ────────────────────────────────────────────────────
test('schedule: ฝ่ายขายและฝ่ายบัญชีแก้วันงวดได้ · ฝ่ายอื่นไม่ได้ · ตัดสินฝ่ายด้วย canConfirmPayment (ไม่ใช่ role ล้วน)', () => {
  const row = { status: 'pending' };
  assert.equal(installmentActionError(row, 'schedule', SA), null);
  assert.equal(installmentActionError(row, 'schedule', FN), null, 'มติข้อ 4: FN แก้วันรายงวดได้');
  assert.equal(installmentActionError(row, 'schedule', FN_ROLE_ONLY), null);
  assert.equal(installmentActionError(row, 'schedule', ADMIN), null);
  assert.match(installmentActionError(row, 'schedule', PC), /ไม่มีสิทธิ์/);
  assert.match(installmentActionError(row, 'schedule', FINANCE_ROLE_OTHER_DEPT), /ไม่มีสิทธิ์/,
    'ถือ payments:confirm แต่ไม่ได้อยู่ฝ่าย FN = ไม่ใช่คนรับรองงวด (กติกาเดียวกับด่านรับรอง)');
});

test('schedule ของ FN: กติกาเดิมทุกข้อยังอยู่ — งวดที่รับรองแล้วล็อก · ล็อกทั้งใบชนะ · งวดยกมาของใบย้อนหลังไม่มีวัน', () => {
  assert.match(installmentActionError({ status: 'confirmed' }, 'schedule', FN), /คอนเฟิร์มแล้ว/);
  assert.equal(installmentActionError({ status: 'reported' }, 'schedule', FN), null);
  assert.equal(installmentActionError({ status: 'pending' }, 'schedule', FN, { orderLock: 'ใบยกเลิกแล้ว' }), 'ใบยกเลิกแล้ว');
  const opening = { status: 'confirmed', kind: 'opening', coversFrom: '2026-01-01', coversTo: '2026-06-30' };
  assert.match(installmentActionError(opening, 'schedule', FN, { historical: true }), /งวดยกมาไม่มีกำหนดชำระ/);
});

// ── 2. "ขอใบวางบิลแล้ว" = คำร้องที่ยังมีชีวิต ────────────────────────────────────────────────────
test('installmentBillingRequested: ผูกคำร้องที่ยังมีชีวิตเท่านั้น — ยกเลิก/ปฏิเสธ/หาไม่เจอ = ยังไม่ขอ', () => {
  const requests = new Map([
    ['RQ-1', { id: 'RQ-1', status: 'pending' }],
    ['RQ-2', { id: 'RQ-2', status: 'cancelled' }],
    ['RQ-3', { id: 'RQ-3', status: 'rejected' }],
    ['RQ-4', { id: 'RQ-4', status: 'draft' }],
  ]);
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-1' }, requests), true);
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-4' }, requests), false, 'ร่างยังไม่ส่งถึงบัญชี = ยังไม่ขอ (billingRequestLive)');
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-2' }, requests), false, 'ยกเลิกไม่ล้างลิงก์บนงวด');
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-3' }, requests), false);
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-9' }, requests), false, 'ถูกลบ/อ่านไม่ขึ้น');
  assert.equal(installmentBillingRequested({ billingRequestId: '' }, requests), false);
  assert.equal(installmentBillingRequested({ billingRequestId: 'RQ-1' }, null), false);
  assert.equal(billingRequestDead({ status: 'cancelled' }), true);
  assert.equal(billingRequestDead({ status: 'answered' }), false);
});

// ── 3. เติมตามรอบ: server คิดเองแล้วเทียบกับที่จอเห็น ────────────────────────────────────────────
// ลูกค้า B ของม็อก: วางบิลทุกวันที่ 25 · เงินเข้าวันที่ 25 เดือนถัดไป · วันนี้ 25 ก.ย. 2026
const RULE_B = { billing: { mode: 'monthly', day: 25 }, payment: { mode: 'monthly', day: 25, monthOffset: 1 } };
const TODAY = '2026-09-25';
const rowsB = () => [
  { id: 'I1', seq: 1, status: 'pending', dueDate: '2026-11-25', updatedAt: 't1' },
  { id: 'I2', seq: 2, status: 'pending', dueDate: '2026-12-25', updatedAt: 't2' },
  { id: 'I3', seq: 3, status: 'pending', dueDate: null, updatedAt: 't3' },
  { id: 'I4', seq: 4, status: 'pending', dueDate: null, updatedAt: 't4' },
];
const screenPlan = (rows, today = TODAY) => planMonthlyFill(RULE_B, rows, today).rows
  .map(({ id, billingDate, dueDate }) => ({ id, billingDate, dueDate }));

test('billingFillCheck: แผนที่จอส่งตรงกับที่ server คิด = ผ่าน (คืนแถวของ planMonthlyFill พร้อม keptDue)', () => {
  const built = billingFillCheck(RULE_B, rowsB(), screenPlan(rowsB()), TODAY);
  assert.equal(built.error, undefined);
  assert.deepEqual(built.rows.map((r) => [r.id, r.billingDate, r.dueDate, r.keptDue]), [
    ['I1', '2026-10-25', '2026-11-25', true],
    ['I2', '2026-11-25', '2026-12-25', true],
    ['I3', '2026-12-25', '2027-01-25', false],
    ['I4', '2027-01-25', '2027-02-25', false],
  ]);
});

test('🔴 billingFillCheck: จอเก่า (งวดเพิ่งถูกแก้ · รอบของลูกค้าเปลี่ยน · ข้ามวัน) = 409 ไม่เขียนชุดใหม่ทับเงียบ ๆ', () => {
  const plan = screenPlan(rowsB());
  // อีกหน้าต่างกำหนดวันงวด 3 ไปแล้ว ⇒ ชุดของ server เหลือ 3 งวดและวันเลื่อน
  const edited = rowsB().map((r) => (r.id === 'I3' ? { ...r, billingEvent: 'หลังติดตั้ง' } : r));
  assert.deepEqual(billingFillCheck(RULE_B, edited, plan, TODAY), { error: BILLING_FILL_STALE_MESSAGE, status: 409 });
  // ลูกค้าเปลี่ยนรอบเป็นวางบิลวันที่ 5
  const rule5 = { ...RULE_B, billing: { mode: 'monthly', day: 5 } };
  assert.equal(billingFillCheck(rule5, rowsB(), plan, TODAY).status, 409);
  // เปิดหน้าต่างค้างข้ามเดือน — รอบแรกเลื่อน
  assert.equal(billingFillCheck(RULE_B, rowsB(), plan, '2026-10-26').status, 409);
  // จอส่งวันเดียวผิด
  const tampered = plan.map((p, i) => (i === 3 ? { ...p, dueDate: '2027-03-01' } : p));
  assert.equal(billingFillCheck(RULE_B, rowsB(), tampered, TODAY).status, 409);
  // จอส่งงวดเกินมา/ซ้ำ
  assert.equal(billingFillCheck(RULE_B, rowsB(), [...plan, plan[0]], TODAY).status, 409);
});

test('billingFillCheck: ไม่มีแผน = 400 · ลูกค้าไม่มีรอบ/วางบิลได้ทุกวัน/ไม่มีงวดให้เติม = 409 พร้อมเหตุ', () => {
  assert.equal(billingFillCheck(RULE_B, rowsB(), [], TODAY).status, 400);
  assert.equal(billingFillCheck(RULE_B, rowsB(), null, TODAY).status, 400);
  const plan = screenPlan(rowsB());
  assert.match(billingFillCheck(null, rowsB(), plan, TODAY).error, /ยังไม่ตั้งรอบวางบิล/);
  const anyday = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
  assert.match(billingFillCheck(anyday, rowsB(), plan, TODAY).error, /ทุกวัน/);
  const filled = rowsB().map((r) => ({ ...r, billingDate: '2026-10-25' }));
  assert.equal(billingFillCheck(RULE_B, filled, plan, TODAY).status, 409);
});

// ── 3a. รอบรุ่นสอง (mig 0390 · มติ 26/09): หลายรอบต่อเดือน = ต้องบอกรอบ · ไม่มีเครดิต = ไม่มีรอบให้เติม ───────────
// ลูกค้าสองรอบ: วางบิลวันที่ 10 → เงินเข้า 25 เดือนเดียวกัน · วางบิลวันที่ 25 → เงินเข้า 10 เดือนถัดไป
const RULE_TWO = {
  billing: { mode: 'monthly', days: [10, 25] },
  payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] },
};
const rowsNew = () => [
  { id: 'N1', seq: 1, status: 'pending', dueDate: null, updatedAt: 't1' },
  { id: 'N2', seq: 2, status: 'pending', dueDate: null, updatedAt: 't2' },
];

test('billingFillCheck หลายรอบ: ไม่บอกรอบ = 409 "เลือกรอบก่อน" (จอเก่าที่ยังไม่เคยถาม) · บอกรอบ = คิดซ้ำด้วยรอบนั้น', () => {
  const planFor = (roundIndex) => planMonthlyFill(RULE_TWO, rowsNew(), TODAY, { roundIndex }).rows
    .map(({ id, billingDate, dueDate }) => ({ id, billingDate, dueDate }));
  const second = planFor(1);
  assert.deepEqual(second, [
    { id: 'N1', billingDate: '2026-09-25', dueDate: '2026-10-10' },
    { id: 'N2', billingDate: '2026-10-25', dueDate: '2026-11-10' },
  ]);
  const missing = billingFillCheck(RULE_TWO, rowsNew(), second, TODAY);
  assert.equal(missing.status, 409);
  assert.match(missing.error, /เลือกก่อนว่าจะใช้รอบไหน/);
  assert.deepEqual(billingFillCheck(RULE_TWO, rowsNew(), second, TODAY, { roundIndex: 1 }).rows.map((r) => r.billingDate),
    ['2026-09-25', '2026-10-25']);
  /* จอพรีวิวรอบ 2 แต่ส่งรอบ 1 (หรือกลับกัน) = แผนไม่ตรง = 409 ไม่เขียนรอบที่คนไม่ได้เห็น */
  assert.equal(billingFillCheck(RULE_TWO, rowsNew(), second, TODAY, { roundIndex: 0 }).status, 409);
  assert.match(billingFillCheck(RULE_TWO, rowsNew(), second, TODAY, { roundIndex: 5 }).error, /รอบที่เลือกไม่มี/);
  /* ลูกค้ารอบเดียวไม่อ่าน roundIndex — ค่าค้างจากตอนลูกค้ามีหลายรอบไม่ทำให้พัง */
  assert.equal(billingFillCheck(RULE_B, rowsB(), screenPlan(rowsB()), TODAY, { roundIndex: 1 }).error, undefined);
});

test('billingRedateCheck หลายรอบ: รอบที่เลือกคิดซ้ำที่ server · ไม่มีเครดิต = 409 พร้อมเหตุ', () => {
  const rows = [
    { id: 'R1', seq: 1, status: 'pending', billingDate: '2026-10-05', dueDate: '2026-10-25', updatedAt: 't1' },
    { id: 'R2', seq: 2, status: 'pending', billingDate: '2026-11-05', dueDate: '2026-11-25', updatedAt: 't2' },
  ];
  const fresh = billingRedateCheck(RULE_TWO, rows, [{ id: 'R1', billingDate: '2026-10-10', dueDate: '2026-10-25' },
    { id: 'R2', billingDate: '2026-11-10', dueDate: '2026-11-25' }], TODAY, { roundIndex: 0 });
  assert.equal(fresh.error, undefined);
  assert.deepEqual(fresh.rows.map((r) => [r.id, r.billingDate, r.dueDate]),
    [['R1', '2026-10-10', '2026-10-25'], ['R2', '2026-11-10', '2026-11-25']]);
  assert.match(billingRedateCheck(RULE_TWO, rows, [{ id: 'R1' }], TODAY).error, /เลือกก่อนว่าจะใช้รอบไหน/);
  const noCredit = billingRedateCheck({ credit: false }, rows, [{ id: 'R1' }], TODAY);
  assert.equal(noCredit.status, 409);
  assert.match(noCredit.error, /ไม่มีเครดิต/);
  assert.match(billingFillCheck({ credit: false }, rowsNew(), [{ id: 'N1' }], TODAY).error, /ไม่มีเครดิต/);
});

test('billingRoundIndexOf: ไม่ส่ง = null · เลข/สตริงเลข = index · ค่าผิดส่งต่อให้ตัวคิดตีกลับ (ไม่กลืนเป็น null)', () => {
  for (const value of [undefined, null, '']) assert.equal(billingRoundIndexOf(value), null);
  assert.equal(billingRoundIndexOf(0), 0);
  assert.equal(billingRoundIndexOf(1), 1);
  assert.equal(billingRoundIndexOf('1'), 1);
  assert.equal(billingRoundIndexOf('x'), 'x');
  assert.equal(billingRoundIndexOf(1.5), 1.5);
  /* รูปอื่นส่งต่อทั้งตัว — ห้ามกลายเป็นเลขรอบ (`[1]` → 1 · ช่องว่าง → 0 = รอบแรก · '1e0' → 1) */
  assert.deepEqual(billingRoundIndexOf([1]), [1]);
  assert.equal(billingRoundIndexOf(' '), ' ');
  assert.equal(billingRoundIndexOf('1e0'), '1e0');
  assert.equal(billingRoundIndexOf(true), true);
  assert.equal(billingRoundIndexOf(' 2 '), 2);
  assert.match(planMonthlyFill(RULE_TWO, rowsNew(), TODAY, { roundIndex: billingRoundIndexOf([1]) }).error, /รอบที่เลือกไม่มี/);
  /* ค่าผิดถึงตัวคิด = "รอบที่เลือกไม่มี" ไม่ใช่ "เลือกรอบก่อน" (จอเลือกไปแล้ว) */
  assert.match(planMonthlyFill(RULE_TWO, rowsNew(), TODAY, { roundIndex: billingRoundIndexOf('x') }).error, /รอบที่เลือกไม่มี/);
});

test('billingFillPatch: งวดที่มีกำหนดชำระแล้วคงวันเดิม — เขียนแค่วันวางบิล · ไม่แตะเหตุการณ์', () => {
  assert.deepEqual(billingFillPatch({ billingDate: '2026-10-25', dueDate: '2026-11-25', keptDue: true }),
    { billingDate: '2026-10-25' });
  assert.deepEqual(billingFillPatch({ billingDate: '2026-12-25', dueDate: '2027-01-25', keptDue: false }),
    { billingDate: '2026-12-25', dueDate: '2027-01-25' });
});

// ── 3b. เขียนการเติมทีละงวด: หยุดกลางทางแล้วบอกตามจริง (ฐานปลอม — เขียนแบบมีเงื่อนไข updatedAt) ─────────────────
/* ฐานปลอมของ `updateInstallment`: update(patch).eq('id').eq('updatedAt').select().maybeSingle()
   · แถวที่ updatedAt ไม่ตรง = ไม่มีแถวถูกแก้ (data null — ท่าเดียวกับ PostgREST) · `failOn` = id ที่ฐานตีกลับ */
const condDb = (seed, { failOn = null } = {}) => {
  const store = new Map(seed.map((r) => [r.id, { ...r }]));
  const writes = [];
  return {
    store,
    writes,
    from(table) {
      assert.equal(table, TABLE);
      return {
        update: (patch) => {
          const where = {};
          const q = {
            eq: (col, value) => { where[col] = value; return q; },
            select: () => ({
              maybeSingle: async () => {
                if (where.id === failOn) return { data: null, error: { code: '23514', message: 'boom' } };
                const cur = store.get(where.id);
                if (!cur || ('updatedAt' in where && cur.updatedAt !== where.updatedAt)) return { data: null, error: null };
                const next = { ...cur, ...patch };
                store.set(where.id, next);
                writes.push({ id: where.id, patch });
                return { data: next, error: null };
              },
            }),
          };
          return q;
        },
      };
    },
  };
};

test('🔴 writeBillingFill: ครบทุกงวด = before/after ทุกงวด · เขียนแบบมีเงื่อนไข · คงกำหนดชำระเดิม (keptDue)', async () => {
  const live = rowsB();
  const planned = billingFillCheck(RULE_B, live, screenPlan(live), TODAY).rows;
  const db = condDb(live);
  const res = await writeBillingFill(db, live, planned);
  assert.equal(res.stopped, null);
  assert.deepEqual(res.after.map((r) => [r.id, r.billingDate, r.dueDate]), [
    ['I1', '2026-10-25', '2026-11-25'],
    ['I2', '2026-11-25', '2026-12-25'],
    ['I3', '2026-12-25', '2027-01-25'],
    ['I4', '2027-01-25', '2027-02-25'],
  ]);
  assert.deepEqual(res.before.map((r) => r.id), ['I1', 'I2', 'I3', 'I4']);
  assert.ok(!('dueDate' in db.writes[0].patch), 'งวดที่มีกำหนดชำระแล้วเขียนแค่วันวางบิล');
});

test('🔴 writeBillingFill: อีกหน้าต่างแก้งวดกลางทาง = หยุดที่งวดนั้น · before/after มีแค่งวดที่ลงจริง (ป้อน audit) · งวดหลังไม่ถูกแตะ', async () => {
  const live = rowsB();
  const planned = billingFillCheck(RULE_B, live, screenPlan(live), TODAY).rows;
  const db = condDb(live);
  db.store.set('I3', { ...db.store.get('I3'), updatedAt: 't3-other-window' });  // แถวในฐานเปลี่ยนหลังด่านอ่าน
  const res = await writeBillingFill(db, live, planned);
  assert.deepEqual(res.stopped, { seq: 3, error: null });
  assert.deepEqual(res.after.map((r) => r.id), ['I1', 'I2']);
  assert.deepEqual(res.before.map((r) => r.id), ['I1', 'I2']);
  assert.deepEqual(db.writes.map((w) => w.id), ['I1', 'I2'], 'I4 ต้องไม่ถูกเขียนหลังหยุด');
  assert.equal(db.store.get('I4').billingDate, undefined);
  const message = billingFillStoppedMessage(res.after.length, { seq: res.stopped.seq, message: 'มีคนแก้งวดนี้' });
  assert.match(message, /^เติมวันแล้ว 2 งวด แต่หยุดที่งวดที่ 3 — มีคนแก้งวดนี้/);
  assert.match(message, /งวดที่เติมแล้วไม่ถูกเติมซ้ำ/, 'กดซ้ำต้องปลอดภัย และต้องบอกคนกด');
});

test('writeBillingFill: ฐานตีกลับงวดแรก = โยน error เดิม (ยังไม่มีอะไรลง) · ตีกลับงวดหลัง = หยุดพร้อม error ให้ route แปล', async () => {
  const live = rowsB();
  const planned = billingFillCheck(RULE_B, live, screenPlan(live), TODAY).rows;
  await assert.rejects(writeBillingFill(condDb(live, { failOn: 'I1' }), live, planned), (e) => e.code === '23514');
  const db = condDb(live, { failOn: 'I2' });
  const res = await writeBillingFill(db, live, planned);
  assert.equal(res.stopped.seq, 2);
  assert.equal(res.stopped.error.code, '23514');
  assert.deepEqual(res.after.map((r) => r.id), ['I1']);
  // งวดแรกเปลี่ยนไปแล้ว = ไม่มีอะไรลงเลย (route ตอบ 409 ข้อความงวดเปลี่ยน · ไม่ลง audit)
  const stale = condDb(live);
  stale.store.set('I1', { ...stale.store.get('I1'), updatedAt: 'x' });
  const none = await writeBillingFill(stale, live, planned);
  assert.deepEqual([none.after.length, none.stopped], [0, { seq: 1, error: null }]);
});

// ── 4. freeze ตั้งงวดใหม่: อุ้มวันวางบิล/เหตุการณ์ · null ไม่ทับค่าจริง · ไม่เอ่ยคอลัมน์ใหม่ถ้าไม่มีค่า ───────────
const TABLE = 'sales_order_installments';
const fakeDb = (seed = []) => {
  const store = new Map(seed.map((r) => [r.id, { ...r }]));
  const calls = { deleted: [], updates: [] };
  return {
    store,
    calls,
    rows: () => [...store.values()].sort((a, b) => a.seq - b.seq),
    from(table) {
      assert.equal(table, TABLE);
      const self = this;
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: self.rows(), error: null }) }) }),
        insert(payload) {
          payload.forEach((r) => store.set(r.id, { ...r }));
          return { select: async () => ({ data: payload, error: null }) };
        },
        update: (patch) => ({
          eq: (_col, id) => {
            const apply = () => {
              calls.updates.push({ id, patch });
              store.set(id, { ...store.get(id), ...patch });
              return store.get(id);
            };
            return {
              then: (resolve) => resolve({ data: apply(), error: null }),
              select: () => ({ maybeSingle: async () => ({ data: apply(), error: null }) }),
            };
          },
        }),
        delete: () => ({
          in: async (_col, ids) => {
            ids.forEach((id) => { calls.deleted.push(id); store.delete(id); });
            return { error: null };
          },
        }),
      };
    },
  };
};
const order = {
  id: 'SOR-1',
  totalAmount: 1000,
  quotation: {
    paymentPlan: {
      type: 'installment',
      installments: [{ label: 'มัดจำ', percent: 50, note: 'ก่อนผลิต' }, { label: 'ก่อนส่งของ', percent: 50 }],
    },
  },
};
const draftRow = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-1', seq: 1, label: 'มัดจำ', percent: 50, amount: 500,
  status: 'pending', frozenAt: null, evidence: [], ...over,
});

test('🔴 freeze ตั้งงวดใหม่: วันวางบิล/รอเหตุการณ์ตามไปตามลำดับงวด (เดิมหายเงียบ — map อุ้มแค่สี่ช่อง)', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, billingDate: '2026-10-05', dueDate: '2026-10-25' }),
    draftRow({ id: 'SOI-2', seq: 2, billingEvent: 'ก่อนส่งสินค้า' }),
    draftRow({ id: 'SOI-3', seq: 3 }),
  ]); // 3 งวดในใบ แต่แผนของ QT เหลือ 2 ⇒ เส้น "ลบแล้วตั้งใหม่"
  await freezeInstallments(db, { order, user: { id: 'U1' }, now: '2026-09-26T03:00:00.000Z' });
  const rows = db.rows();
  assert.deepEqual(db.calls.deleted, ['SOI-1', 'SOI-2', 'SOI-3']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].billingDate, '2026-10-05');
  assert.equal(rows[0].dueDate, '2026-10-25');
  assert.equal(rows[1].billingEvent, 'ก่อนส่งสินค้า');
  assert.equal(rows[1].billingDate ?? null, null, 'CHECK 0389: วันกับเหตุการณ์ไม่มาคู่กัน — อุ้มตามแถวเดิม');
});

test('🔴 freeze ตั้งงวดใหม่: เขียนกลับเฉพาะช่องที่มีค่า — null ของแถวเก่าไม่ทับค่าของงวดใหม่ · ไม่เอ่ยคอลัมน์ 0389 ถ้าไม่มีค่า', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, coversFrom: '2026-09-01', coversTo: '2027-02-28', note: null, billingDate: null }),
    draftRow({ id: 'SOI-2', seq: 2 }),
    draftRow({ id: 'SOI-3', seq: 3 }),
  ]);
  await freezeInstallments(db, { order, user: { id: 'U1' }, now: '2026-09-26T03:00:00.000Z' });
  const restore = db.calls.updates.filter((u) => 'coversTo' in u.patch);
  assert.equal(restore.length, 1);
  assert.deepEqual(Object.keys(restore[0].patch).sort(), ['coversFrom', 'coversTo'],
    'ก่อนรัน 0389 ชื่อ billingDate ใน payload = PGRST204 ⇒ แถวนั้นไม่ได้อุ้มอะไรเลย (รวมช่วงครอบของด่านช่าง)');
  const [first, second] = db.rows();
  assert.equal(first.note, 'ก่อนผลิต', 'หมายเหตุจากแผนของงวดใหม่ต้องไม่ถูก null ของแถวเก่าทับ');
  assert.equal(first.coversTo, '2027-02-28');
  assert.ok(!db.calls.updates.some((u) => u.id === second.id && Object.keys(u.patch).length && !('frozenAt' in u.patch)),
    'งวดที่ไม่มีอะไรให้อุ้มไม่ถูกเขียนซ้ำ');
});

// ── 5. ฐานยังไม่รัน 0389: บอกให้รันมิกที่ถูกตัว ────────────────────────────────────────────────────
test('installmentBillingSchemaError: รหัสไม่มีคอลัมน์ของวันวางบิล = 0389 (ก่อนตัวของ 0378 ที่เหมาทุกคอลัมน์)', () => {
  const pgrst = { code: 'PGRST204', message: "Could not find the 'billingDate' column of 'sales_order_installments' in the schema cache" };
  assert.equal(installmentBillingSchemaError(pgrst), INSTALLMENT_BILLING_SCHEMA_MISSING);
  assert.equal(installmentBillingSchemaError({ code: '42703', message: 'column customers.billingRule does not exist' }),
    INSTALLMENT_BILLING_SCHEMA_MISSING);
  const refund = { code: 'PGRST204', message: "Could not find the 'refundedOn' column" };
  assert.equal(installmentBillingSchemaError(refund), null, 'คอลัมน์ของ 0378 ห้ามโทษ 0389');
  assert.equal(installmentRefundSchemaError(refund), INSTALLMENT_REFUND_SCHEMA_MISSING);
  assert.equal(installmentBillingSchemaError({ code: '23514', message: 'billingDate check' }), null);
  assert.equal(installmentBillingSchemaError(null), null);
});

// ── 6. ยามต้นทาง: ผู้เรียกทุกทางต่อสายครบ ──────────────────────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}
const ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';

test('route งวด: fill-billing เป็นคำสั่งของทั้งใบ (ก่อนด่าน installmentId) · ด่าน schedule ทีละงวด · เขียนแบบมีเงื่อนไข · audit', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const dispatch = patch.indexOf("if (action === 'fill-billing') return fillBillingDates({ user, supabase, req, id, body });");
  assert.ok(dispatch > 0 && dispatch < patch.indexOf("if (!installmentId) return badRequest("),
    'proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้ — คำสั่งของทั้งใบต้องมาก่อนด่านงวดเดียว');
  const fill = slice(route, 'async function fillBillingDates(', 'async function replanOrderInstallments(');
  assert.ok(fill.indexOf("if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');") >= 0
    && fill.indexOf("if (!installmentScheduleAllowed(user)) return forbidden(") < fill.indexOf('loadOrderForUser('),
    'สิทธิ์ก่อนโหลด — คนที่ผ่าน proxy ด้วย payments:confirm แต่ไม่ใช่ FN ต้องได้ 403 ไม่ใช่เหตุของรอบ/แผน');
  assert.match(fill, /billingFillCheck\(billing\.rule, live, body\.plan, businessDate\(\), \{ roundIndex \}\)/, 'วันนี้ = นาฬิกาไทย · แผนคิดใหม่ที่ server');
  assert.match(fill, /const roundIndex = billingRoundIndexOf\(body\.roundIndex\);/, 'รอบที่คนเลือก (ลูกค้าหลายรอบ) คิดซ้ำที่ server');
  assert.match(fill, /installmentActionError\(byId\.get\(planned\.id\), 'schedule', user, \{/);
  assert.match(fill, /orderLock = historicalInstallmentLock\(order\) \|\| pipelineInstallmentLock\(order, 'schedule'\)/);
  assert.match(fill, /written = await writeBillingFill\(supabase, live, built\.rows\)/);
  assert.ok(fill.indexOf('installmentActionError(') < fill.indexOf('writeBillingFill('), 'ด่านทุกงวดก่อนเขียนงวดแรก');
  // audit = เฉพาะงวดที่เขียนจริง (before/after จาก writeBillingFill ตรง ๆ) · หยุดกลางทาง = 409 ด้วยข้อความกลาง
  assert.match(fill, /const \{ before, after \} = written;/);
  assert.match(fill, /before: \{ installments: before \},/);
  assert.match(fill, /after: \{ installments: after, fill: 'billing-monthly', billingRule: billing\.rule, roundIndex \},/);
  assert.ok(fill.indexOf('await recordAudit({') < fill.indexOf('billingFillStoppedMessage(after.length, stopped)'),
    'หยุดกลางทางยังต้องลง audit งวดที่เขียนไปแล้วก่อนตอบ 409');
  assert.match(fill, /if \(stopped\) return fail\(billingFillStoppedMessage\(after\.length, stopped\), 409\);/);
  const store = code('lib/sales/salesOrderInstallmentsStore.js');
  const writer = slice(store, 'export async function writeBillingFill(', 'export async function loadInstallment(');
  assert.match(writer, /updateInstallment\(supabase, row\.id, billingFillPatch\(plan\), \{ expectedUpdatedAt: row\.updatedAt \}\)/);
});

test('route งวด: schedule แตะวันวางบิลเฉพาะเมื่อจอส่งคีย์มา (โมดัลเดิมส่งแค่ dueDate) · ตรวจรูปด้วย normalizeInstallmentBilling', () => {
  const patch = slice(code(ROUTE), 'export const PATCH');
  const schedule = slice(patch, "if (action === 'schedule') {", "} else if (action === 'coverage') {");
  assert.match(schedule, /patch = \{ dueDate \};/);
  assert.match(schedule, /if \(Object\.hasOwn\(body, 'billingDate'\) \|\| Object\.hasOwn\(body, 'billingEvent'\)\) \{/);
  assert.match(schedule, /if \(isOpeningInstallment\(row\)\) return badRequest\(/);
  assert.match(schedule, /normalizeInstallmentBilling\(\{/);
  const write = slice(patch, 'updated = await updateInstallment(supabase, installmentId, patch');
  assert.ok(write.indexOf('installmentBillingSchemaError(writeError)') < write.indexOf('installmentRefundSchemaError(writeError)'),
    'ถามมิก 0389 ก่อน — ตัวของ 0378 เหมารหัสเดียวกันทุกคอลัมน์');
});

test('หน้าใบ: GET โหลดรอบวางบิลของลูกค้าพร้อมทางถอย 42703 · คำร้องที่งวดผูกอยู่ไม่ตัดใบที่ยกเลิก', () => {
  const route = code(SO_ROUTE);
  const customer = slice(route, 'async function loadCustomerOfOrder(', '\n}\n');
  assert.match(customer, /\.select\('id, arCode, team, teams, "billingRule"'\)/);
  assert.match(customer, /if \(withRule\.error\?\.code !== '42703'\) return/);
  assert.match(customer, /\.select\('id, arCode, team, teams'\)/, 'ทางถอยต้องมีทีมด้วย — ไม่งั้นลูกค้าดูเหมือนของกลาง ทุกทีมได้ธงตั้งรอบ');
  assert.match(customer, /billingSchemaReady: false/);
  const get = slice(route, 'export const GET', 'export const PATCH');
  assert.match(get, /canEditBillingRule: canEditCustomerBillingRule\(user, order\.customer\),/,
    'ธงตั้งรอบของแผง = ตัวตัดสินเดียวกับ API ตั้งรอบ');
  const load = slice(route, 'async function loadOrder(', '\n}\n');
  assert.match(load, /loadCustomerOfOrder\(supabase, order\.customerId\)/);
  assert.match(load, /billingSchemaReady,/);
  const linked = slice(load, 'fetchInChunks(linkedRequestIds', 'if (linkedError)');
  assert.doesNotMatch(linked, /\.neq\('status', 'cancelled'\)/, 'ยกเลิกคำร้อง ≠ ถูกลบ — แผงต้องบอกตามจริง');
});

test('แผงงวด: โมดัลกำหนดวันงวดส่ง pickerPayload + savedDueDate · ลิงก์ขอใบวางบิลพก installmentId/requiredDate · หน้าใบส่งฝ่าย', () => {
  const panel = code(PANEL);
  assert.match(panel, /onAction\(live\(scheduleFor\.row\), "schedule", withRule\s*\? pickerPayload\(scheduleFor\.pick\)\s*: \{\s*dueDate: scheduleFor\.dueDate \|\| null,\s*\.\.\.\(scheduleFor\.clearBilling \? \{ billingDate: null, billingEvent: null \} : \{\}\),\s*\}\)/,
    'โมดัลแบบเดิม (ลูกค้าไม่มีรอบ) ต้องล้างวันวางบิลที่ค้างได้ — ไม่งั้นป้าย "เลยรอบวางบิล" ค้างถาวร');
  assert.match(panel, /savedDueDate=\{scheduleRow\.dueDate \|\| ""\}/);
  assert.match(panel, /const missing = withRule \? pickerMissing\(scheduleFor\.pick\) : "";/);
  // ลิงก์ประกอบที่ lib/sales/billingRequestHref.js ที่เดียว (installmentId/requiredDate ตรวจใน billingRequestHref.test.mjs)
  // — ปุ่มในแถวกระดิ่งใช้ตัวเดียวกัน · closure ในแผงกลับมาเมื่อไร สองปุ่มเพี้ยนหากันได้โดยไม่มีเทสต์แดง
  assert.match(panel, /import \{ billingRequestHref \} from "@\/lib\/sales\/billingRequestHref";/);
  assert.match(panel, /const newBillingRequestHref = \(row\) => billingRequestHref\(order, row\);/);
  assert.doesNotMatch(panel, /new URLSearchParams\(/, 'ห้ามประกอบลิงก์คำร้องเองในแผง');
  assert.match(panel, /installmentBillingRequested\(row, requestById\)/);
  // แดง "เลยกำหนด" ยังอ่าน dueDate ช่องเดียว — วันวางบิลไม่มีทางแดง
  assert.match(panel, /const overdue = !installmentVoid\(row, order\) && row\.status !== "confirmed" && row\.dueDate && String\(row\.dueDate\) < String\(todayIso\);/);
  assert.doesNotMatch(panel, /billingDate[^;\n]*<\s*String\(todayIso\)/);
  assert.match(panel, /colSpan=\{\(single \? 7 : 8\) \+ \(showCoverage \? 1 : 0\) \+ \(billingColumn \? 1 : 0\)\}/);
  const page = code(SO_PAGE);
  assert.match(page, /user=\{\{ id: order\.meId, role, department: order\.meDepartment \}\}/,
    'ด่านวันงวดของ FN ตัดสินฝ่าย — แผงต้องได้ฝ่ายเดียวกับที่ route เห็น');
  assert.match(page, /json: \{ action: "fill-billing", plan, roundIndex \}/);
  assert.match(page, /onFillBilling=\{runBillingFill\}/);
});

test('แผงงวด (review S3): คำร้องอ่านไม่ขึ้นไม่เตือนผิด · ใบที่ตายทุกแบบไม่มีวางบิล · ไม่มีสิทธิ์ตั้งรอบ = ไม่ชวนตั้ง · โมดัลเติมไม่ค้าง', () => {
  const panel = code(PANEL);
  // อ่านคำร้องไม่ขึ้น = ไม่รู้ว่าขอแล้วหรือยัง ⇒ ไม่นับเลยรอบ/งวดถัดไป ไม่ขึ้นป้าย
  assert.match(panel, /const billingUnknown = \(row\) => Boolean\(order\?\.billingRequestsError && row\?\.billingRequestId\s*&& !requestById\.has\(row\.billingRequestId\)\);/);
  assert.match(panel, /const lateBilling = billingOn \? liveRows\.filter\(\(r\) => !billingUnknown\(r\) && billingStateOf\(r\)\.key === "late"\) : \[\];/);
  assert.match(panel, /\.filter\(\(r\) => r\.billingDate && !billingUnknown\(r\) && BILLING_OPEN\.includes\(billingStateOf\(r\)\.key\)\)/);
  assert.match(panel, /const showBadge = !installmentVoid\(row, order\) && !billingUnknown\(row\)/);
  // ใบย้อนหลังที่ยกเลิกก็ตาย — และงวดโมฆะไม่ส่งลิงก์คำร้องไปคอลัมน์ที่ซ่อนป้ายของมัน
  assert.match(panel, /const deadOrder = deadPipeline \|\| \(historical && order\?\.status === "cancelled"\);/);
  assert.match(panel, /const billingOn = order\?\.billingSchemaReady !== false && !deadOrder && !movedAway;/);
  assert.match(panel, /row\.billingRequestId && !\(billingColumn && !installmentVoid\(row, order\) && billingStateOf\(row\)\.key === "requested"\)/);
  /* คอลัมน์วันวางบิลซ่อนเมื่อไม่มีรอบ/ไม่มีเครดิตและไม่มีงวดไหนมีวันวางบิล — ลิงก์คำร้องต้องกลับไปอยู่ช่องรายละเอียด (ไม่หายทั้งสองที่) */
  assert.match(panel, /const billingColumn = billingOn && \(Boolean\(billingRule\)/);
  // ชวนตั้งรอบเฉพาะคนที่ API ตั้งรอบให้ผ่าน
  assert.match(panel, /const canSetBillingRule = order\?\.canEditBillingRule === true;/);
  assert.match(panel, /\{!billingRule && !noCredit && canSetBillingRule \? "ตั้งรอบวางบิล" : "ดูที่ทะเบียนลูกค้า"\}/,
    'ไม่มีเครดิต = ตั้งแล้ว ไม่ชวนไปตั้งรอบ');
  assert.match(panel, /action=\{canSetBillingRule \? \(/);
  // โมดัลเติม: ไม่มีงวดเหลือ = ปุ่มปิดปุ่มเดียว · เหลืองวดเดียวหลังหยุดกลางทางยังยืนยันได้
  assert.match(panel, /const fillAllowed = fillRows\.length > 0 && fillGatesOpen\(fillRows\);/);
  assert.match(panel, /const canFill = fillCandidates\.length >= 2 && fillGatesOpen\(fillCandidates\);/);
  assert.match(panel, /disabled=\{!!busy \|\| !fillAllowed\} onClick=\{submitFill\}/);
  // ลูกค้าหลายรอบต่อเดือน: ถามรอบก่อนพรีวิว · ไม่เลือกให้ · เปิดใหม่ล้างที่เลือก · ส่งรอบไปกับแผน
  assert.match(panel, /const \[fillRound, setFillRound\] = useState\(null\);/);
  assert.match(panel, /setFillRound\(null\); setFillOpen\(true\);/);
  assert.match(panel, /planMonthlyFill\(billingRule, saved, todayIso, \{ roundIndex: fillRoundIndex \}\)/);
  /* state จำ **วันวางบิลของรอบ** (ไม่ใช่ลำดับ) — 409 ดึงรอบใหม่แล้วลำดับเลื่อน ชิปที่เลือกต้องไม่กระโดดไปรอบอื่น */
  assert.match(panel, /const fillRoundIndex = pickedRoundIndex\(billingRule, fillRound\);/);
  assert.match(panel, /const fillRoundValue = fillRoundIndex === null \? null : fillRound;/);
  assert.match(panel, /<BillingRoundChoice choices=\{roundChoices\} value=\{fillRoundValue\} onChange=\{setFillRound\}/);
  assert.match(panel, /roundIndex: fillRoundIndex,/);
  /* ยังไม่เลือกรอบ = ปุ่มยืนยันไม่มีจำนวนงวด (เหมือนจัดวันใหม่) — เลขที่นับก่อนเลือกรอบทำให้ปุ่มที่ดับดูพร้อมกด */
  assert.match(panel, /fillRoundMissing \? "เติมวัน" : `เติมวัน \$\{fillRows\.length\} งวด`/);
  assert.doesNotMatch(panel, /fillRoundMissing \? fillCandidates : fillRows/);
  /* รอบลูกค้าไม่เป็นรายเดือนแล้วระหว่างเปิดโมดัล = บอกเหตุจริง ไม่ใช่ "ไม่มีงวดที่ต้องเติมวันแล้ว" */
  assert.match(panel, /\{monthlyRule \? fillPlan\?\.error \|\| "ไม่มีงวดที่ต้องเติมวันแล้ว" : noMonthlyNote\("เติมวัน"\)\}/);
  // รอบรุ่นสอง: ไม่มีเครดิต = ทำเหมือนไม่มีรอบ (pickerRuleOf) · ห้ามอ่านช่องรุ่นแรกตรง ๆ
  assert.match(panel, /const billingRule = billingOn \? pickerRuleOf\(order\?\.customer\?\.billingRule\) : null;/);
  assert.doesNotMatch(panel, /billingRule\??\.billing\.mode|\.payment\.day|\.billing\.day|\.monthOffset/);
  // ประกาศเลยรอบเป็นสตริงเดียว (thaiText ตัดบรรทัดให้เฉพาะลูกที่เป็นสตริง)
  assert.doesNotMatch(panel, /ยังไม่ขอใบวางบิล`\}\s*\{lateBilling\.length === 1/);
});
