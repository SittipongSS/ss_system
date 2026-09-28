// ── ด่านงานบริการรายบรรทัดบนเส้นของใบสั่งขาย (mig 0391 · PR-A · แผน §2.5 ข้อ 1–4 · ข้อ 10) ─────────────────
//
// ⭐ ใบ pipeline สาย SERVICE: ยื่น/อนุมัติผ่านได้เมื่อตั้งงานบริการครบ (ตัวตัดสินเดียวกับตารางบนจอ) · อนุมัติ = เปิดรอบขายของโซน
//   ในทรานแซกชันเดียวกัน (P1) · คืนร่างล้างตราประทับ (D22) · แก้รอบระหว่างรออนุมัติ = trigger ตอบ → 409 ไทย ·
//   "แบ่งช่วงครอบตามช่วงบริการ…" = คำสั่งของทั้งใบที่ route งวด (คิดซ้ำที่ server · เทียบพรีวิว · ด่านรายงวด · เขียนแบบมีเงื่อนไข)
// ⚠️ ส่วนใหญ่เป็นยามต้นทาง (อ่าน source ตัดคอมเมนต์) — พิสูจน์แค่ "ด่านอยู่ตรงนี้ ลำดับนี้" · ตัวตัดสินมีเทสต์ของตัวเอง
//   (serviceSetup.test.mjs · paymentCoverage.test.mjs) · ตัวเขียนช่วงครอบมีเทสต์พฤติกรรมด้วยฐานปลอมที่ท้ายไฟล์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCoverageFill } from './salesOrderInstallmentsStore.js';
import { INSTALLMENT_VERSION_MISSING, coveragePlanStale, scheduleManyShapeError } from './installmentScheduleMany.js';
import { SERVICE_SETUP_SQL_MESSAGES } from './serviceSetup.js';
import { splitCoverageByPeriod } from './paymentCoverage.js';
import { withLiveAmounts } from './salesOrderPayments.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => stripComments(readFileSync(join(SRC, rel), 'utf8'));
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const INSTALLMENTS_ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
const patchOf = () => slice(code(SO_ROUTE), 'export const PATCH = withUser(', 'export const DELETE = withUser(');
const actionOf = (name, next) => slice(patchOf(), `if (action === '${name}') {`, next);

// ── ยื่นอนุมัติ ────────────────────────────────────────────────────────────────────────────────────────
test('ยื่นอนุมัติ: ด่านงานบริการอยู่หลังด่านเอกสารยืนยันคำสั่งซื้อ และก่อน RPC ยื่น (ลงนามผู้จัดทำ)', () => {
  const submit = actionOf('submit', "if (action === 'approve') {");
  const confirmation = submit.indexOf('salesOrderConfirmationGate(before, before.quotation)');
  const gate = submit.indexOf('if (serviceSetupRequired(before)) {');
  const rpc = submit.indexOf('submitSalesOrderWithSignatureEvidence(supabase, {');
  assert.ok(confirmation > 0 && gate > confirmation && rpc > gate, 'ลำดับ: เอกสารยืนยัน → งานบริการ → RPC');
  assert.ok(submit.indexOf('isHistoricalOrder(before)') < gate, 'ใบย้อนหลังแยกกิ่งไปก่อนถึงด่านนี้');
  const block = slice(submit, 'if (serviceSetupRequired(before)) {', 'submitSalesOrderWithSignatureEvidence(');
  assert.match(block, /loadServiceSetupContext\(supabase, before, \{ lines: before\.lines, withFgOptions: true \}\)/);
  assert.match(block, /catch \(setupError\) \{ return fail\(`ตรวจงานบริการไม่สำเร็จ: \$\{setupError\.message\}`, 500\); \}/,
    'อ่านไม่ขึ้น = 500 ไม่ใช่ผ่าน');
  assert.match(block, /const issues = serviceSetupIssues\(setupCtx\);/);
  assert.match(block, /Response\.json\(\{ error: `ยื่นอนุมัติไม่ได้ — ยังขาด \$\{issues\.length\} ข้อ`, issues \}, \{ status: 400 \}\)/);
});

