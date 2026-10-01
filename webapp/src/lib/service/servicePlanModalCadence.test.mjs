// ── โมดัลรอบบริการ: ความถี่ตามปฏิทิน (mig 0397 · มติเจ้าของ 29/09 + คำตอบ 4 ข้อ) — ยามรูปโค้ดของจอ ─────────────────
//
// ตัวเลข/สถานะฟอร์มทดสอบที่ `components/service/servicePlanForm.test.mjs` (logic ล้วน) · ไฟล์นี้เฝ้าสิ่งที่อยู่ใน JSX
// ซึ่ง node รันตรงไม่ได้ และพังเงียบได้ทั้งที่เทสต์ logic เขียว:
//   · ตัวเลือกชุดเล็ก = แผ่น/ชิปที่เห็นครบ ไม่ใช่ดรอปดาวน์ (docs/form-design-rules.md §3)
//   · วันของสัปดาห์เรียงอาทิตย์–เสาร์จากลิสต์กลาง · เสาร์–อาทิตย์กดแล้วบอกเหตุ (title อย่างเดียวมองไม่เห็นบนมือถือ)
//   · เปลี่ยนรอบที่มีนัดอยู่แล้ว ต้องถามพร้อมรายการก่อนยกเลิกนัด (คำตอบข้อ 4 · กติกาโมดัลอนุมัติ) — หน้าไซต์ต้องส่ง error
//     ที่พก status + data มาถึงโมดัล (apiJson) ไม่งั้นไม่มีรายการให้ยืนยันและการเปลี่ยนรอบทำต่อไม่ได้
//   · คำบนจอของความถี่มาจาก CADENCE_TEXT ที่เดียว · คำว่า "ทุก N วัน" ประกอบที่ cadence.js ที่เดียวทั้งระบบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CADENCE_TEXT } from './cadence.js';
import { WEEKDAY_LABELS } from './sites.js';

const SRC_ROOT = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC_ROOT), 'utf8');
/* ตัดคอมเมนต์ (JSX · บล็อก · บรรทัด) — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const noComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const MODAL_PATH = 'components/service/ServicePlanModal.js';
const FORM_PATH = 'components/service/servicePlanForm.js';
const SITE_PATH = 'app/database/sites/[id]/page.js';
const INTAKE_PATH = 'app/service/intake/page.js';
const RAW = read(MODAL_PATH);
const MODAL = noComments(RAW);
const FORM = noComments(read(FORM_PATH));
const SITE = noComments(read(SITE_PATH));
const INTAKE = noComments(read(INTAKE_PATH));

function between(src, start, end) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `หา "${start}" ไม่เจอ`);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to >= 0, `หา "${end}" หลัง "${start}" ไม่เจอ`);
  return src.slice(from, to + end.length);
}
const BOX = between(MODAL, '<fieldset', '</fieldset>');
const DIALOG = between(MODAL, '<ConfirmDialog', '</ConfirmDialog>');
const THAI = /[฀-๿]/;

/* ═══ ลำดับของฟอร์ม + กล่องความถี่ ═══════════════════════════════════════════════════════════════ */

