// ── หน้าใบสั่งขาย × งานบริการรายบรรทัด (U9 · mig 0392 · PR-A · แผน §2.10) — ยามซอร์สของการต่อสาย ───────────────
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
import { SERVICE_REOPEN_TEXT, SERVICE_REOPENED_TEXT, serviceSetupApprovalChecklist, serviceSetupWarnings } from './serviceSetup.js';

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
  assert.match(page, /const backfillRail = showBackfillPanel \? \(\s*<ServiceBackfillRailCard/);

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
  assert.match(gate, /showSubmitIssues\(serviceSetupIssues\(\{ unsaved: true \}\), \[\], flow, "client"\);/);
  assert.match(gate, /if \(Array\.isArray\(fresh\.issues\) && fresh\.issues\.length\) \{\s*showSubmitIssues\(fresh\.issues, fresh\.warnings, flow, "server"\);\s*return null;/);
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
  assert.match(request, /if \(issues && action === "submit"\) \{\s*setConfirmState\(null\);\s*setError\(""\);\s*showSubmitIssues\(issues, data\.warnings, "pipeline", "server"\);/);
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
  assert.match(run, /if \(issues && action === "submit"\) \{\s*setConfirmState\(null\);\s*showSubmitIssues\(issues, failure\.data\.warnings, "backfill", "server"\);/);
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
  /* กลุ่มที่แตะได้ด้วย "จัดใหม่งวดที่มีวันแล้วด้วย" เท่านั้น (`dateFill: 'dated'` — backfill ลูกค้าเครดิต) = ขอเปิดแผงพร้อมสวิตช์นั้น */
  assert.match(jump, /if \(issue\.dateFill\) \{\s*setDateFillAsk\(\{ issue, includeDated: issue\.dateFill === 'dated' \}\);\s*return;\s*\}/);
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
  /* บันทึกงานบริการ: ก้อน GET ก่อน แล้วค่อยตัวใบ (บรรทัดแรกล้างแผง "ยังไม่บันทึก" — UAT 29/09 ข้อ 1) */
  assert.match(page, /const afterServiceSaved = async \(\) => \{\s*setSubmitIssues\(\(current\) => submitIssuesAfterSave\(current\)\);\s*await setup\.reload\(\);\s*await refreshOrder\(\);/);
});

test('หน้าใบไม่มี fetch ดิบ และไม่มี inline style ใหม่ในส่วนงานบริการ', () => {
  assert.doesNotMatch(page, /(^|[^.\w])fetch\(/m);
  const service = [
    slice(page, '{setupFlow === "backfill" ? <ServiceBackfillBanner', '<Tabs'),
    slice(page, '{setupRequired && !historical ? (', ') : ('),
    slice(page, 'const backfillRail = showBackfillPanel ? (', ') : null;'),
    slice(page, '<ReasonDialog\n        open={!!serviceRejectForm}', '\n      />'),
    slice(page, '<ReasonDialog\n        open={!!serviceReopenForm}', '\n      />'),
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

test('UAT 29/09 ข้อ 1: แผงแดงพกที่มา (client/server) · การ์ดรางแดงจากด่านของ server เท่านั้น · บันทึกสำเร็จล้างแผง "ยังไม่บันทึก"', () => {
  assert.match(page, /const showSubmitIssues = \(issues, warnings, flow, source\) => setSubmitIssues\(\{[^}]*\n\s*source,\n[^}]*\}\);/);
  /* ทุกที่ที่วาดแผงบอกที่มาตรง ๆ — ลืมบอก = การ์ดรางไม่แดง (ปลอดภัยไว้ก่อน) แต่ยามนี้จับได้ */
  const calls = page.match(/showSubmitIssues\([^;]*\);/g) || [];
  assert.equal(calls.length, 4, calls.join('\n'));
  for (const call of calls) assert.match(call, /, "(client|server)"\);$/, call);
  const gate = slice(page, 'async function serviceGateBeforeSubmit(flow) {', '\n  }\n');
  assert.match(gate, /showSubmitIssues\(serviceSetupIssues\(\{ unsaved: true \}\), \[\], flow, "client"\);/,
    'ด่าน "ยังไม่บันทึก" เป็นของจอ — ยังไม่ได้ถาม server');
  /* การ์ดรางแดงจากตัวตัดสินกลาง (flow backfill + ที่มา server) — ไม่ใช่แค่ flow แบบเดิม */
  assert.match(page, /pressed=\{backfillRailPressed\(submitIssues\)\}/);
  assert.doesNotMatch(page, /pressed=\{submitIssues\?\.flow/);
  /* บันทึกสำเร็จ = แผงที่มีแต่ "ยังไม่บันทึก" หมดความหมาย — ไม่ต้องรอกดยื่นอีกครั้ง */
  const saved = slice(page, 'const afterServiceSaved = async () => {', '\n  };');
  assert.match(saved, /setSubmitIssues\(\(current\) => submitIssuesAfterSave\(current\)\);/);
});

test('UAT 29/09 ข้อ 3 (มติเจ้าของ): การ์ดราง "งานบริการ (ใบเดิม)" บนสุดของรางขวาระหว่างยังไม่ยื่นตรวจ · ยื่นแล้วกลับใต้การ์ดจัดการเอกสาร', () => {
  assert.match(page, /const backfillRailFirst = backfillRailOnTop\(setupView\);/);
  assert.equal(count(page, /<ServiceBackfillRailCard\b/g), 1, 'การ์ดตัวเดียว — วางได้สองที่ตามขั้น');
  const aside = slice(page, 'aside={<>', '<Tabs');
  const top = aside.indexOf('{backfillRailFirst ? backfillRail : null}');
  const summary = aside.indexOf('<DocumentSummaryCard');
  const control = aside.indexOf('<DocumentControlCard');
  const bottom = aside.indexOf('{backfillRailFirst ? null : backfillRail}');
  assert.ok(top >= 0 && summary > top, 'ยังไม่ยื่นตรวจ = เหนือการ์ดยอดสุทธิ (ปุ่ม "ยื่นตรวจงานบริการ" อยู่ในกรอบรางที่ปักหมุดที่ 1440)');
  assert.ok(control > summary && bottom > control, 'ยื่นแล้ว/รอตรวจ = ใต้การ์ดจัดการเอกสาร (ที่เดิม)');
  assert.equal(count(aside, /\bbackfillRail\b/g), 2, 'วางสองที่ ขึ้นทีละที่');
});

/* ── มติ 29/09: คำเตือน "จำนวนรอบบริการ n รอบ ในช่วงบริการ m เดือน" (ไม่บล็อก) ถึงทั้งผู้ยื่นและผู้อนุมัติ ───────────────────────────── */
test('29/09 คำเตือนรอบน้อย: โมดัลยืนยันยื่น (คำเตือนของฝ่ายขาย) + โมดัลอนุมัติทั้งสองสาย (สิ่งที่ต้องตรวจก่อนกดจากก้อนสด)', () => {
  const line = (i, rounds) => ({
    id: `L${i}`, lineNo: i, fgCode: 'FG-364-02-001-1061', productId: `P${i}`, qty: 12, unit: 'เดือน', serviceRounds: rounds, metadata: {},
  });
  const ctx = {
    order: { id: 'SO1', status: 'draft', origin: 'pipeline', servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', totalAmount: 0 },
    lines: [line(1, 1), line(2, 12)],
    allocations: [{ salesOrderLineId: 'L1', zoneId: 'Z1', packsPerRound: 2 }, { salesOrderLineId: 'L2', zoneId: 'Z1', packsPerRound: 2 }],
    zonesById: new Map([['Z1', { id: 'Z1', siteId: 'S1', name: 'Office' }]]),
    installments: [],
  };
  const [warning] = serviceSetupWarnings(ctx);
  assert.equal(warning.owner, 'SA', 'ของฝ่ายขาย ⇒ saWarningLines ใส่ในโมดัลยืนยันยื่น');
  assert.equal(warning.message, 'รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)');
  assert.ok(serviceSetupApprovalChecklist(ctx).includes('รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็อนุมัติได้)'));
  /* หน้าใบส่งต่อตรง ๆ — ไม่กรอง/ไม่เขียนคำเอง */
  assert.match(page, /\.filter\(\(w\) => w\?\.owner === "SA" && w\?\.message\)/);
  assert.match(slice(page, 'if (action === "approve") {', '\n      return;'), /checklist: service\?\.approvalChecklist \|\| \[\],/);
  assert.match(slice(page, 'async function openBackfillApprove() {', '\n  }\n'), /checklist: fresh\.approvalChecklist,/);
  assert.doesNotMatch(page, /ถ้าตั้งใจก็/, 'คำเตือนมาจาก serviceSetup.js ที่เดียว');
});

/* ══ ปุ่ม "แก้งานบริการ" หลังอนุมัติ (mig 0396 · แผน IMPL_PLAN_REOPEN §6.2 · มติเจ้าของ 30/09) ═══════════════════════════════════ */

test('0396: กดปุ่ม "แก้งานบริการ" = โหลดก้อนสดก่อนเสมอ · ปุ่มหาย/ติดด่านบนก้อนสด = บอกเหตุ ไม่เปิดโมดัล · ผ่าน = โมดัลจาก view.reopen.prompt', () => {
  const open = slice(page, 'async function openServiceReopen() {', '\n  }\n');
  const freshAt = open.indexOf('await freshServiceView()');
  const formAt = open.indexOf('setServiceReopenForm(');
  assert.ok(freshAt >= 0 && formAt > freshAt, 'ต้องอ่านก้อนสดก่อนเปิดโมดัล (TS อาจตั้งรอบไปแล้วระหว่างเปิดหน้าทิ้งไว้)');
  assert.match(open, /if \(!fresh\) return;/, 'โหลดไม่ขึ้น = ไม่เปิด (freshServiceView บอกเหตุแล้ว) — ห้ามถือว่าผ่าน');
  assert.match(open, /const reopen = fresh\.reopen \|\| null;/);
  assert.match(open, /if \(!reopen\?\.canReopen \|\| \(!reopen\.blockedReason && !reopen\.prompt\)\) \{\s*notifyToast\.error\(SERVICE_REOPEN_TEXT\.gone\);\s*return;/);
  assert.match(open, /if \(reopen\.blockedReason\) \{\s*notifyToast\.error\(reopen\.blockedReason\);\s*return;/,
    'ติดด่านบนก้อนสด = ช่องทางเดียวกับ GatedAction (toast) · เหตุจาก server');
  assert.ok(open.indexOf('reopen.blockedReason) {') < formAt, 'ด่านก่อนเปิดโมดัล');
  /* เวอร์ชัน = ก้อนสดที่โมดัลโชว์ (ตามตัวอักษร) · หัว/คำถาม/ผลจาก approvalPrompt (ผลบังคับ) */
  assert.match(open, /setServiceReopenForm\(\{ reason: "", version: fresh\.updatedAt \?\? null, prompt: approvalPrompt\(reopen\.prompt\) \}\);/);
  assert.doesNotMatch(open, /new Date\(/);
  /* การ์ดได้ callback + สถานะกำลังยิง (ปุ่มดับ) — หน้าไม่ตัดสินว่าปุ่มโชว์ไหม (ก้อน view.reopen ของ server) */
  const lines = slice(page, '<SalesOrderServiceLines', '\n            />');
  assert.match(lines, /onReopen=\{openServiceReopen\}/);
  assert.match(lines, /reopenBusy=\{!!busy\}/);
  assert.doesNotMatch(page, /reopen\.canReopen &&|reopen\?\.visible &&/, 'หน้าไม่มีเงื่อนไขโชว์ปุ่มของตัวเอง');
});

test('0396: ยืนยันเปิดแก้ = POST { action: "reopen", expectedUpdatedAt, reason } ผ่าน apiJson ไม่ลองซ้ำ · ไม่สำเร็จ = โมดัลค้าง + ก้อนสดเลื่อนเวอร์ชัน (ไม่มีทางตัน 409)', () => {
  const submit = slice(page, 'async function submitServiceReopen() {', '\n  }\n');
  assert.match(submit, /const reason = String\(form\?\.reason \|\| ""\)\.trim\(\);/);
  assert.match(submit, /if \(!form \|\| reason\.length < SERVICE_REOPEN_TEXT\.reasonMin\) return;/);
  assert.match(submit, /const ok = await runServiceBackfill\("reopen", \{ reason \}, form\.version\);/, 'เวอร์ชันของก้อนสดที่โมดัลโชว์');
  assert.match(submit, /if \(ok\) \{\s*setServiceReopenForm\(null\);\s*return;\s*\}/);
  /* ใบขยับระหว่างเปิดโมดัล: เหตุผลที่พิมพ์ไม่หาย · ผล/เวอร์ชันตามก้อนสด · สดบอกว่าติดด่าน/ปุ่มหาย = คงโมดัลไว้กับเหตุของ server */
  assert.match(submit, /const fresh = await setup\.reload\(\)\.catch\(\(\) => null\);/);
  assert.match(submit, /if \(!reopen\?\.canReopen \|\| reopen\.blockedReason \|\| !reopen\.prompt\) return;/);
  assert.match(submit, /\{ \.\.\.current, version: fresh\.updatedAt \?\? null, prompt: approvalPrompt\(reopen\.prompt\) \}/);
  /* ตัวยิงตัวเดียวกับยื่น/อนุมัติ/ตีกลับ — POST ของ …/service-setup · เวลาตามตัวอักษร · ไม่ retry */
  const run = slice(page, 'async function runServiceBackfill(action, extra = {}, expectedUpdatedAt = setup.data?.updatedAt ?? null) {', '\n  }\n');
  assert.match(run, /json: \{ action, expectedUpdatedAt, \.\.\.extra \},/);
  assert.doesNotMatch(run, /retry/);
  /* ทัก/ล้มเหลวจากแคตตาล็อก — จำนวนรอบขายที่ถอนจาก TS */
  assert.match(page, /reopen: \(data\) => SERVICE_REOPEN_TEXT\.toast\(Number\(data\?\.termsRemoved\) \|\| 0\),/);
  assert.match(page, /reopen: SERVICE_REOPEN_TEXT\.failed,/);
  assert.equal(SERVICE_REOPEN_TEXT.toast(2), 'เปิดแก้งานบริการแล้ว (ถอนจาก TS 2 รอบขาย) — แก้ในการ์ด ‘งานบริการ’ แล้วกด ‘ยื่นตรวจงานบริการ’');
});

test('0396 (ตรวจทาน ui-reopen-lost-response): POST ล้มแต่ก้อนสดบอกว่าเปิดแก้ด้วยเหตุผลของเรา = สำเร็จจริง — ปิดโมดัล ล้างเหตุ โหลดใบ ทักสำเร็จ', () => {
  const submit = slice(page, 'async function submitServiceReopen() {', '\n  }\n');
  const reloadAt = submit.indexOf('const fresh = await setup.reload().catch(() => null);');
  const doneAt = submit.indexOf('if (fresh?.reopened && String(fresh.reopened.reason || "").trim() === reason) {');
  const versionAt = submit.indexOf('const reopen = fresh?.reopen || null;');
  assert.ok(reloadAt >= 0 && doneAt > reloadAt && versionAt > doneAt, 'ตรวจ "ทำไปแล้ว" จากก้อนสดก่อนทางเลื่อนเวอร์ชัน');
  const done = submit.slice(doneAt, versionAt);
  assert.match(done, /setServiceReopenForm\(null\);/);
  assert.match(done, /setError\(""\);/, 'ไม่ค้างข้อความ "เชื่อมต่อไม่ได้ ลองอีกครั้ง" ของงานที่สำเร็จแล้ว');
  assert.match(done, /await refreshOrder\(\);/, 'runServiceBackfill ข้ามการโหลดใบตอนต่อไม่ติด');
  assert.match(done, /setToast\(\{ kind: "success", msg: SERVICE_BACKFILL_TOAST\.reopen\(null\) \}\);/);
  /* ไม่รู้จำนวนรอบขายที่ถอน (คำตอบหาย) — ทักไม่พูดจำนวน */
  assert.equal(SERVICE_REOPEN_TEXT.toast(0), 'เปิดแก้งานบริการแล้ว — แก้ในการ์ด ‘งานบริการ’ แล้วกด ‘ยื่นตรวจงานบริการ’');
});

test('0396 (ตรวจทาน ui-reason-no-min-feedback): โมดัลเปิดแก้โชว์ตัวนับ n/500 ต่อท้ายคำอธิบาย + บอกขั้นต่ำ 10 ตัวอักษรจนกว่าจะถึง', () => {
  const dialog = slice(page, '<ReasonDialog\n        open={!!serviceReopenForm}', '\n      />');
  assert.match(dialog, /\n\s+showCount\n/);
  const reason = code('components/ui/ReasonDialog.js');
  assert.match(reason, /showCount = false,/, 'ค่าตั้งต้นปิด — โมดัลเหตุผลตัวอื่นหน้าตาเดิม');
  assert.match(reason, /const countText = minLength > 1 && normalized\.length < minLength \? `\$\{count\} · อย่างน้อย \$\{minLength\} ตัวอักษร` : count;/);
  assert.match(reason, /const hint = showCount \? \(helpText \? `\$\{helpText\} · \$\{countText\}` : countText\) : \(helpText \|\| count\);/);
  assert.match(reason, /\{error \|\| hint\}/);
});

test('0396: โมดัลเหตุผล = ReasonDialog (เหตุผลบังคับ ห้ามอยู่ใน ConfirmDialog) · 10–500 ตัวอักษร · เหตุที่ API ตีกลับขึ้นในโมดัล · คำจากแคตตาล็อก', () => {
  const dialog = slice(page, '<ReasonDialog\n        open={!!serviceReopenForm}', '\n      />');
  for (const prop of [
    'title={serviceReopenForm?.prompt?.title}',
    'description={serviceReopenForm?.prompt?.description}',
    'detail={serviceReopenForm?.prompt?.detail}',
    'confirmLabel={serviceReopenForm?.prompt?.confirmLabel}',
    'label={SERVICE_REOPEN_TEXT.reasonLabel}',
    'helpText={SERVICE_REOPEN_TEXT.reasonHelp}',
    'placeholder={SERVICE_REOPEN_TEXT.reasonPlaceholder}',
    'minLength={SERVICE_REOPEN_TEXT.reasonMin}',
    'maxLength={SERVICE_REOPEN_TEXT.reasonMax}',
    'tone="warning"',
    'busy={busy === "service-reopen"}',
    'submitError={error}',
    'onConfirm={submitServiceReopen}',
  ]) assert.ok(dialog.includes(prop), `โมดัลเปิดแก้ขาด ${prop}`);
  /* เพดานเดียวกับ CHECK/RPC ของ 0396 (นับหลัง btrim) */
  assert.equal(SERVICE_REOPEN_TEXT.reasonMin, 10);
  assert.equal(SERVICE_REOPEN_TEXT.reasonMax, 500);
  assert.equal(count(page, /open=\{!!serviceReopenForm\}/g), 1);
  const flow = slice(page, 'async function openServiceReopen() {', '\n  }\n') + slice(page, 'async function submitServiceReopen() {', '\n  }\n');
  assert.doesNotMatch(flow, /setConfirmState|confirmAction\(/, 'ไม่ผ่าน ConfirmDialog');
  assert.doesNotMatch(dialog, /นับ Actual|นับเป็น Actual/);
});

test('0396: หลังเปิดแก้ — คำใต้สถานะใบพูด "การแก้งานบริการ" · โมดัลอนุมัติของผู้จัดการมีเหตุที่เปิดแก้เป็นข้อแรก (มติ 30/09 ข้อ 4.3)', () => {
  assert.match(page, /\? \(setupView\?\.reopened\s*\? SERVICE_REOPENED_TEXT\.actualNote\(order\.approvedAt\)\s*: `ยอดถูกนับเป็น Actual แล้ว/);
  assert.equal(SERVICE_REOPENED_TEXT.actualNote('2026-09-29T04:08:11Z'), 'ยอดถูกนับเป็น Actual แล้ว (อนุมัติ 29/09/2026) — การแก้งานบริการไม่เปลี่ยนยอดนี้');
  /* หน้าไม่อ่านคอลัมน์ 0396 เอง — ถาม `view.reopened` ของก้อน GET (ตัวตัดสินกลาง serviceSetupReopened) */
  assert.doesNotMatch(page, /serviceSetupReopened/);
  /* โมดัลอนุมัติส่ง checklist ของก้อนสดตรง ๆ — ข้อแรกของใบที่เปิดแก้คือเหตุผล + ผู้เปิด */
  assert.match(slice(page, 'async function openBackfillApprove() {', '\n  }\n'), /checklist: fresh\.approvalChecklist,/);
  const ctx = {
    order: {
      id: 'SO1', orderNumber: 'SO-26090247-0', status: 'approved', origin: 'pipeline', supersededById: null, serviceTermsOpenedAt: null,
      serviceSetupState: 'submitted', servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', totalAmount: 0,
      serviceSetupReopenedAt: '2026-09-30T03:15:00Z', serviceSetupReopenedByName: 'Kamonrat Pipattanapong',
      serviceSetupReopenedReason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน',
    },
    lines: [{ id: 'L1', lineNo: 1, fgCode: 'FG-364-02-001-1061', productId: 'P1', qty: 12, unit: 'เดือน', serviceRounds: 12, metadata: {} }],
    allocations: [{ salesOrderLineId: 'L1', zoneId: 'Z1', packsPerRound: 2 }],
    zonesById: new Map([['Z1', { id: 'Z1', siteId: 'S1', name: 'Office' }]]),
    installments: [],
  };
  const [first] = serviceSetupApprovalChecklist(ctx, { flow: 'backfill' });
  assert.equal(first, 'เหตุที่เปิดแก้: SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน (Kamonrat Pipattanapong 30/09/2026)');
});