// ── อนุมัติ ───────────────────────────────────────────────────────────────────────────────────────────
test('อนุมัติ: ด่านงานบริการอยู่หลังด่านอนุมัติใบตัวเอง และก่อน RPC อนุมัติ · 409 พร้อม issues', () => {
  const approve = actionOf('approve', "if (action === 'reject') {");
  const self = approve.indexOf('isSalesOrderSelfApproval(before, user.id)');
  const gate = approve.indexOf('if (serviceSetupRequired(before)) {');
  const rpc = approve.indexOf('approveSalesOrderWithSignatureEvidence(supabase, {');
  assert.ok(self > 0 && gate > self && rpc > gate, 'ลำดับ: แบ่งแยกหน้าที่ → งานบริการ → RPC');
  const block = slice(approve, 'if (serviceSetupRequired(before)) {', 'approveSalesOrderWithSignatureEvidence(');
  assert.match(block, /setupCtx = await loadServiceSetupContext\(supabase, before, \{ lines: before\.lines, withFgOptions: true \}\)/);
  assert.match(block, /return fail\(`ตรวจงานบริการไม่สำเร็จ: \$\{setupError\.message\}`, 500\)/);
  assert.match(block, /error: `อนุมัติไม่ได้ — งานบริการยังขาด \$\{issues\.length\} ข้อ · ตีกลับให้ฝ่ายขายแก้`, issues \}, \{ status: 409 \}/);
});

test('อนุมัติ: ฐานตีกลับงานบริการ (service_setup_incomplete) → 409 + issues จากรหัสรายข้อ · สำเร็จตอบ termsOpened', () => {
  const approve = actionOf('approve', "if (action === 'reject') {");
  const caught = slice(approve, '} catch (approvalError) {', 'const data = result.document;');
  assert.match(caught, /if \(approvalError\?\.code === 'service_setup_incomplete'\) \{/);
  assert.match(caught, /issues: serviceSetupSqlIssues\(approvalError\.extra\?\.setupErrors \|\| \[\], setupCtx \|\| \{\}\)/);
  assert.match(caught, /\{ status: 409 \}/);
  assert.ok(caught.indexOf("'service_setup_incomplete'") < caught.indexOf('signatureEvidenceErrorResponse(approvalError)'),
    'แปลงานบริการก่อนตกไปตัวแปลลายเซ็น');
  assert.match(approve, /return ok\(\{ \.\.\.data, termsOpened: setupCtx && data\?\.serviceTermsOpenedAt \? serviceSetupTotals\(setupCtx\)\.zones : 0 \}\);/);
});

test('ทุกจุดโหลดบริบทงานบริการใน route ของใบส่ง withFgOptions: true (fail-closed ของ fg_foreign)', () => {
  const route = code(SO_ROUTE);
  const calls = [...route.matchAll(/loadServiceSetupContext\(([^)]*\))?[^;]*/g)].map((m) => m[0]);
  assert.equal(calls.length, 2, 'ยื่น + อนุมัติ');
  for (const call of calls) assert.match(call, /withFgOptions: true/);
});

