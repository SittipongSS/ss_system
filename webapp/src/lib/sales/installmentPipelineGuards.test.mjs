// ── ยามต้นทาง PR0 ของงวดชำระใบ pipeline (แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ───────────────
// ⭐ ตรรกะจริงมีเทสต์เรียกฟังก์ชันตรง ๆ แล้ว (salesOrderPayments.test · salesOrderInstallmentsStore.test ·
//    paymentLedger.test · privateEvidenceGate.test) — ไฟล์นี้ตรึงว่า **ผู้เรียกทุกทางต่อสายครบ**
//    ซึ่งพังเงียบได้ทั้งหมด: route ลืมส่งล็อก = ปุ่มหายแต่ API ยังรับ · จอลืมส่ง updatedAt = ไม่มีตัวล็อก ·
//    ทะเบียนลืมตัดงวดโมฆะ = ยอดค้างรับเทียมกลับมา
// ⚠️ ยามอ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (rel) => read(rel)
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
const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const FN_PAGE = 'app/finance/payments/page.js';
const LEDGER_ROUTE = 'app/api/finance/payments/route.js';

// ── 1. PATCH งวด: ล็อกทั้งใบของใบ pipeline ถึงด่านเดียวกับปุ่ม ───────────────────────────────
test('PATCH งวด: orderLock = ล็อกใบย้อนหลัง || ล็อกใบ pipeline ของคำสั่งนั้น · ใบ revised รู้เลข Rev.', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const gate = slice(patch, 'installmentActionError(row, action, user, {', '});');
  assert.ok(gate.includes('orderLock: historicalInstallmentLock(order) || pipelineInstallmentLock(order, action),'),
    'SO-26080039-0: PATCH งวดของใบ pipeline เคยไม่ดูสถานะใบเลย ⇒ เงินก้อนเดียวถูกรับรองสองใบ');
  // ข้อความของใบ revised ต้องบอกเลขใบ Rev. เหมือนที่แผงบนจอบอก — revisionHistory รูปเดียวกับ route ของหน้าใบ
  const load = slice(route, 'async function loadOrderForUser', 'export const GET');
  assert.match(load, /if \(order\.status === 'revised' && order\.supersededById\)/);
  assert.match(load, /fetchAllResult\(\(\) => supabase\s*\.from\('sales_orders'\)\.select\('id, "orderNumber"'\)\s*\.eq\('baseNumber', order\.baseNumber \|\| order\.orderNumber\)\s*\.order\('id', \{ ascending: true \}\)\)/,
    'อ่านไร้ขอบเขตไม่ได้ (check:rowcap) — ห่อ fetchAllResult + ลำดับที่นิ่ง');
  assert.match(load, /if \(historyError\) throw historyError;/, 'อ่านพลาดต้องดัง (supabase ไม่ throw เอง)');
  assert.match(load, /serviceContract, revisionHistory,/);
  const page = code('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(page, /\.eq\('baseNumber', order\.baseNumber \|\| order\.orderNumber\)/, 'หน้าใบโหลดสายโซ่จากเลขฐานเดียวกัน');
});

// ── 2. PATCH งวด: optimistic lock สองชั้น ─────────────────────────────────────────────────
test('PATCH งวด: updatedAt ที่จอส่งมาไม่ตรงแถวสด = 409 ก่อนด่าน · เขียนแบบมีเงื่อนไข · เขียนไม่โดน = 409', () => {
  const patch = slice(code(ROUTE), 'export const PATCH');
  const stale = patch.indexOf('if (installmentStale(row, body.expectedUpdatedAt)) return fail(INSTALLMENT_STALE_MESSAGE, 409);');
  assert.ok(stale > 0, 'ชั้นแรก: แถวที่ตาเห็นเก่ากว่าแถวสด');
  assert.ok(stale < patch.indexOf('installmentActionError(row, action, user, {'), 'ต้องบอก "ข้อมูลเก่า" ก่อนด่านที่ตัดสินจากแถวสด');
  assert.match(patch, /updated = await updateInstallment\(supabase, installmentId, patch, \{ expectedUpdatedAt: row\.updatedAt \}\);/,
    'ชั้นสอง: เขียนเฉพาะเมื่อแถวยังเป็นรุ่นที่ด่านเพิ่งตัดสิน');
  const miss = patch.indexOf('if (!updated) return fail(INSTALLMENT_STALE_MESSAGE, 409);');
  assert.ok(miss > 0 && miss < patch.indexOf('await recordAudit('), 'เขียนไม่โดนต้องไม่ลง audit/กระดิ่ง');
});

