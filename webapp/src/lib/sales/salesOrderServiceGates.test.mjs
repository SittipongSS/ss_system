// ── ด่านงานบริการรายบรรทัดบนเส้นของใบสั่งขาย (mig 0392 · PR-A · แผน §2.5 ข้อ 1–4 · ข้อ 10) ─────────────────
//
// ⭐ ใบ pipeline สาย SERVICE: ยื่น/อนุมัติผ่านได้เมื่อตั้งงานบริการครบ (ตัวตัดสินเดียวกับตารางบนจอ) · อนุมัติ = เปิดรอบขายของโซน
//   ในทรานแซกชันเดียวกัน (P1) · คืนร่างล้างตราประทับ (D22) · แก้รอบระหว่างรออนุมัติ = trigger ตอบ → 409 ไทย ·
//   "แบ่งช่วงครอบตามช่วงบริการ…" = คำสั่งของทั้งใบที่ route งวด (คิดซ้ำที่ server · เทียบพรีวิว · ด่านรายงวด · เขียนแบบมีเงื่อนไข)
// ⚠️ ส่วนใหญ่เป็นยามต้นทาง (อ่าน source ตัดคอมเมนต์) — พิสูจน์แค่ "ด่านอยู่ตรงนี้ ลำดับนี้" · ตัวตัดสินมีเทสต์ของตัวเอง
//   (serviceSetup.test.mjs · paymentCoverage.test.mjs) · ตัวเขียนช่วงครอบมีเทสต์พฤติกรรมด้วยฐานปลอมที่ท้ายไฟล์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCoverageFill } from './salesOrderInstallmentsStore.js';
import { INSTALLMENT_VERSION_MISSING, coveragePlanStale, scheduleManyShapeError } from './installmentScheduleMany.js';
import {
  SERVICE_DEFER_TEXT, SERVICE_SETUP_SQL_MESSAGES, serviceSetupApprovalGate, serviceSetupIssues, serviceSetupRequired, serviceSetupSkipState,
} from './serviceSetup.js';
import { resolveExpectedUpdatedAt } from './documentConcurrency.js';
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

// ── ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404 · มติเจ้าของ 01/10 "ฝ่ายขายกดข้ามเอง" · แผน IMPL_PLAN_DEFER §3) ─────────────────────
/* ลำดับของข้อความในก้อนซอร์ส — หาไม่เจอหรือสลับ = แดงพร้อมบอกว่าตัวไหน */
function assertInOrder(text, needles, label) {
  let at = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, at + 1);
    assert.ok(next > at, `${label}: ลำดับผิดหรือหาไม่เจอ — ${needle}`);
    at = next;
  }
}

