// ── ยามต้นทาง PR2 · ปรับแผนงวดหลังอนุมัติ (mig 0377 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D1/D5) ────────
// ⭐ ตรรกะจริงมีเทสต์เรียกตรงแล้ว (installmentReplan.test · approvalPrompt.test · salesOrderInstallmentsStore.test ·
//    installmentReplanMigration.test + PGlite ใน scratch) — ไฟล์นี้ตรึงว่า **ผู้เรียกทุกทางต่อสายครบ** ซึ่งพังเงียบได้:
//    · route: คำสั่งของทั้งใบต้องมาก่อนด่าน installmentId (ไม่งั้นได้ "ไม่ได้ระบุงวด") · สิทธิ์ก่อนโหลด · อ่านงวดสดแบบโยน error
//    · แผง: ปุ่ม/โมดัลถามด่านตัวเดียวกับ route · โมดัลยืนยันบอกผลผ่าน approvalPrompt · ส่ง expected ของแถวที่ตาเห็น
//    · หน้า: 409 = ดึงใบสด · toast บอกว่า Actual ไม่เปลี่ยน · ทะเบียนบัญชีขึ้นป้าย "ปรับแผนหลังอนุมัติ" (D5)
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (rel) => read(rel)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
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
const EDITOR = 'components/salesPlanning/QuotationInstallments.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const LEDGER_ROUTE = 'app/api/finance/payments/route.js';
const LEDGER_PAGE = 'app/finance/payments/page.js';

// ── 1. route ────────────────────────────────────────────────────────────────────────────────
test('route PATCH: action replan มาก่อนด่าน installmentId และส่งต่อให้ตัวจัดการของทั้งใบ', () => {
  const patch = slice(code(ROUTE), 'export const PATCH = withUser(', '\n});');
  const replan = patch.indexOf("if (action === 'replan') return replanOrderInstallments({ user, supabase, req, id, body });");
  const gate = patch.indexOf("if (!installmentId) return badRequest(");
  assert.ok(replan > 0 && gate > replan, 'replan ต้องมาก่อนด่าน "ไม่ได้ระบุงวด"');
});

