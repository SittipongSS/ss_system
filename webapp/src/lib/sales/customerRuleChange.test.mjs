// ── จอ "งวดที่วันจะเปลี่ยน" เมื่อกติกาวางบิลของลูกค้าเปลี่ยน (รุ่นสี่ · system-design §7.1–7.2) ─────────────────────
// สิ่งที่ชุดนี้ล็อกไว้:
//   1. ขา PATCH กติกา: ระบบ **เสนอ** งวดที่วันจะเปลี่ยน (planRuleChange) ไม่ย้ายเอง · งวดที่ redate จะตีกลับอยู่แล้วไปอยู่ `kept`
//      ตั้งแต่ตอนเสนอ (ปุ่มกับ API ตอบคำเดียวกัน) · ใบที่คนนี้มองไม่เห็นไม่ถูกอ่านงวด
//   2. ขา redate: ตัวตรวจของ schedule-many ต่อใบ · ทุกงวดทุกใบตรวจก่อนเขียนงวดแรก · กติกา **ใหม่** ตัดสิน
//   3. ตัวอ่านฝั่ง server: อ่านกติกาพลาด = ปิดแค่วันวางบิล (ไม่โยน) · ขอบเขตการเห็นก่อนอ่านงวด · 0393 จากคีย์ของแถว
//   4. ยามต้นทาง (อ่าน source): route redate/alias/proxy ต่อสายครบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { customerRedateCheck, customerRuleChange, installmentsForScreen, orderScheduleLock, redateShapeError } from './customerRuleChange.js';
import { billingSkipReady, loadOrdersBundle, loadScheduleRule } from './installmentScheduleServer.js';
import { NO_BILLING_WRITE_ERROR, RULE_UNAVAILABLE_ERROR } from './billingRule.js';

const SA = { id: 'u-sa', role: 'ae', teams: ['KA'] };
const PC = { id: 'u-pc', role: 'pc', department: 'PC' };
const T = '2026-09-29T01:00:00.000Z';
const CREDIT30 = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
const NONE = { v: 4, need: 'none' };

const order = (id, over = {}) => ({
  id, orderNumber: `SO-2609${id.slice(-4)}-0`, customerId: 'CUS-1', status: 'approved', totalAmount: 1000,
  deal: { id: 'D1', team: 'KA' }, quotation: { status: 'accepted', paymentPlan: null }, ...over,
});
const inst = (id, salesOrderId, seq, over = {}) => ({
  id, salesOrderId, seq, status: 'pending', amount: 500, label: `งวดที่ ${seq}`, billingDate: null, billingEvent: null,
  dueDate: null, billingSkip: null, updatedAt: T, ...over,
});
const bundle = (over = {}) => ({
  orders: [order('SOR-0001'), order('SOR-0002')],
  hidden: 0,
  installments: [
    inst('A1', 'SOR-0001', 1, { billingDate: '2026-10-05', dueDate: '2026-11-04' }),       // ตามเครดิต 30 ⇒ ล้างวันวางบิล
    inst('A2', 'SOR-0001', 2, { billingDate: '2026-11-05', dueDate: '2026-11-20' }),       // แก้เอง — ก็ยังล้างวันวางบิล (ไม่มีวันวางบิลแล้ว)
    inst('A3', 'SOR-0001', 3, { dueDate: '2026-12-10' }),                                   // ไม่มีวันวางบิล = วันเท่าเดิม
    inst('B1', 'SOR-0002', 1, { billingDate: '2026-10-10', dueDate: '2026-11-09', billingRequestId: 'RQ-1' }), // ขอใบแล้ว
    inst('B2', 'SOR-0002', 2, { status: 'confirmed', billingDate: '2026-09-01', dueDate: '2026-10-01' }),   // ชำระแล้ว (ไม่ใช่งวดเปิด)
  ],
  requestedIds: new Set(['B1']),
  ...over,
});

