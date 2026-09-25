// ── ยามต้นทาง PR1 (แผน so-payment-unlock-replan · mig 0376 · มติเจ้าของ 23/09) ─────────────────────────────
// ⭐ ย้อนการอนุมัติ + ออก Rev. **ย้ายงวดทั้งแถว** — ตรรกะจริงมีเทสต์เรียกตรงแล้ว (salesOrderPayments.test ·
//    installmentEvidenceOwners.test · salesOrderInstallmentsStore.test · salesOrderRevisionCarry.test + PGlite ใน scratch)
//    ไฟล์นี้ตรึงว่า **ผู้เรียกทุกทางต่อสายครบ** ซึ่งพังเงียบได้ทั้งหมด:
//    · route ย้อนการอนุมัติกลับไปล็อกด้วยงวดที่รับรองแล้ว = ใบที่รับเงินแล้วแก้เอกสารไม่ได้เหมือนเดิม (คำขอ A ไม่เกิด)
//    · route ย้อนการอนุมัติไม่ถามคอลัมน์ 0376 = deploy ก่อนรันมิกแล้วเงินถูกก๊อปซ้ำเงียบ ๆ
//    · payment-file ไม่รู้จัก movedFrom = สลิป/ใบกำกับของงวดที่ย้ายมาเปิดไม่ได้ทั้งหมด
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
const FILE_ROUTE = 'app/api/sales-planning/sales-orders/[id]/payment-file/route.js';
const LIST_ROUTE = 'app/api/sales-planning/sales-orders/route.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';

// ── 1. ย้อนการอนุมัติ: ไม่ถามเงินรับแล้ว · ถามคอลัมน์ 0376 ก่อน · Σ งวดต้องเท่ายอดใบ ────────────────────
test('ย้อนการอนุมัติ: ไม่มี paymentLockReason · ถามคอลัมน์ 0376 (503) · อ่านงวดสดแบบโยน error · Σ ≠ ยอดใบ = ไม่ย้อน', () => {
  const revoke = slice(code(SO_ROUTE), "if (action === 'revoke')", "if (action === 'revise')");
  assert.doesNotMatch(revoke, /paymentLockReason/, 'งวดย้ายไปใบ Rev. ทั้งแถว (0376) — เงินรับแล้วไม่ล็อกการย้อนอีก');
  const rpc = revoke.indexOf("rpc('revoke_sales_order_approval_atomic'");
  const probe = revoke.indexOf('const moveSchemaError = await installmentMoveColumnError(supabase);');
  assert.ok(probe > 0 && probe < rpc, 'ต้องถามคอลัมน์ของ 0376 ก่อนย้อน — ไม่งั้น RPC ตัวก๊อปนับเงินซ้ำ');
  assert.match(revoke, /if \(moveSchemaError\) return fail\(moveSchemaError, 503\);/);
  assert.ok(revoke.indexOf('isHistoricalOrder(before)') < probe, 'ใบย้อนหลังยังได้คำของตัวเองก่อน');
  assert.ok(revoke.indexOf('canRevokeSalesOrderApproval(') < probe, 'ด่านสิทธิ์มาก่อน');
  const live = revoke.indexOf('try { liveInstallments = await loadInstallments(supabase, id); }');
  assert.ok(live > probe && live < rpc, 'อ่านงวดสด — before.installments ของ loadOrder กลืน error เป็น []');
  assert.doesNotMatch(revoke, /loadInstallments\([^)]*\)\s*\.catch/);
  const mismatch = revoke.indexOf('const totalMismatch = installmentsTotalMismatch(liveInstallments, before.totalAmount);');
  assert.ok(mismatch > live && mismatch < rpc, 'RPC ออก Rev. RAISE เมื่อ Σ ≠ ยอดใบ ⇒ ต้องกันตั้งแต่ขั้นย้อน (ทางตัน approval_revoked)');
  assert.match(revoke, /if \(totalMismatch\) return fail\(totalMismatch, 409\);/);
});