test('ลำดับ: ชนิดงาน → ใบสั่งขาย → เริ่ม/สิ้นสุดรอบ → ความถี่ → เจ้าหน้าที่ → หมายเหตุ (ความถี่คิดจากวันเริ่ม จึงอยู่ใต้วันที่)', () => {
  const at = (needle) => {
    const i = MODAL.indexOf(needle);
    assert.ok(i >= 0, `หา "${needle}" ไม่เจอ`);
    return i;
  };
  const order = ['<span>ชนิดงาน *</span>', '<span>ใบสั่งขายที่ครอบรอบนี้</span>', '<span>เริ่มรอบ *</span>', '<span>สิ้นสุดรอบ</span>',
    '<fieldset', '</fieldset>', '<span>เจ้าหน้าที่ประจำรอบ</span>', '<span>หมายเหตุ</span>', '<span>เปิดใช้งาน</span>'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // กล่องความถี่อยู่ในกริดของฟอร์ม กินเต็มแถว · คลาสกล่องเป็นของโมดูลของโมดัลเอง (ไฟล์ร่วมไม่ถูกเพิ่มคลาส)
  assert.match(MODAL, /<fieldset className=\{`\$\{planStyles\.cadence\} \$\{styles\.wide\}`\}>\s*<legend>\{CADENCE_TEXT\.fieldLabel\} \*<\/legend>/);
  assert.equal((MODAL.match(/<fieldset/g) || []).length, 1);
});

test('⭐ ชนิดความถี่ = แผ่นเลือกสามแผ่นจากแคตตาล็อก (OptionTiles) — ไม่ใช่ดรอปดาวน์', () => {
  assert.match(MODAL, /import OptionTiles from "@\/components\/ui\/OptionTiles";/);
  assert.match(BOX, /<OptionTiles value=\{form\.cadenceKind\} onChange=\{pickKind\} options=\{CADENCE_TEXT\.tiles\} ariaLabel=\{CADENCE_TEXT\.fieldLabel\} \/>/);
  assert.deepEqual(CADENCE_TEXT.tiles.map((t) => t.value), ['monthly', 'weekly', 'days']);
  assert.deepEqual(CADENCE_TEXT.tiles.map((t) => t.label), ['ทุกเดือน (ตามวันที่)', 'ทุกสัปดาห์ (ตามวัน)', 'ทุก N วัน']);
  assert.doesNotMatch(BOX, /<Select\b|<select\b|SearchableSelect|MenuSelect/, 'ในกล่องความถี่ไม่มีดรอปดาวน์สักตัว');
  // ช่องของแต่ละชนิดขึ้นเฉพาะเมื่อเลือกชนิดนั้น และอยู่ใต้แผ่นเลือก (ช่องที่โผล่ตามเงื่อนไขอยู่ใต้ตัวที่ทำให้โผล่)
  const tiles = BOX.indexOf('<OptionTiles');
  for (const kind of ['monthly', 'weekly', 'days']) {
    const at = BOX.indexOf(`{form.cadenceKind === "${kind}" && (`);
    assert.ok(at > tiles, `ช่องของชนิด ${kind} ต้องอยู่ใต้แผ่นเลือก`);
  }
});

test('ทุกเดือน: ชิป "ทุก n เดือน" + ชิป วันเดียว/ช่วงวัน + ตารางวัน 1–30 · 31 สิ้นเดือน ตัวเดียวกับโมดัลรอบวางบิล + คำใบ้', () => {
  const block = between(BOX, '{form.cadenceKind === "monthly" && (', '{form.cadenceKind === "weekly" && (');
  assert.match(block, /<ChoiceChips\s+value=\{form\.monthEvery\}\s+onChange=\{\(monthEvery\) => setForm\(\(prev\) => \(\{ \.\.\.prev, monthEvery \}\)\)\}\s+options=\{everyMonthOptions\(form\)\}/);
  assert.match(block, /<ChoiceChips\s+value=\{form\.dayMode\}\s+onChange=\{\(mode\) => setForm\(\(prev\) => setDayMode\(prev, mode\)\)\}\s+options=\{CADENCE_TEXT\.dayModes\}/);
  assert.match(MODAL, /import CustomerBillingRuleDayGrid from "@\/components\/database\/CustomerBillingRuleDayGrid";/);
  assert.match(block, /<CustomerBillingRuleDayGrid\s+ariaLabel=\{CADENCE_TEXT\.monthDayLabel\}\s+multiple=\{ranged\}\s+value=\{ranged \? rangeDays\(form\) : planFormMonthDay\(form\)\}/);
  assert.match(block, /onPick=\{\(day\) => setForm\(\(prev\) => \(prev\.dayMode === "range" \? pickRangeDay\(prev, day\) : pickSingleDay\(prev, day\)\)\)\}/);
  assert.match(block, /<p className=\{styles\.hint\}>\{ranged \? CADENCE_TEXT\.rangeHint : CADENCE_TEXT\.monthEndHint\}<\/p>/);
  assert.deepEqual(CADENCE_TEXT.dayModes.map((m) => m.value), ['single', 'range']);
});

test('🔴 ทุกสัปดาห์: เจ็ดชิปจาก WEEKDAY_LABELS ตามดัชนี (อาทิตย์ก่อน) · ไม่มีลิสต์ชื่อวันเขียนเองในโมดัล', () => {
  const block = between(BOX, '{form.cadenceKind === "weekly" && (', '{form.cadenceKind === "days" && (');
  assert.match(MODAL, /import \{ WEEKDAY_LABELS \} from "@\/lib\/service\/sites";/);
  assert.match(block, /\{WEEKDAY_LABELS\.map\(\(label, weekday\) => \{/);
  assert.deepEqual(WEEKDAY_LABELS, ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
  assert.match(block, /const on = weekday === pickedWeekday;/);
  assert.match(MODAL, /const pickedWeekday = planFormWeekday\(form\);/);
  assert.match(block, /role="radiogroup" aria-label=\{CADENCE_TEXT\.weekdayLabel\}/);
  assert.match(block, /role="radio"\s+className="choice-chip"\s+aria-checked=\{on\}\s+data-on=\{on \? "1" : undefined\}/);
  assert.match(block, /<ChoiceChips\s+value=\{form\.weekEvery\}\s+onChange=\{\(weekEvery\) => setForm\(\(prev\) => \(\{ \.\.\.prev, weekEvery \}\)\)\}\s+options=\{everyWeekOptions\(form\)\}/);
  // ชื่อวัน (ย่อ/เต็ม) ต้องไม่ถูกพิมพ์เป็นลิสต์ในจอ — ลิสต์วันจันทร์–ศุกร์เขียนเองคือสิ่งที่ยามสัปดาห์เริ่มวันอาทิตย์ห้าม
  for (const src of [MODAL, FORM]) {
    assert.doesNotMatch(src, /['"](?:จ\.|อ\.|พ\.|พฤ\.|ศ\.|ส\.|อา\.)['"]/);
    assert.doesNotMatch(src, /['"](?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)['"]/);
    assert.doesNotMatch(src, /\+ 6\) % 7|getDay\(\)|getUTCDay\(\)/);
  }
});

test('🔴 เสาร์–อาทิตย์: โชว์เสมอ โฟกัสได้ aria-disabled + title · กดแล้วไม่ถูกเลือกแต่บอกเหตุในบรรทัด role="status"', () => {
  const block = between(BOX, '{form.cadenceKind === "weekly" && (', '{form.cadenceKind === "days" && (');
  assert.match(block, /const blocked = isWeekendDay\(weekday\);/);
  assert.match(block, /aria-disabled=\{blocked \? "true" : undefined\}/);
  assert.match(block, /title=\{blocked \? CADENCE_TEXT\.weekendBlocked : undefined\}/);
  assert.match(block, /onClick=\{\(\) => pickWeekday\(weekday\)\}/);
  assert.doesNotMatch(block, /(?<![\w-])disabled\b/, 'ห้าม disabled จริง — ปุ่มที่กดไม่ลงบอกเหตุไม่ได้ (กติกา "ติดด่าน = โชว์แล้วบอกเหตุตอนกด")');
  assert.match(block, /<p className=\{planStyles\.note\} role="status">\{weekendNote \? CADENCE_TEXT\.weekendBlocked : ""\}<\/p>/);
  const pick = between(MODAL, 'const pickWeekday = (weekday) => {', '\n  };');
  assert.match(pick, /if \(isWeekendDay\(weekday\)\) \{ setWeekendNote\(true\); return; \}/, 'กดเสาร์/อาทิตย์ = บอกเหตุ ไม่เขียนฟอร์ม');
  assert.match(pick, /setWeekendNote\(false\);\s*setForm\(\(prev\) => \(\{ \.\.\.prev, weekday \}\)\);/, 'เลือกวันทำการแล้วบรรทัดบอกเหตุหาย');
  // วันที่ไซต์ไม่เปิดให้เข้า = เตือนใต้ชิป ไม่บล็อก
  assert.match(block, /\{accessWarning && \(\s*<p className=\{planStyles\.warn\}>\{accessWarning\}<\/p>\s*\)\}/);
  // ข้อความบอกวันที่ไซต์ให้เข้า + วันที่เลือกด้วยชื่อ (ป้ายวันจาก WEEKDAY_LABELS ของไซต์) — ไม่ใช่ "วันนี้"
  assert.match(MODAL, /const accessWarning = accessWarningText\(form, accessDays, WEEKDAY_LABELS\);/);
  assert.match(FORM, /return CADENCE_TEXT\.accessWarning\(allowed, WEEKDAY_NAMES\[planFormWeekday\(form\)\]\);/);
  assert.equal(CADENCE_TEXT.accessWarning('จ. อ. พ.', 'พฤหัสบดี'), 'ไซต์นี้ให้เข้าเฉพาะ จ. อ. พ. — วันพฤหัสบดีอยู่นอกวันที่ไซต์เปิดให้เข้า');
});

test('ทุก N วัน: ช่องตัวเลข 1–365 autoComplete="off" · ว่างจนกว่าจะพิมพ์ · ไม่มีปุ่มลัด', () => {
  const block = between(BOX, '{form.cadenceKind === "days" && (', ')}\n');
  assert.match(block, /<span>\{CADENCE_TEXT\.everyDaysLabel\}<\/span>/);
  assert.match(block, /<Input type="number" min="1" max="365" inputMode="numeric" autoComplete="off" value=\{form\.everyDays\} onChange=\{change\("everyDays"\)\} \/>/);
  assert.match(block, /<small>\{CADENCE_TEXT\.everyDaysHint\}<\/small>/);
  assert.doesNotMatch(block, /<Button/, 'ปุ่มลัด 7/14/30/90 ถอดแล้ว');
  // ช่องพิมพ์ทุกช่องของโมดัลปิด autocomplete (ช่องติ๊กไม่เกี่ยว)
  for (const input of MODAL.match(/<Input\b[^>]*>/g) || []) assert.match(input, /autoComplete="off"/, input);
});

/* ═══ บรรทัดสรุป · นัดถัดไป · วันหยุด ═══════════════════════════════════════════════════════════ */

test('⭐ บรรทัดสรุป: จำนวนรอบบริการ · ความถี่ · ตกวันหยุดไปไหน · ได้กี่นัด — เทียบจำนวนรอบบริการแบบไม่บล็อก', () => {
  assert.match(MODAL, /const summary = planSummary\(form, \{ todayIso: businessDate\(\), holidays \}\);/);
  assert.match(MODAL, /const estimate = summary\.estimate;/);
  assert.match(BOX, /\{summary\.pending \|\| summary\.text\}/);
  assert.match(BOX, /\{summary\.shiftText \? <>\{" · "\}\{summary\.shiftText\}<\/> : null\}/);
  assert.match(BOX, /<strong>\{CADENCE_TEXT\.visits\(estimate\)\}<\/strong>/);
  assert.match(BOX, /\{summary\.needEndDate \? <>\{" · "\}\{CADENCE_TEXT\.needEndDate\}<\/> : null\}/);
  assert.match(BOX, /estimate === roundsSold\s*\? <>\{" "\}\{CADENCE_TEXT\.matchesSold\}<\/>/);
  assert.match(BOX, /estimate !== roundsSold\s*\? <>\{" — "\}\{PLAN_ROUNDS_SOLD_HINT\.diff\(Math\.abs\(estimate - roundsSold\)\)\}<\/>/);
  assert.match(BOX, /\{summary\.nextText \? \(\s*<p className=\{styles\.hint\}>\{CADENCE_TEXT\.nextLabel\} \{summary\.nextText\}<\/p>\s*\) : null\}/);
  // จำนวนนัดไม่ตรง = ข้อความ ไม่ใช่ด่าน: ตัวตรวจตอนบันทึกไม่ถามจำนวนนัด/จำนวนรอบบริการเลย
  const submit = between(MODAL, 'const submit = async () => {', '\n  };');
  assert.doesNotMatch(submit, /estimate|roundsSold/);
});

test('⭐ วันหยุดมาจากตาราง holidays (useHolidayMap) · ปีที่ยังไม่มีวันหยุด = คำเตือนเหลืองในกล่อง ไม่บล็อก', () => {
  assert.match(MODAL, /import useHolidayMap from "@\/lib\/useHolidayMap";/);
  assert.match(MODAL, /const holidays = useHolidayMap\(\);/);
  assert.match(MODAL, /const gapText = holidayGapText\(summary\.gapYears\);/);
  assert.match(BOX, /\{gapText \? <StatusNotice tone="warning">\{gapText\}<\/StatusNotice> : null\}/);
  const submit = between(MODAL, 'const submit = async () => {', '\n  };');
  assert.doesNotMatch(submit, /gapText|gapYears|holidays/, 'คำเตือนวันหยุดไม่ใช่เหตุให้บันทึกไม่ได้');
  // "วันนี้" จากนาฬิกาไทย — ไม่มีนาฬิกาเครื่อง/ตัดสตริง ISO ในโมดัล (check:thaitime)
  assert.match(MODAL, /import \{ businessDate \} from "@\/lib\/businessDate";/);
  assert.doesNotMatch(MODAL, /new Date\(|toISOString|\.slice\(0, 10\)/);
});

test('ระยะเติมนัดในคำอธิบายท้ายฟอร์มมาจากรอบที่ตั้งอยู่ (90 · รอบหลายเดือนไกลกว่า) — ไม่มี "90 วัน" ตายตัว', () => {
  assert.match(MODAL, /ระบบสร้างนัดล่วงหน้า <strong>\{summary\.horizonDays\} วัน<\/strong> เท่านั้น แล้วต่อรอบให้เมื่อปิดงานจริง/);
  assert.doesNotMatch(MODAL, /90 วัน/);
});

/* ═══ เปลี่ยนรอบที่มีนัดอยู่แล้ว (คำตอบเจ้าของข้อ 4) ═════════════════════════════════════════════════ */

test('🔴 409 plan_schedule_confirm → เปิดกล่องยืนยันพร้อมรายการ ไม่ใช่ข้อความ error · error อื่นขึ้นในฟอร์มตามเดิม', () => {
  const submit = between(MODAL, 'const submit = async () => {', '\n  };');
  assert.match(submit, /await onSave\(payload\);\s*onClose\(\);/);
  assert.match(submit, /const asked = scheduleConfirmOf\(e\);\s*if \(asked\) setConfirm\(\{ payload, preview: asked\.preview, error: "" \}\);\s*else setError\(e\.message \|\| "บันทึกไม่สำเร็จ"\);/);
  assert.match(FORM, /export const PLAN_SCHEDULE_CONFIRM = 'plan_schedule_confirm';/);
  assert.match(FORM, /error\?\.status !== 409 \|\| data\?\.code !== PLAN_SCHEDULE_CONFIRM/);
  // รหัสเดียวกับที่ API ตอบ
  assert.match(read('app/api/service/plans/[id]/route.js'), /code: 'plan_schedule_confirm',/);
});

test('🔴 ยืนยันแล้วส่ง payload เดิม + cancelVisitIds ของรายการที่เห็น · 409 รอบสองเปลี่ยนรายการ · 500 ค้างในกล่อง กดซ้ำได้', () => {
  const fn = between(MODAL, 'const confirmCancel = async () => {', '\n  };');
  assert.match(fn, /const \{ payload, preview \} = confirm;/);
  assert.match(fn, /await onSave\(\{ \.\.\.payload, cancelVisitIds: cancelVisitIdsOf\(preview\) \}\);\s*setConfirm\(null\);\s*onClose\(\);/);
  assert.match(fn, /const asked = scheduleConfirmOf\(e\);\s*setConfirm\(asked\s*\? \{ payload, preview: asked\.preview, error: asked\.message \|\| "" \}\s*: \{ payload, preview, error: e\.message \|\| "บันทึกไม่สำเร็จ" \}\);/);
  assert.doesNotMatch(fn, /setError\(/, 'ข้อผิดพลาดระหว่างยืนยันต้องขึ้นในกล่องยืนยัน (ฟอร์มข้างหลังถูกบัง)');
  assert.match(FORM, /\.map\(\(visit\) => visit\.id\)/);
});

test('⭐ กล่องยืนยัน: บอกผลก่อนเขียน — หัว/คำถาม/รายละเอียด/ป้ายปุ่มจาก CADENCE_TEXT.confirm · รายการนัด + นัดที่ไม่ถูกแตะ', () => {
  assert.match(MODAL, /import ConfirmDialog from "@\/components\/ui\/ConfirmDialog";/);
  assert.match(DIALOG, /open=\{!!confirm\}/);
  assert.match(DIALOG, /title=\{CADENCE_TEXT\.confirm\.title\}/);
  assert.match(DIALOG, /message=\{CADENCE_TEXT\.confirm\.message\(confirmCount\)\}/);
  assert.match(DIALOG, /detail=\{confirm \? CADENCE_TEXT\.confirm\.detail\(confirm\.preview\.fromText, confirm\.preview\.toText\) : undefined\}/);
  assert.match(DIALOG, /confirmLabel=\{CADENCE_TEXT\.confirm\.confirmLabel\(confirmCount\)\}/);
  assert.match(DIALOG, /cancelLabel=\{CADENCE_TEXT\.confirm\.cancelLabel\}/);
  assert.match(DIALOG, /error=\{confirm\?\.error\}/);
  assert.match(DIALOG, /onConfirm=\{confirmCancel\}/);
  assert.match(DIALOG, /onClose=\{\(\) => setConfirm\(null\)\}/, '"กลับไปแก้รอบ" ปิดแค่กล่อง — ยังไม่ได้บันทึกอะไร');
  assert.doesNotMatch(DIALOG, /tone="danger"|\bdanger\b/, 'โทนกลาง — นัดถูกยกเลิก ไม่ได้ถูกลบ');
  assert.match(DIALOG, /\{confirm\.preview\.cancel\.map\(\(visit\) => \(\s*<li key=\{visit\.id\}>/);
  assert.match(DIALOG, /\{visit\.code \|\| visit\.id\}/);
  assert.match(DIALOG, /\{fmtDate\(visit\.scheduledDate\)\}/);
  assert.match(DIALOG, /\{VISIT_STATUS_LABELS\[visit\.status\] \|\| visit\.status\}/);
  assert.match(DIALOG, /\{keptLine \? <p className=\{planStyles\.kept\}>\{keptLine\}<\/p> : null\}/);
  assert.match(MODAL, /const keptLine = confirm \? CADENCE_TEXT\.confirm\.kept\(keptOfPreview\(confirm\.preview\)\) : null;/);
  // นัดที่อยู่ต่อเป็นนัดของรอบใหม่ (ไม่อยู่ในรายการยกเลิก) ถูกบอกในกล่องก่อนกด — คำเดียวกับ toast หลังบันทึก
  assert.match(DIALOG, /\{staysLine \? <p className=\{planStyles\.kept\}>\{staysLine\}<\/p> : null\}/);
  assert.match(MODAL, /const staysLine = confirm \? staysLineOf\(confirm\.preview\) : null;/);
  assert.match(MODAL, /const confirmCount = confirm \? confirm\.preview\.cancel\.length : 0;/);
  // คำของกล่องอยู่ในแคตตาล็อกที่เดียว (โมดัลไม่พิมพ์ซ้ำ) และพูดคำที่เจ้าของใช้
  assert.doesNotMatch(DIALOG, THAI, 'กล่องยืนยันไม่มีคำไทยพิมพ์เอง');
  assert.equal(CADENCE_TEXT.confirm.message(3), 'ยกเลิกนัดตามรอบเดิม 3 นัด?');
  assert.equal(CADENCE_TEXT.confirm.confirmLabel(3), 'ยกเลิกนัดตามรอบเดิม 3 นัด แล้วบันทึก');
  assert.equal(CADENCE_TEXT.confirm.cancelLabel, 'กลับไปแก้รอบ');
  assert.match(CADENCE_TEXT.confirm.detail('ทุก 30 วัน', 'ทุกเดือน วันที่ 22'), /จะถูกยกเลิกและถอดออกจากรอบนี้.*แล้วระบบสร้างนัดตามรอบใหม่ให้$/);
});

test('ระหว่างถามยืนยัน โมดัลหลักปิดด้วย Esc/กากบาทไม่ได้ · เปิดโมดัลใหม่ล้างคำถามค้าง', () => {
  assert.match(MODAL, /size="md" dismissible=\{!confirm\}>/);
  const effect = between(MODAL, 'useEffect(() => {\n    if (!open) return;', ']);');
  assert.match(effect, /setConfirm\(null\);/);
  assert.match(effect, /setWeekendNote\(false\);/);
});

/* ═══ คำบนจอ ═══════════════════════════════════════════════════════════════════════════════ */

test('🔴 กล่องความถี่ไม่มีคำไทยพิมพ์เอง — ทุกคำมาจาก CADENCE_TEXT / PLAN_ROUNDS_SOLD_HINT (ยกเว้นหน่วย "รอบ" ของบรรทัดจำนวนรอบบริการ)', () => {
  const rest = BOX.replace('<strong>{roundsSold} รอบ</strong>', '');
  const hit = rest.split('\n').find((line) => THAI.test(line));
  assert.equal(hit, undefined, hit?.trim());
});

test('ทุกคำของแคตตาล็อกฝั่งจอถูกใช้จริงในโมดัล/ตัวช่วยของฟอร์ม (ไม่มีคำกำพร้า ไม่มีคำที่ลืมแสดง)', () => {
  const ui = MODAL + FORM;
  const direct = ['fieldLabel', 'tiles', 'everyLabel', 'monthsUnit', 'weeksUnit', 'monthDayLabel', 'dayModes', 'monthEndHint', 'rangeHint',
    'rangePending', 'rangeUnset', 'weekdayLabel', 'weekendBlocked', 'accessWarning', 'everyDaysLabel', 'everyDaysHint', 'visits', 'matchesSold',
    'needEndDate', 'nextLabel', 'shiftReason'];
  for (const key of direct) assert.ok(ui.includes(`CADENCE_TEXT.${key}`), `CADENCE_TEXT.${key} ยังไม่ถูกใช้`);
  for (const key of ['title', 'message', 'detail', 'kept', 'stays', 'confirmLabel', 'cancelLabel']) {
    assert.ok(ui.includes(`CADENCE_TEXT.confirm.${key}`), `CADENCE_TEXT.confirm.${key} ยังไม่ถูกใช้`);
  }
  assert.match(MODAL, /useSuggestion: SUGGESTION_USE_LABEL, useSuggestionAria: suggestionAriaLabel/);
  // คีย์ที่เหลือเป็นของฝั่ง API (ข้อความ 409/500 + เธรดของนัด) — ต้องมีอยู่จริงในแคตตาล็อก
  const keys = [...direct, 'useSuggestion', 'useSuggestionAria', 'confirm', 'holidayReadFailed'].sort();
  assert.deepEqual(Object.keys(CADENCE_TEXT).sort(), keys);
  assert.deepEqual(Object.keys(CADENCE_TEXT.confirm).sort(), ['afterSaveFailed', 'cancelFailed', 'cancelLabel', 'confirmLabel', 'detail',
    'kept', 'message', 'needConfirm', 'saveFailed', 'stale', 'stays', 'threadBody', 'title']);
});

test('ไม่มี style={{ · ไม่มีคลาสปุ่ม/ช่องกรอกดิบ ในโมดัล (เพดาน audit:ui ห้ามขึ้น)', () => {
  assert.doesNotMatch(RAW, /style=\{\{/);
  assert.doesNotMatch(MODAL, /className="[^"]*(?<![\w-])btn\b/);
  assert.doesNotMatch(MODAL, /premium-input|premium-select/);
});

/* ═══ จอที่เรียกโมดัล + จอที่พิมพ์ความถี่ ══════════════════════════════════════════════════════════ */

test('🔴 หน้าไซต์: บันทึกรอบผ่าน apiJson (error พก status + data ถึงโมดัล) · ข้อความหลังบันทึกจากตัวช่วย · ส่งวันเข้าไซต์ให้โมดัล', () => {
  const save = between(SITE, 'const savePlan = async (form) => {', '\n  };');
  assert.match(save, /const data = await apiJson\(editing \? `\/api\/service\/plans\/\$\{formPlan\.id\}\?generate=1` : "\/api\/service\/plans", \{\s*method: editing \? "PATCH" : "POST",\s*json: form,\s*fallbackError: "บันทึกไม่สำเร็จ",\s*\}\);/);
  assert.doesNotMatch(save, /apiFetch\(|res\.json\(\)|new Error\(/, 'apiFetch ดิบ + new Error = โมดัลไม่ได้รายการของ 409');
  assert.match(save, /setToast\(\{ kind: "success", msg: planSavedMessage\(data\) \}\);/);
  assert.match(SITE, /import \{ planSavedMessage \} from "@\/components\/service\/servicePlanForm";/);
  assert.match(SITE, /import \{ apiFetch, apiJson \} from "@\/lib\/apiFetch";/);
  const modal = SITE.slice(SITE.indexOf('<ServicePlanModal'), SITE.indexOf('/>', SITE.indexOf('<ServicePlanModal')));
  assert.ok(modal.includes('accessDays={site?.accessDays}'));
  assert.ok(modal.includes('onSave={savePlan}'));
});

test('หน้าไซต์: ตารางรอบ + คำถามลบรอบ พิมพ์ความถี่ด้วย cadenceText (ทุกชนิด) · คำอธิบายการ์ดไม่สัญญา 90 วันตายตัว', () => {
  assert.match(SITE, /import \{ cadenceText \} from "@\/lib\/service\/cadence";/);
  assert.match(SITE, /<td>\{cadenceText\(plan\)\}<\/td>/);
  assert.match(SITE, /message: \(row\) => `ลบรอบ\$\{cadenceText\(row\)\}\?`,/);
  assert.match(SITE, /meta="ระบบสร้างนัดล่วงหน้าอย่างน้อย 90 วันตามรอบ แล้วเสนอรอบถัดไปเมื่อปิดงานจริง"/);
});

test('หน้างานเข้าใหม่: แท็บ "ครบรอบยังไม่มีนัด" พิมพ์ row.cadenceText ทั้งการ์ดและตาราง · ตั้งรอบแล้วเตือนปีที่ยังไม่มีวันหยุด', () => {
  assert.equal((INTAKE.match(/\{naText\(row\.cadenceText\)\}/g) || []).length, 2, 'การ์ด + ตาราง');
  assert.match(INTAKE, /\{VISIT_KIND_LABELS\[row\.kind\] \|\| row\.kind\} · \{naText\(row\.cadenceText\)\}/);
  assert.match(INTAKE, /import \{ holidayGapText \} from "@\/lib\/service\/cadence";/);
  assert.match(INTAKE, /const holidayGap = holidayGapText\(body\?\.holidayGapYears\);\s*notifyToast\.success\(holidayGap \? `\$\{saved\} · \$\{holidayGap\}` : saved\);/);
  const modal = INTAKE.slice(INTAKE.indexOf('<ServicePlanModal'), INTAKE.indexOf('/>', INTAKE.indexOf('<ServicePlanModal')));
  assert.ok(modal.includes('accessDays={planRow?.site?.accessDays}'), 'ไซต์ของแถวมีวันเข้าไซต์อยู่แล้ว — ไม่ยิงคิวรีเพิ่ม');
});

/* ═══ ทั้งระบบ ═════════════════════════════════════════════════════════════════════════════ */

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(full);
  }
  return out;
}

test('🔴 คำ "ทุก N วัน" จาก everyDays ประกอบที่ lib/service/cadence.js ที่เดียวทั้งระบบ (จออื่นเรียก cadenceText)', () => {
  const root = new URL('.', SRC_ROOT).pathname;
  const offenders = [];
  for (const file of sourceFiles(root)) {
    const rel = file.slice(root.length);
    if (rel === 'lib/service/cadence.js') continue;
    const code = noComments(readFileSync(file, 'utf8'));
    // `ทุก ${…everyDays…} วัน` (template) และ `ทุก {…everyDays…} วัน` (JSX)
    if (/ทุก \$?\{[^}\n]*everyDays[^}\n]*\} วัน/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'รอบตามปฏิทินไม่มี everyDays — จอที่ประกอบคำเองจะพิมพ์ "ทุก  วัน"/"ทุก null วัน"');
  assert.match(read('lib/service/cadence.js'), /return `ทุก \$\{cadence\.everyDays\} วัน`;/);
});

test('คำเรียกจำนวนรอบ: ไม่มีคำเก่าในแคตตาล็อกความถี่และตัวช่วยของฟอร์ม (ยาม roundsSoldWording ไม่ได้สแกนสองไฟล์นี้)', () => {
  const OLD = /ไปกี่รอบ|ไป \$\{[^}]*\} รอบ|ขายไว้|ตามที่ขาย|รอบที่ขาย|รอบ\/โซน|ระบุไว้/;
  for (const rel of ['lib/service/cadence.js', FORM_PATH]) {
    const hit = noComments(read(rel)).split('\n').find((line) => OLD.test(line));
    assert.equal(hit, undefined, `${rel}: ${hit?.trim()}`);
  }
});