// ── 1. ขา PATCH กติกา ─────────────────────────────────────────────────────────────────────────────
test('customerRuleChange: ต้อง → ไม่ต้องวางบิล = เสนอล้างวันวางบิลทุกงวดเปิด (คงกำหนดชำระ) · ขอใบแล้วไม่แตะ · พกใบ/updatedAt ไว้ให้ redate', () => {
  const change = customerRuleChange(CREDIT30, NONE, bundle(), SA);
  assert.deepEqual(change.rows.map((r) => [r.id, r.change, r.billingDate, r.dueDate, r.salesOrderCode, r.updatedAt]), [
    ['A1', 'clearBilling', null, '2026-11-04', 'SO-26090001-0', T],
    ['A2', 'clearBilling', null, '2026-11-20', 'SO-26090001-0', T],
  ]);
  assert.deepEqual(change.kept.map((k) => [k.id, k.reason, k.salesOrderCode]), [['B1', 'requested', 'SO-26090002-0']]);
  assert.deepEqual(change.same.map((r) => r.id), ['A3'], 'งวดชำระแล้วไม่อยู่ในรายการไหนเลย (ไม่ใช่งวดเปิด)');
  assert.equal(change.rows[0].amount, 500);
  assert.equal(change.hiddenOrders, 0);
});

test('customerRuleChange: งวดที่ redate จะตีกลับอยู่แล้ว → kept "locked" พร้อมเหตุ (ล็อกทั้งใบ · ไม่มีสิทธิ์ตั้งวัน) · ใบที่มองไม่เห็นนับไว้', () => {
  const historicalDraft = order('SOR-0003', { origin: 'historical', status: 'draft' });
  const b = bundle({
    orders: [order('SOR-0001'), historicalDraft],
    hidden: 2,
    installments: [inst('A1', 'SOR-0001', 1, { billingDate: '2026-10-05', dueDate: '2026-11-04' }),
      inst('H1', 'SOR-0003', 1, { billingDate: '2026-10-05', dueDate: '2026-11-04' })],
    requestedIds: new Set(),
  });
  const change = customerRuleChange(CREDIT30, NONE, b, SA);
  assert.deepEqual(change.rows.map((r) => r.id), ['A1']);
  assert.deepEqual(change.kept.map((k) => [k.id, k.reason]), [['H1', 'locked']]);
  assert.equal(change.kept[0].lock, orderScheduleLock(historicalDraft));
  assert.equal(change.hiddenOrders, 2);
  const noRight = customerRuleChange(CREDIT30, NONE, b, PC);
  assert.equal(noRight.rows.length, 0);
  assert.ok(noRight.kept.every((k) => k.reason === 'locked'));
  assert.match(noRight.kept.find((k) => k.id === 'A1').lock, /ไม่มีสิทธิ์/);
});

test('customerRuleChange: ไม่ต้อง → ต้องวางบิล (เครดิต 30) = เสนอวันวางบิลถอยจากกำหนดชำระ · ติ๊ก "งวดนี้ไม่ต้องวางบิล" ไม่แตะ', () => {
  const b = bundle({
    orders: [order('SOR-0001')],
    installments: [inst('A1', 'SOR-0001', 1, { dueDate: '2026-11-04' }), inst('A2', 'SOR-0001', 2, { dueDate: '2026-12-04', billingSkip: true })],
    requestedIds: new Set(),
  });
  const change = customerRuleChange(NONE, CREDIT30, b, SA);
  assert.deepEqual(change.rows.map((r) => [r.id, r.change, r.billingDate, r.dueDate]), [['A1', 'addBilling', '2026-10-05', '2026-11-04']]);
  assert.deepEqual(change.kept.map((k) => [k.id, k.reason]), [['A2', 'skip']]);
});

// ── 2. ขา redate ────────────────────────────────────────────────────────────────────────────────
const redateBundle = (over = {}) => {
  const b = bundle(over);
  return { ...b, sentRows: new Map(b.installments.map((r) => [r.id, r])) };
};
const pick = (id, fields) => ({ id, updatedAt: T, ...fields });