test('0404 ยื่นแบบข้าม: กิ่งอยู่หลังด่านเอกสารยืนยัน · server ตัดสินเองด้วย serviceSetupSkipState (ไม่เชื่อจอ) · ลำดับคำตอบตามตารางของแผน', () => {
  const submit = actionOf('submit', "if (action === 'approve') {");
  assertInOrder(submit, [
    'salesOrderConfirmationGate(before, before.quotation)',
    /* เฉพาะบูลีนแท้ — "true" / 1 จากคำขอที่ประกอบเองไม่นับ */
    'const deferring = body.deferServiceSetup === true;',
    /* ① ใบที่ไม่ต้องตั้งงานบริการ (สายอื่น/ใบย้อนหลังแยกกิ่งไปแล้ว) = 409 */
    'if (deferring && !serviceSetupRequired(before)) {',
    "error: SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_state_invalid.message, code: 'service_setup_defer_state_invalid',",
    '}, { status: 409 });',
    /* ② เวอร์ชันของจอ — ไม่มี/ผิดรูป = 400 ก่อนโหลดอะไร */
    'if (deferring) {',
    'const expected = resolveExpectedUpdatedAt(body);',
    'if (!expected.ok) return badRequest(expected.error);',
    'deferExpected = expected.value;',
    /* ③ โหลดบริบทครั้งเดียว (ในบล็อกเดิม) → ④–⑥ ตัดสินจากข้อที่เพิ่งคิด */
    'let deferSkip = null;',
    'if (serviceSetupRequired(before)) {',
    'setupCtx = await loadServiceSetupContext(supabase, before, { lines: before.lines, withFgOptions: true });',
    'const issues = serviceSetupIssues(setupCtx);',
    'const skip = serviceSetupSkipState(setupCtx, { canEdit: true, issues });',
    'if (!skip.visible && !issues.length) {',
    "error: SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_nothing.message, code: 'service_setup_defer_nothing',",
    'if (skip.visible && !skip.canSkip) {',
    'return Response.json({ error: skip.blockedReason, issues: [...issues, ...skip.extraIssues], skip }, { status: 400 });',
    'if (skip.visible) deferSkip = skip;',
    'if (issues.length && !deferSkip) return Response.json({ error: `ยื่นอนุมัติไม่ได้ — ยังขาด ${issues.length} ข้อ`, issues }, { status: 400 });',
    /* ⑦ RPC ตัวห่อ → ⑧ กระทู้ + audit + ตอบแถวใบ · ทั้งหมดก่อนถึงการยื่นปกติ */
    'if (deferSkip) {',
    'const deferred = await submitOrderDeferringServiceSetup(supabase, {',
    'if (deferred.error) {',
    'const data = deferred.data.document;',
    "await logThread('submit');",
    'summary: `submit ${before.orderNumber} for approval (ลงนามผู้จัดทำ) · ข้ามการตั้งงานบริการ ${deferSkip.deferredCount} ข้อ`,',
    'return ok(data);',
    'submitSalesOrderWithSignatureEvidence(supabase, {',
  ], 'ยื่นแบบข้าม');
  assert.equal(submit.split('if (serviceSetupRequired(before)) {').length - 1, 1, 'บล็อกด่านงานบริการของการยื่นมีบล็อกเดียว (โหลดบริบทครั้งเดียว)');
  assert.equal(submit.split('body.deferServiceSetup').length - 1, 1, 'อ่านธงจากคำขอที่เดียว');

  /* ⑤ ครบแล้ว/ไม่มีอะไรให้ข้าม = 409 **ไม่พก issues** (จอห้ามวาดแผงแดงเปล่า) */
  const nothing = slice(submit, 'if (!skip.visible && !issues.length) {', 'if (skip.visible && !skip.canSkip)');
  assert.match(nothing, /\{ status: 409 \}/);
  assert.doesNotMatch(nothing, /\bissues\b(?!\.length)/, 'คำตอบ "ไม่มีอะไรให้ข้าม" ต้องไม่มีคีย์ issues');

  /* ⑦ RPC ได้เวอร์ชันของจอ (ไม่ใช่ `before.updatedAt` — แท็บค้างต้องโดน workflow_stale) + fingerprint/เลขหลักฐานนิพจน์เดียวกับการยื่นปกติ */
  const call = slice(submit, 'await submitOrderDeferringServiceSetup(supabase, {', '});');
  assert.match(call, /orderId: id,/);
  assert.match(call, /evidenceId: genId\('DSE'\),/);
  assert.match(call, /expectedUpdatedAt: deferExpected,/);
  assert.match(call, /documentFingerprint: salesOrderApprovalFingerprint\(before, before\.lines\),/);
  assert.match(call, /\buser,/);
  assert.doesNotMatch(call, /before\.updatedAt/);
  /* ผลผิดของ RPC = JSON พร้อม code (+ accountUrl ของ "ยังไม่มีลายเซ็น") และสถานะจากตัวแปล — supabase ไม่ throw จึงไม่มี try/catch */
  const failed = slice(submit, 'if (deferred.error) {', 'const data = deferred.data.document;');
  assert.match(failed, /error: deferred\.error\.message, code: deferred\.error\.code, \.\.\.\(deferred\.error\.extra \|\| \{\}\),/);
  assert.match(failed, /\{ status: deferred\.error\.status \}/);
  /* ⑧ audit ของการข้ามลงที่ route (ฐานไม่ลง) หลัง RPC สำเร็จเท่านั้น */
  const done = slice(submit, 'const data = deferred.data.document;', 'submitSalesOrderWithSignatureEvidence(supabase, {');
  assert.match(done, /await recordAudit\(\{\s*user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data,/);

  /* การยื่นปกติข้างล่างไม่ถูกแตะ: เวอร์ชันที่ server อ่าน · สรุป audit เดิม · ตัวแปลลายเซ็นเดิม */
  const normal = slice(submit, 'submitSalesOrderWithSignatureEvidence(supabase, {');
  assert.match(normal, /expectedUpdatedAt: before\.updatedAt,/);
  assert.match(normal, /return signatureEvidenceErrorResponse\(submitError, \{ action: 'submit' \}\);/);
  assert.match(normal, /summary: `submit \$\{before\.orderNumber\} for approval \(ลงนามผู้จัดทำ\)`, request: req \}\);/);
  assert.doesNotMatch(normal, /deferSkip|deferExpected|deferring/, 'การยื่นปกติไม่รู้จักการข้าม');
  /* ข้อความ/สถานะของสองคำตอบใหม่มาจากแคตตาล็อกเดียวกับรหัสของฐาน */
  assert.equal(SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_state_invalid.status, 409);
  assert.equal(SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_nothing.status, 409);
});

test('0404 อนุมัติใบที่ข้าม: ด่านถาม serviceSetupApprovalGate (หยุดเฉพาะข้อที่ข้ามไม่ได้) · สรุป audit อ่านจากแถวที่ RPC คืน ไม่ใช่จากด่าน', () => {
  const approve = actionOf('approve', "if (action === 'reject') {");
  const block = slice(approve, 'if (serviceSetupRequired(before)) {', 'approveSalesOrderWithSignatureEvidence(');
  assertInOrder(block, [
    'const allIssues = serviceSetupIssues(setupCtx);',
    'const issues = serviceSetupApprovalGate(setupCtx, allIssues).blocking;',
    'if (issues.length) {',
    'error: `อนุมัติไม่ได้ — งานบริการยังขาด ${issues.length} ข้อ · ตีกลับให้ฝ่ายขายแก้`, issues }, { status: 409 }',
  ], 'ด่านอนุมัติ');
  assert.equal(approve.split('serviceSetupApprovalGate(').length - 1, 1, 'ถามด่านครั้งเดียว ก่อน RPC');
  assert.equal(approve.split('serviceSetupIssues(').length - 1, 1);
  /* หลัง RPC: ทุกอย่างอ่านจาก `data` (แถวที่ฐานคืน) — ฐานเห็นว่าครบ = เปิดรอบขาย + ประทับ ⇒ สรุปห้ามพูดว่ายังไม่ส่ง TS */
  const after = slice(approve, 'const data = result.document;');
  assert.doesNotMatch(after, /serviceSetupApprovalGate|allIssues|\.deferring/, 'ผลหลังอนุมัติห้ามสรุปจากด่าน JS');
  assert.match(after, /const approvedWithoutSetup = !!setupCtx && !data\?\.serviceTermsOpenedAt && serviceSetupDeferred\(data\)\?\.stage === 'approved';/);
  assert.match(after, /\+ \(approvedWithoutSetup \? ' · ยังไม่ตั้งงานบริการ \(ข้ามตอนยื่น\) — ยังไม่ส่ง TS' : ''\),/);
  assert.ok(after.indexOf('const approvedWithoutSetup') > after.indexOf("await logThread('approve', { overrideReason });"), 'คิดตอนลง audit — หลังงานเงินทั้งหมด');
  /* สรุปเดิมของสองทาง (อนุมัติปกติ · Admin Override) ยังอยู่ครบ */
  assert.match(after, /summary: \(selfApproval\s*\? `admin override approve \$\{before\.orderNumber\}: \$\{overrideReason\}`\s*: `approve \$\{before\.orderNumber\}`\)/);
  /* คำตอบของการอนุมัติไม่เปลี่ยน (หน้าใบคิด toast จากแถวที่คืน) — บรรทัดเดิมทุกตัวอักษร (ยามข้างบนยึดไว้แล้ว) และเป็น return สุดท้าย */
  assert.ok(after.trimEnd().endsWith('return ok({ ...data, termsOpened: setupCtx && data?.serviceTermsOpenedAt ? serviceSetupTotals(setupCtx).zones : 0 });\n  }'));
  /* งานเงินระหว่าง RPC กับ audit ไม่รู้จักการข้าม (ฉบับตรึง · คิวบัญชี · หยุดยอดงวด เดินเหมือนเดิมทุกใบ) */
  const money = slice(after, 'const data = result.document;', "await logThread('approve', { overrideReason });");
  assert.doesNotMatch(money, /serviceSetupDeferred|deferServiceSetup|serviceSetupSkipState/);
  for (const piece of ['captureIssuedSalesOrderSnapshot(getSupabaseAdmin(), {', ".update({ financeStatus: 'pending' })", 'await freezeInstallments(supabase, {']) {
    assert.ok(money.includes(piece), `งานเงินหลังอนุมัติขาด ${piece}`);
  }
});

