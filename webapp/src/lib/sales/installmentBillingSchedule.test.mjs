// ── กำหนดวางบิลบนงวดของใบ (mig 0389 · มติเจ้าของ 25–26/09 · ม็อก mockups/billing-cycle จอ C) ─────────────
// สามเรื่องที่พังเงียบได้ทั้งหมด:
//   1. ด่านวันงวด (`schedule`) — มติข้อ 4 ให้ฝ่ายบัญชีแก้วันงวดได้ · ปุ่มกับ API ต้องถามตัวเดียวกันด้วยค่าชุดเดียวกัน
//   2. "เติมตามรอบ เดือนละงวด" (`fill-billing`) — **ถอดแล้ว** (รุ่นสี่ · system-design §7.5): route ตอบ 410 · ตัวตรวจแผน/ตัวเขียนถูกลบ
//   3. freeze ตั้งงวดใหม่ (จำนวนงวดไม่ตรงแผน) ต้องอุ้มวันวางบิล/เหตุการณ์ (+ ติ๊ก billingSkip ของ 0393) ข้ามไปตามลำดับงวด
//      และ null ต้องไม่ทับค่าจริง
// + ยามต้นทาง (อ่าน source): route/จอ/หน้าใบ ต่อสายครบ — พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้" (ตัดคอมเมนต์ก่อน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  billingRequestDead, installmentActionError, installmentBillingRequested,
} from './salesOrderPayments.js';
import {
  INSTALLMENT_BILLING_SCHEMA_MISSING, INSTALLMENT_REFUND_SCHEMA_MISSING, freezeInstallments,
  installmentBillingSchemaError, installmentRefundSchemaError,
} from './salesOrderInstallmentsStore.js';
import { BILLING_V4_SCHEMA_MISSING, billingV4SchemaError } from './billingPolicySchema.js';

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

test('🔴 freeze ตั้งงวดใหม่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" (0393) ตามไปตามลำดับงวด · เก็บแค่ true · ก่อน 0393 ไม่เอ่ยคอลัมน์', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, dueDate: '2026-10-25', billingSkip: true }),
    draftRow({ id: 'SOI-2', seq: 2, billingSkip: null, dueDate: '2026-11-25' }),
    draftRow({ id: 'SOI-3', seq: 3, billingSkip: false }),
  ]);
  await freezeInstallments(db, { order, user: { id: 'U1' }, now: '2026-09-26T03:00:00.000Z' });
  const [first, second] = db.rows();
  assert.equal(first.billingSkip, true, 'ติ๊กบนใบร่างแล้วอนุมัติ ติ๊กต้องไม่หาย (ไม่งั้นกระดิ่ง/ทะเบียนกลับมาชวนวางบิลงวดมัดจำ)');
  assert.equal(second.billingSkip ?? null, null);
  const restores = db.calls.updates.filter((u) => 'dueDate' in u.patch);
  assert.deepEqual(restores.map((u) => Object.keys(u.patch).sort()), [['billingSkip', 'dueDate'], ['dueDate']],
    'อุ้มเฉพาะ true — null/false ไม่อยู่ใน payload');
  // ก่อนรัน 0393: select('*') ไม่คืนคีย์ billingSkip ⇒ payload ไม่มีชื่อคอลัมน์นี้เลย (ไม่ชน PGRST204 แล้วเสียช่วงครอบไปด้วย)
  const before0393 = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, dueDate: '2026-10-25' }), draftRow({ id: 'SOI-2', seq: 2 }), draftRow({ id: 'SOI-3', seq: 3 }),
  ]);
  await freezeInstallments(before0393, { order, user: { id: 'U1' }, now: '2026-09-26T03:00:00.000Z' });
  assert.equal(before0393.calls.updates.some((u) => 'billingSkip' in u.patch), false);
});

// ── 5. ฐานยังไม่รัน 0389 / 0393: บอกให้รันมิกที่ถูกตัว ───────────────────────────────────────────────
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
  /* รุ่นสี่: คอลัมน์ติ๊ก (0393) — ตัวของ 0389 ไม่รู้จัก ⇒ route ถาม billingV4SchemaError ก่อน (ยามต้นทางใน installmentScheduleMany.test) */
  const skip = { code: 'PGRST204', message: "Could not find the 'billingSkip' column of 'sales_order_installments' in the schema cache" };
  assert.equal(installmentBillingSchemaError(skip), null);
  assert.equal(billingV4SchemaError(skip), BILLING_V4_SCHEMA_MISSING);
  assert.equal(installmentRefundSchemaError(skip), INSTALLMENT_REFUND_SCHEMA_MISSING, 'ตัวของ 0378 เหมาทุกคอลัมน์ — ต้องมาทีหลังเสมอ');
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
const FILL = 'components/salesPlanning/installmentDates/InstallmentDateFill.js';
const MODE_HOOK = 'components/salesPlanning/installmentDates/useInstallmentDateMode.js';
const DRAFTS = 'lib/sales/installmentDateDrafts.js';
const CELL = 'components/salesPlanning/installmentDates/InstallmentDateCell.js';
const CREATE_PAGE = 'app/sales-planning/sales-orders/new/page.js';
const CHROME = 'components/salesPlanning/installmentDates/InstallmentDateChrome.js';

