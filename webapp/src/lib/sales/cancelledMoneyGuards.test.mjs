// ── ยามต้นทาง PR3 · ยกเลิกใบที่มีเงินรับแล้ว + เงินค้าง (แผน so-payment-unlock-replan · mig 0378 · มติเจ้าของ 23/09 D4) ──────
// ⭐ ตรรกะจริงมีเทสต์เรียกตรงแล้ว (salesOrderPayments.test · installmentCarry.test · paymentLedger.test ·
//    salesOrderInstallmentsStore.test · approvalPrompt.test · installmentCarryMigration.test + PGlite ใน scratch)
//    ไฟล์นี้ตรึงว่า **ผู้เรียกทุกทางต่อสายครบ** ซึ่งพังเงียบได้ทั้งหมด:
//    · route ยกเลิกยังถาม paymentLockReason กับใบ pipeline = ใบที่รับเงินแล้วยกเลิกไม่ได้เหมือนเดิม (คำขอ A ไม่เกิด)
//    · route ยกเลิกเลิกถามกับใบย้อนหลังด้วย = ใบย้อนหลังเปลี่ยนกติกาเงียบ ๆ (ต้องคงเดิมทุกข้อ)
//    · กู้คืน/ลบถาวรไม่ถาม movedFrom = เงินที่ยกไปแล้วกลับมาสองที่ · ไฟล์หลักฐานของงวดที่ย้ายไปถูกกวาดทิ้ง
//    · FN กดยกเงินไม่ได้เพราะ proxy ปล่อยแค่ PATCH ของ /installments
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

const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const INST_ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const REFUND_DIALOG = 'components/salesPlanning/InstallmentRefundDialog.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const FN_PAGE = 'app/finance/payments/page.js';
const FN_HOME = 'app/finance/page.js';
const PROXY = 'proxy.js';

// ── 1. ยกเลิก: paymentLockReason เหลือเป็นด่านของใบย้อนหลังเท่านั้น ─────────────────────────────────────
test('ยกเลิกใบ: ใบ pipeline ไม่ถาม paymentLockReason แล้ว · ใบย้อนหลังยังถาม (งวดสดแบบโยน error) คู่กับ historicalCancelBlock', () => {
  const cancel = slice(code(SO_ROUTE), "if (action === 'cancel')", "if (action === 'finance_approve')");
  assert.doesNotMatch(cancel, /paymentLockReason\(before\.installments\)/, 'before.installments ของ loadOrder กลืน error = ด่านเปิดเงียบ');
  const hist = slice(cancel, 'if (isHistoricalOrder(before)) {\n      let liveInstallments;', '\n    }\n');
  const live = hist.indexOf('try { liveInstallments = await loadInstallments(supabase, id); }');
  const lock = hist.indexOf('const cancelPaymentBlock = paymentLockReason(liveInstallments);');
  const waiting = hist.indexOf('const waitingBlock = historicalCancelBlock(before, liveInstallments);');
  assert.ok(live > 0 && lock > live && waiting > live, 'อ่านงวดสดก่อน แล้วถามทั้งสองด่านของใบย้อนหลัง');
  assert.match(hist, /if \(cancelPaymentBlock\) return badRequest\(cancelPaymentBlock\);/);
  assert.doesNotMatch(cancel, /loadInstallments\([^)]*\)\s*\.catch/);
  assert.equal((cancel.match(/paymentLockReason\(/g) || []).length, 1, 'เรียกที่เดียว — ในบล็อกใบย้อนหลัง');
});

