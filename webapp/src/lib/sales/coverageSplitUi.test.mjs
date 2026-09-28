// ── แผงงวด (ช่วงบริการ · แบ่งช่วงครอบ · กรอบแดงหลังกดยื่น) + โมดัลแบ่งช่วงครอบ + การ์ดสัญญา — mig 0391 · แผน §2.8 ──────────
// ยามต้นทาง (อ่าน source ที่ตัดคอมเมนต์แล้ว) — ไฟล์จอมี JSX ⇒ import ใต้ node ไม่ได้ · พฤติกรรมของตัวคิด
// (`splitCoverageByPeriod` · `serviceSetupEditError` · `serviceSetupFieldId`) มีเทสต์ของมันเองแล้ว ที่นี่ยึด
// **สัญญาที่จอพึ่ง**: ลำดับเหตุของตัวคิด · รูป id ของช่อง · และการต่อสายของสามไฟล์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COVERAGE_SPLIT_ERRORS, splitCoverageByPeriod } from './paymentCoverage.js';
import { SERVICE_SETUP_EDIT_TEXT, serviceSetupEditError, serviceSetupFieldId } from './serviceSetup.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (rel) => raw(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\{\s*\}/g, '{}')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const MODAL = 'components/salesPlanning/CoverageSplitModal.js';
const CARD = 'components/salesPlanning/ServiceContractCard.js';
const PERIOD = { from: '2026-10-01', to: '2027-09-30' };
const row = (seq, extra = {}) => ({ id: `I${seq}`, seq, status: 'pending', amount: 1000, ...extra });

// ── 1. สัญญาของตัวคิดที่โมดัลพึ่ง ─────────────────────────────────────────────────────────────────────
test('ตัวคิด: เหตุที่ไม่ขึ้นกับวิธีแบ่ง (ไม่มีช่วงบริการ · ไม่มีงวดให้แบ่ง) มาก่อนเหตุของวิธี — โมดัลบอกได้ก่อนเลือกวิธี', () => {
  assert.equal(splitCoverageByPeriod(null, [row(1)], '').error, COVERAGE_SPLIT_ERRORS.noPeriod);
  assert.equal(splitCoverageByPeriod(PERIOD, [], '').error, COVERAGE_SPLIT_ERRORS.noRows);
  assert.equal(splitCoverageByPeriod(PERIOD, [row(1, { status: 'confirmed', coversFrom: '2026-10-01', coversTo: '2027-09-30' })], '').error,
    COVERAGE_SPLIT_ERRORS.noRows, 'งวดที่รับรองแล้วไม่ถูกแตะ = ไม่ใช่เป้าของการแบ่ง');
  // ยังไม่เลือกวิธี = ตัวคิดตอบ "ไม่ลงตัว" (โมดัลต้องไม่เอาคำนี้ไปโชว์ก่อนเลือก)
  assert.equal(splitCoverageByPeriod(PERIOD, [row(1), row(2)], '').error, COVERAGE_SPLIT_ERRORS.uneven);
  // เลือกแล้วได้ชุดที่ส่งได้ตรง ๆ (id + วัน) — รูปที่ route เทียบ
  const monthly = splitCoverageByPeriod(PERIOD, [row(1), row(2)], 'monthly');
  assert.equal(monthly.error, null);
  assert.deepEqual(monthly.rows.map(({ id, coversFrom, coversTo }) => ({ id, coversFrom, coversTo })), [
    { id: 'I1', coversFrom: '2026-10-01', coversTo: '2027-03-31' },
    { id: 'I2', coversFrom: '2027-04-01', coversTo: '2027-09-30' },
  ]);
  assert.equal(splitCoverageByPeriod(PERIOD, [1, 2, 3, 4, 5].map((n) => row(n)), 'monthly').error, COVERAGE_SPLIT_ERRORS.uneven,
    '12 เดือน / 5 งวด ไม่ลงตัว — โมดัลไม่มีปุ่มใช้');
});