// ── กรอกจำนวนรอบ ────────────────────────────────────────────────────────────────────────────────────
test('กรอกจำนวนรอบ: ส่ง before เข้าตัวตรวจทั้งสอง · select พกช่องที่ตัวตัดสินชนิดบรรทัดอ่าน · trigger ล็อก → 409 ไทย', () => {
  const rounds = actionOf('set_service_rounds', "if (action === 'set-doc-language') {");
  assert.match(rounds, /serviceRoundsEditError\(before, \{ canEdit \}\)/);
  assert.match(rounds, /validateServiceRoundsPatch\(body\.serviceRounds, lines \|\| \[\], before\)/);
  const select = rounds.match(/from\('sales_order_lines'\)\.select\('([^']*)'\)/)[1];
  for (const column of ['id', '"fgCode"', '"productId"', 'description', 'metadata', '"serviceKind"', '"serviceFgCode"', '"serviceRounds"']) {
    assert.ok(select.split(',').map((s) => s.trim()).includes(column), `ขาด ${column}`);
  }
  assert.match(rounds, /if \(updateError && String\(updateError\.message \|\| ''\)\.includes\('sales_order_service_setup_locked'\)\) \{\s*return fail\(SERVICE_SETUP_SQL_MESSAGES\.sales_order_service_setup_locked\.message, 409\);/);
  assert.ok(rounds.indexOf("'sales_order_service_setup_locked'") < rounds.indexOf('return fail(updateError.message, 500)'),
    'แปลล็อกก่อนตกไป 500 ดิบ');
  assert.equal(SERVICE_SETUP_SQL_MESSAGES.sales_order_service_setup_locked.status, 409);
});

// ── คืนร่าง ──────────────────────────────────────────────────────────────────────────────────────────
test('คืนร่าง (admin): ล้างตราเปิดงานบริการและสถานะตั้งย้อนหลังในก้อนเดียวกับสถานะ (D22)', () => {
  const restore = actionOf('restore', "return badRequest('คำสั่งไม่ถูกต้อง');");
  const patch = slice(restore, 'const patch = {', '};');
  assert.match(patch, /status: 'draft',/);
  assert.match(patch, /serviceTermsOpenedAt: null, serviceSetupState: null,/);
});

test('ย้อนอนุมัติ / ยกเลิก ไม่แตะสถานะตั้งย้อนหลัง (ค่าค้างไม่มีผล — D28)', () => {
  const patch = patchOf();
  for (const name of ['revoke', 'cancel']) {
    const start = patch.indexOf(`if (action === '${name}') {`);
    assert.ok(start >= 0, `หาคำสั่ง ${name} ไม่เจอ`);
    const block = patch.slice(start, patch.indexOf("if (action === '", start + 10));
    assert.doesNotMatch(block, /serviceSetupState|serviceTermsOpenedAt/, `${name} ต้องไม่แตะ (แผน §2.5 ข้อ 1)`);
  }
});

// ── แบ่งช่วงครอบตามช่วงบริการ (route งวด) ───────────────────────────────────────────────────────────────
test('fill-coverage: ส่งต่อก่อนกิ่งรายงวด (installmentId) ของ PATCH', () => {
  const patch = slice(code(INSTALLMENTS_ROUTE), 'export const PATCH = withUser(');
  const dispatch = patch.indexOf("if (action === 'fill-coverage') return fillCoverage({ user, supabase, req, id, body });");
  assert.ok(dispatch > 0, 'ต้องมีตัวส่งต่อ');
  assert.ok(dispatch < patch.indexOf("const installmentId = String(body.installmentId || '').trim();"), 'ก่อนด่าน installmentId');
});

test('fill-coverage: สิทธิ์ก่อนโหลด → ด่านจังหวะใบ (ข้อความเดียวกับปุ่ม) → ช่วงบริการ → คิดซ้ำ → เทียบพรีวิว → ด่านรายงวด → เขียน → audit', () => {
  const fill = slice(code(INSTALLMENTS_ROUTE), 'async function fillCoverage(', '\n}\n');
  const order = [
    'if (!installmentScheduleAllowed(user)) return forbidden(',
    'await loadOrderForUser(supabase, user, id)',
    'const flow = serviceSetupFlow(order, { lines: order.lines });',
    'const lockText = serviceSetupEditError(order, { canEdit: true });',
    "if (lockText || !['pipeline', 'backfill'].includes(flow)) return fail(lockText || COVERAGE_FILL_NOTHING, 409);",
    'const period = servicePeriodOf(order);',
    'if (!period) return fail(COVERAGE_SPLIT_ERRORS.noPeriod, 409);',
    'const live = await loadInstallments(supabase, order.id);',
    /* ยอดของงวดร่างที่จอเห็นคือยอดตามแผน QT สด (withLiveAmounts) — โหมดตามสัดส่วนต้องคิดจากชุดเดียวกับพรีวิว (W2 gate) */
    'const split = splitCoverageByPeriod(period, installmentsForScreen(order, live), mode);',
    'if (split.error) return fail(split.error, 409);',
    'if (!coveragePlanMatches(split.rows, body.plan)) return fail(COVERAGE_PLAN_STALE, 409);',
    /* ชั้นแรกของ optimistic lock (รุ่นของงวดที่พรีวิวเห็น) — ท่าเดียวกับ schedule-many: 409 พก conflicts + งวดสด */
    'const stale = coveragePlanStale(live, body.plan);',
    'if (stale?.status === 409) {',
    'return ok({ error: stale.error, conflicts: stale.conflicts, installments: installmentsForScreen(order, live) }, 409);',
    'if (stale) return fail(stale.error, stale.status);',
    "installmentActionError(byId.get(planned.id), 'coverage', user, {",
    'written = await writeCoverageFill(supabase, live, split.rows);',
    'await recordAudit({',
  ];
  let at = -1;
  for (const needle of order) {
    const next = fill.indexOf(needle);
    assert.ok(next > at, `ลำดับผิดหรือหาไม่เจอ: ${needle}`);
    at = next;
  }
  assert.match(fill, /orderLock = historicalInstallmentLock\(order\) \|\| pipelineInstallmentLock\(order, 'coverage'\)/);
  assert.match(fill, /coversFrom: planned\.coversFrom, coversTo: planned\.coversTo,/);
  assert.ok(fill.indexOf('await recordAudit({') < fill.indexOf('coverageFillStoppedMessage(after.length, stopped)'),
    'หยุดกลางทางยังต้องลง audit งวดที่เขียนไปแล้วก่อนตอบ 409');
  /* หยุดกลางทาง/ไม่ได้เขียนสักงวด = 409 พกจำนวนที่ลงแล้ว + งวดสด (อ่านพลาด = ไม่พก ไม่กลายเป็น 500) — ท่าเดียวกับ schedule-many */
  const stoppedBranch = slice(fill, 'if (stopped || !after.length) {', 'let settled;');
  assert.match(stoppedBranch, /fresh = installmentsForScreen\(order, await loadInstallments\(supabase, order\.id\)\);\s*\} catch \{\s*fresh = null;/);
  assert.match(stoppedBranch, /error: after\.length \? coverageFillStoppedMessage\(after\.length, stopped\) : \(stopped\?\.message \|\| INSTALLMENT_STALE_MESSAGE\),/);
  assert.match(stoppedBranch, /filled: after\.length,\s*\.\.\.\(fresh \? \{ installments: fresh \} : \{\}\),\s*\}, 409\);/);
  assert.ok(fill.indexOf('if (after.length) {\n      await recordAudit({') >= 0, 'ไม่ได้เขียนสักงวด = ไม่ลง audit');
  /* เขียนครบ + audit แล้ว — อ่านงวดสดพลาดห้ามตกไป catch นอก (500 ทั้งที่ลงครบ) · ถอยไปงวดก่อนเขียนที่แทนด้วยแถวที่เพิ่งเขียน */
  assert.match(fill, /try \{\s*settled = await loadInstallments\(supabase, order\.id\);\s*\} catch \{\s*settled = installmentsAfterWrite\(live, after\);\s*\}/);
  assert.match(fill, /return ok\(\{ filled: after\.length, installments: installmentsForScreen\(order, settled\) \}\);/);
  // ข้อความเมื่อพรีวิวกับของจริงไม่ตรง = ข้อความของแผน §2.5 ข้อ 3
  assert.match(code(INSTALLMENTS_ROUTE), /const COVERAGE_PLAN_STALE = 'งวดหรือช่วงบริการเพิ่งเปลี่ยน — ตรวจพรีวิวใหม่';/);
});