test('customerRedateCheck: ตัวตรวจของ schedule-many ต่อใบ · เรียงตามเลขใบ · patch เฉพาะช่องที่เปลี่ยน · กติกาใหม่ตัดสิน', () => {
  const built = customerRedateCheck({
    customerId: 'CUS-1', bundle: redateBundle(), user: SA, rule: NONE, skipReady: true,
    sent: [pick('A2', { billingDate: null, dueDate: '2026-11-20' }), pick('A1', { billingDate: null, dueDate: '2026-11-04' })],
  });
  assert.equal(built.error, undefined);
  assert.deepEqual(built.plans.map((p) => [p.order.id, p.rows.map((r) => [r.id, r.patch])]), [
    ['SOR-0001', [['A1', { billingDate: null }], ['A2', { billingDate: null }]]],
  ]);
  // กติกาใหม่ = ไม่ต้องวางบิล ⇒ จอเก่าที่ยังส่ง "เพิ่มวันวางบิล" มา = 400 (ไม่ใช่เขียนวันวางบิลปลอม)
  const stale = customerRedateCheck({
    customerId: 'CUS-1', bundle: redateBundle(), user: SA, rule: NONE, skipReady: true,
    sent: [pick('A3', { billingDate: '2026-11-10', dueDate: '2026-12-10' })],
  });
  assert.deepEqual(stale, { error: `SO-26090001-0 งวดที่ 3: ${NO_BILLING_WRITE_ERROR}`, status: 400 });
  // อ่านกติกาใหม่ไม่ขึ้น = ปิดเฉพาะงวดที่เปลี่ยนวันวางบิล
  const down = customerRedateCheck({
    customerId: 'CUS-1', bundle: redateBundle(), user: SA, ruleUnavailable: true, skipReady: true,
    sent: [pick('A3', { billingDate: '2026-11-10', dueDate: '2026-12-10' })],
  });
  assert.equal(down.error, `SO-26090001-0 งวดที่ 3: ${RULE_UNAVAILABLE_ERROR}`);
});

test('customerRedateCheck: ของเปลี่ยนใต้มือ = 409 พร้อมทุกงวดทุกใบ (รุ่นเก่า · ขอใบแล้ว · ไม่อยู่แล้ว · ใบย้ายลูกค้า) · ไม่มีอะไรถูกเขียน', () => {
  const b = redateBundle();
  b.sentRows.set('X9', inst('X9', 'SOR-9999', 1));
  const moved = order('SOR-9999', { customerId: 'CUS-2' });
  b.orders.push(moved);
  const built = customerRedateCheck({
    customerId: 'CUS-1', bundle: b, user: SA, rule: NONE, skipReady: true,
    sent: [
      { ...pick('A1', { billingDate: null }), updatedAt: 'old' },
      pick('B1', { billingDate: null }),
      pick('GONE', { billingDate: null }),
      pick('X9', { billingDate: null }),
    ],
  });
  assert.equal(built.status, 409);
  assert.deepEqual(built.conflicts.map((c) => [c.id, c.seq, c.salesOrderCode]), [
    ['GONE', null, ''], ['X9', 1, 'SO-26099999-0'], ['A1', 1, 'SO-26090001-0'], ['B1', 1, 'SO-26090002-0'],
  ]);
  assert.match(built.conflicts.find((c) => c.id === 'B1').reason, /^ขอใบวางบิลแล้ว/);
  assert.equal(built.conflicts.find((c) => c.id === 'X9').reason, 'ใบนี้ไม่ใช่ของลูกค้ารายนี้แล้ว');
  assert.match(built.error, /^ยังไม่ได้บันทึกงวดไหน — .*งวดที่ 1 \(SO-26090001-0\): เพิ่งถูกแก้จากอีกหน้าต่าง/, 'บอกเลขใบด้วย — จอนี้รวมหลายใบ');
});

test('customerRedateCheck: งวดของใบที่มองไม่เห็น = 403 · ล็อกทั้งใบ = 409 ต่องวด · รูปคำขอ = 400', () => {
  const b = redateBundle();
  b.sentRows.set('Z1', inst('Z1', 'SOR-HIDE', 1));
  assert.equal(customerRedateCheck({ customerId: 'CUS-1', bundle: b, user: SA, sent: [pick('Z1', { billingDate: null })] }).status, 403);
  const locked = redateBundle({ orders: [order('SOR-0001', { status: 'cancelled' }), order('SOR-0002')] });
  const res = customerRedateCheck({ customerId: 'CUS-1', bundle: locked, user: SA, rule: NONE, sent: [pick('A1', { billingDate: null })] });
  assert.equal(res.status, 409);
  assert.match(res.conflicts[0].reason, /^ใบยกเลิกแล้ว/);
  assert.match(redateShapeError([{ id: 'A1', updatedAt: T }]), /ไม่ได้ส่งวันใหม่/);
  assert.match(redateShapeError([]), /ไม่ได้ส่งงวดที่จะบันทึกมา/);
  assert.equal(customerRedateCheck({ customerId: 'CUS-1', bundle: b, user: SA, sent: 'x' }).status, 400);
  // คีย์อื่น (ติ๊ก/รอเหตุการณ์) ถูกทิ้ง — จอนี้แตะแค่สองช่องวัน
  const onlyDates = customerRedateCheck({
    customerId: 'CUS-1', bundle: redateBundle(), user: SA, rule: NONE, skipReady: true,
    sent: [pick('A1', { billingDate: null, billingEvent: 'ก่อนส่งสินค้า', billingSkip: true })],
  });
  assert.deepEqual(onlyDates.plans[0].rows[0].patch, { billingDate: null });
  assert.equal(onlyDates.plans[0].rows[0].before.billingSkip, null, 'ติ๊กที่ส่งมาไม่ถูกเขียน');
});