test('id ของช่องงวด = inst-<id>-<field> (หน้าใบโฟกัสด้วยตัวเดียวกัน) · เหตุล็อกของปุ่มแบ่ง = ข้อความชุด A.3', () => {
  assert.equal(serviceSetupFieldId({ installmentId: 'I7', field: 'coverage' }), 'inst-I7-coverage');
  assert.equal(serviceSetupFieldId({ installmentId: 'I7', field: 'dueDate' }), 'inst-I7-dueDate');
  assert.equal(serviceSetupFieldId({ installmentId: 'I7', field: 'billingDate' }), 'inst-I7-billingDate');
  const service = (extra) => ({ id: 'SO', origin: 'pipeline', businessLine: 'SERVICE', ...extra });
  assert.equal(serviceSetupEditError(service({ status: 'draft' }), { canEdit: true }), null);
  assert.equal(serviceSetupEditError(service({ status: 'pending_approval' }), { canEdit: true }), SERVICE_SETUP_EDIT_TEXT.pending);
  assert.equal(serviceSetupEditError(service({ status: 'approved', serviceTermsOpenedAt: '2026-10-01T00:00:00Z' }), { canEdit: true }),
    SERVICE_SETUP_EDIT_TEXT.stamped);
  assert.equal(serviceSetupEditError(service({ status: 'approved', serviceSetupState: 'submitted' }), { canEdit: true }),
    SERVICE_SETUP_EDIT_TEXT.backfillSubmitted);
});