/* ⚠️ แก้ยามโดยตั้งใจใน PR3 (mig 0378 · มติ D4): ด่านนี้ย้ายเข้าบล็อกใบย้อนหลังแล้ว — ใบ pipeline ที่มีเงินรับแล้วยกเลิกได้
   (เงินค้างอยู่กับใบ → ยกเข้าใบใหม่/บันทึกคืนเงิน) · มติ 24/09 (mig 0387) ถอด paymentLockReason ทั้งตัว — ใบย้อนหลังถาม
   historicalCancelBlock ตัวเดียว · รูปเต็มของเส้นยกเลิกตรึงที่ cancelledMoneyGuards.test.mjs */
test('ยกเลิกใบ (PR3 → มติ 24/09): ไม่มี paymentLockReason · ใบ pipeline ไม่ถูกล็อกด้วยเงินรับแล้ว', () => {
  const cancel = slice(code(SO_ROUTE), "if (action === 'cancel')", "if (action === 'finance_approve')");
  assert.doesNotMatch(cancel, /paymentLockReason/);
  const hist = cancel.indexOf('if (isHistoricalOrder(before)) {\n      try { liveInstallments = await loadInstallments(supabase, id); }');
  assert.ok(hist > 0 && cancel.indexOf('historicalCancelBlock(before, liveInstallments)') > hist);
});