test('installmentsForScreen: งวดร่างใบ pipeline เดินตามแผน QT สด · ใบย้อนหลังไม่ทับ (ตัวเดียวกับ route งวด)', () => {
  const plan = { type: 'installment', installments: [{ label: 'ก', percent: 30 }, { label: 'ข', percent: 70 }] };
  const rows = [inst('A1', 'S', 1, { amount: 1 }), inst('A2', 'S', 2, { amount: 1 })];
  const live = installmentsForScreen(order('SOR-0001', { quotation: { paymentPlan: plan } }), rows);
  assert.deepEqual(live.map((r) => r.amount), [300, 700]);
  assert.deepEqual(installmentsForScreen(order('SOR-0001', { origin: 'historical', quotation: { paymentPlan: plan } }), rows), rows);
});

// ── 3. ตัวอ่านฝั่ง server (supabase ปลอม) ────────────────────────────────────────────────────────────
const single = (result) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) });

test('loadScheduleRule: อ่านพลาด = ruleUnavailable (ไม่โยน — ไม่ 500 ทั้งคำขอ) · 42703 = ยังไม่มีกติกา · ใบไม่ผูกลูกค้า = ไม่ถาม', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.deepEqual(await loadScheduleRule(single({ data: { id: 'C', billingRule: NONE }, error: null }), 'C'), { rule: NONE, ruleUnavailable: false });
  assert.deepEqual(await loadScheduleRule(single({ data: null, error: null }), 'C'), { rule: null, ruleUnavailable: false });
  assert.deepEqual(await loadScheduleRule(single({ data: null, error: { code: '42703', message: 'x' } }), 'C'), { rule: null, ruleUnavailable: false });
  assert.deepEqual(await loadScheduleRule(single({ data: null, error: { code: '57014', message: 'timeout' } }), 'C'), { rule: null, ruleUnavailable: true });
  assert.deepEqual(await loadScheduleRule({ from() { throw new Error('down'); } }, 'C'), { rule: null, ruleUnavailable: true });
  let asked = false;
  assert.deepEqual(await loadScheduleRule({ from() { asked = true; } }, null), { rule: null, ruleUnavailable: false });
  assert.equal(asked, false);
});

test('billingSkipReady: ถามจากคีย์ของแถวที่อ่านด้วย select * ก่อน · ไม่มีแถว = probe คอลัมน์', async () => {
  let probed = 0;
  const probe = (error) => ({ from: () => ({ select: () => ({ limit: async () => { probed += 1; return { error }; } }) }) });
  assert.equal(await billingSkipReady(probe(null), [{ id: 'a', billingSkip: null }]), true);
  assert.equal(await billingSkipReady(probe(null), [{ id: 'a' }]), false);
  assert.equal(probed, 0);
  assert.equal(await billingSkipReady(probe({ code: '42703' }), []), false);
  assert.equal(await billingSkipReady(probe(null), []), true);
  assert.equal(probed, 2);
});