// ── 2. กู้คืน: เงินยกไปแล้ว/คืนลูกค้าแล้ว = คืนสถานะไม่ได้ ─────────────────────────────────────────────────
test('กู้คืนใบที่ยกเลิก: อ่านงวดสด + แถวที่ยกออก (movedFrom carry) แบบโยน error → cancelledMoneyRestoreBlock → 409 ก่อนเขียน', () => {
  const restore = slice(code(SO_ROUTE), "if (action === 'restore')", "return badRequest('คำสั่งไม่ถูกต้อง');");
  const status = restore.indexOf("if (before.status !== 'cancelled')");
  const read1 = restore.indexOf('moneyRows = await loadInstallments(supabase, id);');
  const read2 = restore.indexOf("carriedAway = await loadMovedOut(supabase, id, { reason: 'carry' });");
  const block = restore.indexOf('const moneyBlock = cancelledMoneyRestoreBlock(moneyRows, carriedAway);');
  const write = restore.indexOf(".from('sales_orders').update(patch)");
  assert.ok(status > 0 && read1 > status && read2 > status && block > read2 && block > read1 && write > block);
  assert.match(restore, /if \(moneyBlock\) return fail\(moneyBlock, 409\);/);
  assert.match(restore, /catch \(error\) \{ return fail\(`ตรวจเงินของใบไม่สำเร็จ: \$\{error\.message\} — ยังไม่ได้คืนสถานะ`, 500\); \}/,
    'อ่านไม่ขึ้น ≠ ไม่มีเงินย้ายออก — หยุด ไม่ใช่เปิดด่าน');
});

// ── 3. ลบถาวร: มีงวดที่ไหนอ้างใบนี้ใน movedFrom = ลบไม่ได้ (ก่อน force · แบบเดียวกับด่าน chain) ────────────────
test('ลบถาวร: แถวที่ย้ายไปจากใบนี้ (movedFrom) บล็อกทั้งลบปกติและบังคับลบ — ก่อนถึง force_delete/purgePrivateEvidence', () => {
  const del = slice(code(SO_ROUTE), 'export const DELETE');
  const chain = del.indexOf('if (chainBlock) return fail(chainBlock, 409);');
  const read1 = del.indexOf('movedOut = await loadMovedOut(supabase, id);');
  const block = del.indexOf('const movedBlock = movedOutDeleteBlock(movedOut);');
  const rpc = del.indexOf("supabase.rpc('force_delete_sales_order'");
  const purge = del.indexOf("purgePrivateEvidence(supabase, 'sales_orders', id)");
  assert.ok(chain > 0 && read1 > chain && block > read1 && rpc > block && purge > block);
  assert.match(del, /if \(movedBlock\) return fail\(movedBlock, 409\);/);
  assert.match(del, /catch \(error\) \{ return fail\(`ตรวจงวดที่ย้ายไปจากใบนี้ไม่สำเร็จ: \$\{error\.message\} — ยังไม่ได้ลบใบ`, 500\); \}/);
  /* ⚠️ แก้โดยตั้งใจ (review UI-6): พรีวิวไม่ใช่ "ดูได้เสมอ" แล้ว — มันถามงวดย้ายออกของตัวเองแล้วตอบ blocked (เทสต์ UI-6 ข้างล่าง)
     ที่นี่ตรึงแค่ว่าพรีวิวอยู่ก่อนด่านของตอนลบจริง (ลำดับเดิม) */
  assert.ok(del.indexOf('if (isDryRun(req))') < read1, 'พรีวิวอยู่ก่อนด่านของตอนลบจริง');
});

