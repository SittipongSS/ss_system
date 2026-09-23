// ── ยามของจอฝั่งเงินของใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374 · slice S7) ──────────────────────
//
// 🔴 **นี่คือยาม source ไม่ใช่เทสต์พฤติกรรม** — อ่าน source เป็นสตริงแล้วจับด้วย regex ⇒ พิสูจน์ได้แค่ว่า
//    "ข้อความนี้ยังอยู่ในไฟล์" · ตรรกะจริงอยู่ที่ lib และมีเทสต์เรียกฟังก์ชันตรง ๆ แล้ว:
//    `paymentConfirmPrompt` (approvalPrompt.test) · `installmentActionError`/`installmentConfirmOutlook`
//    (salesOrderPayments.test) · `taxInvoicePending` (taxInvoice.test) · ledgerRow/stampConfirmOutlook (paymentLedger.test)
//
// ⭐ ห้าข้อนี้พังเงียบได้ทั้งหมด — ไม่มี error ไม่มีจอแดง:
//   1. โมดัลรับรองไม่ได้รับโหมดใบย้อนหลัง ⇒ บัญชีอ่าน "ใบนี้จะย้อนการอนุมัติหรือออก Rev. ไม่ได้" + บรรทัด Actual
//      ซึ่งไม่จริงกับใบนี้ทั้งคู่ และไม่เห็นว่าใบผ่าน AE Sup แล้วหรือยัง
//   2. หน้าทะเบียนตัดสินใบย้อนหลังด้วย literal ⇒ สะกดผิดที่เดียว = ป้าย/โหมดหายเงียบ (literal มีบ้านเดียว)
//   3. โมดัลตีกลับงวดยกมาไม่บอกทางแก้ ⇒ ฝ่ายขายแจ้งใหม่ไปเรื่อย ๆ ทั้งที่ยอดที่อนุมัติไปผิด (ต้องยกเลิกใบ)
//   4. ป้าย "ยกมา" หายจากคิว ⇒ บัญชีแยกเงินก่อนเข้าระบบออกจากงวดปกติไม่ได้
//   5. แผงงวดต่อ preview/แผนเปลี่ยน/ปุ่มเริ่มติดตามให้ใบย้อนหลัง ⇒ "ชำระเต็มจำนวน 100%" ปลอม ·
//      ไม่ส่งล็อกทั้งใบเข้าด่าน ⇒ ปุ่มเปิดให้กดแล้ว API ตีกลับ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DIALOG = 'components/salesPlanning/InstallmentConfirmDialog.js';
const PAGE = 'app/finance/payments/page.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const ROUTE = 'app/api/finance/payments/route.js';

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