test('0404 ทางเดียวที่ถึง RPC อนุมัติ/ยื่นแบบข้าม · คำสั่งอื่นของใบไม่แตะตราการข้าม (ฐานล้างเองเมื่อใบกลับเป็นร่าง/ตีกลับ)', () => {
  const patch = patchOf();
  /* อนุมัติ: จุดเรียกเดียวทั้งไฟล์ (ปุ่มอนุมัติ + Admin Override ใช้ action เดียวกัน) · ยื่นแบบข้าม: จุดเรียกเดียว */
  const route = code(SO_ROUTE);
  assert.equal(route.split('approveSalesOrderWithSignatureEvidence(supabase, {').length - 1, 1);
  assert.equal(route.split('submitOrderDeferringServiceSetup(').length - 1, 1);
  for (const name of ['withdraw', 'revoke', 'revise', 'save', 'reject', 'cancel', 'restore', 'set_service_contract', 'set_service_rounds']) {
    const start = patch.indexOf(`if (action === '${name}') {`);
    assert.ok(start >= 0, `หาคำสั่ง ${name} ไม่เจอ`);
    const next = patch.indexOf("if (action === '", start + 10);
    const block = patch.slice(start, next < 0 ? undefined : next);
    assert.doesNotMatch(block, /serviceSetupDeferred|deferServiceSetup|serviceSetupSkipState|serviceSetupApprovalGate/, `${name} ต้องไม่รู้จักการข้าม`);
  }
  /* ดึงกลับ/ตีกลับ/กู้คืน เปลี่ยน `status` ในคำสั่งเดียว ⇒ trigger `BEFORE UPDATE OF status` ของ 0404 ล้างสามช่องให้ (ไม่ต้องจำใน JS) */
  assert.match(actionOf('reject', "if (action === 'cancel') {"), /const patch = \{ status: 'rejected',/);
  assert.match(slice(actionOf('restore', "return badRequest('คำสั่งไม่ถูกต้อง');"), 'const patch = {', '};'), /status: 'draft',/);
  assert.match(actionOf('withdraw', "if (action === 'revoke') {"), /supabase\.rpc\('withdraw_sales_order_submission_atomic', \{/);
});

/* ── พฤติกรรมจริงของกิ่งข้าม ──────────────────────────────────────────────────────────────────────────────────────
   route.js import ใต้ node ไม่ได้ (`@/lib/http` ลาก next/headers) ⇒ ตัดก้อนซอร์สของกิ่งนี้ (จากบรรทัดอ่านธง ถึงก่อนการยื่นปกติ) มารันด้วย
   ตัวตัดสินจริง (`serviceSetupRequired` · `serviceSetupIssues` · `serviceSetupSkipState` · `resolveExpectedUpdatedAt`) + ฐาน/ตัวตอบปลอม
   · ก้อนตกทะลุ (ไม่ return) = "เดินต่อไปการยื่นปกติ" ⇒ ฟังก์ชันคืน 'NORMAL_SUBMIT'
   ⚠️ รูปของก้อน (ลำดับ/ตัวอักษร) ยึดด้วยยามต้นทางข้างบน — ที่นี่ยึด **ผล** ของทุกแถวในตารางของแผน และว่า server ไม่เชื่อสิ่งที่จอส่งมา */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const SKIP_SCOPE = ['body', 'before', 'supabase', 'id', 'user', 'req', 'serviceSetupRequired', 'loadServiceSetupContext', 'serviceSetupIssues',
  'serviceSetupSkipState', 'submitOrderDeferringServiceSetup', 'SERVICE_SETUP_SQL_MESSAGES', 'resolveExpectedUpdatedAt', 'badRequest', 'fail', 'ok',
  'genId', 'salesOrderApprovalFingerprint', 'logThread', 'recordAudit'];
function skipBranch() {
  const raw = readFileSync(join(SRC, SO_ROUTE), 'utf8');
  const from = raw.indexOf('    const deferring = body.deferServiceSetup === true;');
  const to = raw.indexOf('    // การยื่น = การลงนามของผู้จัดทำ (mig 0153)', from);
  assert.ok(from > 0 && to > from, 'หาก้อนของกิ่งข้ามใน route ไม่เจอ');
  return new AsyncFunction(...SKIP_SCOPE, `${raw.slice(from, to)}\n    return 'NORMAL_SUBMIT';`);
}

const SKIP_ORDER = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26100005-0', status: 'draft', origin: 'pipeline', customerId: 'C1', dealId: 'DL1',
  deal: { id: 'DL1', line: 'SERVICE' }, projectId: null, project: null, totalAmount: 120000,
  servicePeriodFrom: null, servicePeriodTo: null, serviceTermsOpenedAt: null, serviceSetupState: null, supersededById: null,
  updatedAt: '2026-10-02T02:00:00.111111+00:00', ...over,
});
const SKIP_LINE = (i, over = {}) => ({
  id: `SOL-${i}`, lineNo: i, sortOrder: i, fgCode: null, productId: null, description: 'ระบบกระจายกลิ่น', qty: 12, unit: 'แพ็คเกจ', metadata: {},
  serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over,
});
const SKIP_DONE = (i) => SKIP_LINE(i, { serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-0521-02-001-00012', serviceRounds: 12 });
const SKIP_ROWS = (over = {}) => [1, 2].map((seq) => ({
  id: `I${seq}`, seq, status: 'pending', amount: 60000, dueDate: seq === 1 ? '2026-10-01' : '2027-04-01', billingDate: null, billingEvent: null,
  coversFrom: seq === 1 ? '2026-10-01' : '2027-04-01', coversTo: seq === 1 ? '2027-03-31' : '2027-09-30', ...over,
}));
const SKIP_PERIOD = { servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30' };
function skipCtx({ order = SKIP_ORDER(), lines = [SKIP_LINE(1), SKIP_LINE(2)], allocations = [], installments = SKIP_ROWS(), predecessor = null } = {}) {
  return {
    order, lines, allocations,
    zonesById: new Map([['Z1', { id: 'Z1', code: 'ZN-1', name: 'Lobby', siteId: 'S1', isActive: true }]]),
    sitesById: new Map([['S1', { id: 'S1', customerId: 'C1', kind: 'customer', isActive: true }]]),
    productsById: new Map([['P1', { id: 'P1', fgCode: 'FG-0521-02-001-00012', isActive: true, approvalStatus: 'approved', customerId: 'C1' }]]),
    fgOptions: [], fgOptionIds: new Set(['P1']), siblingSites: [], installments, customerBillingRule: null, contract: null,
    liveTermsByZone: new Map(), predecessor, unsaved: false,
  };
}
const SKIP_COMPLETE = () => skipCtx({
  order: SKIP_ORDER(SKIP_PERIOD), lines: [SKIP_DONE(1)], allocations: [{ id: 'A1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 }],
});
const CLIENT_VERSION = '2026-10-02T02:30:11.170722+00:00';

/* รันกิ่งข้ามหนึ่งครั้ง → { out (คำตอบ หรือ 'NORMAL_SUBMIT'), status, json, loads, rpc[], audits[], threads[] } */
async function runSkip({ body, ctx = skipCtx(), loadError = null, rpcResult = null }) {
  const seen = { loads: 0, rpc: [], audits: [], threads: [] };
  const before = { ...ctx.order, lines: ctx.lines };
  const out = await skipBranch()(
    body, before, { fake: 'supabase' }, 'SO1', { id: 'U-AE', name: 'เอ ขายดี', role: 'ae', team: 'T1' }, { fake: 'req' },
    serviceSetupRequired,
    async (_supabase, order, options) => {
      seen.loads += 1;
      assert.deepEqual(options, { lines: before.lines, withFgOptions: true });
      assert.equal(order, before);
      if (loadError) throw loadError;
      return ctx;
    },
    serviceSetupIssues, serviceSetupSkipState,
    async (_supabase, input) => {
      seen.rpc.push(input);
      return rpcResult || { data: { document: { id: 'SO1', status: 'pending_approval', serviceSetupDeferredAt: 'now' }, evidence: { id: input.evidenceId } } };
    },
    SERVICE_SETUP_SQL_MESSAGES, resolveExpectedUpdatedAt,
    (message) => Response.json({ error: message }, { status: 400 }),
    (message, status = 500) => Response.json({ error: message }, { status }),
    (data) => ({ ok: data }),
    (prefix) => `${prefix}-1`,
    (order, lines) => `fp:${order.id}:${lines.length}`,
    async (kind) => { seen.threads.push(kind); },
    async (entry) => { seen.audits.push(entry); },
  );
  const isResponse = out instanceof Response;
  return { out, status: isResponse ? out.status : null, json: isResponse ? await out.json() : null, ...seen };
}
const skipBody = (over = {}) => ({ action: 'submit', deferServiceSetup: true, expectedUpdatedAt: CLIENT_VERSION, ...over });

test('0404 พฤติกรรม: ไม่ส่งธงข้าม = การยื่นปกติเหมือนเดิม (ครบ → เดินต่อ · ไม่ครบ → 400 เดิม) · ธงที่ไม่ใช่บูลีนแท้ไม่นับ', async () => {
  const complete = await runSkip({ body: { action: 'submit' }, ctx: SKIP_COMPLETE() });
  assert.deepEqual([complete.out, complete.loads, complete.rpc.length], ['NORMAL_SUBMIT', 1, 0]);
  const missing = await runSkip({ body: { action: 'submit' } });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error, 'ยื่นอนุมัติไม่ได้ — ยังขาด 2 ข้อ');
  assert.deepEqual(missing.json.issues.map((i) => i.key), ['kind_missing', 'kind_missing']);
  assert.equal(missing.rpc.length, 0);
  /* "true" / 1 / {} จากคำขอที่ประกอบเอง = ไม่ใช่การข้าม ⇒ ด่านเดิมทั้งชุด (ใบที่ยังไม่ตั้งยื่นไม่ได้) */
  for (const flag of ['true', 1, {}, [], 'yes']) {
    const res = await runSkip({ body: { action: 'submit', deferServiceSetup: flag, expectedUpdatedAt: CLIENT_VERSION } });
    assert.deepEqual([res.status, res.json.error, res.rpc.length], [400, 'ยื่นอนุมัติไม่ได้ — ยังขาด 2 ข้อ', 0], JSON.stringify(flag));
  }
  /* ใบสายสินค้า: ไม่โหลดบริบท ไม่มีด่าน — เดินต่อ */
  const product = await runSkip({ body: { action: 'submit' }, ctx: skipCtx({ order: SKIP_ORDER({ deal: { id: 'DL2', line: 'PRODUCT' } }) }) });
  assert.deepEqual([product.out, product.loads], ['NORMAL_SUBMIT', 0]);
});

test('0404 พฤติกรรม: ข้ามได้ → RPC ตัวห่อได้เวอร์ชันของจอ + ผู้ลงนาม · กระทู้ + audit หลังสำเร็จ · ตอบแถวใบ — ไม่เดินต่อไปการยื่นปกติ', async () => {
  const res = await runSkip({ body: skipBody() });
  assert.deepEqual(res.out, { ok: { id: 'SO1', status: 'pending_approval', serviceSetupDeferredAt: 'now' } }, 'ตอบแถวใบที่ฐานคืน (พกตราการข้าม)');
  assert.equal(res.loads, 1, 'โหลดบริบทครั้งเดียว');
  assert.equal(res.rpc.length, 1);
  assert.deepEqual(res.rpc[0], {
    orderId: 'SO1', evidenceId: 'DSE-1', expectedUpdatedAt: CLIENT_VERSION, documentFingerprint: 'fp:SO1:2',
    user: { id: 'U-AE', name: 'เอ ขายดี', role: 'ae', team: 'T1' },
  });
  assert.notEqual(res.rpc[0].expectedUpdatedAt, SKIP_ORDER().updatedAt, 'ไม่ใช่เวอร์ชันที่ server เพิ่งอ่าน');
  assert.deepEqual(res.threads, ['submit']);
  assert.equal(res.audits.length, 1);
  assert.equal(res.audits[0].summary, 'submit SO-26100005-0 for approval (ลงนามผู้จัดทำ) · ข้ามการตั้งงานบริการ 2 ข้อ');
  assert.deepEqual([res.audits[0].action, res.audits[0].entityType, res.audits[0].entityId, res.audits[0].after.serviceSetupDeferredAt], ['update', 'sales_order', 'SO1', 'now']);
  /* ใบถูกตีกลับยื่นใหม่แบบข้ามได้ · ข้อที่ตามมา (ช่วงครอบของงวด) ถูกนับรวมในสรุป */
  const rejected = await runSkip({
    body: skipBody(),
    ctx: skipCtx({ order: SKIP_ORDER({ status: 'rejected' }), lines: [SKIP_DONE(1)], allocations: [{ id: 'A1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 }], installments: SKIP_ROWS({ coversFrom: null, coversTo: null }) }),
  });
  assert.equal(rejected.rpc.length, 1);
  assert.equal(rejected.audits[0].summary, 'submit SO-26100005-0 for approval (ลงนามผู้จัดทำ) · ข้ามการตั้งงานบริการ 3 ข้อ', 'period_missing + coverage_missing สองงวด');
});

test('0404 พฤติกรรม 🔴 server ตัดสินเอง: ข้อที่ข้ามไม่ได้ / ใบเดิมของ Rev. ยังเดินรอบ / ไม่มีอะไรให้ข้าม = ไม่ยิง RPC ไม่ว่าจอจะส่งอะไรมา', async () => {
  const alloc = [{ id: 'A1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 }];
  /* จอโกหกว่าข้ามได้ — ไม่มีคีย์ไหนของคำขอถูกเชื่อ */
  const lie = { skip: { visible: true, canSkip: true }, issues: [], canSkip: true, deferredCount: 99 };

  /* ยังไม่มีงวดชำระ (ข้ามไม่ได้) + ยังไม่ใส่ช่วงบริการ (ข้ามได้) */
  const noMoney = await runSkip({ body: skipBody(lie), ctx: skipCtx({ lines: [SKIP_DONE(1)], allocations: alloc, installments: [] }) });
  assert.equal(noMoney.status, 400);
  assert.equal(noMoney.json.error, SERVICE_DEFER_TEXT.blocked(1));
  assert.deepEqual(noMoney.json.issues.map((i) => i.key), ['period_missing', 'installments_missing'], 'ส่งทุกข้อ — แผงแดงแยกเองว่าข้อไหนข้ามได้');
  assert.deepEqual([noMoney.rpc.length, noMoney.audits.length, noMoney.threads.length], [0, 0, 0]);
  /* 400 พกก้อน `skip` ของคำตอบเดียวกัน — จอวาดบรรทัดท้ายแผง/ป้าย 'ข้ามได้' จากภาพเดียวกับข้อ (ไม่ใช่ก้อนสดของหน้า) */
  assert.deepEqual([noMoney.json.skip.visible, noMoney.json.skip.canSkip, noMoney.json.skip.lead, noMoney.json.skip.blockingCount],
    [true, false, SERVICE_DEFER_TEXT.panelBlocked(1, 1), 1]);

  /* 🔴 lib-01: ทุกรายการยังไม่ตอบ 'งานบริการ?' + ยังไม่มีงวดชำระ — เดิมผ่าน (ด่านงวดทำงานเฉพาะใบที่มีแพ็คเกจ) ⇒ ตอนนี้ไม่ยิง RPC
     และ 400 พกข้อเงินที่ต้องแก้ต่อท้ายข้อของการยื่น (แผงแดงมีแถว "ยังไม่มีงวดชำระ" ให้กดไปแก้) */
  const unansweredNoMoney = await runSkip({ body: skipBody(lie), ctx: skipCtx({ installments: [] }) });
  assert.deepEqual([unansweredNoMoney.status, unansweredNoMoney.json.error, unansweredNoMoney.rpc.length], [400, SERVICE_DEFER_TEXT.blocked(1), 0]);
  assert.deepEqual(unansweredNoMoney.json.issues.map((i) => i.key), ['kind_missing', 'kind_missing', 'installments_missing']);
  assert.deepEqual(unansweredNoMoney.json.skip.extraIssues.map((i) => i.key), ['installments_missing']);
  const unansweredNoDue = await runSkip({ body: skipBody(lie), ctx: skipCtx({ installments: SKIP_ROWS({ dueDate: null }) }) });
  assert.deepEqual([unansweredNoDue.status, unansweredNoDue.rpc.length], [400, 0]);
  assert.ok(unansweredNoDue.json.issues.every((i) => ['kind_missing', 'due_missing'].includes(i.key)) && unansweredNoDue.json.issues.some((i) => i.key === 'due_missing'));
  /* การยื่นปกติของใบเดียวกันไม่เปลี่ยน: 400 เดิม ไม่มีข้อเงิน ไม่มี `skip` */
  const normalUnanswered = await runSkip({ body: { action: 'submit' }, ctx: skipCtx({ installments: [] }) });
  assert.deepEqual(normalUnanswered.json, { error: 'ยื่นอนุมัติไม่ได้ — ยังขาด 2 ข้อ', issues: normalUnanswered.json.issues });
  assert.deepEqual(normalUnanswered.json.issues.map((i) => i.key), ['kind_missing', 'kind_missing']);
  /* กำหนดชำระยังไม่ใส่ */
  const noDue = await runSkip({ body: skipBody(lie), ctx: skipCtx({ lines: [SKIP_DONE(1)], allocations: alloc, installments: SKIP_ROWS({ dueDate: null }) }) });
  assert.deepEqual([noDue.status, noDue.json.error, noDue.rpc.length], [400, SERVICE_DEFER_TEXT.blocked(2), 0]);

  /* ใบ Rev. ที่ใบเดิมยังเดินรอบบริการ (D-F18) */
  const running = await runSkip({
    body: skipBody(lie),
    ctx: skipCtx({ order: SKIP_ORDER({ revisedFromId: 'SO0' }), predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: ['S1'] } }),
  });
  assert.deepEqual([running.status, running.json.error, running.rpc.length], [400, SERVICE_DEFER_TEXT.predecessorRunning('SO-26090001-0', 1), 0]);
  assert.deepEqual(running.json.issues.map((i) => i.key), ['kind_missing', 'kind_missing']);
  /* ใบ Rev. ที่ TS ตั้งมาตรฐาน มล./เดือนบนรอบขายของใบเดิมไว้ (ตรวจทานรอบสุดท้าย — ค่ามาตรฐานถูกยกทอดเดียว) */
  const standard = await runSkip({
    body: skipBody(lie),
    ctx: skipCtx({ order: SKIP_ORDER({ revisedFromId: 'SO0' }), predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: [], standardMlTermCount: 2 } }),
  });
  assert.deepEqual([standard.status, standard.json.error, standard.rpc.length], [400, SERVICE_DEFER_TEXT.predecessorStandard('SO-26090001-0', 2), 0]);
  assert.equal(standard.json.skip.lead, SERVICE_DEFER_TEXT.panelPredecessorStandard('SO-26090001-0'));

  /* งานบริการครบแล้ว = 409 ไม่พก issues (ห้ามวาดแผงแดงเปล่า) */
  const nothing = await runSkip({ body: skipBody(lie), ctx: SKIP_COMPLETE() });
  assert.equal(nothing.status, 409);
  assert.deepEqual(nothing.json, { error: SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_nothing.message, code: 'service_setup_defer_nothing' });
  assert.equal(nothing.rpc.length, 0);

  /* ขาดแต่ข้อที่ฐานมองไม่เห็น (ช่วงครอบของงวด) — ข้ามไม่ได้ = 400 เดิมพร้อมข้อ */
  const followOnly = { ...SKIP_COMPLETE(), installments: SKIP_ROWS({ coversFrom: null, coversTo: null }) };
  const follow = await runSkip({ body: skipBody(lie), ctx: followOnly });
  assert.deepEqual([follow.status, follow.json.error, follow.rpc.length], [400, 'ยื่นอนุมัติไม่ได้ — ยังขาด 2 ข้อ', 0]);
  assert.deepEqual(follow.json.issues.map((i) => i.key), ['coverage_missing', 'coverage_missing']);
});

test('0404 พฤติกรรม: ด่านก่อนโหลดบริบท (ไม่ใช่ใบสายบริการ 409 · ไม่มี/ผิดรูปเวอร์ชัน 400) · อ่านบริบทไม่ขึ้น 500 · ผลผิดของ RPC ส่งต่อพร้อม code', async () => {
  const product = await runSkip({ body: skipBody(), ctx: skipCtx({ order: SKIP_ORDER({ deal: { id: 'DL2', line: 'PRODUCT' } }) }) });
  assert.equal(product.status, 409);
  assert.deepEqual(product.json, { error: SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_state_invalid.message, code: 'service_setup_defer_state_invalid' });
  assert.deepEqual([product.loads, product.rpc.length], [0, 0]);

  for (const expectedUpdatedAt of [undefined, null, '', '   ', 12345, 'ไม่ใช่เวลา']) {
    const res = await runSkip({ body: skipBody({ expectedUpdatedAt }) });
    assert.deepEqual([res.status, res.loads, res.rpc.length], [400, 0, 0], String(expectedUpdatedAt));
    assert.match(res.json.error, /เวอร์ชันของเอกสาร/);
  }

  const unread = await runSkip({ body: skipBody(), loadError: new Error('อ่านงวดชำระไม่สำเร็จ: connection reset') });
  assert.deepEqual([unread.status, unread.json.error, unread.rpc.length], [500, 'ตรวจงานบริการไม่สำเร็จ: อ่านงวดชำระไม่สำเร็จ: connection reset', 0]);

  /* ฐานปฏิเสธ (แท็บค้าง · รอบขายค้างของใบที่กู้คืน · ยังไม่มีลายเซ็น) — สถานะ/ข้อความ/code/extra ของตัวแปล · ไม่มีกระทู้ ไม่มี audit */
  for (const error of [
    { status: 409, message: SERVICE_SETUP_SQL_MESSAGES.workflow_stale.message, code: 'workflow_stale', extra: {} },
    { status: 409, message: SERVICE_SETUP_SQL_MESSAGES.service_setup_defer_terms_exist.message, code: 'service_setup_defer_terms_exist', extra: {} },
    { status: 409, message: 'กรุณาเพิ่มลายเซ็นอิเล็กทรอนิกส์ในบัญชีของฉันก่อนยื่นอนุมัติ', code: 'signature_required', extra: { accountUrl: '/account' } },
    { status: 500, message: 'บันทึกหลักฐานลายเซ็นไม่สำเร็จ', code: 'signature_evidence_failed' },
  ]) {
    const res = await runSkip({ body: skipBody(), rpcResult: { error } });
    assert.equal(res.status, error.status, error.code);
    assert.deepEqual(res.json, { error: error.message, code: error.code, ...(error.extra || {}) });
    assert.deepEqual([res.rpc.length, res.threads.length, res.audits.length], [1, 0, 0], 'ของที่ไม่ได้เขียนต้องไม่มีประวัติ');
  }
});

/* ด่านงานบริการของการอนุมัติ — ก้อนซอร์สจริงของ route (จาก `let setupCtx = null;` ถึงก่อนยิง RPC อนุมัติ) รันด้วยตัวตัดสินจริง
   ตกทะลุ = "ผ่านด่าน เดินต่อไป RPC อนุมัติ" ⇒ คืน 'APPROVE_RPC' */
function approveGateBranch() {
  const raw = readFileSync(join(SRC, SO_ROUTE), 'utf8');
  const approveAt = raw.indexOf("  if (action === 'approve') {");
  const from = raw.indexOf('    let setupCtx = null;\n    if (serviceSetupRequired(before)) {', approveAt);
  const to = raw.indexOf('    let result;\n    try {\n      result = await approveSalesOrderWithSignatureEvidence(supabase, {', from);
  assert.ok(approveAt > 0 && from > approveAt && to > from, 'หาก้อนด่านงานบริการของการอนุมัติใน route ไม่เจอ');
  return new AsyncFunction('before', 'supabase', 'serviceSetupRequired', 'loadServiceSetupContext', 'serviceSetupIssues', 'serviceSetupApprovalGate', 'fail',
    `${raw.slice(from, to)}\n    return 'APPROVE_RPC';`);
}
async function runApproveGate(ctx) {
  const before = { ...ctx.order, lines: ctx.lines };
  const out = await approveGateBranch()(before, { fake: 'supabase' }, serviceSetupRequired, async () => ctx, serviceSetupIssues, serviceSetupApprovalGate,
    (message, status = 500) => Response.json({ error: message }, { status }));
  const isResponse = out instanceof Response;
  return { out, status: isResponse ? out.status : null, json: isResponse ? await out.json() : null };
}
const SKIPPED = { serviceSetupDeferredAt: '2026-10-02T02:30:00+00:00', serviceSetupDeferredById: 'U-AE', serviceSetupDeferredByName: 'เอ ขายดี' };
const pendingCtx = (ctx, flag) => ({ ...ctx, order: { ...ctx.order, status: 'pending_approval', ...(flag ? SKIPPED : {}) } });

test('0404 พฤติกรรม 🔴 ด่านอนุมัติ: ไม่มีตรา = ทุกข้อหยุด (เหมือนเดิม) · ยังข้ามอยู่ = ผ่านไป RPC (ฐานอนุมัติโดยไม่เปิดรอบขาย) · ข้อที่ข้ามไม่ได้ยังหยุด', async () => {
  const alloc = [{ id: 'A1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 }];
  const refused = (res, n) => assert.deepEqual([res.status, res.json.error], [409, `อนุมัติไม่ได้ — งานบริการยังขาด ${n} ข้อ · ตีกลับให้ฝ่ายขายแก้`]);

  /* ครบ — ผ่าน ทั้งมีและไม่มีตรา (มีตรา: ฐานเปิดรอบขายตามปกติ ตราไม่มีผล) */
  assert.equal((await runApproveGate(pendingCtx(SKIP_COMPLETE(), false))).out, 'APPROVE_RPC');
  assert.equal((await runApproveGate(pendingCtx(SKIP_COMPLETE(), true))).out, 'APPROVE_RPC');

  /* ยังไม่ตั้ง + ไม่มีตรา (ใบที่ยื่นค้างก่อน deploy · ของเปลี่ยนหลังยื่น) — ปฏิเสธเหมือนเดิมพร้อมทุกข้อ */
  const plain = await runApproveGate(pendingCtx(skipCtx(), false));
  refused(plain, 2);
  assert.deepEqual(plain.json.issues.map((i) => i.key), ['kind_missing', 'kind_missing']);

  /* ยังไม่ตั้ง + ผู้ยื่นเลือกข้าม — ผ่านด่าน (ข้อของการตั้งและข้อที่ตามมาถูกเลื่อน) */
  assert.equal((await runApproveGate(pendingCtx(skipCtx(), true))).out, 'APPROVE_RPC');
  const withCoverage = skipCtx({ lines: [SKIP_DONE(1)], allocations: alloc, installments: SKIP_ROWS({ coversFrom: null, coversTo: null }) });
  assert.deepEqual(serviceSetupIssues(withCoverage).map((i) => i.key), ['period_missing', 'coverage_missing', 'coverage_missing']);
  assert.equal((await runApproveGate(pendingCtx(withCoverage, true))).out, 'APPROVE_RPC');
  refused(await runApproveGate(pendingCtx(withCoverage, false)), 3);

  /* ข้ามอยู่ แต่มีข้อที่ข้ามไม่ได้ (งวดถูกลบระหว่างรออนุมัติ) — ปฏิเสธ พร้อมเฉพาะข้อที่หยุดการอนุมัติ */
  const noMoney = await runApproveGate(pendingCtx(skipCtx({ lines: [SKIP_DONE(1)], allocations: alloc, installments: [] }), true));
  refused(noMoney, 1);
  assert.deepEqual(noMoney.json.issues.map((i) => i.key), ['installments_missing']);

  /* มีตรา แต่ไม่เหลือข้อของการตั้ง (ฐานจะเปิดรอบขาย) — ข้อที่ตามมากลับมาหยุดการอนุมัติ (ด่านเต็มชุดของวันนี้) */
  const stuck = await runApproveGate(pendingCtx({ ...SKIP_COMPLETE(), installments: SKIP_ROWS({ coversFrom: null, coversTo: null }) }, true));
  refused(stuck, 2);
  assert.deepEqual(stuck.json.issues.map((i) => i.key), ['coverage_missing', 'coverage_missing']);

  /* มีตรา + ยังไม่ตั้ง แต่ใบเดิมของ Rev. มีรอบเดินอยู่ (D-F18 — ฐานจะถอยการอนุมัติ) — ปฏิเสธพร้อมทุกข้อ */
  const running = await runApproveGate(pendingCtx(skipCtx({
    order: SKIP_ORDER({ revisedFromId: 'SO0' }), predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: ['S1'] },
  }), true));
  refused(running, 2);
  /* มีตรา + ยังไม่ตั้ง แต่รอบขายของใบเดิมมีมาตรฐาน มล./เดือนที่ TS ตั้งไว้ (ฐานไม่เข้า D1 — ถอยการอนุมัติ) — ปฏิเสธพร้อมทุกข้อ */
  const standard = await runApproveGate(pendingCtx(skipCtx({
    order: SKIP_ORDER({ revisedFromId: 'SO0' }), predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: [], standardMlTermCount: 1 },
  }), true));
  refused(standard, 2);
  /* 🔴 lib-01: ข้ามอยู่ · ทุกรายการยังไม่ตอบ · งวดถูกลบ/กำหนดชำระถูกล้างระหว่างรออนุมัติ — ข้อเงินหยุดการอนุมัติ (ด่านเดียวกับตอนยื่นแบบข้าม) */
  const unansweredNoMoney = await runApproveGate(pendingCtx(skipCtx({ installments: [] }), true));
  refused(unansweredNoMoney, 1);
  assert.deepEqual(unansweredNoMoney.json.issues.map((i) => i.key), ['installments_missing']);

  /* ใบสายสินค้า — ไม่มีด่านนี้ (ไม่โหลดบริบท) */
  const product = pendingCtx(skipCtx({ order: SKIP_ORDER({ deal: { id: 'DL2', line: 'PRODUCT' } }) }), false);
  assert.equal((await runApproveGate(product)).out, 'APPROVE_RPC');
});

/* ไฟล์ซอร์สที่ไม่ใช่เทสต์ใต้ src/app/api และ src/lib — ตราการข้ามต้องไม่ถูกเขียนจาก JS ที่ไหนเลย */
function sourceFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFilesUnder(full));
    else if (/\.(m?js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

test('0404 🔴 สามช่องของตราการข้ามเขียนได้ทางเดียว = RPC ตัวห่อของฐาน — ไม่มี JS ฝั่ง server ที่ใส่ช่องพวกนี้ใน payload', () => {
  const files = [...sourceFilesUnder(join(SRC, 'app/api')), ...sourceFilesUnder(join(SRC, 'lib'))];
  assert.ok(files.length > 300, `เจอแค่ ${files.length} ไฟล์ — ตัวไล่น่าจะพัง`);
  const offenders = [];
  for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'));
    /* คีย์ของออบเจกต์ (`serviceSetupDeferredAt:` / `"serviceSetupDeferredAt":`) = กำลังประกอบ payload เขียน · การอ่าน (`order.serviceSetupDeferredAt`) ไม่นับ */
    if (/(^|[^.\w])["']?serviceSetupDeferred(At|ById|ByName)["']?\s*:/m.test(text)) offenders.push(relative(SRC, file).split(sep).join('/'));
  }
  assert.deepEqual(offenders, [], 'ตราการข้ามต้องมาจาก submit_sales_order_deferring_service_setup เท่านั้น (ล้างด้วย trigger ของ 0404)');
  /* ตัวตรวจต้องจับของจริงได้ */
  assert.ok(/(^|[^.\w])["']?serviceSetupDeferred(At|ById|ByName)["']?\s*:/m.test('  .update({ serviceSetupDeferredAt: now })'));
  assert.ok(!/(^|[^.\w])["']?serviceSetupDeferred(At|ById|ByName)["']?\s*:/m.test('at: order.serviceSetupDeferredAt,'));
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
  /* มติเจ้าของ 08/10 (หน่วยของจำนวนรอบบริการบนผิวฝ่ายขาย = "เดือน"): สรุป audit ของใบ pipeline พูดหน่วยเดียวกับตารางงานบริการ
     (`roundsCount` ของแคตตาล็อก) · ใบย้อนหลังยังพูด "รอบ" — ก้อน before/after ยังเป็นตัวเลข `serviceRounds` */
  assert.match(rounds, /const roundsWords = \(rounds\) => \(isHistoricalOrder\(before\) \? `\$\{rounds\} รอบ` : SERVICE_SETUP_LINE_TEXT\.roundsCount\(rounds\)\);/);
  assert.match(rounds, /rounds === null \? 'ยังไม่ระบุ' : roundsWords\(rounds\)/);
  assert.match(rounds, /serviceRounds: rounds \}\)\)/, 'after ของ audit ยังเก็บตัวเลข');
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

// ── writeCoverageFill: พฤติกรรมด้วยฐานปลอม (ท่าเดียวกับ writeBillingFill เดิม — ถอดแล้วในรุ่นสี่) ─────────────────
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