// ── 2. ยามต้นทาง: ทุกไฟล์ ────────────────────────────────────────────────────────────────────────────
test('ทั้งสามไฟล์: ไม่มี fetch ดิบ · ไม่มี style ฝังใหม่ (แผงงวดคงแถบสัดส่วนเงินตัวเดิมตัวเดียว)', () => {
  for (const rel of [PANEL, MODAL, CARD]) {
    assert.doesNotMatch(code(rel), /(^|[^A-Za-z.])fetch\(/, `${rel}: จอเรียก API ผ่าน apiFetch/apiJson เท่านั้น`);
  }
  assert.doesNotMatch(code(MODAL), /style=\{\{/);
  assert.doesNotMatch(code(CARD), /style=\{\{/);
  assert.equal((code(PANEL).match(/style=\{\{/g) || []).length, 1, 'inline style ของแผงมีตัวเดียว (ความกว้างแถบเงิน) — งบโมดูลเต็ม');
  assert.match(code(MODAL), /^"use client";/);
});

// ── 3. โมดัลแบ่งช่วงครอบ ─────────────────────────────────────────────────────────────────────────────
test('โมดัล: พรีวิวจากตัวคิดเดียวกับ route · ไม่มีวิธีตั้งต้น · สองวิธีตามแผน · ส่ง plan ตามที่ตัวคิดคืนเป๊ะ', () => {
  const modal = code(MODAL);
  assert.match(modal, /const \[mode, setMode\] = useState\(null\);/, 'ไม่เลือกให้ (กฎบ้าน)');
  assert.match(modal, /const split = splitCoverageByPeriod\(period, rows, mode \|\| ""\);/);
  assert.match(modal, /\{ value: "monthly", label: "เท่ากันรายเดือน" \}/);
  assert.match(modal, /\{ value: "proportional", label: "ตามสัดส่วนงวด" \}/);
  assert.match(modal, /<Segmented ariaLabel="วิธีแบ่งช่วงครอบ" options=\{COVERAGE_SPLIT_MODES\} value=\{mode\} onChange=\{setMode\} \/>/);
  assert.match(modal, /plan: planned\.map\(\(\{ id, coversFrom, coversTo \}\) => \(\{ id, coversFrom, coversTo, updatedAt: versionOf\(id\) \}\)\),/,
    'ห้ามแต่งวันเอง — route เทียบ id + วันกับชุดที่คิดซ้ำ · พกรุ่นของงวดที่ตาเห็น (ชั้นแรกของ optimistic lock เหมือน schedule-many)');
  assert.match(modal, /const versionOf = \(id\) => rows\.find\(\(row\) => row\?\.id === id\)\?\.updatedAt \|\| "";/);
  assert.match(modal, /await onApply\(\{\s*mode,\s*plan:/);
  // ตารางพรีวิว: งวด | สัดส่วน | ครอบเดิม → ครอบใหม่ · ข้อสังเกตสองข้อ
  assert.match(modal, /<th className=\{styles\.seqCol\}>งวด<\/th>\s*<th className="num">สัดส่วน<\/th>\s*<th>ครอบเดิม → ครอบใหม่<\/th>/);
  assert.match(modal, /<li>แบ่งเป็นเดือนปฏิทิน · แก้รายงวดต่อได้<\/li>/);
  assert.match(modal, /<li>งวดที่บัญชีรับรองแล้วไม่ถูกแตะ<\/li>/);
});

test('โมดัล: แบ่งไม่ลงตัว/ใบแก้ไม่ได้แล้ว = บอกเหตุ + ไม่มีปุ่มใช้ (มีแค่ปิด) · error ของ API ขึ้นในโมดัล', () => {
  const modal = code(MODAL);
  assert.equal((modal.match(/ใช้ช่วงครอบนี้/g) || []).length, 1, 'ปุ่มใช้มีที่เดียว');
  const footer = slice(modal, 'footer={(', '<div className={styles.body}>');
  assert.match(footer, /\{previewError \? \(\s*<Button variant="ghost" onClick=\{onClose\} disabled=\{!!busy\}>ปิด<\/Button>\s*\) : \(/,
    'สาขาที่มีเหตุ = ปุ่มปิดปุ่มเดียว');
  assert.ok(footer.indexOf('ใช้ช่วงครอบนี้') > footer.indexOf(') : ('), 'ปุ่มใช้อยู่ในสาขา "ไม่มีเหตุ" เท่านั้น');
  assert.match(modal, /const previewError = blockedReason\s*\|\| \(mode \|\| \[COVERAGE_SPLIT_ERRORS\.noPeriod, COVERAGE_SPLIT_ERRORS\.noRows\]\.includes\(split\.error\) \? split\.error : null\)/,
    'เหตุของใบมาก่อน · "ไม่ลงตัว" เพราะยังไม่เลือกวิธีไม่ใช่เหตุ');
  assert.match(modal, /\{previewError \? \(\s*<StatusNotice tone="warning">\{previewError\}<\/StatusNotice>/);
  assert.match(modal, /\{error \? <StatusNotice tone="error" role="alert">\{error\}<\/StatusNotice> : null\}/);
  // ด่านรายงวดตัวเดียวกับ route → บอกก่อนกด · ปุ่มดับ
  assert.match(modal, /disabled=\{!!busy \|\| !mode \|\| !!blocker \|\| !planned\.length\}/);
  assert.match(modal, /title=\{!mode \? "เลือกวิธีแบ่งก่อน" : blocker \|\| undefined\}/);
});

// ── 4. แผงงวด ────────────────────────────────────────────────────────────────────────────────────────
test('แผง: ปุ่มแบ่ง — ไม่มีสิทธิ์/ไม่ใช่ใบงานบริการ = ไม่มีปุ่ม · ติดเงื่อนไขของใบ = ดับพร้อมเหตุเป็นตัวหนังสือ', () => {
  const panel = code(PANEL);
  // ตัวตัดสินการโชว์: สิทธิ์ + ใบงานบริการ + มีตัวรับ — ไม่มีเหตุของสถานะใบปนเข้ามา
  const visible = slice(panel, 'const coverageSplitVisible =', ';');
  assert.match(visible, /periodLineShown && !zeroWithoutRows && Boolean\(canEditSetup\) && Boolean\(onFillCoverage\)/);
  assert.doesNotMatch(visible, /EditError|Blocker|periodReady|status/, 'ติดเงื่อนไขต้องโชว์แล้วบอกเหตุ ไม่ใช่ซ่อน');
  assert.match(panel, /const periodLineShown = setupShown && \(periodReady \|\| needsPeriod\);/);
  assert.match(panel, /const setupShown = Boolean\(flow\) && flow !== "none";/);
  assert.match(panel, /const flow = setupFlow === undefined \? serviceSetupFlow\(order, \{ lines: order\?\.lines \}\) : setupFlow;/);
  assert.match(panel, /const period = servicePeriod === undefined \? servicePeriodOf\(order\) : servicePeriod;/);
  // เหตุ: ข้อความล็อกชุดเดียวกับ route (canEdit ผ่านแล้วที่การโชว์) → ไม่มีช่วงบริการ → ไม่มีงวดให้แบ่ง
  assert.match(panel, /: serviceSetupEditError\(order, \{ canEdit: true \}\)\s*\|\| \(!periodReady \? COVERAGE_SPLIT_ERRORS\.noPeriod : ""\)/);
  const button = slice(panel, '{coverageSplitVisible ? (\n            <span className={styles.gatedAction}>', '</span>\n          ) : null}');
  assert.match(button, /disabled=\{!!busy \|\| !!coverageSplitBlocker\} onClick=\{openCoverageSplit\}/);
  assert.match(button, /แบ่งช่วงครอบตามช่วงบริการ…/);
  assert.match(button, /\{coverageSplitBlocker \? <small className=\{styles\.gateNote\} role="status">\{coverageSplitBlocker\}<\/small> : null\}/);
  // canEditSetup ตั้งต้น = canStart (หน้าใบส่ง canEdit = canEditSalesPlanning && inSalesEditScope)
  assert.match(panel, /servicePeriod, setupFlow, highlight = null, onFillCoverage, canEditSetup = canStart, onOpenTab,/);
});

test('แผง: ส่ง mode + plan ให้หน้าใบ · พรีวิวจากงวดชุดที่หน้าใบถือ (ชุดเดียวกับที่ route คิดซ้ำ) · ด่านรายงวด coverage', () => {
  const panel = code(PANEL);
  assert.match(panel, /const done = await onFillCoverage\(\{ mode, plan \}\);\s*if \(done\) setSplitOpen\(false\);/);
  const mount = slice(panel, '<CoverageSplitModal', '/>');
  assert.match(mount, /period=\{period\} rows=\{saved\}/);
  assert.match(mount, /rowGate=\{coverageSplitRowGate\} onApply=\{submitCoverageSplit\} blockedReason=\{coverageSplitBlocker\}/);
  assert.match(mount, /error=\{error\}/, 'error ของ API ขึ้นในโมดัล');
  assert.match(panel, /const coverageSplitRowGate = \(planned\) => gate\(saved\.find\(\(r\) => r\.id === planned\.id\), "coverage", \{/);
  assert.match(panel, /\(splitCoverageByPeriod\(period, saved, "monthly"\)\.error === COVERAGE_SPLIT_ERRORS\.noRows \? COVERAGE_SPLIT_ERRORS\.noRows : ""\)/);
});

test('แผง: บรรทัดช่วงบริการ · ใบยอด 0 · แถบช่วงครอบ (CoverageTimeline import อย่างเดียว)', () => {
  const panel = code(PANEL);
  assert.match(panel, /<>ช่วงบริการ <b>\{periodText\}<\/b> \(ตั้งที่ตารางรายการ\)<\/>/);
  assert.match(panel, /"ใบยอด 0 บาท — ไม่มีงวด · ยังต้องใส่ช่วงบริการ \(TS ใช้วางรอบ\)"/);
  assert.match(panel, /import CoverageTimeline from "\.\/historicalWizard\/CoverageTimeline";/);
  assert.match(panel, /<CoverageTimeline startDate=\{period\.from\} endDate=\{period\.to\} segments=\{timelineSegments\}/);
  // ชนิดท่อนมีแค่สี่ชนิดของตัววาด — ไม่มี "gap"
  assert.doesNotMatch(slice(panel, 'const timelineKind =', ';'), /gap/);
  // ใบสายสินค้า/ใบย้อนหลังไม่เห็นของใหม่: ทุกชิ้นห้อยกับ setupShown
  assert.match(panel, /const timelineRows = setupShown && periodReady && showCoverage && !deadPipeline/);
});

test('แผง: กรอบแดงเฉพาะช่องใน highlight (หลังกดยื่น) · id ของช่อง = serviceSetupFieldId · สามคอลัมน์', () => {
  const panel = code(PANEL);
  assert.match(panel, /serviceSetupFieldId\(\{ installmentId: row\.id, field \}\)/);
  assert.match(panel, /const cellId = \(row, field\) => \(setupShown && row\?\.id && !row\.preview/);
  assert.match(panel, /id && issueOf\(row, field\) \? styles\.cellIssue : ""/, 'แดงเมื่ออยู่ใน highlight เท่านั้น');
  assert.equal((panel.match(/styles\.cellIssue/g) || []).length, 1, 'คลาสแดงมีทางเข้าทางเดียว');
  assert.match(panel, /<td \{\.\.\.cellProps\(row, "billingDate"\)\}>/);
  assert.match(panel, /<td \{\.\.\.cellProps\(row, "dueDate"\)\}>/);
  assert.match(panel, /<td \{\.\.\.cellProps\(row, "coverage", edited \? styles\.coverEdited : ""\)\}>/);
  assert.match(panel, /invalid=\{Boolean\(coverIssue\)\}/);
  // ไม่มีการคิดแดงเองจากข้อมูลงวด — ตัวอ่านเดียวคือ highlight
  assert.match(panel, /return String\(\(highlight instanceof Map \? highlight\.get\(id\) : highlight\[id\]\) \|\| ""\);/);
});

test('แผง (#1846): คำขอ "ไปแก้" จากแผงแดง = เข้าโหมดตั้งวันงวดแล้วเปิด "เติมวันงวดที่ว่าง…" · ตอบหน้าใบทุกครั้งว่าเปิดได้ไหม', () => {
  const panel = code(PANEL);
  assert.match(panel, /servicePeriod, setupFlow, highlight = null, onFillCoverage, canEditSetup = canStart, onOpenTab,\s*dateFillRequest = null, onDateFillRequestDone,/);
  const at = panel.indexOf('if (!dateFillRequest || dateFillSeen.current === dateFillRequest) return;');
  assert.ok(at > panel.indexOf('const dateMode = useInstallmentDateMode({'), 'อ่านโหมดหลังสร้าง');
  const effect = panel.slice(at, panel.indexOf('}, [dateFillRequest]);', at));
  assert.match(effect, /dateFillSeen\.current = dateFillRequest;/, 'คำขอเดียวเปิดครั้งเดียว (StrictMode รัน effect ซ้ำ)');
  // ทางเข้าของ #1846 ตัวเดียว (`openFill` = เข้าโหมด + เปิดแผงเติม · ติดด่าน = toast บอกเหตุเอง) — ไม่ตั้ง state ของโหมดเอง
  // แผงเติมไม่มีงวดให้เติม = ไม่เปิดแผงที่บอก "ไม่มีงวดที่ว่าง" — ตอบเปิดไม่ได้ ให้หน้าใบไปที่ช่อง (ตัวเลือกงวดตัวเดียวกับแผงเติม)
  // คำขอพา "จัดใหม่งวดที่มีวันแล้วด้วย" มาด้วย (backfill ลูกค้าเครดิต: งวดมีกำหนดชำระแล้วขาดวันวางบิล) — ตรวจเป้าด้วยสวิตช์เดียวกับที่จะเปิด
  // (true จริงเท่านั้น · ไม่ส่ง = ค่าตั้งต้นเดิม) แล้วส่งต่อเข้า `openFill` ตัวเดียว
  assert.match(effect, /const includeDated = dateFillRequest\.includeDated === true;/);
  assert.match(effect, /const fillable = fillTargetsOf\(mode\.fillKind, fillInputRows\(mode\.rows, mode\.current, mode\.isLocked\), \{ includeDated \}\)\.length > 0;/);
  assert.match(effect, /const opened = fillable && mode\.available && !mode\.busy && !mode\.blocker;/);
  assert.match(effect, /if \(fillable && !mode\.fill\) mode\.openFill\(\{ includeDated \}\);/, 'แผงเติมเปิดอยู่แล้ว = ไม่ตั้งต้นตัวเลือกที่กำลังเลือกทิ้ง');
  assert.match(effect, /dateFillDoneRef\.current\?\.\(opened\);/);
  assert.doesNotMatch(effect, /setActive|setFill|enter\(/);
});

// ── 5. การ์ดสัญญา (D21) ─────────────────────────────────────────────────────────────────────────────
test('การ์ดสัญญา: การ์ดกรอกรอบเหลือเฉพาะใบย้อนหลัง · ใบ pipeline ได้บรรทัดบอกทาง + ช่วงบริการ + สถานะผูก + เตือนช่วงไม่ตรง', () => {
  const card = code(CARD);
  assert.match(card, /const showRoundsCard = historical && roundLines\.length > 0;/);
  assert.match(card, /\{showRoundsCard && \(\s*<DetailCard icon=\{Repeat\} title="จำนวนรอบบริการที่ขายไว้">/);
  assert.doesNotMatch(card, /\{roundLines\.length > 0 && \(/, 'เงื่อนไขเดิม (ทุกใบ) ต้องไม่กลับมา');
  assert.match(card, /serviceRoundLines\(order\?\.lines, order\)/, 'กฎ 17: ส่ง order เสมอ');
  assert.match(card, /<span>จำนวนรอบอยู่ที่ตารางรายการ แท็บภาพรวม<\/span>/);
  assert.match(card, /<span className="form-field-label">ช่วงบริการตามใบ<\/span>/);
  assert.match(card, /<span>ยังไม่ผูก — TS วางรอบได้ แต่นัดบริการติดด่านสัญญาจนกว่าจะผูก<\/span>/);
  assert.match(card, /" ไม่ตรงกับช่วงบริการของใบ — นัดนอกช่วงสัญญาจะติดด่าน"/);
  assert.match(card, /const periodMismatch = !historical && Boolean\(linked\) && periodReady\s*&& \(linked\.effectiveDate !== servicePeriod\.from \|\| linked\.expiryDate !== servicePeriod\.to\);/);
  assert.match(card, /const servicePeriod = period === undefined \? servicePeriodOf\(order\) : period;/);
  // สามบรรทัดใหม่ไม่ขึ้นกับใบย้อนหลัง
  assert.match(card, /\{historical \? null : \(\s*<div className="form-grid cols-2">/);
});