test('route replan: สิทธิ์ AE Sup/admin ก่อนโหลด · งวดสดโยน error · ด่านเดียวกับปุ่ม · ชุดสุดท้ายจาก lib · RPC · audit', () => {
  const fn = slice(code(ROUTE), 'async function replanOrderInstallments(', '\nexport const PATCH');
  const role = fn.indexOf('if (!isSalesOrderReviewer(user?.role)) return forbidden();');
  const load = fn.indexOf('await loadOrderForUser(supabase, user, id);');
  assert.ok(role > 0 && load > role, 'D1: ตัดสิทธิ์ก่อนแตะข้อมูล');
  const live = fn.indexOf('const live = await loadInstallments(supabase, order.id);');
  assert.ok(live > load, 'อ่านงวดสดแบบโยน error');
  assert.doesNotMatch(fn, /loadInstallments\([^)]*\)\s*\.catch/, 'แผนว่างเพราะอ่านพัง = "ลบทุกงวดเปิด"');
  const gate = fn.indexOf('const gate = installmentReplanBlocker(order, live, user);');
  assert.ok(gate > live);
  assert.match(fn, /if \(gate\.blocker\) return fail\(gate\.blocker, 409\);/);
  assert.match(fn, /const reasonError = replanReasonError\(body\.reason\);\s*if \(reasonError\) return badRequest\(reasonError\);/);
  assert.match(fn, /if \(!Array\.isArray\(body\.rows\)\) return badRequest\(/, 'ไม่ส่งแผน ≠ ลบทุกงวดเปิด');
  assert.match(fn, /if \(replanStale\(live, body\.expected\)\) return fail\(REPLAN_STALE_MESSAGE, 409\);/);
  assert.match(fn, /const built = buildReplanRows\(order, live, body\.rows, \{\s*unit: 'amount', serviceRounds: orderHasServiceRounds\(order, order\.lines\),\s*\}\);/);
  assert.match(fn, /if \(built\.error\) return badRequest\(built\.error\);/);
  const rpc = fn.indexOf('await replanInstallments(supabase, {');
  assert.ok(rpc > fn.indexOf('buildReplanRows('), 'ส่งชุดที่ lib คำนวณ ไม่ใช่ของที่จอส่งมาดิบ ๆ');
  assert.match(fn, /orderId: order\.id, rows: built\.rows, expected: body\.expected, reason, user,/);
  assert.match(fn, /if \(result\.error\) return fail\(result\.error, result\.status\);/);
  const audit = slice(fn, 'await recordAudit({', '});');
  assert.match(audit, /entityType: 'sales_order_installments'/);
  assert.match(audit, /before: \{ installments: result\.before \}/);
  assert.match(audit, /after: \{ installments: result\.after, reason \}/);
  assert.match(audit, /summary: replanAuditSummary\(\{/);
  assert.ok(fn.indexOf('await recordAudit({') > rpc, 'audit หลังเขียนสำเร็จ');
  assert.doesNotMatch(fn, /updateInstallment\(|\.from\('sales_order_installments'\)|\.from\('sales_orders'\)\s*\.update/,
    'ห้ามเขียนงวด/ใบเองทีละแถว — ทางเดียวคือ RPC 0377');
  assert.match(fn, /return ok\(\{ installments: installmentsForScreen\(order, await loadInstallments\(supabase, order\.id\)\) \}\);/);
});

// ── 2. แผงงวดบนใบ ────────────────────────────────────────────────────────────────────────────
test('แผง: ปุ่ม "ปรับแผนงวด" = GatedAction ในช่อง actions ของการ์ด · ถามด่านตัวเดียวกับ route', () => {
  const panel = code(PANEL);
  assert.match(panel, /const replanGate = installmentReplanBlocker\(order, saved, user\);/);
  assert.match(panel, /<DetailCard id="payment" icon=\{Wallet\} eyebrow="PAYMENT" title="การชำระ" meta=\{headline\}\s+actions=\{cardActions\}>/);
  const actions = slice(panel, 'const cardActions =', ';\n');
  assert.match(actions, /replanGate\.visible \? \(\s*<GatedAction/);
  assert.match(actions, /blocker=\{replanGate\.blocker\}/);
  assert.match(actions, /onClick=\{openReplan\}/);
  assert.match(actions, /ปรับแผนงวด/);
  assert.match(actions, /label=\{REPLANNED_BADGE\}/, 'ป้าย D5 อยู่หัวการ์ด — คนที่ไม่มีปุ่มก็เห็น');
  assert.match(panel, /const replanned = !historical && saved\.length > 0 && saved\.every\(\(r\) => r\.frozenAt\)\s+&& installmentsReplanned\(saved, order\?\.quotation\?\.paymentPlan, order\?\.totalAmount\);/);
});

test('แผง: โมดัลปรับแผนอยู่ในแผง · ตัวแก้คือ QuotationInstallments โหมด replan · ยืนยันผ่าน paymentPlanEditPrompt · ส่ง expected ของแถวที่ตาเห็น', () => {
  const panel = code(PANEL);
  const modal = slice(panel, '{replan ? (', '\n      ) : null}');
  assert.match(modal, /<QuotationInstallments\s+mode="replan"/);
  assert.match(modal, /view=\{replanBuild\.view\}/);
  assert.match(modal, /error \? <StatusNotice tone="error" role="alert">\{error\}<\/StatusNotice> : null/, 'error ของ API ขึ้นในโมดัล');
  assert.match(modal, /<Textarea/);
  assert.match(modal, /ตรวจผลก่อนบันทึก/);
  const build = slice(panel, 'const replanBuild =', ';\n');
  assert.match(build, /buildReplanRows\(order, replan\.base, replan\.draft, \{\s*unit: replan\.unit, serviceRounds: hasServiceRounds, requestById,\s*\}\)/);
  const submit = slice(panel, 'const submitReplan = async () => {', '\n  };');
  const prompt = submit.indexOf('await confirmAction(paymentPlanEditPrompt(replanPromptFacts(order, replan.base, replanBuild.rows, {');
  const send = submit.indexOf('await onReplan({');
  assert.ok(prompt > 0 && send > prompt, 'โมดัลยืนยันบอกผลก่อนยิง');
  assert.match(submit, /rows: replanRequestRows\(replanBuild\), expected: replanExpected\(replan\.base\), reason: replan\.reason\.trim\(\),/);
  assert.match(panel, /const replanBaseStale = replan \? replanStale\(saved, replanExpected\(replan\.base\)\) : false;/,
    'หลัง 409 หน้าโหลดงวดใหม่ — แผนที่แก้ค้างต้องบอกว่าอิงข้อมูลเก่า');
});

test('ตัวแก้: QuotationInstallments มีโหมด replan ในไฟล์เดียวกับโหมดใบเสนอราคา (ฟอร์มเดียวสองทางเรียก)', () => {
  const editor = code(EDITOR);
  assert.match(editor, /if \(mode === "replan"\) return <ReplanInstallments/);
  const replan = slice(editor, 'function ReplanInstallments(', '\nexport default function');
  assert.match(replan, /<ChoiceChips/);
  assert.match(replan, /options=\{REPLAN_UNITS\}/);
  assert.match(editor, /const REPLAN_UNITS = \[\s*\{ value: "amount", label: "ใส่เป็นบาท" \},\s*\{ value: "percent", label: "ใส่เป็น %" \},\s*\];/);
  assert.match(replan, /<MoneyInput/);
  assert.match(replan, /<DateInput/);
  assert.match(replan, /if \(row\.lock \|\| !entry\) \{[\s\S]*?label=\{row\.lock \|\| "ล็อก"\}/, 'แถวล็อกอ่านอย่างเดียวพร้อมเหตุ');
  assert.doesNotMatch(replan, /premium-glass-table/, 'ตารางใหม่ไม่เพิ่มคลาสการ์ดเก่า (ratchet legacyTable)');
  assert.match(replan, /REPLAN_VAT_NOTE/);
  assert.match(replan, /คงเหลือให้แบ่ง/);
  assert.match(replan, /monthlyDueDates\(/);
  assert.match(replan, /replanSwitchUnit\(/);
});

// ── 3. หน้าใบสั่งขาย ─────────────────────────────────────────────────────────────────────────
test('หน้าใบ: onReplan ยิง PATCH action replan ผ่าน apiFetch · 409 = ดึงใบสด · toast บอกว่า Actual ไม่เปลี่ยน', () => {
  const page = code(SO_PAGE);
  const fn = slice(page, 'async function runInstallmentReplan(', '\n  }\n');
  assert.match(fn, /apiFetch\(`\/api\/sales-planning\/sales-orders\/\$\{id\}\/installments`, \{\s*method: "PATCH",\s*json: \{ action: "replan", rows, expected, reason \},/);
  assert.match(fn, /if \(res\.status === 409\) refreshOrder\(\);/);
  assert.match(fn, /setToast\(\{ kind: "success", msg: REPLAN_DONE_MESSAGE \}\);/);
  assert.match(page, /onReplan=\{runInstallmentReplan\}/);
});

// ── 4. ทะเบียนบัญชี (D5) ─────────────────────────────────────────────────────────────────────
test('ทะเบียนบัญชี: อ่านแผนของ QT มาด้วย · ประทับป้ายก่อนกรอง · หน้าขึ้นป้าย "ปรับแผนหลังอนุมัติ"', () => {
  const route = code(LEDGER_ROUTE);
  assert.match(route, /\.from\('quotations'\)\.select\('id, "quoteNumber", "paymentPlan"'\)/);
  const load = slice(route, 'async function loadLedger(', '\nconst listParam');
  assert.match(load, /stampOrderReplanned\(ledger, planByQuotation\);\s*return ledger;/,
    'ค่าระดับใบต้องประทับจากชุดก่อนกรอง (ใน loadLedger — ตัวกรองของ GET ทำงานทีหลัง)');
  const page = code(LEDGER_PAGE);
  assert.match(page, /group\.replanned \? <StatusBadge size="sm" tone="info" label=\{REPLANNED_BADGE\}/);
});