test('route งวด: select บรรทัดพกช่องที่ตัวตัดสินชนิดบรรทัดอ่าน (serviceSetupFlow ของ fill-coverage · D25)', () => {
  const loader = slice(code(INSTALLMENTS_ROUTE), 'async function loadOrderForUser(', '\n}\n');
  const select = loader.match(/from\('sales_order_lines'\)\.select\('([^']*)'\)/)[1];
  for (const column of ['fgCode', '"productId"', '"serviceKind"', '"serviceFgCode"', 'categoryCode:metadata->>categoryCode']) {
    assert.ok(select.includes(column), `ขาด ${column}`);
  }
  assert.doesNotMatch(select, /(^|,\s*)metadata(\s*,|$)/, 'หมวดอ่านแค่คีย์เดียว ไม่ลาก metadata ทั้งก้อน');
});

// ── fill-coverage × schedule-many: รุ่นของงวดที่ตาเห็น (ชั้นแรกของ optimistic lock) ─────────────────────────────────
test('coveragePlanStale: พรีวิวพกรุ่นของงวด (updatedAt) · อีกหน้าต่างแก้งวดหลังเปิดโมดัล = 409 ทุกงวดที่เปลี่ยน · ไม่ส่งรุ่น = 400', () => {
  const live = [1, 2, 3].map((seq) => ({ id: `I${seq}`, seq, status: 'pending', updatedAt: `2026-09-29T0${seq}:00:00.123456+00:00` }));
  const plan = live.map(({ id, updatedAt }) => ({ id, coversFrom: '2026-10-01', coversTo: '2026-12-31', updatedAt }));
  assert.equal(coveragePlanStale(live, plan), null, 'รุ่นตรง = ผ่าน');
  // รูปเวลาต่างแต่เป็นจุดเดียวกัน (Z กับ +00:00) = ไม่ใช่ของเก่า (installmentStale ตัวเดียวกับ schedule-many)
  assert.equal(coveragePlanStale([{ ...live[0], updatedAt: '2026-09-29T01:00:00.123Z' }], [{ ...plan[0], updatedAt: '2026-09-29T01:00:00.123+00:00' }]), null);
  const moved = live.map((row) => (row.seq === 1 ? row : { ...row, updatedAt: `${row.updatedAt}-other` }));
  const res = coveragePlanStale(moved, plan);
  assert.equal(res.status, 409);
  assert.deepEqual(res.conflicts, [
    { id: 'I2', seq: 2, reason: 'เพิ่งถูกแก้จากอีกหน้าต่าง' },
    { id: 'I3', seq: 3, reason: 'เพิ่งถูกแก้จากอีกหน้าต่าง' },
  ]);
  assert.equal(res.error, 'ยังไม่ได้บันทึกงวดไหน — งวดที่ 2: เพิ่งถูกแก้จากอีกหน้าต่าง · งวดที่ 3: เพิ่งถูกแก้จากอีกหน้าต่าง · โหลดงวดล่าสุดแล้วตรวจอีกครั้ง',
    'ประโยคเดียวกับ 409 ของ schedule-many');
  // ไม่ส่งรุ่น = ตรวจ "ของเก่า" ไม่ได้ ⇒ ไม่รับ (คำเดียวกับ schedule-many) · ไม่ใช่ข้ามไปเขียนทับ
  assert.deepEqual(coveragePlanStale(live, plan.map(({ updatedAt, ...rest }) => rest)), { error: INSTALLMENT_VERSION_MISSING, status: 400 });
  assert.equal(scheduleManyShapeError([{ id: 'I1' }]), INSTALLMENT_VERSION_MISSING, 'schedule-many ยังพูดคำเดิม');
});