test('route งวด: fill-billing / redate-billing ถอดแล้ว (รุ่นสี่ §7.5) = 410 "โหลดหน้าใหม่" ก่อนด่าน installmentId · ไม่เหลือตัวคิดรอบรุ่นสอง', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const retired = patch.indexOf('if (RETIRED_BILLING_ACTIONS.includes(action)) return fail(RETIRED_BILLING_MESSAGE, 410);');
  assert.ok(retired > 0 && retired < patch.indexOf("if (!installmentId) return badRequest("),
    'แท็บเก่าต้องได้ 410 พร้อมคำบอก ไม่ใช่ "ไม่ได้ระบุงวด" ที่ชี้ทางผิด');
  assert.match(route, /const RETIRED_BILLING_ACTIONS = Object\.freeze\(\['fill-billing', 'redate-billing'\]\);/);
  assert.match(route, /const RETIRED_BILLING_MESSAGE = 'คำสั่งนี้เลิกใช้แล้ว — โหลดหน้าใหม่';/);
  assert.doesNotMatch(route, /fillBillingDates|redateBillingDates|billingFillCheck|billingRedateCheck|billingRoundIndexOf|writeBillingFill/);
  // ตัวตรวจแผน/ตัวเขียนของสองคำสั่งถูกลบพร้อม route — ไม่มีผู้เรียกเหลือ (ลบของตายแทนการปล่อยให้ดูเหมือนยังใช้)
  const payments = code('lib/sales/salesOrderPayments.js');
  assert.doesNotMatch(payments, /export (function|const) (billingFillCheck|billingRedateCheck|billingRedateRows|billingRoundIndexOf|billingFillPatch)\b/);
  const store = code('lib/sales/salesOrderInstallmentsStore.js');
  assert.doesNotMatch(store, /export async function writeBillingFill\(/);
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
  assert.ok(write.indexOf('billingV4SchemaError(writeError)') >= 0
    && write.indexOf('billingV4SchemaError(writeError)') < write.indexOf('installmentBillingSchemaError(writeError)'),
    'รุ่นสี่: 0393 (billingSkip) ก่อน 0389 — ตัวของ 0389 ไม่รู้จักคอลัมน์ติ๊ก');
});