// ── 4. หน้าใบ: โหลดเงินค้างของดีล + แถวที่ยกออก (อ่านไม่ขึ้นต้องบอก ไม่กลืน) ─────────────────────────────────
test('loadOrder: ใบ pipeline ที่ยังเดินโหลดต้นทางเงินค้างของดีล · ใบที่ยกเลิกโหลดแถวที่ยกออก · อ่านพลาด = moneyLinksError', () => {
  const load = slice(code(SO_ROUTE), 'async function loadOrder(', '\n}\n');
  assert.match(load, /if \(!historical && !\['cancelled', 'revised'\]\.includes\(order\.status\)\) carrySources = await loadCarrySources\(supabase, order\);/);
  assert.match(load, /if \(!historical && order\.status === 'cancelled'\) carriedAway = await loadMovedOut\(supabase, order\.id, \{ reason: 'carry' \}\);/);
  assert.match(load, /catch \(moneyError\) \{/);
  assert.match(load, /moneyLinksError = `อ่านเงินค้างจากใบที่ยกเลิกไม่สำเร็จ: \$\{moneyError\?\.message \|\| moneyError\}`;/);
  assert.match(load, /carrySources,\s*carriedAway,\s*moneyLinksError,/);
});

// ── 5. PATCH carry: คำสั่งของทั้งใบ (ใบปลายทาง) ก่อนด่าน installmentId · FN ผ่าน proxy ได้เพราะเป็น PATCH ของ /installments ──
test('PATCH carry: วางก่อนด่าน installmentId · ลำดับ สิทธิ์ → ใบ → ใบต้นทาง → งวดสด (โยน) → ด่าน → เหตุผล → ข้อมูลเก่า → ชุดสุดท้าย → RPC → audit สองใบ', () => {
  const route = code(INST_ROUTE);
  const patch = slice(route, 'export const PATCH');
  const dispatch = patch.indexOf("if (action === 'carry') return carryIntoOrder({ user, supabase, req, id, body });");
  assert.ok(dispatch > 0 && dispatch < patch.indexOf("if (!installmentId) return badRequest("));
  const fn = slice(route, 'async function carryIntoOrder(', '\nexport const PATCH');
  const steps = [
    'if (!canCarryInstallments(user)) return forbidden(CARRY_FORBIDDEN);',
    'const { order, error } = await loadOrderForUser(supabase, user, id);',
    "const { row: source, response: sourceResponse } = await loadScoped(supabase, 'sales_orders', sourceId, user, 'view');",
    'const sourceError = carrySourceError(order, source);',
    'const live = await loadInstallments(supabase, order.id);',
    'const sourceRows = await loadInstallments(supabase, source.id);',
    'const gate = carryBlocker(order, live, user, carrySourcesFrom([source], sourceRows));',
    'const reasonError = replanReasonError(body.reason);',
    'if (carryStale(live, carried, body.expected)) return fail(CARRY_STALE_MESSAGE, 409);',
    'const built = applyCarryIn(order, live, carried);',
    'const result = await carryInstallments(supabase, {',
    'await recordAudit({',
  ];
  let at = -1;
  for (const step of steps) {
    const next = fn.indexOf(step, at + 1);
    assert.ok(next > at, `ลำดับผิด/หาไม่เจอ: ${step}`);
    at = next;
  }
  assert.doesNotMatch(fn, /loadInstallments\([^)]*\)\s*\.catch/, 'อ่านสดแบบโยน error — กลืนเป็น [] = แผนผิด');
  assert.doesNotMatch(fn, /updateInstallment\(/, 'ทางเขียนทางเดียวคือ RPC 0378 — ห้ามย้ายแถวเองทีละแถว');
  assert.equal((fn.match(/await recordAudit\(\{/g) || []).length, 2, 'audit ทั้งใบปลายทางและใบต้นทาง (ประวัติของทั้งสองใบ)');
  assert.match(fn, /carryAuditSummary\(\{/);
  // proxy: FN ผ่านเฉพาะ PATCH ของ /sales-orders/[id] และ /installments — carry ต้องอยู่ที่นี่
  assert.match(code(PROXY), /\\\/api\\\/sales-planning\\\/sales-orders\\\/\[\^\/\]\+\(\\\/installments\)\?\$/);
});

// ── 6. PATCH refund / refund-clear ─────────────────────────────────────────────────────────────────
test('PATCH refund/refund-clear: ด่านได้ orderCancelled (ใบ pipeline ที่ยกเลิก) · เขียนช่องคืนเงินครบ/ล้างครบ · ไม่มีคอลัมน์ = 503 ให้รัน 0378', () => {
  const patch = slice(code(INST_ROUTE), 'export const PATCH');
  const gate = slice(patch, 'installmentActionError(row, action, user, {', '});');
  assert.match(gate, /orderCancelled: order\.status === 'cancelled' && !isHistoricalOrder\(order\),/);
  assert.match(gate, /refundedOn, creditNoteNo,/);
  const refund = slice(patch, "} else if (action === 'refund') {", "} else if (action === 'refund-clear') {");
  assert.match(refund, /refundedAt: now, refundedOn, refundedById: user\.id, refundedByName: actorName,/);
  assert.match(refund, /refundReason: reason, refundCreditNoteNo: creditNoteNo \|\| null,/);
  const clear = slice(patch, "} else if (action === 'refund-clear') {", '}\n');
  assert.match(clear, /refundedAt: null, refundedOn: null, refundedById: null, refundedByName: null,\s*refundReason: null, refundCreditNoteNo: null,/);
  assert.match(patch, /const refundSchema = installmentRefundSchemaError\(writeError\);\s*if \(refundSchema\) return fail\(refundSchema, 503\);/);
});

// ── 7. แผงงวด: ปุ่ม/โมดัลยกเงิน · ลิงก์ยกไป/ยกมา · คืนเงิน ────────────────────────────────────────────────
test('แผงงวด: ปุ่ม "ยกเงินจากใบที่ยกเลิก" (GatedAction ถาม carryBlocker) · โมดัลในแผง · ยืนยันด้วย paymentCarryPrompt ก่อนยิง', () => {
  const panel = code(PANEL);
  assert.match(panel, /const carryGate = carryBlocker\(order, saved, user, carrySources\);/);
  assert.match(panel, /blocker=\{carryGate\.blocker\} disabled=\{!!busy\} onClick=\{openCarry\}>\s*\{CARRY_BUTTON\}/);
  const submit = slice(panel, 'const submitCarry = async () => {', '\n  };');
  const confirm = submit.indexOf('await confirmAction(paymentCarryPrompt(carryPromptFacts(');
  const fire = submit.indexOf('await onCarry({');
  assert.ok(confirm > 0 && fire > confirm, 'บอกผล (แผนก่อน/หลัง) ก่อนยิง');
  assert.match(submit, /expected: carryExpected\(carry\.base, carryRows\),/, 'expected มาจากชุดที่ตาเห็นตอนเปิดโมดัล');
  assert.match(panel, /const carryBuild = carry \? applyCarryIn\(order, carry\.base, carryRows, \{ requestById \}\) : null;/,
    'พรีวิวก่อน/หลังมาจากตัวเดียวกับที่ route ใช้สร้างชุดสุดท้าย');
  assert.doesNotMatch(read(SO_PAGE), /applyCarryIn\(/, 'โมดัลอยู่ในแผง ไม่อยู่ใน page.js');
});

test('แผงงวด: ใบที่ยกเลิกบอกเงินค้าง + ลิงก์ "ยกไป {SO}" · งวดที่ยกมาบอก "ยกมาจาก {SO}" · เมนูคืนเงิน/ถอนการคืนของบัญชี', () => {
  const panel = code(PANEL);
  assert.match(panel, /const strandedRows = saved\.filter\(\(r\) => strandedInstallment\(r, order\)\);/);
  assert.match(panel, /const carriedAway = carriedAwayGroups\(order\?\.carriedAway\);/);
  assert.match(panel, /href=\{`\/sa\/sales-orders\/\$\{group\.salesOrderId\}#payment`\}/);
  assert.match(panel, /const carriedFrom = carriedFromOf\(row\);/);
  assert.match(panel, /!gate\(row, "refund", REFUND_PROBE\) && \{/);
  assert.match(panel, /!gate\(row, "refund-clear"\) && \{/);
  assert.match(panel, /confirmAction\(paymentRefundClearPrompt\(\{/);
  assert.match(panel, /<InstallmentRefundDialog/);
  // gate ของแผงส่ง orderCancelled ตัวเดียวกับ route
  const gate = slice(panel, 'const gate = (row, action, options) => installmentActionError(', '});');
  assert.match(gate, /orderCancelled: order\?\.status === "cancelled" && !historical,/);
});

test('โมดัลคืนเงิน: ตัวเดียวสองทางเรียก (แผงงวด · คิวเงินค้างของบัญชี) · บอกผลผ่าน paymentRefundPrompt · ช่องใบลดหนี้บังคับเมื่อมีใบกำกับ', () => {
  const dialog = code(REFUND_DIALOG);
  assert.match(dialog, /import \{ paymentRefundPrompt \} from "@\/lib\/approvalPrompt";/);
  assert.match(dialog, /const prompt = paymentRefundPrompt\(\{/);
  assert.match(dialog, /const valueError = refundValueError\(row, \{ refundedOn, reason, creditNoteNo \}\);/,
    'ด่านค่าตัวเดียวกับ API (installmentActionError → refundValueError) ก่อนเปิดปุ่มยืนยัน');
  assert.match(code(FN_PAGE), /<InstallmentRefundDialog/);
  assert.match(code(PANEL), /<InstallmentRefundDialog/);
});

// ── 8. หน้าใบ: ยกเงิน · โมดัลยกเลิก · โมดัลอนุมัติ · ปุ่มกู้คืน ───────────────────────────────────────────
test('หน้าใบ: ยกเงินผ่าน PATCH action carry (apiFetch · 409 = ดึงใบสด · toast) · โมดัลยกเลิกบอกเรื่องเงิน · โมดัลอนุมัติเตือนเงินค้างของดีล', () => {
  const page = code(SO_PAGE);
  const run = slice(page, 'async function runInstallmentCarry(', '\n  }\n');
  assert.match(run, /apiFetch\(`\/api\/sales-planning\/sales-orders\/\$\{id\}\/installments`, \{\s*method: "PATCH",\s*json: \{ action: "carry", sourceOrderId, installmentIds, expected, reason \},/);
  assert.match(run, /if \(res\.status === 409\) refreshOrder\(\);/);
  assert.match(run, /setToast\(\{ kind: "success", msg: CARRY_DONE_MESSAGE \}\);/);
  assert.match(page, /onCarry=\{runInstallmentCarry\}/);
  const modal = slice(page, '{cancelForm && (', '</Modal>');
  assert.match(modal, /\{cancelMoneyLines\.length \? \(\s*<StatusNotice tone="warning" title="เงินของใบนี้">/);
  assert.match(page, /const cancelMoneyLines = salesOrderMoneyOutcome\(order, installments, "cancel"\);/);
  assert.match(page, /\.\.\.salesOrderMoneyOutcome\(order, installments, "approve", \{ strandedSources: order\.carrySources \}\),/);
  const restore = slice(page, '{ id: "restore",', 'onClick: () => requestAction("restore") },');
  assert.match(restore, /disabled: !!restoreMoneyBlock,/);
  assert.match(page, /const restoreMoneyBlock = cancelledMoneyRestoreBlock\(installments, order\?\.carriedAway\);/);
});

// ── 9. บัญชี: คิวเงินค้าง + ตัวนับบนภาพรวม ─────────────────────────────────────────────────────────────
test('บัญชี: คิว "เงินค้างจากใบที่ยกเลิก" บนทะเบียนการชำระ (คืนเงินได้จากคิว) · ตัวนับบนหน้า /finance', () => {
  const fn = code(FN_PAGE);
  assert.match(fn, /const strandedQueue = useMemo\(\(\) => pendingStranded\(rows\), \[rows\]\);/);
  assert.match(fn, /title=\{`\$\{LEDGER_STRANDED_TITLE\} \$\{strandedQueue\.length\} งวด · \$\{fmtMoney\(strandedTotal\)\}`\}/);
  assert.match(fn, /runAction\(refundRow, "refund", values\)/);
  const home = code(FN_HOME);
  assert.match(home, /label=\{LEDGER_STRANDED_TITLE\} value=\{`\$\{summary\?\.strandedCount \?\? 0\} งวด`\}/);
  assert.match(home, /note=\{fmtMoney\(summary\?\.strandedAmount \?\? 0\)\}/);
});

/* ══ review รอบ PR0–PR3 — ยามต่อสาย (ตรรกะจริงมีเทสต์ตรงอยู่ที่ lib แล้ว) ═══════════════════════════════════════════ */
const QT_ROUTE = 'app/api/sales-planning/quotations/[id]/route.js';
const LIST_ROUTE = 'app/api/sales-planning/sales-orders/route.js';
const CONFIRM_DIALOG = 'components/salesPlanning/InstallmentConfirmDialog.js';

// ── MONEY-2: ยกเลิกใบที่ถือเงินต้องเป็นผู้ตรวจสอบ — ทุกสถานะ (อ่านงวดสด · อ่านไม่ขึ้น = ไม่ยกเลิก) ────────────────────────
test('🔴 ยกเลิกใบ pipeline ที่ถือเงิน (ย้อนการอนุมัติแล้ว/ใบ Rev. ร่าง): ไม่ใช่ผู้ตรวจสอบ = 403 ก่อนแตะใบ · ปุ่มถามตัวเดียวกัน', () => {
  const cancel = slice(code(SO_ROUTE), "if (action === 'cancel')", "if (action === 'finance_approve')");
  const read1 = cancel.indexOf('try { moneyRows = await loadInstallments(supabase, id); }');
  const gate = cancel.indexOf('if (salesOrderCancelNeedsReviewer(before, moneyRows)) {');
  const rpc = cancel.indexOf("supabase.rpc('cancel_sales_order_with_reversal_atomic'");
  assert.ok(read1 > 0 && gate > read1 && rpc > gate, 'อ่านงวดสด → ด่านผู้ตรวจสอบ → ก่อนเขียนใบ');
  assert.match(cancel, /if \(!reviewer && !isHistoricalOrder\(before\)\) \{/);
  assert.match(cancel, /catch \(error\) \{ return fail\(`อ่านงวดชำระของใบไม่สำเร็จ: \$\{error\.message\} — ยังไม่ได้ยกเลิก`, 500\); \}/,
    'อ่านไม่ขึ้น ≠ ไม่มีเงิน — หยุด ไม่ใช่เปิดด่าน');
  assert.match(code(SO_PAGE), /visible: canCancelSalesOrder\(order, \{ reviewer, canEdit, installments \}\),/);
});

// ── qt-force-delete-bypasses-movedout: ลบใบเสนอราคา (ปกติ/บังคับ) ห้ามกวาดหลักฐานของเงินที่ย้ายไปใบอื่น ──────────────────
test('🔴 ลบใบเสนอราคา: งวดที่ย้ายไปจากใบสั่งขายลูก (movedFrom) บล็อกก่อน force_delete_quotation/purge · พรีวิวบอก blocked', () => {
  const del = slice(code(QT_ROUTE), 'export const DELETE');
  const read1 = del.indexOf('movedOut = await loadMovedOutOfOrders(supabase, childOrderIds);');
  const children = del.indexOf('childOrderIds = await quotationChildOrderIds(supabase, id);');
  const preview = del.indexOf('await quotationForcePreview(supabase, before, { movedOut })');
  const block = del.indexOf('const movedBlock = movedOutDeleteBlock(movedOut, { subject: QUOTATION_CHILD_ORDERS });');
  const orphans = del.indexOf('await cleanupQuotationOrphans(supabase, before);');
  const rpc = del.indexOf("supabase.rpc('force_delete_quotation'");
  const purge = del.indexOf("purgePrivateEvidence(supabase, 'quotations', id)");
  assert.ok(children > 0 && read1 > children, 'รู้ id ของใบลูกก่อน แล้วถามงวดที่ย้ายออก');
  assert.ok(preview > read1, 'พรีวิวรู้ด้วยว่าลบไม่ได้ (ไม่ใช่รู้หลังกดยืนยัน)');
  assert.ok(block > preview && orphans > block && rpc > block && purge > block, 'ด่านมาก่อนทุกการลบ (ทั้งปกติและบังคับ)');
  assert.match(del, /if \(movedBlock\) return fail\(movedBlock, 409\);/);
  assert.match(del, /blocked: true/, 'อ่านไม่ขึ้นตอนพรีวิว = บอก blocked ไม่ใช่พรีวิวที่ลบได้');
});

// ── UI-6: พรีวิวบังคับลบใบสั่งขายบอกด่านที่ break-glass ข้ามไม่ได้ (สายโซ่ Rev. · งวดที่ย้ายออก) · หน้าไม่เสนอปุ่มยืนยัน ────────
test('🔴 พรีวิวบังคับลบใบสั่งขาย: ด่านสายโซ่ Rev. + งวดที่ย้ายออก ตอบ blocked ในพรีวิว · หน้าใบไม่เปิดโมดัลยืนยันเมื่อ blocked', () => {
  const del = slice(code(SO_ROUTE), 'export const DELETE');
  const dry = slice(del, 'if (isDryRun(req)) {', "const force = isForceRequest(req);");
  assert.match(dry, /const chain = salesOrderRevisionChainDeleteBlock\(before\);\s*if \(chain\) return ok\(\{ dryRun: true, cascade: \[\], notes: \[chain\], blocked: true \}\);/);
  assert.match(dry, /movedOutPreview = await loadMovedOut\(supabase, id\);/);
  assert.match(dry, /const preview = await salesOrderForcePreview\(supabase, before, \{ movedOut: movedOutPreview \}\);/);
  const force = slice(code(SO_PAGE), 'async function forceRemove() {', 'async function printDocument()');
  const blocked = force.indexOf('if (preview.blocked) {');
  const confirm = force.indexOf('setConfirmState({');
  assert.ok(blocked > 0 && confirm > blocked, 'พรีวิวที่ blocked = บอกเหตุ ไม่เปิดโมดัลยืนยันที่ลบไม่ได้จริง');
});

// ── UI-1 / F2: โมดัลรับรองเงินได้สถานะใบ (ทั้งแผงงวดและคิวบนทะเบียน) · แถวคิวของใบที่ยกเลิกติดป้าย ─────────────────────────
test('🔴 โมดัลรับรอง/บันทึกการรับชำระ ส่งสถานะใบเข้า paymentConfirmPrompt · คิวรับรองบนทะเบียนติดป้าย "ใบยกเลิกแล้ว"', () => {
  const dialog = code(CONFIRM_DIALOG);
  assert.match(dialog, /row, multi = false, historical = false, opening = isOpeningInstallment\(row\), outlook = null, orderStatus = null,/);
  assert.match(dialog, /orderStatus,\s*\}\);/);
  assert.match(dialog, /installmentConfirmPrompt\(\{ row, multi, historical, opening, outlook, orderStatus: order\?\.status \?\? row\.orderStatus \?\? null \}\)/);
  assert.match(code(PANEL), /row, multi: rows\.length > 1, historical, outlook: installmentConfirmOutlook\(row, saved\), orderStatus: order\?\.status,/);
  const fn = code(FN_PAGE);
  assert.match(fn, /approvedAt: confirmFor\.orderApprovedAt, historicalInvoiceRef: confirmFor\.historicalInvoiceRef,\s*status: confirmFor\.orderStatus,/);
  assert.match(fn, /\{row\.orderStatus === "cancelled" \? ` · \$\{LEDGER_CANCELLED_TAG\}` : ""\}/);
});

// ── carry-modal-stale-source-409-loop: โมดัลยกเงินรู้ว่าแถวของใบที่ยกเลิกเปลี่ยนแล้ว (ไม่ใช่ 409 วนไม่รู้จบ) ─────────────────
test('🔴 โมดัลยกเงิน: ตัวตรวจข้อมูลเก่ารวมแถวของใบต้นทาง (ตัวล็อกที่ส่งขึ้น RPC รวมแถวนั้นด้วย) · มีปุ่มเริ่มใหม่จากข้อมูลล่าสุด', () => {
  const panel = code(PANEL);
  assert.match(panel, /const freshCarrySource = carry \? carrySources\.find\(\(src\) => src\.id === carry\.sourceId\) \|\| null : null;/);
  assert.match(panel, /replanStale\(\(freshCarrySource\?\.rows \|\| \[\]\)\.filter\(\(r\) => carry\.ids\.includes\(r\.id\)\), replanExpected\(carryRows\)\)/);
  assert.match(panel, /onClick=\{resetCarry\}>เริ่มใหม่จากงวดล่าสุด<\/Button>/);
});

// ── UI-2/3/4: แผงงวดของใบที่ยกเลิก — งวดโมฆะไม่ใช่ค้างรับ/เลยกำหนด · คืนเงินแล้วไม่ใช่ "ยังไม่ออกใบ" · ไม่มีงวด = ไม่วาดแผน QT ──
test('🔴 แผงงวด: ยอด/เตือนนับจากงวดที่ไม่โมฆะ (installmentVoid) · ธงเลยกำหนดรายแถวเว้นงวดโมฆะ · ใบยกเลิกไม่วาดแผนจาก QT', () => {
  const panel = code(PANEL);
  assert.match(panel, /const liveRows = saved\.filter\(\(r\) => !installmentVoid\(r, order\)\);/);
  assert.match(panel, /const rollup = paymentRollup\(liveRows, todayIso\);/);
  assert.match(panel, /const rejectedCount = liveRows\.filter\(\(r\) => r\.status === "rejected"\)\.length;/);
  assert.match(panel, /const overdue = !installmentVoid\(row, order\) && row\.status !== "confirmed" && row\.dueDate && String\(row\.dueDate\) < String\(todayIso\);/);
  assert.match(panel, /\(historical \|\| movedAway \|\| cancelledPipeline \? \[\] : previewInstallments\(/);
  assert.match(panel, /\["reported", "confirmed"\]\.includes\(row\.status\) && !installmentRefunded\(row\)/);
});

// ── MONEY-1: อนุมัติใบของดีลที่มีเงินค้าง — ไม่ยืมสลิปจากเอกสารยืนยันคำสั่งซื้อมาตั้งงวดแรก (อ่านไม่ขึ้น = ไม่ยืม) ─────────────
test('🔴 อนุมัติใบ: ถามเงินค้างของดีลก่อน freeze แล้วส่ง borrowConfirmation (อ่านพลาด = ไม่ยืม)', () => {
  const approve = slice(code(SO_ROUTE), "if (action === 'approve') {", "if (action === 'reject') {");
  const ask = approve.indexOf('borrowConfirmation = !(await loadCarrySources(supabase, before)).length;');
  const freeze = approve.indexOf('await freezeInstallments(supabase, {');
  assert.ok(ask > 0 && freeze > ask);
  assert.match(approve, /catch \(strandedError\) \{\s*borrowConfirmation = false;/);
  assert.match(slice(approve, 'await freezeInstallments(supabase, {', '});'), /borrowConfirmation,/);
});

// ── UI-2: ตารางรายการ SO ต้องได้ refundedAt (ไม่งั้นงวดที่คืนเงินแล้วนับเป็น "เก็บแล้ว" เงียบ ๆ) ─────────────────────────
test('ตารางรายการ SO: เลือก refundedAt ของงวดมาด้วย (salesOrderPaymentCell ตัดงวดที่คืนเงินแล้ว) · ก่อนรัน 0378 ถอยไปชุดเดิม', () => {
  const list = code(LIST_ROUTE);
  assert.match(list, /\.select\('salesOrderId, status, kind, "dueDate", "coversFrom", "coversTo", "taxInvoiceNo", "refundedAt"'\)/);
  assert.match(list, /if \(withRefund\.error\?\.code !== '42703'\) return withRefund;/, 'ไม่มีคอลัมน์ ≠ คอลัมน์งวดว่างทั้งหน้า');
  assert.match(list, /await loadListInstallments\(supabase, orderIds\);/);
});

// ── F3: งวดที่ยกมาจากใบอื่น (QT คนละใบ) ยังเห็นคำร้องวางบิลของตัวเอง — ไม่ใช่ "คำร้องขอเอกสารถูกลบไปแล้ว" ───────────────────
test('🔴 หน้าใบ: โหลดคำร้องวางบิลที่งวดผูกอยู่ด้วย id (แบ่งก้อน) แม้เป็นของใบเสนอราคาอื่น · อ่านพลาดบอกบนแผง ไม่ใช่ "ถูกลบ"', () => {
  const load = slice(code(SO_ROUTE), 'async function loadOrder(', '\n}\n');
  assert.match(load, /const linkedRequestIds = \[\.\.\.new Set\(installmentRows\.map\(\(r\) => r\?\.billingRequestId\)/);
  assert.match(load, /fetchInChunks\(linkedRequestIds, \(chunk\) => fetchAllResult\(\(\) => supabase\s*\.from\('dept_requests'\)/);
  assert.match(load, /\.in\('id', chunk\)/);
  assert.match(load, /billingRequestsError,/);
  assert.match(code(PANEL), /order\?\.billingRequestsError \? "อ่านคำร้องขอเอกสารไม่สำเร็จ" : "คำร้องขอเอกสารถูกลบไปแล้ว"/);
});