// ── writeCoverageFill: พฤติกรรมด้วยฐานปลอม (ท่าเดียวกับ writeBillingFill) ─────────────────────────────────────
/* ฐานปลอมของ `updateInstallment`: update(patch).eq('id').eq('updatedAt').select().maybeSingle()
   · updatedAt ไม่ตรง = ไม่มีแถวถูกแก้ (data null — ท่าเดียวกับ PostgREST) · `failOn` = id ที่ฐานตีกลับ */
const TABLE = 'sales_order_installments';
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
                if (where.id === failOn) return { data: null, error: { code: '23514', message: 'sales_order_installments_covers_range' } };
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

const PERIOD = { from: '2026-10-01', to: '2027-09-30' };
const rows = () => [1, 2, 3, 4].map((seq) => ({
  id: `I${seq}`, seq, status: 'pending', amount: 2500, coversFrom: null, coversTo: null, updatedAt: `t${seq}`,
}));

test('🔴 writeCoverageFill: ครบทุกงวด = เขียนแค่ coversFrom/coversTo แบบมีเงื่อนไข · before/after ทุกงวด', async () => {
  const live = rows();
  const split = splitCoverageByPeriod(PERIOD, live, 'monthly');
  assert.equal(split.error, null);
  const db = condDb(live);
  const res = await writeCoverageFill(db, live, split.rows);
  assert.equal(res.stopped, null);
  assert.deepEqual(res.after.map((r) => [r.id, r.coversFrom, r.coversTo]), [
    ['I1', '2026-10-01', '2026-12-31'],
    ['I2', '2027-01-01', '2027-03-31'],
    ['I3', '2027-04-01', '2027-06-30'],
    ['I4', '2027-07-01', '2027-09-30'],
  ]);
  assert.deepEqual(res.before.map((r) => r.id), ['I1', 'I2', 'I3', 'I4']);
  for (const { patch } of db.writes) {
    assert.deepEqual(Object.keys(patch).sort(), ['coversFrom', 'coversTo', 'updatedAt'], 'ไม่แตะช่องอื่นของงวด');
  }
});

