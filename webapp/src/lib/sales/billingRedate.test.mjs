// ── กำหนดวางบิลรอบสอง (มติเจ้าของ 26/09) — จอ SO ─────────────────────────────────────────────────────────────
// สามเรื่อง:
//   1. "กำหนดชำระ" บนหัวใบ SO + บรรทัด "กำหนด …" / การเรียงของรายการ SO อ่านจาก **งวด** (installmentsNextDue)
//      ไม่ใช่ `sales_orders.paymentDueDate` ค่าตาย (SO-26080050-0 หัวใบ 05/09 ทั้งที่งวดบอก 25 ต.ค.)
//   2. ชื่องวดสั้นห้ามแตกบรรทัด ("งวด / สุดท้าย" ตอนคอลัมน์วันวางบิลกว้าง)
//   3. "จัดวันใหม่ตามรอบปัจจุบัน…" — ลูกค้าเปลี่ยนรอบถาวร ⇒ วันวางบิล + กำหนดชำระของงวดที่ยังเปิดจัดใหม่ทั้งใบ
//      server คิดเองด้วยคำร้องสด · ไม่ตรงกับที่จอเห็น = 409 · งวดที่ขอใบวางบิลแล้ว/รอเหตุการณ์/แจ้งชำระแล้ว ไม่ถูกแตะ
// + ยามต้นทาง (อ่าน source): route/จอ/หน้าใบ ต่อสายครบ — พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้" (ตัดคอมเมนต์ก่อน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BILLING_REDATE_STALE_MESSAGE, billingRedateCheck, billingRedateRows, billingRedateStoppedMessage, billingRequestedIds,
  installmentActionError, installmentScheduleAllowed, installmentsNextDue, paymentRollup, salesOrderPaymentCell,
} from './salesOrderPayments.js';
import { planRedate } from './billingRule.js';
import { writeBillingFill } from './salesOrderInstallmentsStore.js';

// ── 1. กำหนดชำระถัดไปจากงวด ─────────────────────────────────────────────────────────────────────────
test('installmentsNextDue: วันใกล้สุดของงวดที่ยังไม่รับรอง (รวมเลยกำหนด · รวม reported) · ไม่มี = null', () => {
  const rows = [
    { id: 'a', status: 'confirmed', dueDate: '2026-08-01' },
    { id: 'b', status: 'reported', dueDate: '2026-09-10' },
    { id: 'c', status: 'pending', dueDate: '2026-10-25' },
    { id: 'd', status: 'pending', dueDate: null },
  ];
  assert.equal(installmentsNextDue(rows), '2026-09-10', 'แจ้งแล้วแต่บัญชียังไม่รับรอง = เงินยังไม่เข้า (กติกาเดียวกับ "เลยกำหนด")');
  assert.equal(installmentsNextDue([rows[0], rows[3]]), null, 'รับรองครบ/ไม่มีงวดที่มีวัน = ขีด');
  assert.equal(installmentsNextDue([]), null);
  assert.equal(installmentsNextDue(null), null);
  assert.equal(paymentRollup(rows, '2026-09-26').nextDue, '2026-09-10', 'แผงงวดกับหัวใบตัวเดียวกัน');
});