test('route งวด: schedule รุ่นสี่ — ด่านเดียวกับ schedule-many (validateInstallmentDates กับกติกาที่อ่านสด) · ติ๊กเขียน true/null เฉพาะเมื่อเปลี่ยน · ข้อยกเว้นลง audit', () => {
  const patch = slice(code(ROUTE), 'export const PATCH');
  const schedule = slice(patch, "if (action === 'schedule') {", "} else if (action === 'coverage') {");
  const steps = [
    'const flagError = billingFlagShapeError(body);',
    "const skipNext = Object.hasOwn(body, 'billingSkip') ? body.billingSkip === true : rowSkipped(row);",
    'const billingRule = await loadScheduleRule(supabase, order.customerId);',
    'billingException: body.billingException === true,',
    'const dateError = validateInstallmentDates(row, next, billingRule.rule, { ruleUnavailable: billingRule.ruleUnavailable });',
    'if (dateError) return badRequest(dateError);',
    'if (!(await billingSkipReady(supabase, siblings))) return fail(BILLING_V4_SCHEMA_MISSING, 503);',
    'patch = { ...patch, billingSkip: skipNext ? true : null };',
    'scheduleExceptions = scheduleExceptionsOf(row, next, billingRule.rule);',
  ];
  let at = -1;
  for (const step of steps) {
    const next = schedule.indexOf(step, at + 1);
    assert.ok(next > at, `ลำดับผิด/หาไม่เจอ: ${step}`);
    at = next;
  }
  // กำหนดชำระยังเขียนทุกครั้งตามเดิม (โมดัลเดิมส่งแค่ dueDate) — ด่านรุ่นสี่ไม่คิดกำหนดชำระให้ใหม่
  assert.doesNotMatch(schedule, /dueFor\(|dueDateForBilling|planFill|planRedate/);
  assert.match(patch, /summary: `\$\{action\} งวด \$\{row\.seq\} ของ \$\{order\.orderNumber\}`\s*\+ scheduleExceptions\.map\(\(kind\) => ` · \$\{scheduleExceptionText\(kind, actorName\)\}`\)\.join\(''\),/);
});

test('หน้าใบ: GET โหลดรอบวางบิลของลูกค้าพร้อมทางถอย 42703 · คำร้องที่งวดผูกอยู่ไม่ตัดใบที่ยกเลิก', () => {
  const route = code(SO_ROUTE);
  const customer = slice(route, 'async function loadCustomerOfOrder(', '\n}\n');
  assert.match(customer, /\.select\('id, arCode, team, teams, "billingRule", "billingRuleUpdatedAt"'\)/,
    'แถบ "ต้องวางบิลไหม" ส่งตัวล็อกดิบกลับ — ขาดช่องนี้ = 409 ทุกครั้งกับลูกค้า {credit:false} ที่ 0390 ประทับเวลาไว้');
  assert.match(customer, /if \(withRule\.error\?\.code !== '42703'\) return/);
  assert.match(customer, /\.select\('id, arCode, team, teams'\)/, 'ทางถอยต้องมีทีมด้วย — ไม่งั้นลูกค้าดูเหมือนของกลาง ทุกทีมได้ธงตั้งรอบ');
  assert.match(customer, /billingSchemaReady: false/);
  const get = slice(route, 'export const GET', 'export const PATCH');
  assert.match(get, /canEditBillingRule: canEditCustomerBillingRule\(user, order\.customer\),/,
    'ธงตั้งรอบของแผง = ตัวตัดสินเดียวกับ API ตั้งรอบ');
  const load = slice(route, 'async function loadOrder(', '\n}\n');
  assert.match(load, /loadCustomerOfOrder\(supabase, order\.customerId\)/);
  assert.match(load, /billingSchemaReady,/);
  // ⭐ rework v4 — ธง 0393 ของแผง (ติ๊ก "งวดนี้ไม่ต้องวางบิล" + ปุ่มของแถบ "ต้องวางบิลไหม") ต้องมาจาก GET ใบ
  assert.match(load, /billingSkipReadyOf\(installmentRows\) \?\? \(await probeBillingSkip\(supabase\)\)\.ready/);
  assert.match(load, /billingSkipReady,/);
  // ⭐ mig 0413: คำร้องที่ผูกงวดอ่านผ่านตัวโหลดกลาง (ตามงวด ∪ ตามตัวชี้) — ตัวโหลดไม่กรองสถานะ (ยกเลิก ≠ ถูกลบ)
  const linked = slice(load, 'await loadInstallmentRequests(supabase, installmentRows', 'if (linkedError)');
  assert.doesNotMatch(linked, /\.neq\('status', 'cancelled'\)/, 'ยกเลิกคำร้อง ≠ ถูกลบ — แผงต้องบอกตามจริง');
  const loader = slice(code('lib/sales/installmentRequestsStore.js'), 'export async function loadInstallmentRequests(', '\n}\n');
  assert.doesNotMatch(loader, /\.neq\('status'/, 'ตัวโหลดกลางต้องคืนคำร้องที่ยกเลิกด้วย');
});

test('แผงงวด: วันงวดสองช่องแยก (มติ 02/11 · เดิมแบบ C 28/09) บันทึกผ่าน schedule-many ทางเดียว · ล็อกประโยคเดียวกับ route · ลิงก์ขอใบวางบิล · หน้าใบส่งฝ่าย', () => {
  const panel = code(PANEL);
  // ช่องวันในตาราง + บันทึกครั้งเดียว — โมดัลรายงวดสองแบบ / ตัวเลือกรอบในแผง / ปุ่มเติม-จัดวันใหม่ / โหมด+ตัวแก้รายงวด ถอดแล้ว
  assert.match(panel, /const saveDates = useCallback\(\(rows\) => onAction\(null, "schedule-many", \{ rows \}\), \[onAction\]\);/);
  assert.match(panel, /useInstallmentDateMode\(\{/);
  assert.match(panel, /lockOf: dateLockOf,/);
  assert.doesNotMatch(panel, /BillingRoundPicker|pickerPayload|scheduleFor|"schedule", withRule/, 'โมดัลรายงวดเดิมต้องไม่กลับมา');
  assert.doesNotMatch(panel, /onFillBilling|onRedateBilling|fill-billing|redate-billing/, 'จอไม่เรียก action เติม/จัดวันใหม่ของ route แล้ว');
  assert.doesNotMatch(panel, /เลือกรอบ<\/button>|เติมตามรอบ เดือนละงวด…|จัดวันใหม่ตามรอบปัจจุบัน…/, 'ทางเข้าเก่าถอดหมดแล้ว');
  // ล็อกของโหมด = ประโยคของ route (dateLockView → installmentDateLock) + ด่าน schedule + คำร้องชุดเดียวกับป้าย
  const lock = slice(panel, 'const dateLockOf = (row) => dateLockView(row, {', '});');
  assert.match(lock, /requested: requestedIds\.has\(row\.id\),/);
  assert.match(lock, /requestUnknown: billingUnknown\(row\),/, 'อ่านคำร้องไม่ขึ้น ≠ ยังไม่ขอ');
  assert.match(lock, /gateError: gate\(row, "schedule"\) \|\| "",/, 'ด่านสิทธิ์ตัวเดียวกับ route');
  // ไม่มีสิทธิ์ = ไม่มีช่อง (ตารางอ่านอย่างเดียว) · ใบล็อกทั้งใบ = ปุ่มเติมยังอยู่ กดแล้วบอกเหตุ (ติดด่าน = โชว์แล้วบอกเหตุ) ·
  // ร่างช่วงครอบค้าง = ช่องวันอ่านอย่างเดียว · ร่างวันงวดค้าง = ช่วงครอบล็อก
  assert.match(panel, /const dateModeOpen = !isPreview && billingOn && installmentScheduleAllowed\(user\)\s*&& \(Boolean\(scheduleOrderLock\) \|\| saved\.some\(\(row\) => !dateLockOf\(row\)\)\);/);
  assert.match(panel, /const scheduleOrderLock = orderLock \|\| pipelineInstallmentLock\(order, "schedule"\);/);
  assert.match(panel, /blocker: scheduleOrderLock \|\| \(coverDraftCount\s*\?/, 'ล็อกทั้งใบเป็นเหตุของปุ่ม — ไม่ใช่ปุ่มหาย');
  // ร่างแรก/เปิดแผงเติม ล้าง error เก่าของหน้า — ไม่ขึ้นค้างในแถบบันทึกใหม่
  assert.match(panel, /onDirtyChange: onDatesDirty,\s*onClearError,/);
  /* ⭐ รุ่นสี่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" เฉพาะฐานที่รัน 0393 · "งวดนี้ต้องวางบิล…" เปิดโมดัลขอบเขตของแผง */
  assert.match(panel, /skipReady: billingSkipReady,/);
  assert.match(panel, /const billingSkipReady = billingOn && order\?\.billingSkipReady === true;/);
  assert.match(panel, /onAskRequireBilling: \(row\) => \{ onClearError\?\.\(\); setNeedFor\(row\); \},/);
  const hook = code(MODE_HOOK);
  assert.match(slice(hook, 'const setValue = (row, value) => {', '\n  };'),
    /if \(blocker\) \{ notifyToast\.error\(blocker\); return; \}\s*if \(!changes\.length && !fill\) clearErrorRef\.current\?\.\(\);/);
  assert.match(hook, /const canEdit = useCallback\(\(row\) => Boolean\(row\) && available && !blocker && !isLocked\(row\), \[available, blocker, isLocked\]\);/);
  assert.doesNotMatch(hook, /const (enter|open|close|tap|choose) = /, 'ไม่มีโหมด/ตัวแก้รายงวด/ไปงวดถัดไปเอง (มติ 02/11)');
  assert.match(slice(hook, 'const openFill = ({ includeDated = false } = {}) => {', '\n  };'), /clearErrorRef\.current\?\.\(\);/);
  // "เอาคืน" ถามด่านล่าสุด (ร่างช่วงครอบที่เริ่มระหว่าง toast ค้าง) — สองชุดร่างเปิดพร้อมกันไม่ได้
  assert.match(slice(hook, 'const cancel = () => {', '\n  };'), /const gate = gateRef\.current;\s*if \(!gate\.available\) return;\s*if \(gate\.blocker\) \{ notifyToast\.error\(gate\.blocker\); return; \}/);
  // ระหว่างบันทึกแก้ร่างไม่ได้ (บันทึกสำเร็จแล้ว reset = ของที่แก้ตอนนั้นหายเงียบ) · เกินเพดานของ route = ดับปุ่มพร้อมเหตุ
  assert.match(slice(hook, 'const setValue = (row, value) => {', '\n  };'), /if \(busy \|\| !row\) return;/);
  assert.match(hook, /const saveBlocker = changes\.length > SCHEDULE_MANY_MAX/);
  assert.match(code(CHROME), /disabled=\{mode\.busy \|\| Boolean\(mode\.saveBlocker\)\} onClick=\{mode\.save\}/);
  // คืนค่าระหว่างแผงเติมเปิด = ฐานของแผงทิ้งร่างงวดนั้นด้วย (ไม่งั้นเลือกตัวเลือกอื่นแล้วร่างเดิมกลับมา)
  assert.match(slice(hook, 'const revert = (row) => {', '\n  };'), /base: without\(f\.base\)/);
  // ⭐ มติ 02/11: ช่องวันตัวเดียว (InstallmentDateCell) ทั้งแผงงวดของใบและหน้าสร้าง SO — ไม่มีตัวแก้รายงวด/ป๊อปโอเวอร์/แผ่นล่าง
  for (const text of [panel, code(CREATE_PAGE)]) {
    assert.match(text, /<InstallmentDateCell mode=\{dateMode\} row=\{row\} field="bill" \/>/);
    assert.match(text, /<InstallmentDateCell mode=\{dateMode\} row=\{row\} field="due" \/>/);
    assert.doesNotMatch(text, /InstallmentDateEditor|InstallmentDateFrame|InstallmentDateExpandRow|InstallmentDateSheet/);
  }
  const cell = code(CELL);
  // ล้างวันวางบิล = ลบในช่อง (DateInput ส่ง '' ) — ไม่ต้องมีปุ่มแยก · กำหนดชำระไม่ถูกแตะ (แบบ ข)
  assert.match(cell, /\.\.\.v, billingDate: iso \|\| "", billingEvent: iso \? "" : v\.billingEvent, billingSkip: iso \? false : v\.billingSkip,/);
  assert.doesNotMatch(slice(cell, 'onChange={(iso) => mode.setValue(row, {', '})} />'), /dueDate/, 'แบบ ข: เลือกวันวางบิลไม่เขียนกำหนดชำระ');
  // ช่องพิมพ์ชื่อเหตุการณ์ถือข้อความของมันเอง · กด "ใช้" ส่งที่ตัดช่องว่างแล้ว
  assert.match(cell, /value=\{own\}/);
  assert.match(cell, /onClick=\{\(\) => \{ waitFor\(own\.trim\(\)\); setOwn\(""\); setEventOpen\(false\); close\(\); \}\}/);
  assert.match(panel, /const lock = row\.preview \? "ยังไม่เริ่มติดตามการชำระ" : coverModeLock \|\| gate\(row, "coverage"\);/);
  // เมนูแถวไม่มี "ตั้งวันงวด" แล้ว (ช่องในตารางแก้ได้เลย) · ข้อยกเว้นรายงวดอยู่เมนูนี้ (มติ 02/11 ข้อ 2)
  assert.doesNotMatch(panel, /label: "ตั้งวันงวด"/);
  assert.match(panel, /id: "require-billing", icon: Receipt, label: "งวดนี้ต้องวางบิล…",/);
  assert.match(panel, /id: "skip-billing", icon: HandCoins,/);
  // ลิงก์ประกอบที่ lib/sales/billingRequestHref.js ที่เดียว (installmentId/requiredDate ตรวจใน billingRequestHref.test.mjs)
  // — ปุ่มในแถวกระดิ่งใช้ตัวเดียวกัน · closure ในแผงกลับมาเมื่อไร สองปุ่มเพี้ยนหากันได้โดยไม่มีเทสต์แดง
  assert.match(panel, /import \{ billingRequestHref \} from "@\/lib\/sales\/billingRequestHref";/);
  assert.match(panel, /const newBillingRequestHref = \(row\) => billingRequestHref\(order, row\);/);
  assert.doesNotMatch(panel, /new URLSearchParams\(/, 'ห้ามประกอบลิงก์คำร้องเองในแผง');
  assert.match(panel, /installmentBillingRequested\(row, requestById\)/);
  // แดง "เลยกำหนด" ยังอ่าน dueDate ช่องเดียว — วันวางบิลไม่มีทางแดง
  assert.match(panel, /const overdue = !installmentVoid\(row, order\) && row\.status !== "confirmed" && row\.dueDate && String\(row\.dueDate\) < String\(todayIso\);/);
  assert.doesNotMatch(panel, /billingDate[^;\n]*<\s*String\(todayIso\)/);
  const page = code(SO_PAGE);
  assert.match(page, /user=\{\{ id: order\.meId, role, department: order\.meDepartment \}\}/,
    'ด่านวันงวดของ FN ตัดสินฝ่าย — แผงต้องได้ฝ่ายเดียวกับที่ route เห็น');
  assert.match(page, /if \(action === "schedule-many"\) return runInstallmentScheduleMany\(options\);/, 'ผ่าน onAction เดิมของหน้า');
  assert.match(page, /json: \{ action: "schedule-many", rows \}/);
  assert.doesNotMatch(page, /action: "fill-billing"|action: "redate-billing"|onFillBilling|onRedateBilling/);
  // 409 พกงวดสดมา — วางทันที **แล้วดึงใบสดทั้งใบเสมอ** (คำร้องขอใบวางบิลมากับ GET เต็มเท่านั้น — ล็อก "ขอใบวางบิลแล้ว"
  // ที่เกิดระหว่างร่างต้องล็อกบนจอด้วย ไม่งั้นกดบันทึก = 409 เดิมวนไม่จบ) · refreshOrder ไม่ถอดแผง ⇒ ร่างที่ยังใช้ได้อยู่
  const many = slice(page, 'async function runInstallmentScheduleMany(', '\n  }\n');
  // (หลัง merge กับ PR-A งานบริการ: ต่อท้ายด้วย refreshServiceSetup เมื่อบางงวดลงแล้ว — ลำดับ "วางงวดสด → รอใบสด" คงเดิม)
  assert.match(many, /if \(res\.status === 409\) \{\s*if \(Array\.isArray\(data\.installments\)\) setOrder\([^;]+;\s*await refreshOrder\(\);/);
  assert.doesNotMatch(many, /else refreshOrder\(\)/, 'ห้ามดึงใบสดเฉพาะตอนไม่มีชุดงวด — ล็อกของจออ่าน billingRequests ด้วย');
  // ร่างค้าง = ออกจากหน้า/สลับแท็บถามก่อน
  // ยามออกจากหน้ารวมร่างวันงวดด้วย (หลัง merge กับ PR-A งานบริการ มีร่างงานบริการต่อท้ายในยามตัวเดียวกัน)
  assert.match(page, /useUnsavedChanges\(dirty \|\| datesDirty\b[^)]*\);/);
  assert.match(page, /onDatesDirty=\{setDatesDirty\}/);
  assert.match(page, /activeTab === "payment" && next !== "payment" && datesDirty/);
});

test('🔴 review 28/09 MAJOR: กติกาของลูกค้าเปลี่ยนระหว่างมีร่าง = แผงเติมตั้งต้นใหม่ · ร่างอยู่ครบ · ชิป "ตามรอบ" ของช่องกำหนดชำระ (มติ 02/11)', () => {
  const hook = code(MODE_HOOK);
  // ลายเซ็นกติกาเทียบทุก render (ไม่ใช่ effect) · ตัวคิดลายเซ็นอยู่ที่ drafts (เทสต์ใน installmentDateDrafts)
  const reset = slice(hook, 'const ruleShape = dateRuleShape(ruleValue);', '\n  }\n');
  assert.match(reset, /const \[shapeSeen, setShapeSeen\] = useState\(ruleShape\);\s*if \(shapeSeen !== ruleShape\) \{\s*setShapeSeen\(ruleShape\);/);
  assert.match(reset, /setExceptionIds\(new Set\(\)\);/, 'ข้อยกเว้น "งวดนี้ต้องวางบิล…" ผูกกติกาเก่า — ถามใหม่');
  assert.match(reset, /setFill\(\(f\) => \(f \? \{ base: drafts, includeDated: false, choice: null, day: null, excluded: \[\] \} : f\)\);/,
    'แผงเติม = เหมือนเพิ่งเปิด (ฐาน = ร่างตอนนี้) — ตัวเลือก/วันที่ของกติกาเก่าไม่ค้าง');
  assert.doesNotMatch(reset, /setDrafts\(/, 'ห้ามทิ้งร่างของผู้ใช้ — ร่างที่ผิดกติกาใหม่ขึ้นคำเตือนเอง');
  // ช่องอ่านชนิดจากกติกาปัจจุบันทุกครั้งที่วาด (`mode.rowMode`) — ไม่มีวิธีที่จำไว้ให้ค้างข้ามกติกา
  const cell = code(CELL);
  assert.match(cell, /const rm = mode\.rowMode\(row\);/);
  // แบบ ข + มติข้อ 3: ชิป "ตามรอบ: ใช้ …" เฉพาะงวดที่เพิ่งแก้วันวางบิล หรือกำหนดชำระยังว่าง (รวม 'missing' — มีวันวางบิลแต่ไม่มีกำหนดชำระ)
  assert.match(cell, /if \(computed && computed !== v\.dueDate && !v\.billingEvent && \(billChanged \|\| !v\.dueDate\)\) \{/);
  assert.match(cell, /onClick=\{\(\) => setDue\(computed\)\}/);
  // ⭐ รอบห้า (มติ 29/09 หยุดรอปฏิทินใหม่): วันวางบิลตกปีที่ปฏิทินยังไม่มี = บอกเหตุใต้ช่องกำหนดชำระ (ไม่มีชิปคิดให้)
  assert.match(cell, /if \(v\.billingDate && !computed && !v\.dueDate\) \{\s*const gap = calendarGapFor\(ruleValue, v\.billingDate\);/);
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
  // ⭐ mig 0413: ใต้ชื่องวดไล่ทุกคำร้องของงวด · ตัวแทนที่ขึ้นในเซลล์วันวางบิลแล้ว (ขอแล้ว/ร่าง) ไม่พูดซ้ำ
  assert.match(panel, /&& \(billingStateOf\(row\)\.key === "requested" \|\| billingRequestNote\(row\)\?\.kind === "draft"\)\s*\? primaryOf\(row\)\?\.id : null;/);
  /* ⭐ มติ 28/09 ข้อ 17: คอลัมน์วันวางบิลขึ้นทุกใบที่ยังเดิน (ไม่ขึ้นกับรอบของลูกค้า/ว่ามีงวดไหนมีวันแล้ว) — เดิมซ่อนเมื่อไม่มีรอบ/
     ไม่มีเครดิต ⇒ ใบสินค้าเกือบทั้งหมดไม่มีช่องวันวางบิล · ลิงก์คำร้องของงวดโมฆะยังกลับไปช่องรายละเอียดเมื่อคอลัมน์ไม่ขึ้น (ใบที่ตาย) */
  assert.match(panel, /const billingColumn = billingOn;/);
  assert.doesNotMatch(panel, /billingColumn = billingOn && /, 'ห้ามกลับไปซ่อนคอลัมน์ตามรอบของลูกค้า');
  // ชวนตั้งรอบเฉพาะคนที่ API ตั้งรอบให้ผ่าน
  assert.match(panel, /const canSetBillingRule = order\?\.canEditBillingRule === true;/);
  /* ⭐ รุ่นสี่ (มติเจ้าของ 29/09 แบบ A): บรรทัดรอบเดิม → แถบนโยบาย (`BillingPolicyStrip`) — ยังไม่ระบุ/รูปเดิม = แถบถาม
     "ลูกค้ารายนี้ต้องวางบิลไหม?" · ปุ่มตอบเฉพาะคนที่ API ให้ตั้ง (`canEditBillingRule`) และฐานรัน 0393 แล้ว · คนอื่นอ่านอย่างเดียว
     พร้อมบอกว่าใครตอบได้ (ข้อติ #9) · ตอบผ่านโมดัลยืนยันที่บอกขอบเขต ไม่มีค่าตั้งต้น (ข้อติ #14) · PATCH เส้นเดียวกับทะเบียนลูกค้า */
  const strip = code('components/salesPlanning/installmentDates/BillingPolicyStrip.js');
  assert.match(panel, /<BillingPolicyStrip\s+ruleValue=\{billingRule\}\s+customer=\{order\.customer\}\s+canEdit=\{canSetBillingRule\}\s+v4Ready=\{billingSkipReady\}/);
  assert.match(panel, /onRegistryOpened=\{markRegistryOpened\}\s+onSaved=\{onRefreshOrder\}/);
  assert.match(strip, /if \(asksNeed\(ruleValue\)\) \{/);
  assert.match(strip, /<b>ลูกค้ารายนี้ต้องวางบิลไหม\?<\/b>/);
  assert.match(strip, /\{canEdit && v4Ready && customer\?\.id \? \(/, 'ไม่มีสิทธิ์/ฐานยังไม่พร้อม = ไม่มีปุ่มที่ API จะตีกลับ');
  assert.match(strip, /ตอบได้เฉพาะฝ่ายขายทีมที่ดูแลลูกค้า/, 'ไม่มีสิทธิ์ = บอกว่าใครตอบได้ (ไม่ใช่ซ่อนแล้วงง)');
  assert.match(strip, /BILLING_V4_SCHEMA_MISSING/, 'ฐานยังไม่รัน 0393 = บอกเหตุ');
  assert.match(strip, /apiJson\(`\/api\/master\/customers\/\$\{encodeURIComponent\(customer\.id\)\}\/billing-rule`, \{/);
  assert.match(strip, /json: \{ billingRule: ANSWERS\[choice\], baseUpdatedAt: customer\.billingRuleUpdatedAt \?\? null \},/,
    'ตัวล็อกดิบจาก GET (null = .is(null)) — ห้ามแปลงผ่าน Date');
  assert.match(strip, /const \[ask, setAsk\] = useState\(null\);/, 'โมดัลปิดอยู่ตอนเริ่ม');
  /* 🐞 review 29/09: ตอบแล้วมีงวดที่วันจะเปลี่ยน = เปิดจอยืนยันตัวเดียวกับทะเบียนลูกค้าทันที (เดิม toast ชี้ไปที่ที่เปิดจอนั้นไม่ได้แล้ว) */
  assert.match(strip, /import CustomerBillingRuleRedate from "@\/components\/database\/CustomerBillingRuleRedate";/);
  assert.match(strip, /if \(!saved\?\.unchanged && hasRuleChange\(saved\?\.ruleChange\)\) onRuleChange\?\.\(\{ change: saved\.ruleChange,/);
  assert.equal((strip.match(/\{redateModal\}/g) || []).length, 2, 'จอยืนยันอยู่ทั้งสองสาขา — ตอบแล้วแถบสลับเป็นประโยคนโยบายทันที');
  assert.doesNotMatch(strip, /ยืนยันทีละงวดที่ทะเบียนลูกค้า/);
  assert.match(strip, /disabled=\{!choice \|\| ask\.busy\}/, 'ไม่มีค่าตั้งต้น — ยังไม่เลือก = กดบันทึกไม่ได้');
  assert.match(strip, /href=\{`\$\{customerHref\}#billing-rule`\}[^>]*\s+target="_blank" rel="noopener noreferrer" onClick=\{onRegistryOpened\} onAuxClick=\{onRegistryOpened\}/);
  /* กลับจากแท็บทะเบียน = ดึงใบสด (ท่าเดียวกับหน้าสร้าง SO) — ฟังทั้ง focus และ visibilitychange · ยิงเฉพาะหลังเคยกดลิงก์ */
  assert.match(panel, /if \(!registryOpened\.current \|\| refreshing\.current \|\| document\.visibilityState !== "visible"\) return;/);
  assert.match(panel, /window\.addEventListener\("focus", onReturn\);\s*document\.addEventListener\("visibilitychange", onReturn\);/);
  assert.match(panel, /await refreshRef\.current\?\.\(\)/);
  assert.match(code(SO_PAGE), /onRefreshOrder=\{refreshOrder\}/, 'refreshOrder ไม่แตะฟอร์มที่พิมพ์ค้าง (ห้ามใช้ load)');
  // แผงเติม (แทนโมดัล "เติมตามรอบ เดือนละงวด"): เขียนร่างลงตารางอย่างเดียว · ลูกค้าหลายรอบ = ไทล์ละรอบ ไม่เลือกให้ ·
  // เปิดใหม่ล้างที่เลือก · ตัวคิดของ billingRule.js ผ่าน planDateFill (planMonthlyFill เมื่อยังไม่เปิดสวิตช์จัดใหม่)
  const fill = code(FILL);
  assert.doesNotMatch(fill, /apiFetch|onAction|schedule-many/, 'แผงเติมไม่บันทึกเอง — บันทึกที่แถบล่างครั้งเดียว');
  assert.match(fill, /const labels = billingRoundLabels\(ruleValue\);/);
  /* v5 · วันหยุดในระบบของฮุกโหมด (ชิปเครดิต N ตรงกับการ์ด/กระดิ่ง) */
  assert.match(fill, /planDateFill\(ruleValue, inputRows, \{ \.\.\.option, includeDated \}, todayIso, \{ holidays: mode\.holidays \}\)/);
  /* สวิตช์ "จัดใหม่งวดที่มีวันแล้วด้วย" เปิดมาได้เฉพาะคำขอที่ส่ง true จริง ("ไปแก้" ของแผงแดงงานบริการ) — ตัวเลือกยังไม่ถูกเลือกเสมอ */
  assert.match(code(MODE_HOOK), /setFill\(\{ base: drafts, includeDated: includeDated === true, choice: null, day: null, excluded: \[\] \}\);/,
    'เปิดแผงเติม = ยังไม่มีตัวเลือกไหนถูกเลือก (ไม่มีค่าตั้งต้น)');
  assert.match(code(DRAFTS), /: planMonthlyFill\(rule, rows, todayIso, \{ roundIndex: option\.roundIndex \?\? null, holidays \}\);/);
  // ⭐ รุ่นสี่: กติกาค่าดิบ (ตัวถามของ billingRule.js รับทุกรุ่น) — ห้ามผ่านตัวอ่านรุ่นสอง (รุ่นสี่ที่เขียนแทนไม่ได้กลายเป็น "ยังไม่ระบุ")
  // · ห้ามอ่านช่องในตรง ๆ
  assert.match(panel, /const billingRule = billingOn \? \(order\?\.customer\?\.billingRule \?\? null\) : null;/);
  assert.doesNotMatch(panel, /pickerRuleOf|effectiveBillingRule|billingRuleOf\(/);
  assert.doesNotMatch(panel, /billingRule\??\.billing\.mode|\.payment\.day|\.billing\.day|\.monthOffset|\.need\b/);
  /* ⭐ รุ่นสี่: ไม่ต้องวางบิล = ไม่ชวนขอใบวางบิล (เมนูแถว + ปุ่มในเซลล์) · ข้อยกเว้นรายงวดสองทางในเมนูแถว (ด่านเดียวกับเซลล์วัน) */
  // ⭐ mig 0413: งวดที่มีคำร้องแล้วขอเอกสารเพิ่มได้ (ไม่ใช่การชวนวางบิล ⇒ ไม่ถาม canRequestBilling) · ยังไม่มีคำร้อง = ถามตามเดิม
  assert.match(panel, /!billingAskInCell\(row\) && \(hasLinks\(row\) \|\| canRequestBilling\(row, billingRule\)\)/);
  assert.match(panel, /if \(!billingOn \|\| row\.preview \|\| hasLinks\(row\) \|\| !row\.billingDate \|\| !canRequestBilling\(row, billingRule\)\) return false;/);
  assert.match(panel, /id: "require-billing", icon: Receipt, label: "งวดนี้ต้องวางบิล…",/);
  assert.match(panel, /billingSkipReady && \(ex\.skip \|\| ex\.unskip\) && \{/, 'ติ๊กเฉพาะฐานที่รัน 0393');
  assert.match(panel, /\.\.\.\(dateMode\.available && !dateMode\.isLocked\(row\) \? \(\(\) => \{/, 'งวดล็อก/ไม่มีสิทธิ์ = ไม่มีเมนูข้อยกเว้น');
  // ประกาศเลยรอบเป็นสตริงเดียว (thaiText ตัดบรรทัดให้เฉพาะลูกที่เป็นสตริง)
  assert.doesNotMatch(panel, /ยังไม่ขอใบวางบิล`\}\s*\{lateBilling\.length === 1/);
});

test('⭐ รุ่นสี่ (แบบ A · มติ 29/09): แผงงวด — หัวคอลัมน์บอก "ไม่ต้องวางบิล" ครั้งเดียว · เซลล์ขีด · ติ๊กเฉพาะงวด · คำร้องในเซลล์ · ต้องวางบิลแต่ยังไม่มีวัน', () => {
  const panel = code(PANEL);
  assert.match(panel, /\{ notNeeded: NO_BILLING_TEXT, optional: "ไม่บังคับ" \}\[dateModeOf\(billingRule\)\.billingColumn\]/);
  assert.match(panel, /if \(!row\.billingDate && installmentNeed\(row, billingRule\) === "none" && !billingRequested\(row\)\s*&& !\(editDates && dateMode\.rowMode\(row\)\.kind === "exception"\)\) \{/,
    'ไม่ต้องวางบิล = ขีด (ไม่ใช่ช่องให้กรอก) · ยืนยัน "งวดนี้ต้องวางบิล…" แล้ว = ช่องโผล่ · คำร้องที่ขอไปแล้วยังขึ้นตามเดิม');
  assert.match(panel, /row\.billingSkip === true && billingNeedOf !== "none" \? <small>\{NO_BILLING_TEXT\} · เฉพาะงวดนี้<\/small>/);
  assert.match(panel, /ledgerFlags\(row, billingRule, \{ todayIso \}\)\.missingBilling/, 'คำเดียวกับทะเบียนบัญชี');
  assert.match(panel, /requestNote\?\.kind === "draft"/);
  assert.match(panel, /billingRequestNote\(row\)\?\.kind === "draft"\)\s*\? primaryOf\(row\)\?\.id : null;/, 'ร่างคำร้องไม่พูดซ้ำใต้ชื่องวด');
  assert.match(panel, /<RequireBillingModal/);
  assert.match(panel, /dateMode\.requireBilling\(target\.id, scope\);/);
  // แดง "เลยกำหนด" ยังอ่านกำหนดชำระช่องเดียว (must-not-regress 1)
  assert.doesNotMatch(panel, /billingDate[^;\n]*<\s*String\(todayIso\)/);
  /* ช่องวัน (มติ 02/11): รอเหตุการณ์ = ไม่มีวันทั้งสองช่อง · กำหนดชำระที่ใส่ = ล้างรอเหตุการณ์ · ติ๊กเฉพาะ skipReady อยู่เมนูแถว */
  const cell = code(CELL);
  assert.match(cell, /const waitFor = \(name\) => mode\.setValue\(row, \{ \.\.\.clearedDates\(v\), billingEvent: name \}\);/);
  assert.match(cell, /const setDue = \(iso\) => mode\.setValue\(row, \{ \.\.\.v, dueDate: iso \|\| "", billingEvent: iso \? "" : v\.billingEvent \}\);/);
  assert.match(panel, /billingSkipReady && \(ex\.skip \|\| ex\.unskip\) && \{/);
});

test('⭐ มติ 02/11 (ม็อก split-v6): ตารางงวดเป็นการ์ดรายงวดเมื่อคอลัมน์ ≤ 760px — DOM ชุดเดียว · ช่องบอกชื่อตัวเอง · จอกว้างยังเป็นตาราง', () => {
  const panel = code(PANEL);
  const css = readFileSync(join(SRC, 'components/salesPlanning/SalesOrderPaymentPanel.module.css'), 'utf8');
  // กล่องวัดความกว้าง (container) ห่อตาราง · แถวหลักติดธงการ์ด · ทุกช่องบอกชนิด/ชื่อ (::before ในการ์ด)
  assert.match(panel, /<div className=\{styles\.tableBox\}>\s*<TableScroll family="editable"/);
  assert.match(panel, /<tr data-card="row">/);
  assert.match(panel, /<td data-cell="label" data-seq=\{single \? undefined : row\.seq\}>/);
  for (const [cell, label] of [['due', 'กำหนดชำระ / จ่ายจริง'], ['cover', 'ครอบคลุมบริการ'], ['evidence', 'หลักฐาน'], ['tax', 'ใบกำกับภาษี']]) {
    assert.match(panel, new RegExp(`data-cell="${cell}" data-label="${label.replace('/', '\\/')}"`), cell);
  }
  assert.match(panel, /data-cell="bill" data-label=\{billingColumnNote \? `วันวางบิล \(\$\{billingColumnNote\}\)` : "วันวางบิล"\}/);
  for (const cell of ['seq', 'amount', 'status', 'action']) assert.match(panel, new RegExp(`data-cell="${cell}"`), cell);
  // container query (ไม่ใช่ @media — ไม่นับเพดานจุดตัดจอ) · ค่าเดียวกับตารางงวดของหน้าสร้าง SO
  assert.match(css, /\.tableBox \{ container-type: inline-size; \}/);
  const cards = css.slice(css.indexOf('@container (max-width: 760px) {'));
  assert.ok(cards.length > 30, 'มีบล็อกการ์ด');
  assert.match(cards, /--table-min-width: 0;/, 'เลิกกว้างขั้นต่ำของ TableScroll');
  assert.match(cards, /> thead \{ display: none; \}/);
  // ช่องวันสามช่องเต็มกว้าง ระบุชื่อทีละช่อง (ห้าม :not — ความจำเพาะสูงกว่ากฎคู่ แล้วคู่หลุดคนละแถว)
  assert.match(cards, /td\[data-cell="bill"\],\s*\.tableBox \.table\.table > tbody > tr > td\[data-cell="due"\],\s*\.tableBox \.table\.table > tbody > tr > td\[data-cell="cover"\] \{ grid-column: 1 \/ -1; \}/);
  assert.doesNotMatch(cards, /:not\(\[data-cell/);
  // ช่องปุ่มต้องชนะกฎ :has()/ตรึงขวา (0,3,6) — ไม่งั้นกว้าง 1% ในการ์ด · ช่องปุ่มว่าง = ไม่จองที่
  assert.match(cards, /\.tableBox \.table\.table > tbody > tr > td\[data-cell\],/);
  assert.match(cards, /td\[data-cell="action"\]:empty \{ display: none; \}/);
  // ช่องวันเต็มกว้างการ์ด (กติกาของตัวช่องอยู่ InstallmentDates.module.css ค่าเดียวกัน)
  const dates = readFileSync(join(SRC, 'components/salesPlanning/installmentDates/InstallmentDates.module.css'), 'utf8');
  assert.match(dates, /@container \(max-width: 760px\) \{\s*\.field :global\(\.date-input-wrap\) \{ max-width: none; \}/);
});