// ── 3. POST เริ่มติดตาม: ด่านเดียวกับปุ่มบนแผง ─────────────────────────────────────────────
test('POST งวด: ปฏิเสธใบ revised/ยกเลิก/ตีกลับด้วย installmentStartBlock ก่อนสร้างงวด · แผงใช้ตัวเดียวกัน', () => {
  const post = slice(code(ROUTE), 'export const POST', 'export const PATCH');
  const block = post.indexOf('const startBlock = installmentStartBlock(order);');
  assert.ok(block > post.indexOf('if (isHistoricalOrder(order))'), 'ใบย้อนหลังยังตีกลับก่อน (คำของมันเอง)');
  assert.ok(block > 0 && block < post.indexOf('ensureInstallments('));
  assert.match(post, /if \(startBlock\) return badRequest\(startBlock\);/);
  assert.doesNotMatch(post, /\['cancelled', 'rejected'\]\.includes\(order\.status\)/, 'รายชื่อสถานะมีบ้านเดียว (lib)');
  assert.match(code(PANEL), /const canTrackPayments = !installmentStartBlock\(order\);/);
});

// ── 4. แผงงวด: gate ส่งล็อกใบ pipeline รายคำสั่ง + บอกเหตุที่ปุ่มหาย ───────────────────────────────
test('แผงงวด: gate ส่งล็อกใบ pipeline รายคำสั่ง · ข้อความล็อกระดับใบขึ้นเป็น StatusNotice · งวดร่างไม่ชวนบันทึกเงินบนใบที่ล็อก', () => {
  const panel = code(PANEL);
  const gate = slice(panel, 'const gate = (row, action, options) => installmentActionError(', '});');
  assert.match(gate, /orderLock: orderLock \|\| pipelineInstallmentLock\(order, action\), historical, contractEnd,/);
  assert.match(panel, /const pipelineLock = pipelineInstallmentLock\(order\);/);
  /* ⚠️ แก้ยามโดยตั้งใจใน PR1 (mig 0376): ใบ revised ที่งวดย้ายไปแล้วขึ้น "งวดชำระทั้งหมดย้ายไป …" แทนข้อความล็อก
     (ข้อความเดียว ไม่ซ้อนสองข้อความเรื่องเดียวกัน) — ข้อความล็อกของ PR0 ยังขึ้นกับใบยกเลิก/ใบ revised ที่ยังถือแถว */
  assert.match(panel, /: pipelineLock \? <StatusNotice tone="info">\{pipelineLock\}<\/StatusNotice> : null\}/);
  assert.match(panel, /\{isDraftPlan && !historical && !pipelineLock \? \(/);
});

// ── 5. จอทั้งสองทางส่ง updatedAt ของแถวที่ตาเห็น · 409 แล้วดึงข้อมูลสด ───────────────────────────
test('ผู้เรียก PATCH งวดทั้งสองจอส่ง expectedUpdatedAt ของแถวที่ตาเห็น และดึงข้อมูลสดเมื่อได้ 409', () => {
  const page = code(SO_PAGE);
  const run = slice(page, 'async function runInstallmentAction(', 'function leaveEditMode');
  assert.match(run, /expectedUpdatedAt: row\.updatedAt \|\| undefined,/);
  assert.match(run, /if \(res\.status === 409\) refreshOrder\(\);/);
  assert.match(run, /report: installmentReportDoneMessage\(data\.installment\?\.status\),/,
    'toast ต้องพูดตามปลายทางจริง — บัญชีบันทึกเองจบที่ "ชำระแล้ว" ไม่ใช่ "ส่งให้บัญชีตรวจ"');

  const fn = code(FN_PAGE);
  const action = slice(fn, 'const runAction = useCallback(', '}, [load]);');
  assert.match(action, /expectedUpdatedAt: row\.updatedAt \|\| undefined,/);
  assert.match(action, /if \(res\.status === 409\) load\(\{ background: true \}\);/);
});

/* ── 5ก. โมดัลต้องวาด/ส่ง "แถวล่าสุดของตาราง" ไม่ใช่สำเนาที่จำไว้ตอนเปิด ───────────────────────────
   ⭐ ตัวล็อกคือ updatedAt ของแถวที่ **ตาเห็น** ⇒ โมดัลต้องวาดจากแถวล่าสุดเสมอ (ข้อมูลสดมาถึง = โมดัลวาดใหม่)
     ไม่งั้น 409 แล้วกดใหม่ในโมดัลเดิม = 409 ซ้ำไม่รู้จบ (ส่ง updatedAt เก่าของสำเนาเดิมทุกรอบ) */
test('โมดัลของแผงงวดและคิวบัญชีวาดจากแถวล่าสุดของตาราง (live) — กดใหม่หลัง 409 ต้องผ่านได้', () => {
  const panel = code(PANEL);
  assert.match(panel, /const live = \(row\) => \(row \? saved\.find\(\(r\) => r\.id === row\.id\) \|\| row : row\);/);
  for (const pattern of [
    /onAction\(live\(reportFor\.row\), "report"/,
    /onAction\(live\(scheduleFor\.row\), "schedule"/,
    /onAction\(live\(linkFor\.row\), "link"/,
    /row=\{live\(confirmFor\?\.row\)\}/,
    /row=\{live\(invoiceFor\)\}/,
    /onAction\(live\(invoiceFor\), "tax-invoice", values\)/,
    /onAction\(live\(invoiceFor\), "tax-invoice-clear"\)/,
    /onAction\(live\(unconfirmFor\.row\), "unconfirm"/,
    /onAction\(live\(rejectFor\.row\), "reject"/,
  ]) {
    assert.match(panel, pattern);
  }
  const fn = code(FN_PAGE);
  assert.match(fn, /const liveRow = \(row\) => \(row \? rows\.find\(\(r\) => r\.id === row\.id\) \|\| row : null\);/);
  assert.match(fn, /const confirmRow = liveRow\(confirmFor\);/);
  assert.match(fn, /const invoiceRow = liveRow\(invoiceFor\);/);
  assert.match(fn, /runAction\(liveRow\(rejectFor\.row\), "reject"/);
});

// ── 6. ทะเบียนบัญชี: งวดโมฆะของใบที่ตายแล้วไม่เข้าทะเบียน ─────────────────────────────────────
test('ทะเบียนการชำระตัดงวดโมฆะ (ledgerVoidInstallment) ก่อนจัดรูปแถว', () => {
  const route = code(LEDGER_ROUTE);
  const cut = route.indexOf('if (ledgerVoidInstallment(installment, order)) return null;');
  assert.ok(cut > 0, 'ยอดค้างรับเทียม ฿577,667.32 บนใบที่ยกเลิก (23/09)');
  assert.ok(cut < route.indexOf('return ledgerRow({'));
  // select ของใบต้องมี status (ตัวตัดสินอ่านจากตรงนั้น) — ลืม = ไม่มีใบไหนตายเลยเงียบ ๆ
  assert.match(route, /\.select\('id, "orderNumber", "quotationId", "referenceDoc", "dealId", "projectId", "customerId", "customerName", status,/);
});

// ── UAT 23/09: ใบที่ตายแล้วไม่โชว์แถบ "เก็บแล้ว/ทั้งใบ" และประกาศ "จ่ายถึง" ──────────────────────────
test('แผงงวด: ใบยกเลิก/ถูกออก Rev. ทับ ไม่วาดแถบสัดส่วนเงินและประกาศ “จ่ายถึง” ของนัดบริการ', () => {
  const panel = code(PANEL);
  assert.match(panel, /const deadPipeline = cancelledPipeline \|\| \(!historical && order\?\.status === "revised"\);/);
  assert.ok(panel.includes('{!isPreview && !single && !deadPipeline ? (\n        <div className={styles.progress}>'),
    'SO-26090204-0 (ยกเลิก): แถบขึ้น "ทั้งใบ ฿0.00" ข้างยอดใบ ฿250,380');
  assert.ok(panel.includes('{showCoverage && !isPreview && !deadPipeline ? ('),
    'SO-26090204-0 (ยกเลิก): เตือนว่านัดบริการลงคิวไม่ได้ทั้งที่ใบยกเลิกแล้ว');
});

// ── ร่างที่ QT ถูกถอด Won + ด่านกู้คืน (SO-26080039-0) ───────────────────────────────────────────
test('route งวด: โหลดสถานะ QT มาให้ล็อกของร่างที่ QT ไม่ใช่ Won ตัดสินได้ (ไม่มีค่า = ไม่ตัดสิน)', () => {
  const load = slice(code(ROUTE), 'async function loadOrderForUser', 'export const GET');
  const select = slice(load, ".from('quotations')", '.maybeSingle()');
  assert.match(select, /\.select\('[^']*\bstatus\b[^']*'\)/, 'route งวดไม่โหลด quotations.status ⇒ ร่างที่กู้คืนรับรองเงินได้ต่อ');
});

test('กู้คืนใบที่ยกเลิก: route ตรวจ QT ยัง Won + ใบพี่น้องที่ยังใช้งาน (อ่านสดแบบเช็ก error) · ปุ่มใช้ตัวเดียวกันเป็นคำใบ้', () => {
  const route = code(SO_ROUTE);
  const restore = slice(route, "if (action === 'restore') {", "return badRequest('คำสั่งไม่ถูกต้อง');");
  assert.match(restore, /\.from\('sales_orders'\)[\s\S]*?\.eq\('quotationId', before\.quotationId\)/,
    'ต้องอ่านใบอื่นของ QT เดียวกันสด ๆ');
  assert.match(restore, /if \(siblingError\) return fail\(/, 'อ่านไม่ขึ้น ≠ ไม่มีใบพี่น้อง');
  assert.match(restore, /const restoreBlock = salesOrderRestoreBlock\(before, siblings\);/);
  assert.match(restore, /if \(restoreBlock\) return fail\(restoreBlock, 409\);/);
  assert.ok(restore.indexOf('salesOrderRestoreBlock(') < restore.indexOf(".update(patch)"), 'ด่านต้องมาก่อนเขียน');
  const page = code(SO_PAGE);
  assert.match(page, /const restoreBlock = restoreMoneyBlock \|\| salesOrderRestoreBlock\(order\);/);
  assert.match(slice(page, 'id: "restore"', 'onClick'), /disabled: !!restoreBlock,[\s\S]*disabledReason: restoreBlock \|\| undefined,/);
});

test('ทะเบียนบัญชี: route โหลดสถานะ QT · ปุ่มรับรอง/บันทึกใบกำกับถาม ledgerRowLock แล้วปิดพร้อมเหตุ (review G1)', () => {
  const ledger = code(LEDGER_ROUTE);
  assert.match(slice(ledger, ".from('quotations')", '.in('), /\.select\('[^']*\bstatus\b[^']*'\)/);
  const page = code(FN_PAGE);
  assert.match(page, /const confirmLock = ledgerRowLock\(row, "confirm"\);/);
  assert.match(page, /disabled=\{acting \|\| !!confirmLock\} title=\{confirmLock \|\| undefined\} onClick=\{\(\) => setConfirmFor\(row\)\}/);
  assert.match(page, /const invoiceLock = ledgerRowLock\(row, "tax-invoice"\);/);
  assert.match(page, /disabled=\{acting \|\| !!invoiceLock\} title=\{invoiceLock \|\| undefined\} onClick=\{\(\) => setInvoiceFor\(row\)\}/);
});

test('loadOrder ไม่กลืน error ของการอ่าน QT — อ่านไม่ขึ้น ≠ "ไม่พบใบเสนอราคา" (review R1 · ด่านกู้คืน/ยื่นพึ่งสถานะ QT)', () => {
  const load = slice(code(SO_ROUTE), 'async function loadOrder(', 'const { data: revisionHistory');
  assert.match(load, /\{ data: quotation, error: quotationError \}/);
  assert.match(load, /if \(quotationError\) throw quotationError;/);
});