test('🔴 salesOrderPaymentCell.nextDue: ตัวเดียวกับหัวใบ · งวดโมฆะของใบยกเลิกไม่นับ · ยังไม่เริ่มติดตาม = null (ไม่ถอยไปอ่าน paymentDueDate)', () => {
  const plan = { type: 'installment', installments: [{ label: 'ก', percent: 50 }, { label: 'ข', percent: 50 }] };
  const rows = [
    { id: 'c', seq: 1, status: 'confirmed', amount: 500, dueDate: '2026-08-05' },
    { id: 'p', seq: 2, status: 'pending', amount: 500, dueDate: '2026-10-25' },
  ];
  assert.equal(salesOrderPaymentCell(rows, plan, '2026-09-26', 1000, 'approved').nextDue, '2026-10-25');
  assert.equal(salesOrderPaymentCell([{ ...rows[0] }, { ...rows[1], status: 'reported' }], plan, '2026-09-26', 1000, 'approved').nextDue,
    '2026-10-25');
  // ใบยกเลิก: งวดรอชำระเป็นโมฆะ ⇒ ไม่มีวันให้ตาม
  assert.equal(salesOrderPaymentCell(rows, plan, '2026-09-26', 1000, 'cancelled').nextDue, null);
  // ใบที่ยังไม่มีงวดจริง (แผน QT) — ไม่มีวัน
  const untracked = salesOrderPaymentCell([], plan, '2026-09-26', 1000, 'approved');
  assert.equal(untracked.tracked, false);
  assert.equal(untracked.nextDue, null);
});

// ── 3. จัดวันใหม่ตามรอบปัจจุบัน ─────────────────────────────────────────────────────────────────────
// ลูกค้าเปลี่ยนจาก "วางบิลวันที่ 20" เป็น "วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25" (เดือนเดียวกัน) · วันนี้ 26 ก.ย. 2026
const RULE = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const TODAY = '2026-09-26';
const REQUESTS = new Map([
  ['RQ-L', { id: 'RQ-L', status: 'pending' }],
  ['RQ-D', { id: 'RQ-D', status: 'draft' }],
  ['RQ-C', { id: 'RQ-C', status: 'cancelled' }],
]);
const rows = () => [
  { id: 'I1', seq: 1, status: 'pending', billingDate: '2026-09-20', dueDate: '2026-10-25', updatedAt: 't1' },
  { id: 'I2', seq: 2, status: 'pending', billingDate: '2026-10-20', dueDate: '2026-11-25', updatedAt: 't2' },
  // ขอใบวางบิลแล้ว (คำร้องส่งถึงบัญชี) — บัญชีออกใบตามวันเดิมไปแล้ว ห้ามย้ายเงียบ ๆ
  { id: 'I3', seq: 3, status: 'pending', billingDate: '2026-11-20', dueDate: '2026-12-25', billingRequestId: 'RQ-L', updatedAt: 't3' },
  { id: 'I4', seq: 4, status: 'pending', billingDate: null, dueDate: null, billingRequestId: 'RQ-D', updatedAt: 't4' },
];
const requested = (list = rows(), requests = REQUESTS) => billingRequestedIds(list, requests);
const screenPlan = (list = rows(), requests = REQUESTS, today = TODAY) => planRedate(RULE, list, today, {
  requestedIds: requested(list, requests),
}).rows.map(({ id, billingDate, dueDate }) => ({ id, billingDate, dueDate }));

test('billingRequestedIds: คำร้องที่ส่งถึงบัญชีและยังไม่ยกเลิกเท่านั้น — ร่าง/ยกเลิก/หาไม่เจอ = ยังไม่ขอ (billingRequestLive)', () => {
  const list = [
    { id: 'A', billingRequestId: 'RQ-L' },
    { id: 'B', billingRequestId: 'RQ-D' },
    { id: 'C', billingRequestId: 'RQ-C' },
    { id: 'D', billingRequestId: 'RQ-GONE' },
    { id: 'E', billingRequestId: null },
  ];
  assert.deepEqual([...billingRequestedIds(list, REQUESTS)], ['A']);
  assert.deepEqual([...billingRequestedIds(list, new Map())], []);
  assert.deepEqual([...billingRequestedIds(null)], []);
});