// ── 1. โมดัลรับรอง = โมดัลตัวเดิม + โหมดใบย้อนหลัง ─────────────────────────────────────────────
test('โมดัลรับรองส่งโหมดใบย้อนหลังเข้า paymentConfirmPrompt และโชว์สามแถวที่บัญชีต้องเห็น', () => {
  const dialog = code(DIALOG);
  const prompt = slice(dialog, 'paymentConfirmPrompt({', '});');
  for (const key of ['historical,', 'opening,', 'paidThroughLabel:', 'nextInstallmentLabel:']) {
    assert.ok(prompt.includes(key), `paymentConfirmPrompt ต้องได้ ${key}`);
  }
  assert.match(dialog, /historical = false, opening = isOpeningInstallment\(row\), outlook = null/);
  assert.match(dialog, /const label = opening \? OPENING_INSTALLMENT_LABEL :/);
  // สามแถวของใบย้อนหลัง — "อนุมัติใบ" ขึ้นเสมอ (ไม่มีเงื่อนไขอื่นนอกจาก historical)
  assert.match(dialog, /\{historical \? \(\s*<>\s*<dt>อนุมัติใบ<\/dt>/);
  assert.match(dialog, /" · ไม่นับ Actual"/);
  assert.match(dialog, /<dt>ยอดที่เก็บแล้ว<\/dt>/);
  assert.match(dialog, / จาก \$\{fmtMoney\(orderTotal\)\}/);
  assert.match(dialog, /<dt>หมายเหตุจาก SA<\/dt>/);
  // งวดยกมาไม่ขึ้น "ยังไม่ออกใบ" (ชวนให้ออกซ้ำ) · คำเตือน "ไม่มีหลักฐาน" ยังอยู่ครบ
  assert.match(dialog, /: opening\s*\? <span className="cell-quiet">\{openingInvoiceNote\}/);
  assert.match(dialog, /งวดนี้ไม่มีไฟล์หลักฐานแนบมา — ตรวจกับฝ่ายขายก่อนรับรอง/);
});

// ── 2. หน้าทะเบียน: ตัดสินด้วยตัวกลาง ไม่มี literal ──────────────────────────────────────────────
test('ทะเบียนการชำระส่งโหมดใบย้อนหลังด้วย isHistoricalOrder (ไม่มี literal) พร้อมภาพหลังรับรองที่ประทับจาก API', () => {
  const page = code(PAGE);
  assert.doesNotMatch(page, /['"`]historical['"`]/, 'literal ของ origin มีบ้านเดียว (historicalOrders.js)');
  const dialog = slice(page, '<InstallmentConfirmDialog', '/>');
  assert.match(dialog, /historical=\{isHistoricalOrder\(\{ origin: confirmFor\?\.origin \}\)\}/);
  /* ⚠️ แก้โดยตั้งใจ (PR0 · optimistic lock): โมดัลวาดแถวล่าสุดของทะเบียน (`confirmRow = liveRow(confirmFor)`)
     — ภาพหลังรับรองต้องมาจากแถวเดียวกับที่ส่งตัวล็อกขึ้น API (ยังเป็นค่าที่ API ประทับมาเหมือนเดิม) */
  assert.match(dialog, /row=\{confirmRow\}/);
  assert.match(dialog, /outlook=\{confirmRow\?\.confirmOutlook \|\| null\}/);
  for (const key of ['totalAmount: confirmFor.orderTotal', 'approvedByName: confirmFor.orderApprovedByName',
    'approvedAt: confirmFor.orderApprovedAt', 'historicalInvoiceRef: confirmFor.historicalInvoiceRef']) {
    assert.ok(dialog.includes(key), `โมดัลต้องได้ ${key}`);
  }
  // ⚠️ ภาพหลังรับรองต้องประทับจากงวดทั้งใบก่อนกรอง — ที่ API ไม่ใช่ที่จอ
  const route = code(ROUTE);
  const stamp = route.indexOf('stampConfirmOutlook(all)');
  assert.ok(stamp > 0 && stamp < route.indexOf('filterLedger(all, filters)'), 'ประทับก่อนกรอง');
  assert.match(route, /"totalAmount", "approvedAt", "approvedByName", origin/);
});

// ── 3. โมดัลตีกลับงวดยกมา ───────────────────────────────────────────────────────────────────
test('โมดัลตีกลับงวดยกมาบอกทางแก้ (historicalOpeningRejectNote) — ทั้งคิวบนทะเบียนและแผงงวดบนใบ', () => {
  for (const rel of [PAGE, PANEL]) {
    const reject = slice(code(rel), 'title="ตีกลับการแจ้งชำระ"', '/>');
    assert.match(reject, /detail=\{rejectFor && isOpeningInstallment\(rejectFor\.row\) \? historicalOpeningRejectNote : undefined\}/, rel);
  }
});

// ── 4. คิวบนทะเบียน: ป้าย "ยกมา" · ใบย้อนหลัง · ช่วงครอบ ────────────────────────────────────────
test('แถวคิวรับรองโชว์ป้าย "ยกมา" + ป้ายใบย้อนหลัง + ช่วงครอบ · คอลัมน์ใบกำกับไม่นับงวดยกมา', () => {
  const page = code(PAGE);
  const queue = slice(page, '{queueShown.map((row) => (', '{queue.length > QUEUE_PREVIEW');
  assert.match(queue, /\{isOpeningInstallment\(row\) \? \(\s*<StatusBadge size="sm" tone="info" label="ยกมา"/);
  assert.match(queue, /isHistoricalOrder\(\{ origin: row\.origin \}\) \? ` · \$\{LEDGER_HISTORICAL_TAG\}`/);
  assert.match(queue, /` · ครอบ \$\{fmtDate\(row\.coversFrom\)\}–\$\{fmtDate\(row\.coversTo\)\}`/);
  assert.match(page, /\{group\.invoiced\}\/\{group\.count - group\.openingCount\}/);
  assert.match(page, /ยกมา: \{openingInvoiceNote\}/);
});

// ── 5. แผงงวดบนใบ ──────────────────────────────────────────────────────────────────────────
test('แผงงวด: ใบย้อนหลังไม่มี preview/แผนเปลี่ยน/ปุ่มเริ่มติดตาม และทุกด่านได้ล็อกทั้งใบ + โหมดใบย้อนหลัง', () => {
  const panel = code(PANEL);
  assert.match(panel, /const historical = isHistoricalOrder\(order\);/);
  assert.match(panel, /const orderLock = historicalInstallmentLock\(order\);/);
  /* ⚠️ แก้ยามโดยตั้งใจใน PR1 (mig 0376): ใบ revised ที่งวดย้ายไปใบ Rev. แล้วก็ไม่วาด preview (`movedAway`) —
     ใบย้อนหลังยังเป็นเงื่อนไขแรกของ `[]` ตามเดิม */
  assert.match(panel, /: \(historical \|\| movedAway \? \[\] : previewInstallments\(/);
  assert.match(panel, /const drift = historical \? null : installmentPlanDrift\(/);
  assert.match(panel, /\{isPreview && canStart && canTrackPayments && !historical \? \(/);
  // ⚠️ ทุกจุดที่เรียกด่านต้องผ่าน `gate` ตัวเดียว (ซึ่งส่ง orderLock + historical เสมอ)
  const calls = panel.match(/installmentActionError\(/g) || [];
  assert.equal(calls.length, 1, 'เรียก installmentActionError ตรง ๆ ได้ที่เดียว — ใน gate');
  const gate = slice(panel, 'const gate = (row, action, options) => installmentActionError(', '});');
  /* ⚠️ แก้โดยตั้งใจ (PR0): ล็อกทั้งใบต่อด้วยล็อกของใบ pipeline รายคำสั่ง — รูปเดียวกับ route PATCH */
  assert.match(gate, /orderLock: orderLock \|\| pipelineInstallmentLock\(order, action\), historical,/);
  assert.match(gate, /serviceRounds: hasServiceRounds/, 'ด่านเงินเดิมต้องยังอยู่ (serviceOrderScope.test)');
  // ล็อกบอกเหตุผลเป็น StatusNotice (ล็อกดีกว่าซ่อน) · ข้อความงวดร่างของใบปกติไม่ขึ้นกับใบนี้
  assert.match(panel, /\{orderLock \? \(\s*<StatusNotice tone="info">\s*\{orderLock\}/);
  // ⚠️ แก้โดยตั้งใจ (PR0): ใบ pipeline ที่ล็อกทั้งใบ (ยกเลิก/ถูกออก Rev.) ก็ไม่ขึ้นข้อความ "บันทึกเงินได้เลย"
  assert.match(panel, /\{isDraftPlan && !historical && !pipelineLock \? \(/);
});

/* ── 5ก. เซลล์ "ครอบบริการ" ของแผงงวด — ถามสิทธิ์กับตรวจค่าเป็นคนละคำถาม ────────────────────────
   🐞 **review 23/09: ช่องครอบบริการของงวดยกมาล็อกทุกคนรวมบัญชี** — เซลล์ถามด่านพร้อมค่า ⇒ ด่านตอบ
     เรื่อง *ค่า* ("วันเริ่มล็อก") กลับมาเป็นคำตอบเรื่อง *สิทธิ์* ⇒ ไม่มี DateInput โผล่เลยสักครั้ง
   ⚠️ ยามนี้พังเงียบได้ทั้งชุด — ไม่มี error ไม่มีจอแดง มีแต่เซลล์ที่กดไม่ได้:
     1. เซลล์ถามด่านพร้อมค่า (ค่าจากฐานหรือค่าร่าง) ⇒ พิมพ์ผิดกลางคันแล้วช่องกรอกหายทั้งเซลล์
     2. ร่างไม่ได้ถูกตรวจด้วยด่านตัวเดียวกัน/ค่าชุดเดียวกับที่ยิงขึ้น API ⇒ ปุ่มบันทึกเปิดแล้ว API ตีกลับ
     3. ล็อกวาดเป็นข้อความเฉย ๆ ⇒ มือถืออ่าน tooltip ไม่ได้ = เซลล์ตายที่อ่านเหมือนระบบพัง
     4. วันเริ่มของงวดยกมาวาดเป็นช่องกรอก ⇒ บัญชีพิมพ์ได้ แล้วไปเด้งตอนกดบันทึก */
test('เซลล์ช่วงครอบ: ถามด่านแบบไม่ส่งค่า · ตรวจร่างด้วยด่านตัวเดียวกัน · ล็อกบอกเหตุตอนกด · วันเริ่มของงวดยกมาไม่ใช่ช่องกรอก', () => {
  const panel = code(PANEL);
  // 1. ถามสิทธิ์แบบไม่ส่งค่า — ห้ามมี argument ที่สามใน probe ของเซลล์
  assert.match(panel, /const lock = row\.preview \? "[^"]*" : gate\(row, "coverage"\);/,
    'probe ของเซลล์ต้องไม่ส่ง coversFrom/coversTo — ส่งเมื่อไรเซลล์ยุบเป็นข้อความตามค่าที่ไม่ผ่าน');
  // 2. ร่างถูกตรวจด้วยด่านตัวเดียวกัน ด้วยค่าที่จะส่งจริง (`|| null` เหมือน saveCoverDrafts)
  const draftCheck = slice(panel, 'const coverDraftErrors =', 'const coverInvalid');
  assert.match(draftCheck, /gate\(row, "coverage", \{/);
  assert.match(draftCheck, /coversFrom: draft\.coversFrom \|\| null, coversTo: draft\.coversTo \|\| null,/);
  assert.equal((panel.match(/gate\(row, "coverage", \{\s*\n?\s*coversFrom: draft/g) || []).length, 1,
    'ร่างถูกถามด่านที่เดียว — ถามซ้ำตอนวาดเซลล์เมื่อไร ช่องกรอกหายทั้งเซลล์ตอนพิมพ์ผิดกลางคัน');
  assert.match(panel, /const coverInvalid = Boolean\(coverDraftError\);/);
  assert.match(panel, /\{coverDraftError \? ` — \$\{coverDraftError\}` : ""\}/, 'แถบบันทึกต้องบอกเหตุจากด่าน');
  // 3 + 4. ล็อกเป็นปุ่มที่บอกเหตุตอนกด (กติกา GatedAction) ทั้งทั้งเซลล์และช่อง "ตั้งแต่" ของงวดยกมา
  const cell = slice(panel, '{showCoverage ? (() => {', '<td className="num">');
  assert.equal((cell.match(/onClick=\{\(\) => notifyToast\.info\(/g) || []).length, 2,
    'ทั้งเซลล์ที่ล็อกและวันเริ่มของงวดยกมาต้องบอกเหตุตอนกด ไม่ใช่มีแต่ tooltip');
  assert.match(cell, /const startLock = !row\.preview && isOpeningInstallment\(row\)\s*\? gate\(row, "coverage", \{ coversFrom: "", coversTo: row\.coversTo \|\| "" \}\)/,
    'เหตุผลของวันเริ่มต้องมาจากด่าน ไม่ใช่คำที่จอเขียนเอง');
  assert.match(cell, /\{startLock \? \(\s*<button type="button"/, 'วันเริ่มของงวดยกมาไม่ใช่ DateInput');
  // ช่วงสัญญาต้องถึงด่านทุกครั้ง (ตัวเดียวกับ orderLock/historical)
  const gate = slice(panel, 'const gate = (row, action, options) => installmentActionError(', '});');
  assert.match(gate, /orderLock: orderLock \|\| pipelineInstallmentLock\(order, action\), historical, contractEnd,/);
});

/* ── 5ค. ขอบของช่องวัน **กลืนค่าที่พิมพ์** — กฎต้องอยู่ใต้เซลล์ ไม่ใช่ที่ขอบ (review 23/09) ────────────
   🐞 อาการ: `DateInput.update()` ไม่เรียก `onChange` เลยเมื่อค่าที่พิมพ์หลุด `min`/`max` แล้ว `onBlur`
     เด้งกลับค่าเดิม **โดยไม่มีข้อความสักบรรทัด** ⇒ บัญชีพิมพ์วันสิ้นสุดช่วงครอบ แล้ววันนั้นหายไปเฉย ๆ
     ไม่มีอะไรบอกว่าทำไม · เซลล์นี้เคยมีทั้งสองขอบ: `min={draft.coversFrom}` (ค่าจากอีกช่องในเซลล์เดียวกัน)
     และ `max={contractEnd}` (วันที่ไม่ได้อยู่บนแถวนี้เลย) ⇒ ยิ่งพิมพ์ยิ่งหาย
   ⭐ อาการเดียวกับห้าช่องวันของฟอร์มคีย์ใบย้อนหลัง แต่ **ยาคนละตัว — อย่าลอกข้ามกัน**:
     · ฟอร์มคีย์ใบ *ไม่ได้* ถอดขอบทิ้ง มันหุบขอบให้เหลือช่วงเอกสารคงที่ (`DOC_DATE_MIN/MAX` ซึ่งไม่ขึ้นกับ
       ค่าใดบนฟอร์ม ⇒ กลืนค่าที่พิมพ์ไม่ได้) และยามของมัน — `historicalRegisterUi.test` §8
       "ไม่มีช่องวันไหนในฟอร์มคีย์ใบที่ขอบคิดจากค่าอื่นบนฟอร์ม" — **บังคับให้มีขอบคู่นั้นครบทุกช่อง**
     · แผงนี้ถอดขอบทิ้งทั้งคู่ ⇒ ยามตัวนี้ห้ามมี min/max เลยสักตัว (ข้อ 1 ด้านล่าง)
     ⇒ ทั้งสองยามเฝ้าครึ่งเดียวกันคนละหน้า: "ขอบไม่กลืนค่า" + "กฎย้ายไปอยู่ใต้ช่อง" (ครึ่งหลังของฟอร์ม
       คีย์ใบเคยมียามแค่ขั้น ① · เพิ่มขั้น ③ ไว้ในยามตัวเดียวกันแล้ว)
     — ยามตัวนั้นเฝ้าแต่ไฟล์ของฟอร์ม ⇒ แผงงวดหลุดออกมาได้ · ยามตัวนี้เฝ้าทุก `<DateInput` ในแผง
   ⚠️ พังเงียบได้ทั้งชุด — ไม่มี error ไม่มีจอแดง มีแต่ค่าที่พิมพ์แล้วหาย:
     1. ขอบกลับมาที่ช่องไหนก็ได้ในแผงนี้ (รวมโมดัลแจ้งชำระ/กำหนดชำระ ที่ไม่เคยมีขอบมาก่อน)
     2. ถอดขอบแล้วไม่เหลือที่บอกกฎ ⇒ เพดานอายุสัญญาของงวดยกมากลายเป็นความรู้ลับของด่าน
     3. เหตุจากด่านขึ้นแต่บนแถบบันทึกรวม ⇒ ตารางหลายงวดอ่านไม่ออกว่างวดไหนผิด */
test('⭐ เซลล์ช่วงครอบไม่มีขอบที่กลืนค่าที่พิมพ์ — กฎ/เหตุอยู่ใต้เซลล์รายงวด', () => {
  const panel = code(PANEL);

  // 1. ทุก <DateInput ในแผงนี้ต้องไม่มี min/max เลยสักตัว (ขอบ = ค่าหายเงียบ)
  const inputs = [...panel.matchAll(/<DateInput\b([\s\S]*?)\/>/g)];
  assert.ok(inputs.length >= 4, `ยามต้องเจอช่องวันจริง ๆ ในแผงงวด (เจอ ${inputs.length})`);
  for (const [, attrs] of inputs) {
    assert.doesNotMatch(attrs, /\b(min|max)=/,
      'ขอบของ DateInput กลืนค่าที่พิมพ์แล้วเด้งกลับตอนเบลอโดยไม่มีข้อความ '
      + '⇒ กฎแบบนี้ต้องเป็นข้อความใต้เซลล์ ไม่ใช่ขอบของช่อง');
  }

  // 2. กฎที่เดาจากจอไม่ได้ (เพดานอายุสัญญาของงวดยกมา) ยังอยู่ — และ **บอกวันจริง** ไม่ใช่พูดลอย ๆ
  const cell = slice(panel, '{showCoverage ? (() => {', '<td className="num">');
  assert.match(cell, /const coverNote = coverDraftErrors\[row\.id\]/,
    'เหตุจากด่านต้องชนะกฎในบรรทัดเดียวกัน (แพตเทิร์น noteOf || rule ของฟอร์มคีย์ใบ)');
  assert.match(cell, /startLock && contractEnd\s*\n?\s*\? `ครอบได้ถึง \$\{fmtDate\(contractEnd\)\} \(วันสิ้นสุดสัญญา\)`/,
    'เพดานต้องบอกวันที่กั้นอยู่ — วันมาจากสัญญา/งวดอื่น ไม่ได้อยู่บนแถวนี้');

  // 3. บรรทัดนั้นเรนเดอร์จริงใต้สองช่อง และดังเฉพาะตอนเป็นเหตุ (ไม่ใช่ตอนเป็นกฎที่ค้างอยู่)
  assert.match(cell, /<small className=\{styles\.coverNote\}/);
  assert.match(cell, /data-bad=\{coverDraftErrors\[row\.id\] \? "yes" : undefined\}/);
  assert.match(cell, /role=\{coverDraftErrors\[row\.id\] \? "alert" : undefined\}/);
  /* บรรทัดกฎต้องอยู่ **หลัง** ช่อง "ถึง" ไม่ใช่มาแทนมัน — ถอดขอบแล้วเผลอถอดช่องไปด้วยคือทางตันใหม่ */
  const to = cell.indexOf('ariaLabel={`ครอบบริการถึง');
  assert.ok(to > 0 && cell.indexOf('styles.coverNote') > to, 'ช่อง "ถึง" ต้องยังเป็น DateInput ที่พิมพ์ได้');

  // 4. คลาสของบรรทัดต้องมีอยู่จริงใน module css (คลาสลอย = บรรทัดบีบช่องกรอกแคบลงเงียบ ๆ)
  const css = read('components/salesPlanning/SalesOrderPaymentPanel.module.css');
  assert.match(css, /\.coverNote \{[^}]*flex: 0 0 100%/);
  assert.match(css, /\.coverNote\[data-bad="yes"\] \{[^}]*var\(--red\)/);
});

/* ── 5ข. ปลายช่วงของงวดยกมา: ปุ่มกับ API ต้องกั้นด้วย **วันเดียวกัน** (review-fix 23/09) ─────────────
   🐞 อาการที่ยามนี้ปิด: แผงงวดคิดวันเองจาก `order.serviceContract.expiryDate` ส่วน route ของงวด
     ไม่เคยโหลดสัญญา ⇒ ด่านถอยไปอ่านจากงวดอื่นของใบ · สองทางนี้ไม่เท่ากันทันทีที่บัญชีหดช่วงของงวดปกติ
     งวดสุดท้ายลงมาก่อน ⇒ แถบบันทึกเงียบ ปุ่มเปิดให้กด แล้ว API ตีกลับด้วยวันคนละวัน
   ⚠️ พังเงียบได้ทั้งชุด — ไม่มี error ไม่มีจอแดง มีแต่ผู้ใช้ที่กดบันทึกแล้วโดนตีกลับด้วยวันที่ไม่รู้ที่มา
   ⭐ ตรรกะจริงอยู่ที่ `openingCoverageEnd` และมีเทสต์เรียกตรง ๆ ที่ salesOrderPayments.test.mjs
     ยามนี้พิสูจน์แค่ว่า **สองฝั่งยังเรียกตัวนั้นตัวเดียว และ route ยังโหลดสัญญามาให้มันอ่าน** */
const SO_INSTALLMENTS = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
test('ปลายช่วงงวดยกมา: แผงงวดและ route ของงวดคิดวันด้วย openingCoverageEnd ตัวเดียว · route โหลดสัญญามาให้', () => {
  const panel = code(PANEL);
  const route = code(SO_INSTALLMENTS);

  // 1. สองฝั่งเรียกตัวเดียวกัน — ห้ามฝั่งไหนเขียนสูตรเอง
  assert.match(panel, /const contractEnd = openingCoverageEnd\(order, rows\);/);
  assert.match(route, /contractEnd: openingCoverageEnd\(order, siblings\),/);
  for (const [rel, text] of [[PANEL, panel], [SO_INSTALLMENTS, route]]) {
    assert.doesNotMatch(text, /serviceContract\??\.\s*expiryDate/,
      `${rel}: วันสิ้นสุดสัญญาอ่านผ่าน openingCoverageEnd เท่านั้น — เขียนสูตรเองเมื่อไรสองฝั่งเพี้ยนหากันอีก`);
  }

  // 2. route ต้องโหลดสัญญามาแปะกับใบ ไม่งั้น openingCoverageEnd ไม่มีอะไรให้อ่าน (ถอยไปงวดอื่นเงียบ ๆ)
  const load = slice(route, 'async function loadOrderForUser', 'export const GET');
  assert.match(load, /from\('sales_contracts'\)/);
  assert.match(load, /\.select\('id, "expiryDate"'\)\.eq\('id', order\.serviceContractId\)/);
  assert.match(load, /isHistoricalOrder\(order\) && order\.serviceContractId/,
    'ใบ pipeline ต้องไม่ยิง query เพิ่ม — กฎนี้เป็นของงวดยกมาเท่านั้น');
  assert.match(load, /lines: lines \|\| \[\], serviceContract,/);
});

test('แผงงวด: งวดยกมามีป้าย "ยกมา" · ช่องใบกำกับใช้ openingInvoiceNote · โมดัลรับรองได้โหมดใบย้อนหลัง', () => {
  const panel = code(PANEL);
  assert.match(panel, /\{isOpeningInstallment\(row\) \? \(\s*<StatusBadge size="sm" tone="info" label="ยกมา"/);
  assert.match(panel, /\) : isOpeningInstallment\(row\) \? \(\s*<span className=\{styles\.none\}>\s*\{openingInvoiceNote\}/);
  const dialog = slice(panel, '<InstallmentConfirmDialog', '/>');
  assert.match(dialog, /historical=\{historical\}/);
  // ⚠️ แก้โดยตั้งใจ (PR0): แถวล่าสุดของตาราง (`live`) — ตัวเดียวกับที่โมดัลวาดและส่งตัวล็อกขึ้น API
  assert.match(dialog, /outlook=\{confirmFor \? installmentConfirmOutlook\(live\(confirmFor\.row\), saved\) : null\}/,
    'ภาพหลังรับรองคิดจากงวดทั้งใบ (saved) ไม่ใช่ rows ที่อาจเป็น preview');
});