test('loadOrdersBundle: ใบที่มองไม่เห็น (inSalesViewScope) ไม่ถูกอ่านงวด · นับไว้ใน hidden · คำร้องอ่านสดชุด billing_doc', async () => {
  const asked = [];
  const tables = {
    sales_deals: [{ id: 'D1', team: 'KA', ownerId: 'u-sa' }, { id: 'D2', team: 'KA', ownerId: 'u-other' }],
    quotations: [{ id: 'Q1', quoteNumber: 'QT-1', status: 'accepted', paymentPlan: null }],
    sales_order_installments: [inst('A1', 'SOR-0001', 1, { billingRequestId: 'RQ-1' })],
    dept_requests: [{ id: 'RQ-1', status: 'pending' }],
  };
  const supabase = {
    from(table) {
      const q = {
        filters: [],
        select() { return q; },
        in(col, ids) { q.filters.push([col, ids]); return q; },
        eq(col, v) { q.filters.push([col, v]); return q; },
        order() { return q; },
        range() { asked.push([table, q.filters]); return Promise.resolve({ data: tables[table] || [], error: null }); },
      };
      return q;
    },
  };
  const user = { id: 'u-sa', role: 'ae', teams: ['KA'] }; // AE เห็นเฉพาะดีลของตัวเอง
  const res = await loadOrdersBundle(supabase, user, [
    { id: 'SOR-0001', dealId: 'D1', quotationId: 'Q1', orderNumber: 'SO-1' },
    { id: 'SOR-0002', dealId: 'D2', quotationId: 'Q1', orderNumber: 'SO-2' },
  ]);
  assert.deepEqual(res.orders.map((o) => o.id), ['SOR-0001']);
  assert.equal(res.hidden, 1);
  const installmentQuery = asked.find(([table]) => table === 'sales_order_installments');
  assert.deepEqual(installmentQuery[1], [['salesOrderId', ['SOR-0001']]], 'อ่านงวดเฉพาะใบที่เห็น');
  assert.deepEqual(asked.find(([table]) => table === 'dept_requests')[1], [['id', ['RQ-1']], ['kind', 'billing_doc']]);
  assert.deepEqual([...res.requestedIds], ['A1']);
});

// ── 4. ยามต้นทาง ───────────────────────────────────────────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const REDATE = 'app/api/customers/[id]/billing-rule/redate/route.js';