test('billingRedateCheck: แผนที่จอส่งตรงกับที่ server คิด = ผ่าน · งวดที่ขอใบแล้วไม่ถูกแตะและกันงวดหลังไม่ให้ย้อนมาก่อน', () => {
  const built = billingRedateCheck(RULE, rows(), screenPlan(), TODAY, { requestedIds: requested() });
  assert.equal(built.error, undefined);
  assert.deepEqual(built.rows.map((r) => [r.id, r.prevBillingDate, r.billingDate, r.prevDueDate, r.dueDate]), [
    ['I1', '2026-09-20', '2026-10-05', '2026-10-25', '2026-10-25'],
    ['I2', '2026-10-20', '2026-11-05', '2026-11-25', '2026-11-25'],
    // I3 ขอใบแล้ว (20 พ.ย.) ⇒ I4 ต้องหลังจากนั้น — รอบ 5 ธ.ค. (ร่างคำร้องของ I4 ยังไม่นับว่าขอ)
    ['I4', null, '2026-12-05', null, '2026-12-25'],
  ]);
});

test('🔴 ใบที่มีวันนี้ (มีแต่กำหนดชำระ — 0389 ไม่เติมย้อนหลัง) ยังมีวันเดิมให้แทน · ใบที่ว่างทั้งสองช่องไม่มี (ปุ่มจัดใหม่ไม่ซ้ำกับเติมตามรอบ)', () => {
  // SO-26080050-0: SA กรอกวันวางบิล (5 ก.ย.) ลงกำหนดชำระ ⇒ แดง "เลยกำหนด" · เติมตามรอบคงวันนี้ไว้ (keptDue) — จัดใหม่ต้องแทนได้
  const legacy = [
    { id: 'L1', seq: 1, status: 'pending', billingDate: null, dueDate: '2026-09-05', updatedAt: 't1' },
    { id: 'L2', seq: 2, status: 'pending', billingDate: null, dueDate: '2026-10-05', updatedAt: 't2' },
  ];
  const plan = planRedate(RULE, legacy, TODAY, { requestedIds: requested(legacy) }).rows;
  assert.deepEqual(plan.map((r) => [r.id, r.prevBillingDate, r.billingDate, r.prevDueDate, r.dueDate]), [
    ['L1', null, '2026-10-05', '2026-09-05', '2026-10-25'],
    ['L2', null, '2026-11-05', '2026-10-05', '2026-11-25'],
  ]);
  assert.equal(plan.some((r) => r.prevBillingDate), false, 'เงื่อนไขเดิม (วันวางบิลเดิมอย่างเดียว) = ปุ่มหายจากใบนี้');
  assert.equal(plan.some((r) => r.prevBillingDate || r.prevDueDate), true, 'เงื่อนไขของแผง: มีวันเดิมให้แทน = ปุ่มขึ้น');
  const blank = legacy.map((r) => ({ ...r, dueDate: null }));
  const blankPlan = planRedate(RULE, blank, TODAY, { requestedIds: requested(blank) }).rows;
  assert.equal(blankPlan.length, 2);
  assert.equal(blankPlan.some((r) => r.prevBillingDate || r.prevDueDate), false, 'ว่างทั้งใบ = งานของ "เติมตามรอบ" ปุ่มเดียว');
});