// ── 2. ออก Rev.: สรุป audit จาก result.moved · ไม่มี moved = warning ─────────────────────────────────────
test('ออก Rev.: สรุป audit มาจาก result.moved ของ RPC 0376 · ไม่มี moved = warning ในคำตอบ', () => {
  const revise = slice(code(SO_ROUTE), "if (action === 'revise')", "if (action === 'save')");
  assert.match(revise, /const \{ summary: reviseSummary, warning: moveWarning \} = revisionAuditSummary\(\{\s*fromNumber: before\.orderNumber, toNumber: revision\?\.orderNumber \|\| revisionId, reason, moved: result\?\.moved,\s*\}\);/);
  assert.match(revise, /summary: reviseSummary,/);
  assert.doesNotMatch(revise, /loadInstallments\(/, 'ไม่ต้องนับงวดของใบใหม่เองแล้ว — RPC บอกผลการย้ายมา');
  // + fileWarning: ไฟล์ในแท็บ "เอกสาร" ย้ายตามใบ Rev. (มติ 25/09) — warning ต่อท้าย ไม่แทนของเดิม
  assert.match(revise, /const warning = \[moveWarning, specWarning, fileWarning\]\.filter\(Boolean\)\.join\(' · '\) \|\| null;/);
  assert.match(revise, /return ok\(warning \? \{ \.\.\.revision, warning \} : revision, 201\);/);
});

// ── 3. ไฟล์หลักฐาน: เจ้าของตาม movedFrom ─────────────────────────────────────────────────────────────
test('payment-file: อ่าน movedFrom ของงวด แล้วถามด่านตัวเดียว (isInstallmentEvidencePath) · ไม่ผ่าน = 404', () => {
  const route = code(FILE_ROUTE);
  assert.match(route, /\.select\('id, salesOrderId, evidence, "taxInvoiceFile", "movedFrom"'\)/);
  assert.match(route, /const allowed = isInstallmentEvidencePath\(att\.storagePath, row, order\);/);
  assert.doesNotMatch(route, /isQuotationEvidencePath\(|isSalesOrderEvidencePath\(/, 'ด่านอ่านมีบ้านเดียว (lib) — ห้ามต่อ id เองในเราต์');
  assert.match(route, /if \(att\.storageBucket !== privateBucket \|\| !allowed\) \{\s*return Response\.json\(\{ error: 'ไม่พบไฟล์แนบ' \}, \{ status: 404 \}\);/);
  // งวดต้องเป็นของใบนี้ (ใบที่ถืองวดอยู่ตอนนี้) — movedFrom ขยายแค่โฟลเดอร์ ไม่ขยายสิทธิ์ข้ามใบ
  assert.match(route, /if \(!row \|\| row\.salesOrderId !== order\.id\) return Response\.json\(\{ error: 'ไม่พบงวด' \}, \{ status: 404 \}\);/);
});

// ── 4. ตารางรายการ SO: ใบ revised ไม่มีคอลัมน์งวด ───────────────────────────────────────────────────────
test('ลิสต์ SO ส่งสถานะใบเข้า salesOrderPaymentCell (ใบ revised = null)', () => {
  const route = code(LIST_ROUTE);
  assert.match(route, /payment: salesOrderPaymentCell\(\s*installmentsByOrder\.get\(row\.id\) \|\| \[\],\s*quoteById\.get\(row\.quotationId\)\?\.paymentPlan,\s*todayIso,\s*row\.totalAmount,\s*row\.status,\s*\)/);
});

// ── 5. แผงงวด: ใบ revised · โมดัลถอนคำรับรอง ───────────────────────────────────────────────────────
test('แผงงวดของใบ revised: บอกว่างวดย้ายไปใบ Rev. ไหน · ไม่วาดแผน QT · ไม่มีปุ่มเริ่มติดตาม', () => {
  const panel = code(PANEL);
  assert.match(panel, /const movedAway = saved\.length \? null : revisedInstallmentsNote\(order\);/);
  // ⚠️ แก้โดยตั้งใจ (review UI-4): เงื่อนไขเดียวกันครอบใบ pipeline ที่ยกเลิกด้วย (`cancelledPipeline`)
  assert.match(panel, /: \(historical \|\| movedAway \|\| cancelledPipeline \? \[\] : previewInstallments\(/, 'ใบ revised ห้ามถอยไปวาดแผนจาก QT');
  assert.match(panel, /\{movedAway \? <StatusNotice tone="info">\{movedAway\}<\/StatusNotice>\s*: pipelineLock \? <StatusNotice tone="info">\{pipelineLock\}<\/StatusNotice> : null\}/);
  assert.match(panel, /isPreview && canStart && canTrackPayments && !historical/, 'ปุ่มเริ่มติดตามยังถาม installmentStartBlock (revised = ซ่อน)');
});

test('โมดัลถอนคำรับรอง: คำอธิบายมาจาก installmentUnconfirmOutcome (ยอดเก็บแล้วที่ลด · "จ่ายถึง" ที่ถอย)', () => {
  const panel = code(PANEL);
  assert.match(panel, /description=\{unconfirmFor \? installmentUnconfirmOutcome\(live\(unconfirmFor\.row\), saved, \{ serviceRounds: showCoverage \}\) : ""\}/);
  assert.doesNotMatch(read(PANEL), /ย้อนการอนุมัติ\/ออก Rev\. ได้อีกครั้ง/, 'คำเก่าเป็นเท็จตั้งแต่ PR1');
});

// ── 6. หน้าใบสั่งขาย: โมดัลย้อน/ออก Rev./อนุมัติ/ปิดใบ ────────────────────────────────────────────────
test('หน้าใบ: โมดัลย้อน · ออก Rev. · อนุมัติ พูดเรื่องเงินผ่าน salesOrderMoneyOutcome ตัวเดียว', () => {
  const page = code(SO_PAGE);
  assert.match(page, /salesOrderMoneyOutcome\(order, installments, "revoke", \{ serviceRounds: hasServiceRounds \}\)/);
  assert.match(page, /\.\.\.salesOrderMoneyOutcome\(order, installments, "revise"\),/);
  /* PR3 (มติ D4): โมดัลอนุมัติส่งต้นทางเงินค้างของดีลเข้าตัวเดียวกัน (เตือนให้ยกเข้าหลังอนุมัติ) — แก้ยามโดยตั้งใจ */
  assert.match(page, /\.\.\.salesOrderMoneyOutcome\(order, installments, "approve", \{ strandedSources: order\.carrySources \}\),/);
  assert.doesNotMatch(page, /"สร้างงวดชำระตามแผนการชำระที่ระบุไว้ใน QT"/, 'คำนี้ย้ายไปอยู่ใน lib (ใบ Rev. ไม่สร้างงวดจาก QT)');
});

test('มติ D2: โมดัลปิดใบไม่สัญญาว่า "ไม่มีการตีกลับหลังจากนี้" — บอกว่าใบ Rev. จะกลับเข้าคิว', () => {
  const page = read(SO_PAGE);
  assert.doesNotMatch(page, /ไม่มีการตีกลับหลังจากนี้/);
  assert.match(page, /"\*\*ปิดใบสั่งขายใบนี้\*\* — เป็นขั้นสุดท้ายของใบ · ถ้า AE Sup ย้อนการอนุมัติภายหลัง ใบ Rev\. จะกลับเข้าคิวให้บัญชีปิดใหม่",/);
});