test('🔴 writeCoverageFill: อีกหน้าต่างแก้งวดกลางทาง = หยุดที่งวดนั้น · งวดหลังไม่ถูกแตะ · ฐานตีกลับงวดแรก = โยน error เดิม', async () => {
  const live = rows();
  const split = splitCoverageByPeriod(PERIOD, live, 'monthly');
  const db = condDb(live);
  db.store.set('I3', { ...db.store.get('I3'), updatedAt: 't3-other-window' });
  const res = await writeCoverageFill(db, live, split.rows);
  assert.deepEqual(res.stopped, { seq: 3, error: null });
  assert.deepEqual(res.after.map((r) => r.id), ['I1', 'I2']);
  assert.deepEqual(db.writes.map((w) => w.id), ['I1', 'I2'], 'I4 ต้องไม่ถูกเขียนหลังหยุด');
  assert.equal(db.store.get('I4').coversFrom, null);

  await assert.rejects(writeCoverageFill(condDb(live, { failOn: 'I1' }), live, split.rows), (e) => e.code === '23514');
  const later = await writeCoverageFill(condDb(live, { failOn: 'I2' }), live, split.rows);
  assert.equal(later.stopped.seq, 2);
  assert.equal(later.stopped.error.code, '23514');
  assert.deepEqual(later.after.map((r) => r.id), ['I1']);
});

test('writeCoverageFill: กดซ้ำได้ชุดเดิม (การแบ่งไม่ขึ้นกับช่วงครอบเดิมของงวดที่ยังไม่รับรอง)', async () => {
  const live = rows();
  const first = splitCoverageByPeriod(PERIOD, live, 'proportional');
  const db = condDb(live);
  await writeCoverageFill(db, live, first.rows);
  const after = [...db.store.values()];
  const second = splitCoverageByPeriod(PERIOD, after, 'proportional');
  assert.deepEqual(second.rows.map((r) => [r.id, r.coversFrom, r.coversTo]), first.rows.map((r) => [r.id, r.coversFrom, r.coversTo]));
});

/* 🐞 W2 gate: พรีวิวของโมดัลคิดจากงวดที่จอเห็น — งวดร่างของใบปกติโชว์ยอดตามแผน QT สด (`withLiveAmounts` · B-4 ไม่เขียนลงฐาน)
   ถ้า server คิดจากยอดดิบในฐาน โหมด "ตามสัดส่วนงวด" จะได้คนละชุดกับพรีวิว ⇒ 409 "งวดหรือช่วงบริการเพิ่งเปลี่ยน" ทุกครั้งที่กด
   ⇒ route คิดจาก `installmentsForScreen(order, live)` (ยามลำดับข้างบน) · เทสต์นี้พิสูจน์ว่าสองชุดต่างกันได้จริง */
test('fill-coverage ตามสัดส่วน: ยอดดิบในฐาน ≠ ยอดที่จอเห็น ⇒ ต้องคิดจากชุดที่จอเห็น', () => {
  const stored = [1, 2].map((seq) => ({
    id: `I${seq}`, seq, status: 'pending', amount: 5000, percent: 50, coversFrom: null, coversTo: null, updatedAt: `t${seq}`,
  }));
  const plan = { type: 'installment', installments: [{ label: 'มัดจำ', percent: 25 }, { label: 'ส่วนที่เหลือ', percent: 75 }] };
  const screen = withLiveAmounts(stored, plan, 10000);
  assert.deepEqual(screen.map((r) => r.amount), [2500, 7500]);
  const fromDb = splitCoverageByPeriod(PERIOD, stored, 'proportional');
  const fromScreen = splitCoverageByPeriod(PERIOD, screen, 'proportional');
  assert.deepEqual(fromDb.rows.map((r) => r.coversTo), ['2027-03-31', '2027-09-30']);
  assert.deepEqual(fromScreen.rows.map((r) => r.coversTo), ['2026-12-31', '2027-09-30']);
  assert.deepEqual(fromScreen.rows.map((r) => r.id), stored.map((r) => r.id), 'งวดชุดเดียวกัน (id) — ต่างแค่ยอด');
});