test('🔴 billingRedateCheck: จอเก่า (คำร้องเปลี่ยนสถานะ · ข้ามรอบ · วันถูกแก้) = 409 ไม่เขียนชุดใหม่ทับเงียบ ๆ', () => {
  const plan = screenPlan();
  // คำร้องของงวด 3 ถูกยกเลิกระหว่างเปิดหน้าต่าง ⇒ งวด 3 กลับเข้าแผน ชุดของ server เปลี่ยน
  const cancelled = new Map([...REQUESTS, ['RQ-L', { id: 'RQ-L', status: 'cancelled' }]]);
  assert.deepEqual(
    billingRedateCheck(RULE, rows(), plan, TODAY, { requestedIds: requested(rows(), cancelled) }),
    { error: BILLING_REDATE_STALE_MESSAGE, status: 409 },
  );
  // ร่างคำร้องของงวด 4 ถูกส่งถึงบัญชีแล้ว ⇒ งวด 4 หลุดจากแผน
  const sent = new Map([...REQUESTS, ['RQ-D', { id: 'RQ-D', status: 'pending' }]]);
  assert.equal(billingRedateCheck(RULE, rows(), plan, TODAY, { requestedIds: requested(rows(), sent) }).status, 409);
  // เปิดหน้าต่างค้างข้ามรอบ
  assert.equal(billingRedateCheck(RULE, rows(), plan, '2026-10-06', { requestedIds: requested() }).status, 409);
  // จอส่งวันเดียวผิด / งวดซ้ำ
  const tampered = plan.map((p, i) => (i === 0 ? { ...p, dueDate: '2026-10-31' } : p));
  assert.equal(billingRedateCheck(RULE, rows(), tampered, TODAY, { requestedIds: requested() }).status, 409);
  assert.equal(billingRedateCheck(RULE, rows(), [...plan, plan[0]], TODAY, { requestedIds: requested() }).status, 409);
  // ไม่ส่ง requestedIds = ถือว่าไม่มีงวดไหนขอ ⇒ ชุดต่างจากจอ (route ต้องส่งเสมอ)
  assert.equal(billingRedateCheck(RULE, rows(), plan, TODAY).status, 409);
});

test('billingRedateCheck: ไม่มีแผน = 400 · ไม่มีรอบ/วางบิลได้ทุกวัน/ตรงรอบอยู่แล้ว = 409 พร้อมเหตุ', () => {
  assert.equal(billingRedateCheck(RULE, rows(), [], TODAY).status, 400);
  assert.equal(billingRedateCheck(RULE, rows(), null, TODAY).status, 400);
  const plan = screenPlan();
  assert.match(billingRedateCheck(null, rows(), plan, TODAY).error, /ยังไม่ตั้งรอบวางบิล/);
  const anyday = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
  assert.match(billingRedateCheck(anyday, rows(), plan, TODAY).error, /ทุกวัน/);
  const aligned = rows().map((r) => {
    const next = plan.find((p) => p.id === r.id);
    return next ? { ...r, billingDate: next.billingDate, dueDate: next.dueDate } : r;
  });
  const done = billingRedateCheck(RULE, aligned, plan, TODAY, { requestedIds: requested(aligned) });
  assert.equal(done.status, 409);
  assert.match(done.error, /ตรงกับรอบปัจจุบันอยู่แล้ว/, 'กดซ้ำหลังจัดครบ = บอกว่าไม่มีอะไรเปลี่ยน');
});

