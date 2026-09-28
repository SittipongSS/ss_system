// ── หน้าใบสั่งขาย × งานบริการรายบรรทัด (U9 · mig 0391 · PR-A · แผน §2.10) — ยามซอร์สของการต่อสาย ───────────────
//
// หน้าใบยาว ~2,400 บรรทัด และเป็น JSX ที่รันใต้ node ไม่ได้ ⇒ ยามอ่านซอร์ส (ตัดคอมเมนต์ก่อน) ว่าสายสำคัญยังต่ออยู่:
//   · แถบ/การ์ดงานบริการย้อนหลังขึ้นเฉพาะขั้น 'backfill' ของก้อน GET หรือ "รอผู้จัดการตรวจ" (D25/D28)
//   · ยื่นตรวจงานบริการผ่านโมดัล `approvalPrompt(` ก่อนยิง `submit` (D12 — ถอนเองไม่ได้ต้องบอกก่อนกด)
//   · อนุมัติงานบริการส่ง `overrideReason` เฉพาะเมื่อ server บอกว่าต้องใช้ (`needsOverrideReason`)
//   · แผงแดงขึ้นเมื่อมี `submitIssues` เท่านั้น (กฎ 3: ไม่มีแดงก่อนกด)
//   · ไม่มีป้าย/ข้อความของสายย้อนหลังที่พูดว่า "นับ Actual" (ใบนับไปแล้ว — การตั้งย้อนหลังไม่แตะยอด)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ก่อน — คำอธิบายในคอมเมนต์ต้องไม่ทำให้ยามเขียว/แดงผิด */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const page = code(PAGE);