test('route redate: สิทธิ์สองชั้นก่อนแตะงวด · กติกาใหม่อ่านสด · ตรวจครบทุกใบก่อนเขียน · ตัวเขียนของ schedule-many · audit ต่อใบก่อน 409', () => {
  const route = code(REDATE);
  const steps = [
    "if (!canViewSalesPlanning(user) || !installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');",
    ".from('customers').select('*').eq('id', id).maybeSingle();",
    'if (!canEditCustomerBillingRule(user, customer)) {',
    'const { rule, ruleUnavailable } = await loadScheduleRule(supabase, customer.id);',
    'const bundle = await loadRedateBundle(supabase, user, ids);',
    'const skipReady = await billingSkipReady(supabase, bundle.installments);',
    'const built = customerRedateCheck({ customerId: customer.id, bundle, sent, user, rule, ruleUnavailable, skipReady });',
    'if (built.status === 409) return ok({ error: built.error, conflicts: built.conflicts }, 409);',
    'written = await writeScheduleMany(plan.rows, (rowId, patch, expectedUpdatedAt) => updateInstallment(',
    'await recordAudit({',
    'if (written.stopped) {',
  ];
  let at = -1;
  for (const step of steps) {
    const next = route.indexOf(step, at + 1);
    assert.ok(next > at, `ลำดับผิด/หาไม่เจอ: ${step}`);
    at = next;
  }
  assert.match(route, /entityType: 'sales_order_installments',\s*entityId: plan\.order\.id,/, 'ลงประวัติของแต่ละใบ (ม็อก rd-apply)');
  assert.match(route, /after: \{ installments: after, redate: 'customer-rule', customerId: customer\.id, billingRule: rule \},/);
  const failMessage = route.slice(route.indexOf('const failMessage'), route.indexOf('const done = []'));
  assert.ok(failMessage.indexOf('billingV4SchemaError') < failMessage.indexOf('installmentBillingSchemaError'));
  assert.doesNotMatch(route, /dueFor\(|dueDateForBilling|planRuleChange|planRedate/, 'server ไม่คิดวันเอง — วันมาจากที่จอเสนอ/คนเห็น');
  const alias = readFileSync(join(SRC, 'app/api/master/customers/[id]/billing-rule/redate/route.js'), 'utf8');
  assert.match(alias, /export \{ POST \} from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/customers\/\[id\]\/billing-rule\/redate\/route";/,
    'จอเรียกผ่าน /api/master/customers/* — ไม่มี alias = 404');
});

// ── 5. route redate ตัวจริง (fetch ปลอม · devBypass) ──────────────────────────────────────────────────────────────
async function redateRoute(t, { role = 'admin', rule, installments }) {
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === 'next/headers') {
        return { url: 'data:text/javascript,export function cookies(){throw new Error("no cookie in devBypass")}export const headers=cookies;', shortCircuit: true };
      }
      return next(spec, ctx);
    }
  `));
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', NEXT_PUBLIC_DEV_BYPASS_ROLE: role,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  const store = new Map(installments.map((r) => [r.id, { ...r }]));
  const writes = [];
  const audits = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input?.url || String(input));
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const table = url.pathname.replace('/rest/v1/', '');
    const one = String(new Headers(init.headers || {}).get('accept') || '').includes('vnd.pgrst.object');
    const reply = (rows) => json(one ? (rows[0] ?? null) : rows);
    if (table === 'customers') return reply([{ id: 'CUS-1', arCode: 'AR-015', name: 'ลูกค้า', teams: ['KA'], billingRule: rule }]);
    if (table === 'sales_orders') return reply([{ id: 'SOR-1', orderNumber: 'SO-26090230-0', dealId: 'D1', quotationId: 'Q1', customerId: 'CUS-1', status: 'approved', totalAmount: 1000 }]);
    if (table === 'sales_deals') return reply([{ id: 'D1', team: 'KA', ownerId: 'u-1' }]);
    if (table === 'quotations') return reply([{ id: 'Q1', quoteNumber: 'QT-1', status: 'accepted', paymentPlan: null }]);
    if (table === 'sales_order_installments' && method === 'GET') return reply([...store.values()]);
    if (table === 'sales_order_installments' && method === 'PATCH') {
      const id = url.searchParams.get('id').replace(/^eq\./, '');
      const patch = JSON.parse(init.body);
      writes.push({ id, patch, expected: url.searchParams.get('updatedAt') });
      store.set(id, { ...store.get(id), ...patch });
      return reply([store.get(id)]);
    }
    if (table === 'audit_logs') { audits.push(JSON.parse(init.body)); return json([], 201); }
    return reply([]);
  });
  const { POST } = await import('../../app/api/customers/[id]/billing-rule/redate/route.js');
  const call = async (body) => {
    const res = await POST(new Request('http://localhost/api/customers/CUS-1/billing-rule/redate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'CUS-1' }) });
    return { status: res.status, body: await res.json() };
  };
  return { call, writes, audits };
}

test('⭐ route redate: ใช้วันใหม่ = เขียนแบบมีเงื่อนไข updatedAt ทีละงวด · audit ต่อใบ · ตอบงวดของแต่ละใบ', async (t) => {
  const { call, writes, audits } = await redateRoute(t, {
    rule: NONE,
    installments: [inst('A1', 'SOR-1', 1, { billingDate: '2026-10-05', dueDate: '2026-11-04' }), inst('A2', 'SOR-1', 2, { billingDate: '2026-11-05', dueDate: '2026-12-04' })],
  });
  const res = await call({ rows: [
    { id: 'A1', billingDate: null, dueDate: '2026-11-04', updatedAt: T },
    { id: 'A2', billingDate: null, dueDate: '2026-12-04', updatedAt: T },
  ] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.saved, 2);
  assert.deepEqual(writes.map((w) => [w.id, w.patch.billingDate, 'dueDate' in w.patch, w.expected]), [
    ['A1', null, false, `eq.${T}`], ['A2', null, false, `eq.${T}`],
  ]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].entityId, 'SOR-1');
  assert.match(audits[0].summary, /^จัดวันใหม่ตามกำหนดวางบิลของลูกค้า AR-015 \(ไม่ต้องวางบิล\) 2 งวด ของ SO-26090230-0$/);
  assert.deepEqual(res.body.orders.map((o) => [o.salesOrderId, o.installments.map((r) => r.billingDate)]), [['SOR-1', [null, null]]]);
  // กดซ้ำ = ค่าตรงฐานแล้ว ⇒ ไม่เขียน ไม่ลงประวัติ
  const again = await call({ rows: [{ id: 'A1', billingDate: null, dueDate: '2026-11-04', updatedAt: T }] });
  assert.deepEqual([again.status, again.body.saved, writes.length, audits.length], [200, 0, 2, 1]);
});

test('⭐ route redate: ฝ่ายที่ตั้งวันงวดไม่ได้ = 403 ก่อนอ่านอะไร', async (t) => {
  const { call, writes } = await redateRoute(t, { role: 'rd', rule: NONE, installments: [inst('A1', 'SOR-1', 1, { billingDate: '2026-10-05' })] });
  const res = await call({ rows: [{ id: 'A1', billingDate: null, updatedAt: T }] });
  assert.equal(res.status, 403);
  assert.equal(writes.length, 0);
});