// ── เขียน: ทั้งสองช่องเสมอ · มีเงื่อนไข updatedAt · หยุดกลางทางบอกตามจริง (ฐานปลอม) ─────────────────────
const TABLE = 'sales_order_installments';
const condDb = (seed) => {
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

test('🔴 จัดวันใหม่เขียนทั้งวันวางบิลและกำหนดชำระทุกงวด (ไม่มี keptDue) · งวดที่ขอใบแล้วไม่ถูกเขียน', async () => {
  const live = rows();
  const built = billingRedateCheck(RULE, live, screenPlan(), TODAY, { requestedIds: requested() });
  const db = condDb(live);
  const res = await writeBillingFill(db, live, billingRedateRows(built.rows));
  assert.equal(res.stopped, null);
  // updateInstallment ประทับ updatedAt เอง — ที่เทียบคือช่องวันที่ของ patch
  assert.deepEqual(db.writes.map((w) => [w.id, w.patch.billingDate, w.patch.dueDate, 'billingEvent' in w.patch]), [
    ['I1', '2026-10-05', '2026-10-25', false],
    ['I2', '2026-11-05', '2026-11-25', false],
    ['I4', '2026-12-05', '2026-12-25', false],
  ]);
  assert.equal(db.store.get('I3').billingDate, '2026-11-20', 'งวดที่ขอใบวางบิลแล้วคงวันเดิม');
  assert.ok(billingRedateRows(built.rows).every((r) => r.keptDue === false));
});

test('จัดวันใหม่หยุดกลางทาง: บอกว่าลงแล้วกี่งวด หยุดที่งวดไหน และกดซ้ำปลอดภัย (งวดที่จัดแล้วตรงรอบ ตัดทิ้งเอง)', async () => {
  const live = rows();
  const built = billingRedateCheck(RULE, live, screenPlan(), TODAY, { requestedIds: requested() });
  const db = condDb(live);
  db.store.set('I2', { ...db.store.get('I2'), updatedAt: 't2-other-window' });
  const res = await writeBillingFill(db, live, billingRedateRows(built.rows));
  assert.deepEqual(res.stopped, { seq: 2, error: null });
  assert.deepEqual(res.after.map((r) => r.id), ['I1']);
  const message = billingRedateStoppedMessage(res.after.length, { seq: 2, message: 'มีคนแก้งวดนี้' });
  assert.match(message, /^จัดวันใหม่แล้ว 1 งวด แต่หยุดที่งวดที่ 2 — มีคนแก้งวดนี้/);
  assert.match(message, /งวดที่จัดแล้วไม่ถูกแตะซ้ำ/);
  // กดซ้ำ: งวด 1 ตรงรอบแล้ว ⇒ ไม่อยู่ในแผนรอบสอง
  const after = [...db.store.values()];
  const again = planRedate(RULE, after, TODAY, { requestedIds: requested(after) });
  assert.deepEqual(again.rows.map((r) => r.id), ['I2', 'I4']);
});

test('installmentScheduleAllowed = ด่านสิทธิ์ของ schedule ตัวเดียว (ฝ่ายขายแก้ใบได้ · ฝ่ายบัญชี) — ปุ่มระดับใบไม่มีสิทธิ์ = ไม่วาด', () => {
  const row = { id: 'I1', status: 'pending' };
  const people = [
    [{ id: 'sa', role: 'ae' }, true],
    [{ id: 'fn', role: 'finance', department: 'FN' }, true],
    [{ id: 'pc', role: 'pc', department: 'PC' }, false],
    [{ id: 'x', role: 'finance', department: 'SA' }, false],
  ];
  for (const [user, allowed] of people) {
    assert.equal(installmentScheduleAllowed(user), allowed, user.id);
    assert.equal(!installmentActionError(row, 'schedule', user), allowed, `ด่าน schedule ต้องตอบตรงกัน: ${user.id}`);
  }
});

// ── ยามต้นทาง ────────────────────────────────────────────────────────────────────────────────────
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
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const SO_LIST = 'app/sales-planning/sales-orders/page.js';

test('route งวด: redate-billing เป็นคำสั่งของทั้งใบ (ก่อนด่าน installmentId) · คำร้องอ่านสดแบบโยน · ด่าน schedule ก่อนเขียน · audit ก่อน 409', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const dispatch = patch.indexOf("if (action === 'redate-billing') return redateBillingDates({ user, supabase, req, id, body });");
  assert.ok(dispatch > 0 && dispatch < patch.indexOf('if (!installmentId) return badRequest('),
    'proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้ — คำสั่งของทั้งใบต้องมาก่อนด่านงวดเดียว');
  const loader = slice(route, 'async function loadBillingRequestedIds(', '\n}\n');
  assert.match(loader, /\.from\('dept_requests'\)\.select\('id, status'\)\.in\('id', chunk\)\.eq\('kind', 'billing_doc'\)\s*\.order\('id', \{ ascending: true \}\)/,
    'ชุดคำร้องเดียวกับที่หน้าใบโหลดให้แผง (billing_doc) — ไม่งั้นแผนจอกับ server ต่างกันถาวร');
  assert.doesNotMatch(loader, /\.neq\('status'/, 'คำร้องที่ยกเลิกต้องอ่านมาให้ตัวตัดสินเห็น');
  assert.match(loader, /fetchInChunks\(ids, \(chunk\) => fetchAllResult\(/, 'ไล่หน้า + ซอยก้อน (rowcap · URL 16 KB)');
  assert.match(loader, /if \(error\) throw error;/, 'อ่านคำร้องพลาด ≠ ยังไม่ขอ');
  assert.match(loader, /return billingRequestedIds\(rows, new Map\(/);
  const fn = slice(route, 'async function redateBillingDates(', 'async function fillBillingDates(');
  const steps = [
    "if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');",
    'const { order, error } = await loadOrderForUser(supabase, user, id);',
    'const billing = await loadCustomerBillingRule(supabase, order);',
    'const live = await loadInstallments(supabase, order.id);',
    'const requestedIds = await loadBillingRequestedIds(supabase, live);',
    'const roundIndex = billingRoundIndexOf(body.roundIndex);',
    'const built = billingRedateCheck(billing.rule, live, body.plan, businessDate(), { requestedIds, roundIndex });',
    "const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');",
    "installmentActionError(byId.get(planned.id), 'schedule', user, {",
    'written = await writeBillingFill(supabase, live, billingRedateRows(built.rows));',
    'await recordAudit({',
    'if (stopped) return fail(billingRedateStoppedMessage(after.length, stopped), 409);',
  ];
  let at = -1;
  for (const step of steps) {
    const next = fn.indexOf(step, at + 1);
    assert.ok(next > at, `ลำดับผิด/หาไม่เจอ: ${step}`);
    at = next;
  }
  assert.doesNotMatch(fn, /loadInstallments\([^)]*\)\s*\.catch/, 'อ่านสดแบบโยน error');
  assert.match(fn, /after: \{ installments: after, redate: 'billing-rule', billingRule: billing\.rule, roundIndex \},/);
});

test('แผงงวด: จัดวันใหม่คิดด้วย planRedate + คำร้องชุดเดียวกับป้าย · ไม่มีสิทธิ์ไม่วาด · ติดล็อกบอกเหตุ · แก้รายงวดยังอยู่', () => {
  const panel = code(PANEL);
  assert.match(panel, /const requestedIds = billingRequestedIds\(saved, requestById\);/);
  assert.match(panel, /planRedate\(billingRule, saved, todayIso, \{ requestedIds, roundIndex \}\)/);
  assert.match(panel, /const canRedate = Boolean\(onRedateBilling\) && installmentScheduleAllowed\(user\)/);
  // review รอบสอง: ใบที่มีวันนี้มีแต่กำหนดชำระ (0389 ไม่เติมย้อนหลัง) — เช็กแค่วันวางบิลเดิม = ปุ่มหายจากทุกใบจริง
  // รอบรุ่นสอง: ลูกค้าหลายรอบ = ถามทุกรอบ (redateProbes) ไม่ใช่เดารอบแรก
  assert.match(panel, /redateProbes\.some\(\(planned\) => planned\.some\(\(row\) => row\.prevBillingDate \|\| row\.prevDueDate\)\)/);
  assert.doesNotMatch(panel, /\.some\(\(row\) => row\.prevBillingDate\)/);
  assert.match(panel, /const redateBlockerOf = \(planned\) => \(saved\.some\(\(r\) => billingUnknown\(r\) && installmentBillingRedatable\(r\)\)/,
    'คำร้องอ่านไม่ขึ้น = แผนบนจอเชื่อไม่ได้ — เฉพาะงวดที่อยู่ในแผนได้ (งวดที่ชำระแล้ว/ยกมา/รอเหตุการณ์ไม่บล็อกทั้งใบ)');
  assert.match(panel, /blocker=\{redateCardBlocker\} disabled=\{!!busy\}/);
  assert.match(panel, /จัดวันใหม่ตามรอบปัจจุบัน…/);
  assert.match(panel, /`จัดวันใหม่ \$\{redateRows\.length\} งวด`/);
  assert.match(panel, /<Button tone="primary" disabled=\{!!busy \|\| !!redateBlocker \|\| !redateRows\.length\}/, 'ปุ่มยืนยันเดียว (navy)');
  // ลูกค้าหลายรอบต่อเดือน (มติ 26/09 ข้อ 3): ถามรอบก่อนพรีวิว · ไม่เลือกให้ · เปิดใหม่ล้างที่เลือก · ส่งรอบไปกับแผน
  assert.match(panel, /const \[redateRound, setRedateRound\] = useState\(null\);/);
  assert.match(panel, /setRedateRound\(null\); setRedateOpen\(true\);/);
  assert.match(panel, /const redateRoundValue = redateRoundIndex === null \? null : redateRound;/);
  assert.match(panel, /<BillingRoundChoice choices=\{roundChoices\} value=\{redateRoundValue\} onChange=\{setRedateRound\}/);
  /* ปุ่มบนการ์ดถามทุกรอบด้วยลำดับ (ค่าของชิปเป็นวันวางบิล ห้ามส่งเข้าตัวคิดตรง ๆ) */
  assert.match(panel, /roundChoices\.map\(\(_, roundIndex\) => planRowsOf\(redateOf\(roundIndex\)\)\)/);
  assert.match(panel, /\{monthlyRule \? redatePlan\?\.error \|\| "ไม่มีงวดที่ต้องจัดวันใหม่แล้ว" : noMonthlyNote\("จัดวันใหม่"\)\}/);
  assert.match(panel, /roundIndex: redateRoundIndex,/);
  assert.match(panel, /กำหนดชำระใหม่ใช้แทนวันเดิม/, 'โมดัลต้องบอกว่ากำหนดชำระใหม่แทนวันเดิม (ป้ายแดง/ด่านนัดช่างอ่านช่องนี้)');
  assert.match(panel, /งวดที่ขอใบวางบิลแล้ว รอเหตุการณ์ หรือแจ้งชำระแล้ว ไม่ถูกแตะ/);
  assert.match(panel, /<RedateCell from=\{planned\.prevBillingDate\} to=\{planned\.billingDate\} \/>/);
  assert.match(panel, /<RedateCell from=\{planned\.prevDueDate\} to=\{planned\.dueDate\} \/>/);
  assert.match(panel, /<WeekendBadge iso=\{to\} \/>/);
  // มติ 26/09: วันที่ระบบแนะนำต้องแก้เองได้เสมอ — เมนูแก้รายงวดห้ามหาย
  assert.match(panel, /label: billingRule \? "กำหนดวันงวด" : row\.dueDate \? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ",/);
  // ชื่องวดสั้นไม่แตกบรรทัด
  assert.match(panel, /<InstallmentLabel label=\{row\.label\} \/>/);
  assert.match(panel, /text\.length <= LABEL_NOWRAP_MAX\s*\? <strong className=\{styles\.nowrap\}>/);
  const page = code(SO_PAGE);
  assert.match(page, /json: \{ action: "redate-billing", plan, roundIndex \}/);
  assert.match(page, /onRedateBilling=\{runBillingRedate\}/);
});

test('🔴 หัวใบ + รายการ SO: กำหนดชำระมาจากงวด (nextDue) — ไม่อ่าน paymentDueDate ค่าตายบนจอ', () => {
  const page = code(SO_PAGE);
  assert.match(page, /label: "กำหนดชำระ",\s*value: paymentSummary\.nextDue \? fmtDate\(paymentSummary\.nextDue\) : NA,/);
  assert.doesNotMatch(page, /fmtDate\(order\.paymentDueDate\)/);
  const list = code(SO_LIST);
  assert.match(list, /const aDue = a\.payment\?\.nextDue \|\| null;/);
  assert.match(list, /const bDue = b\.payment\?\.nextDue \|\| null;/);
  assert.match(list, /กำหนด \{row\.payment\?\.nextDue \? fmtDate\(row\.payment\.nextDue\) : NA\}/);
  assert.doesNotMatch(list, /paymentDueDate/);
});