/** ข้อความตั้งแต่ `from` ถึง `to` ตัวแรกหลังจากนั้น (ไม่รวม `to`) — หาไม่เจอ = ยามพัง ไม่ใช่ผ่านเงียบ */
function slice(src, from, to) {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอในหน้าใบ — ชื่อ/ขอบเขตเปลี่ยนแล้ว อัปเดตยามนี้ด้วย`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return src.slice(start, end);
}
const count = (src, re) => (src.match(re) || []).length;

test('โหลดก้อนงานบริการเฉพาะใบที่ต้องตั้ง · ยามออกจากหน้าเห็นร่างงานบริการด้วย', () => {
  assert.match(page, /const setupRequired = serviceSetupRequired\(order\);/);
  assert.match(page, /const setup = useServiceSetup\(order\?\.id, \{ enabled: setupRequired, customerId: order\?\.customerId \|\| null \}\);/);
  /* ร่างของหน้า + ร่างวันงวด (#1846 datesDirty) + ร่างงานบริการ — ยามตัวเดียวต้องเห็นร่างงานบริการด้วย */
  assert.match(page, /useUnsavedChanges\([^)]*\bsetup\.dirty\b[^)]*\);/);
  assert.equal(count(page, /useUnsavedChanges\(/g), 1, 'ยามออกจากหน้ามีตัวเดียว');
});

test('D25/D28: แถบและการ์ดงานบริการย้อนหลังขึ้นเฉพาะขั้น backfill หรือรอผู้จัดการตรวจ', () => {
  assert.match(page, /const setupView = setupRequired \? setup\.data : null;/);
  assert.match(page, /const setupFlow = setupView\?\.flow \|\| null;/);
  assert.match(page, /const backfillAwaiting = serviceBackfillAwaitingReview\(order\);/);
  assert.match(page, /const showBackfillPanel = setupFlow === "backfill" \|\| backfillAwaiting;/);

  assert.equal(count(page, /<ServiceBackfillBanner\b/g), 1);
  assert.match(page, /\{setupFlow === "backfill" \? <ServiceBackfillBanner setup=\{setup\} \/> : null\}/);
  assert.equal(count(page, /<ServiceBackfillRailCard\b/g), 1);
  assert.match(page, /\{showBackfillPanel \? \(\s*<ServiceBackfillRailCard/);

  /* ตัวตัดสินตัวเดียว — ห้ามอ่านสถานะดิบเอง (ค่า 'submitted' ค้างบนใบที่ย้อน/ยกเลิก/ถูก Rev. ทับต้องไม่มีผล) */
  assert.doesNotMatch(page, /serviceSetupState/);
  /* ป้ายหัวใบ "งานบริการรอผู้จัดการตรวจ" ใช้ตัวตัดสินเดียวกัน */
  assert.match(page, /\{backfillAwaiting && <StatusBadge size="sm" tone="warning" label="งานบริการรอผู้จัดการตรวจ" \/>\}/);
});

test('แถบสรุปของผู้อนุมัติ: ผู้ตรวจ + (ใบรออนุมัติ หรือ งานบริการรอตรวจ)', () => {
  assert.match(page,
    /const showSetupStrip = setupRequired && reviewer && \(order\.status === "pending_approval" \|\| backfillAwaiting\);/);
  assert.equal(count(page, /<ServiceSetupStrip\b/g), 1);
  assert.match(page, /\{showSetupStrip \? <ServiceSetupStrip setup=\{setup\} \/> : null\}/);
});

test('กฎ 3: แผงแดงขึ้นเมื่อมี submitIssues เท่านั้น · ป้ายแดงบนแท็บก็เช่นกัน', () => {
  assert.equal(count(page, /<SubmitGateNotice\b/g), 1);
  assert.match(page, /\{submitIssues \? \(\s*<div ref=\{submitGateRef\} className=\{styles\.submitGate\}>\s*<SubmitGateNotice/);
  assert.match(page, /const tabIssueCounts = submitIssues \? issuesByTab\(submitIssues\.issues\) : null;/);
  /* ป้ายแดงของแท็บมาจากจำนวนข้อหลังกดเท่านั้น · "ครบ x/n" ก่อนกดเป็นกลาง */
  for (const badge of page.match(/<CountBadge[^>]*>/g) || []) {
    assert.match(badge, /count=\{tabIssueCounts\.(overview|payment)\}/, `ป้ายนับที่ไม่ได้มาจากข้อหลังกด: ${badge}`);
    assert.match(badge, /tone="danger"/);
  }
  assert.match(page, /const setupTabProgress = !submitIssues && setupView\?\.mode === "edit" && setupServiceLines > 0/);
  /* ช่องแดงของตาราง/แผงงวด: Map เดียวที่ memo ตามข้อหลังกด (ตัวตนใหม่ = ตารางลืมว่าแก้ช่องไหนไปแล้ว) */
  assert.match(page, /const serviceHighlight = useMemo\(\(\) => \{\s*if \(!submitIssues\?\.issues\?\.length\) return NO_HIGHLIGHT;/);
  const memo = slice(page, 'const serviceHighlight = useMemo(() => {', '\n  const showSubmitIssues');
  assert.match(memo, /return map;\s*\}, \[submitIssues\]\);\s*$/, 'memo ตามข้อหลังกดตัวเดียว');
  assert.equal(count(page, /highlight=\{serviceHighlight\}/g), 2, 'ตารางรายการ + แผงงวดใช้ Map ตัวเดียวกัน');
});

test('ยื่นอนุมัติ (pipeline): ยังไม่บันทึก = ข้อเดียว · ก้อนสดมีข้อ = แผงแดงไม่เปิดโมดัล · 400 issues = ปิดโมดัลแล้ววาดแผง', () => {
  const gate = slice(page, 'async function serviceGateBeforeSubmit(flow) {', '\n  }\n');
  assert.ok(gate.indexOf('if (setup.dirty)') >= 0 && gate.indexOf('if (setup.dirty)') < gate.indexOf('freshServiceView()'),
    'ต้องเช็คร่างที่ยังไม่บันทึกก่อนโหลดก้อนสด');
  assert.match(gate, /showSubmitIssues\(serviceSetupIssues\(\{ unsaved: true \}\), \[\], flow\);/);
  assert.match(gate, /if \(Array\.isArray\(fresh\.issues\) && fresh\.issues\.length\) \{\s*showSubmitIssues\(fresh\.issues, fresh\.warnings, flow\);\s*return null;/);
  assert.doesNotMatch(gate, /setConfirmState/, 'ด่านไม่เปิดโมดัลเอง');

  const press = slice(page, 'async function pressSubmit() {', '\n  }\n');
  assert.match(press, /if \(!setupRequired\) \{\s*submitLineRef\.current = null;\s*submitWarningsRef\.current = \[\];\s*openSubmitConfirm\(\);/);
  assert.match(press, /const fresh = await serviceGateBeforeSubmit\("pipeline"\);\s*if \(!fresh\) return;\s*submitLineRef\.current = fresh\.submitLine \|\| null;\s*submitWarningsRef\.current = saWarningLines\(fresh\.warnings\);\s*openSubmitConfirm\(\);/);
  /* โมดัลยืนยันเติมบรรทัดงานบริการจากก้อนสด แล้วล้าง ref ทิ้ง (กดครั้งหน้าไม่พาบรรทัดเก่ามา) */
  const confirm = slice(page, 'function openSubmitConfirm() {', '\n  }\n');
  assert.match(confirm, /const submitLine = submitLineRef\.current;\s*submitLineRef\.current = null;/);
  assert.match(confirm, /submitLine,\s*\.\.\.warningLines,\s*\]\.filter\(Boolean\)\.join\("\\n"\)/);
  assert.match(page, /onClick: pressSubmit,/);

  const request = slice(page, 'async function requestAction(action, payload = {}) {', '\n  async function save()');
  assert.match(request, /if \(issues && action === "submit"\) \{\s*setConfirmState\(null\);\s*setError\(""\);\s*showSubmitIssues\(issues, data\.warnings, "pipeline"\);/);
  assert.match(request, /if \(action === "submit"\) setSubmitIssues\(null\);/, 'ยื่นผ่าน = ล้างแผงแดง');
});

test('อนุมัติ (pipeline): โมดัลบอกผลงานบริการจากก้อนสด · 409 issues เป็นข้อความในโมดัล · ทักจำนวนโซนที่เปิด', () => {
  const approve = slice(page, 'if (action === "approve") {', '\n      return;');
  assert.match(approve, /const service = setupRequired \? await freshServiceView\(\) : null;/);
  assert.match(approve, /checklist: service\?\.approvalChecklist \|\| \[\],/);
  assert.match(approve, /\.\.\.salesOrderMoneyOutcome\(order, installments, "approve"[^\n]*\n[\s\S]*?\.\.\.\(service\?\.approvalEffects \|\| \[\]\),/,
    'ผลของงานบริการอยู่หลังผลเรื่องเงิน');
  assert.match(page, /issuesErrorText\(data\.error \|\| "อัปเดตใบสั่งขายไม่สำเร็จ", issues\)/);
  assert.match(page, /messages\.slice\(0, 3\)\.join\(" · "\)/);
  assert.match(page, /`อนุมัติแล้ว · เปิดงานบริการ \$\{fmtNumber\(Number\(data\.termsOpened\)\)\} โซนให้ TS`/);
});

test('D12: ยื่นตรวจงานบริการย้อนหลังผ่าน approvalPrompt ก่อนยิง submit · ด่านเดียวกับยื่นอนุมัติ', () => {
  const press = slice(page, 'async function pressBackfillSubmit() {', '\n  }\n');
  const gateAt = press.indexOf('serviceGateBeforeSubmit("backfill")');
  const promptAt = press.indexOf('approvalPrompt(');
  const submitAt = press.indexOf('runServiceBackfill("submit", {}, version)');
  assert.ok(gateAt >= 0 && promptAt > gateAt && submitAt > promptAt,
    'ลำดับต้องเป็น ด่านก้อนสด → โมดัล approvalPrompt → ยิง submit');
  assert.match(press, /approvalPrompt\(\{\s*\.\.\.fresh\.backfillSubmitPrompt,\s*checklist: [^\n]*\n\s*verb: "ยื่นตรวจ",\s*\}\)/);
  assert.match(press, /showsError: true,/);
  assert.match(press, /setError\(""\);/);

  /* F6: เวอร์ชันที่ยิง = เวอร์ชันของก้อนสดที่โมดัลโชว์ (closure ของการกดยังเห็นก้อนก่อนโหลดสด ⇒ 409 ทุกรอบที่กดซ้ำ) */
  assert.match(press, /const version = fresh\.updatedAt \?\? null;/);
  const run = slice(page, 'async function runServiceBackfill(action, extra = {}, expectedUpdatedAt = setup.data?.updatedAt ?? null) {', '\n  }\n');
  assert.match(run, /apiJson\(`\/api\/sales-planning\/sales-orders\/\$\{id\}\/service-setup`/);
  assert.match(run, /method: "POST",/);
  /* เวลาของใบไปตามตัวอักษร (ผ่าน Date = ไมโครวินาทีหาย ⇒ 409 ทุกครั้ง) */
  assert.match(run, /json: \{ action, expectedUpdatedAt, \.\.\.extra \},/);
  /* ใบขยับระหว่างเปิดโมดัล (409 ไม่มี issues) = ปิดโมดัล — กดใหม่ได้โมดัลของก้อนสด (ไม่ส่งเวอร์ชันเดิมซ้ำจน 409 ทุกครั้ง) */
  assert.match(run, /if \(failure\?\.status === 409 && !issues\) setConfirmState\(null\);/);
  assert.doesNotMatch(run, /retry/);
  assert.doesNotMatch(run, /new Date\(/);
  assert.match(run, /if \(issues && action === "submit"\) \{\s*setConfirmState\(null\);\s*showSubmitIssues\(issues, failure\.data\.warnings, "backfill"\);/);
});

test('D12: อนุมัติงานบริการส่ง overrideReason เฉพาะเมื่อ server บอกว่าต้องใช้', () => {
  const approve = slice(page, 'async function openBackfillApprove() {', '\n  }\n');
  assert.match(approve, /if \(!fresh\.backfill\?\.canReview\)/);
  assert.match(approve, /const needsOverrideReason = !!fresh\.backfill\.needsOverrideReason;/);
  assert.match(approve, /title: "อนุมัติงานบริการของใบสั่งขาย",/);
  assert.match(approve, /subject: fresh\.approvalSubject,/);
  assert.match(approve, /checklist: fresh\.approvalChecklist,/);
  assert.match(approve, /effects: fresh\.approvalEffects,/);
  assert.match(approve, /confirmLabel: "อนุมัติงานบริการ",/);
  assert.match(approve, /overrideReason: needsOverrideReason,/);
  assert.match(approve, /runServiceBackfill\("approve", needsOverrideReason \? \{ overrideReason: overrideReasonRef\.current \} : \{\}, version\)/);
  assert.match(approve, /const version = fresh\.updatedAt \?\? null;/);
  /* F15: คำถามพูดถึงงานบริการของใบ ไม่ใช่ "อนุมัติ SO-…" (ใบอนุมัติไปแล้ว) · ช่องเหตุผลพูดถึงงานบริการที่ตัวเองยื่น */
  assert.match(approve, /verb: "อนุมัติงานบริการของ",/);
  assert.match(approve, /overridePlaceholder: "เหตุผลที่อนุมัติงานบริการที่ตัวเองยื่น",/);
  assert.match(page, /placeholder=\{confirmState\?\.overridePlaceholder \|\| "บันทึกไว้กับใบว่าทำไมต้องอนุมัติใบของตัวเอง"\}/);
  assert.match(approve, /setOverrideReason\(""\);\s*overrideReasonRef\.current = "";/, 'เปิดโมดัลใหม่ล้างเหตุผลเก่า');
  /* ติดด่านอยู่แล้ว = บอกเหตุตั้งแต่เปิดโมดัล (ข้อความเดียวกับ 409 ของ route) */
  assert.match(approve, /if \(fresh\.issues\?\.length\) setError\(issuesErrorText\(serviceApproveBlockedText\(fresh\.issues\.length\), fresh\.issues\)\);/);
  assert.match(page, /`อนุมัติไม่ได้ — งานบริการยังขาด \$\{fmtNumber\(n\)\} ข้อ · ตีกลับให้ฝ่ายขายแก้`/);
  /* ช่องเหตุผลในโมดัลบอกว่าบังคับเมื่อเป็นงานบริการย้อนหลัง */
  assert.match(page, /confirmState\?\.overrideRequired \? "เหตุผลของ Admin Override \(บังคับ 10–500 ตัวอักษร\)"/);
});

test('ตีกลับงานบริการ: ReasonDialog ของตัวเอง 10–500 ตัวอักษร · ข้อความตามภาคผนวก A.5', () => {
  const dialog = slice(page, '<ReasonDialog\n        open={!!serviceRejectForm}', '\n      />');
  assert.match(dialog, /title="ตีกลับให้แก้ไข"/);
  assert.match(dialog, /`\$\{order\.orderNumber\} · ส่งกลับให้ \$\{setupView\?\.state\?\.submittedByName \|\| "ผู้ยื่น"\}`/);
  assert.match(dialog, /"งานบริการกลับเป็นแก้ไขได้ — ฝ่ายขายแก้แล้วยื่นตรวจใหม่"/);
  assert.match(dialog, /"ยังไม่เปิดงานให้ TS · ใบยังอนุมัติแล้ว · Actual เท่าเดิม"/);
  assert.match(dialog, /label="เหตุผลที่ตีกลับ"/);
  assert.match(dialog, /helpText="ฝ่ายขายเห็นเหตุผลนี้บนแถบของใบตอนเปิดแก้"/);
  assert.match(dialog, /confirmLabel="ยืนยันตีกลับ"/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /maxLength=\{500\}/);
  assert.match(dialog, /submitError=\{error\}/);
  assert.match(page, /const ok = await runServiceBackfill\("reject", \{ reason \}\);/);
});

test('ไม่มีป้าย/ข้อความของสายย้อนหลังที่พูดว่า "นับ Actual"', () => {
  const backfill = [
    slice(page, 'const SERVICE_BACKFILL_TOAST = {', '\n};'),
    slice(page, 'async function runServiceBackfill(action, extra = {}, expectedUpdatedAt = setup.data?.updatedAt ?? null) {', '\n  }\n'),
    slice(page, 'async function pressBackfillSubmit() {', '\n  }\n'),
    slice(page, 'async function openBackfillApprove() {', '\n  }\n'),
    slice(page, '<ReasonDialog\n        open={!!serviceRejectForm}', '\n      />'),
  ].join('\n');
  assert.doesNotMatch(backfill, /นับ Actual/);
  assert.doesNotMatch(backfill, /นับเป็น Actual/);
  /* ข้อความทักตามภาคผนวก A.5 */
  assert.match(page, /submit: \(\) => "ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ",/);
  assert.match(page, /approve: \(data\) => `อนุมัติงานบริการแล้ว · เปิด \$\{fmtNumber\(Number\(data\?\.termsOpened\) \|\| 0\)\} โซนให้ TS`,/);
  assert.match(page, /reject: \(\) => "ตีกลับงานบริการแล้ว",/);
  /* หมายเหตุใต้หัวใบ: ยอดนับไปแล้ว การตั้งย้อนหลังไม่เปลี่ยน */
  assert.match(page, /`ยอดถูกนับเป็น Actual แล้ว \(อนุมัติ \$\{fmtDate\(order\.approvedAt\)\}\) — การตั้งงานบริการย้อนหลังไม่เปลี่ยนยอดนี้`/);
});

test('การ์ดรายการ: ใบที่ต้องตั้งใช้การ์ดทั้งใบของ SalesOrderServiceLines · ใบอื่นเหมือนเดิม · ลิงก์ #service-setup', () => {
  assert.match(page, /\{setupRequired && !historical \? \(\s*<SalesOrderServiceLines\s/);
  const lines = slice(page, '<SalesOrderServiceLines', '\n            />');
  assert.match(lines, /setup=\{setup\}/);
  assert.match(lines, /mode=\{setup\.data\?\.mode\}/);
  assert.match(lines, /onSaved=\{afterServiceSaved\}/);
  assert.match(lines, /onRoundsSave=\{setServiceRounds\}/);
  assert.match(lines, /canEditRounds=\{canEditServiceRounds\}/);
  assert.match(page, /const canEditServiceRounds = canEdit && !serviceRoundsEditError\(order, \{ canEdit \}\);/);
  /* ดินสอรอบปิดตัวแก้เมื่อสำเร็จเท่านั้น ⇒ ต้องคืน boolean */
  assert.match(page, /const ok = !!\(await requestAction\("set_service_rounds", \{ serviceRounds: map \}\)\);[\s\S]{0,80}return ok;/);
  /* การ์ดเดิมของใบสินค้า/ย้อนหลังยังเป็น QuotationReadOnlyLineItems และมี id ให้ลิงก์ hash เหมือนกัน */
  assert.match(page, /<DetailCard id="service-setup" icon=\{Package\} eyebrow="ORDER LINES"/);
  assert.match(page, /window\.location\.hash !== "#service-setup"/);
});

test('แผงงวด: ช่วงบริการ · ขั้น · แบ่งช่วงครอบ PATCH fill-coverage ไม่ลองซ้ำ · การ์ดสัญญาได้ช่วงบริการ', () => {
  const fill = slice(page, 'async function runFillCoverage({ mode, plan }) {', '\n  }\n');
  assert.match(fill, /method: "PATCH",\s*json: \{ action: "fill-coverage", mode, plan \},/);
  assert.doesNotMatch(fill, /retry/);
  /* 409 ท่าเดียวกับ schedule-many: วางงวดสดที่พกมา → รอใบสด (ปุ่มยังดับจนจอตรง server) · ลงไปแล้วบางงวด = ข้อที่ยังขาดเปลี่ยน */
  assert.match(fill, /if \(res\.status === 409\) \{\s*if \(Array\.isArray\(data\.installments\)\) setOrder\(\(current\) => \(\{ \.\.\.current, installments: data\.installments \}\)\);\s*await refreshOrder\(\);\s*if \(Number\(data\.filled\) > 0\) refreshServiceSetup\(\);\s*\}/);
  const many = slice(page, 'async function runInstallmentScheduleMany({ rows }) {', '\n  }\n');
  assert.match(many, /await refreshOrder\(\);\s*if \(Number\(data\.saved\) > 0\) refreshServiceSetup\(\);/,
    'schedule-many หยุดกลางทาง = บางงวดลงแล้ว ⇒ ก้อนงานบริการตามด้วย');
  assert.match(fill, /return false;[\s\S]*return true;/);
  assert.match(page, /onFillCoverage=\{runFillCoverage\}/);
  assert.match(page, /servicePeriod=\{setupView \? setupView\.period : undefined\}/);
  assert.match(page, /setupFlow=\{setupView \? setupView\.flow : undefined\}/);
  assert.match(page, /period=\{setupView \? setupView\.period : undefined\}/);
});

test('"ไปแก้": สลับแท็บแล้วพาไปที่ช่องด้วย id ของ serviceSetupFieldId', () => {
  const jump = slice(page, 'const jumpToIssue = async (issue) => {', '\n  };');
  /* สลับแท็บถามก่อนได้ (ร่างวันงวดค้าง · #1846) ⇒ รอคำตอบ · ไม่ได้สลับ = ไม่พาไปที่ช่อง */
  assert.match(jump, /!\(await selectTab\(issue\.tab\)\)\) return;/);
  assert.match(jump, /revealServiceSetupField\(serviceSetupFieldId\(issue\)\)/);
  assert.match(page, /onJump=\{jumpToIssue\}/);
});

test('#1846: "ไปแก้" ของข้อวันงวดที่รวมหลายงวด = ขอให้แผงงวดเปิด "เติมวันงวดที่ว่าง…" · เปิดไม่ได้ = ถอยไปโฟกัสช่องของงวดแรก', () => {
  const jump = slice(page, 'const jumpToIssue = async (issue) => {', '\n  };');
  /* แผงงวดอยู่แท็บการชำระ ⇒ สลับแท็บก่อน (ถามก่อนได้) แล้วค่อยขอ · ขอแล้วไม่โฟกัสเซลล์ซ้อน (แผงเติมโฟกัสหัวของมันเอง) */
  assert.match(jump, /if \(issue\.dateFill\) \{\s*setDateFillAsk\(\{ issue \}\);\s*return;\s*\}/);
  assert.ok(jump.indexOf('await selectTab(issue.tab)') < jump.indexOf('issue.dateFill'), 'สลับแท็บก่อนขอ');
  assert.ok(jump.indexOf('issue.dateFill') < jump.indexOf('revealServiceSetupField('), 'ข้ออื่นยังไปที่ช่องเหมือนเดิม');
  /* คำขอเป็น state (ไม่ใช่ ref/อีเวนต์) — แผงเพิ่งเมานต์จากการสลับแท็บยังได้รับ · ประกาศก่อน early return ของหน้า (กฎของ hook) */
  assert.ok(page.indexOf('const [dateFillAsk, setDateFillAsk] = useState(null);') >= 0);
  assert.ok(page.indexOf('const [dateFillAsk, setDateFillAsk] = useState(null);') < page.indexOf('if (!order) {\n    return <Workspace'));
  const done = slice(page, 'const dateFillDone = (opened) => {', '\n  };');
  assert.match(done, /setDateFillAsk\(null\);/, 'ตอบแล้วล้างคำขอ — กลับมาแท็บการชำระอีกครั้งไม่เปิดซ้ำ');
  assert.match(done, /if \(!opened && ask\?\.issue\) revealServiceSetupField\(serviceSetupFieldId\(ask\.issue\)\);/);
  const panel = slice(page, '<SalesOrderPaymentPanel', '/>\n');
  assert.match(panel, /dateFillRequest=\{dateFillAsk\}/);
  assert.match(panel, /onDateFillRequestDone=\{dateFillDone\}/);
});

test('ก้อนงานบริการตามเวอร์ชันของใบ — ยิงซ้ำไม่เกินครั้งเดียวต่อเวอร์ชัน (กันวน)', () => {
  assert.match(page, /if \(setup\.data\.updatedAt === order\.updatedAt \|\| setupSyncedFor\.current === order\.updatedAt\) return;\s*setupSyncedFor\.current = order\.updatedAt;/);
  /* บันทึกงานบริการ: ก้อน GET ก่อน แล้วค่อยตัวใบ */
  assert.match(page, /const afterServiceSaved = async \(\) => \{\s*await setup\.reload\(\);\s*await refreshOrder\(\);/);
});

test('หน้าใบไม่มี fetch ดิบ และไม่มี inline style ใหม่ในส่วนงานบริการ', () => {
  assert.doesNotMatch(page, /(^|[^.\w])fetch\(/m);
  const service = [
    slice(page, '{setupFlow === "backfill" ? <ServiceBackfillBanner', '<Tabs'),
    slice(page, '{setupRequired && !historical ? (', ') : ('),
    slice(page, '{showBackfillPanel ? (', ') : null}'),
    slice(page, '<ReasonDialog\n        open={!!serviceRejectForm}', '\n      />'),
  ].join('\n');
  assert.doesNotMatch(service, /style=\{\{/);
});

test('F14: คำเตือนของฝ่ายขาย (ครอบซ้อน) ขึ้นในโมดัลยืนยันเมื่อยื่นผ่าน — ไม่หายเงียบ · คำเตือนของบัญชีไม่ใส่ (แผงงวดบอกแล้ว)', () => {
  assert.match(page, /const saWarningLines = \(warnings\) => \(Array\.isArray\(warnings\) \? warnings : \[\]\)\s*\.filter\(\(w\) => w\?\.owner === "SA" && w\?\.message\)/);
  const press = slice(page, 'async function pressSubmit() {', '\n  }\n');
  assert.match(press, /submitWarningsRef\.current = saWarningLines\(fresh\.warnings\);/);
  const confirm = slice(page, 'function openSubmitConfirm() {', '\n  }\n');
  assert.match(confirm, /const warningLines = submitWarningsRef\.current;\s*submitWarningsRef\.current = \[\];/);
  assert.match(confirm, /submitLine,\s*\.\.\.warningLines,/);
  const backfill = slice(page, 'async function pressBackfillSubmit() {', '\n  }\n');
  assert.match(backfill, /checklist: \[\.\.\.\(fresh\.backfillSubmitPrompt\.checklist \|\| \[\]\), \.\.\.saWarningLines\(fresh\.warnings\)\]/);
});
