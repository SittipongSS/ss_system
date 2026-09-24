// ── เปลือกเดียวของโมดัลจัดคิว แบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) — ยามซอร์สของชิ้นส่วนกลาง ─────
//
// ⭐ ชิ้นส่วนที่สองโมดัล (แก้นัด · ลงคิวเข้าพื้นที่) ใช้ร่วม: เปลือก · แผงด่าน · ช่องวัน/เวลา · ชิปผู้ไปด้วย
//    กติกาเชิงข้อมูลเทสต์ด้วยค่าจริงที่ `lib/service/scheduleModal.test.mjs` — ไฟล์นี้ล็อก "รูป" ที่ตรรกะเทสต์ไม่ได้
//    (คอมโพเนนต์เป็น JSX · repo ไม่มีตัวเรนเดอร์ React ในเทสต์)
// ⭐ ขั้น B2: ทั้งสองโมดัลวาดเปลือกนี้ตัวเดียว — ยามท้ายไฟล์ล็อกว่าไม่มีโมดัลไหนกลับไปประกอบเปลือกเอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์เล่าประวัติของเดิมได้ */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const shell = code(read('./ScheduleModalShell.js'));
const shellCss = code(read('./ScheduleModalShell.module.css'));
const gate = code(read('./GatePanel.js'));
const time = code(read('./TimeWindowField.js'));
const timeCss = code(read('./TimeWindowField.module.css'));
const helpers = code(read('./HelperChips.js'));
const helpersCss = code(read('./HelperChips.module.css'));
const picker = code(read('./CrewLoadPicker.js'));
const pickerCss = code(read('./CrewLoadPicker.module.css'));

test('⭐ เปลือก: ปุ่มหลักปุ่มเดียว เป็น GatedAction ที่ชี้บรรทัดผลลัพธ์ (aria-describedby)', () => {
  assert.equal((shell.match(/tone="primary"/g) || []).length, 1, 'tone="primary" มีที่เปลือกที่เดียว');
  const primary = shell.match(/<GatedAction\s+tone="primary"[\s\S]*?>/);
  assert.ok(primary, 'ปุ่มหลักต้องเป็น GatedAction (ติดด่าน = กดได้แล้วบอกเหตุ)');
  assert.match(primary[0], /blocker=\{primary\.blocker \|\| ""\}/);
  assert.match(primary[0], /aria-describedby=\{outcomeId\}/);
  assert.match(shell, /<p\s+id=\{outcomeId\}\s+className=\{styles\.outcome\}/);
  // error ทับผลลัพธ์ และประกาศด้วย role="alert" (แถบท้ายไม่เลื่อน ⇒ ไม่จมใต้เนื้อ)
  assert.match(shell, /const shown = error \? \{ tone: "error", text: error \} : outcome;/);
  assert.match(shell, /role=\{shown\?\.tone === "error" \? "alert" : "status"\}/);
});

test('⭐ เปลือก: ทุกปุ่มท้ายดับตอน busy · ทุกช่องล็อกด้วย fieldset · ปิดไม่ได้ระหว่างส่ง', () => {
  const buttons = shell.match(/<GatedAction[\s\S]*?>/g) || [];
  assert.equal(buttons.length, 2, 'ปุ่มรอง (map) + ปุ่มหลัก');
  for (const button of buttons) assert.match(button, /disabled=\{busy \|\| /, button);
  assert.match(shell, /<fieldset ref=\{bodyRef\} className=\{styles\.body\} data-layout=\{split \? "split" : "single"\} disabled=\{busy\}>/);
  assert.match(shell, /dismissible=\{!busy\}/);
});

test('⭐ เปลือก: Modal xl/sm · แผ่นเต็มจอบนมือถือ · ชิปต่อท้ายชื่อ · ปุ่มท้ายอยู่ในโซน footer จริง', () => {
  const modal = shell.match(/<Modal[\s\S]*?>/)[0];
  assert.match(modal, /titleAside=\{titleAside\}/);
  assert.match(modal, /size=\{split \? "xl" : "sm"\}/);
  assert.match(modal, /\bsheetOnPhone\b/);
  assert.match(modal, /className=\{more \? `\$\{styles\.shell\} \$\{styles\.more\}` : styles\.shell\}/);
  assert.match(modal, /footer=\{footer\}/);
  assert.doesNotMatch(shell, /form-actions/, 'แถบลอย .form-actions คือ pain 1');
  // ร่าง = ชิปเส้นประ · ชิปชนิดงานมีสีตามชนิด
  assert.match(shell, /data-draft=\{status\.draft \? "yes" : undefined\}/);
  assert.match(shell, /data-kind=\{kind\.key\}/);
  assert.match(shellCss, /\.chip\[data-draft="yes"\] \{[^}]*border-style: dashed;/);
  /* สีชนิดงานตั้งที่ระดับเปลือก — ชิปในหัวกับจุดหน้าชนิดงานในกล่อง "งานนี้" ใช้ชุดเดียว (ไม่ก๊อปรายคอมโพเนนต์) */
  for (const kind of ['install', 'refill', 'maintenance', 'repair', 'inspect', 'remove', 'survey']) {
    assert.match(shellCss, new RegExp(`\\.shell \\[data-kind="${kind}"\\] \\{ --kind:`), kind);
  }
  assert.match(shellCss, /\.chip\[data-kind\]::before \{[^}]*background: var\(--kind, var\(--accent-ink\)\);/);
  assert.match(code(read('./ScheduleModalParts.module.css')), /\.value\[data-kind\]::before \{[^}]*background: var\(--kind, var\(--accent-ink\)\);/);
});

test('เปลือก: สองคอลัมน์ 376px | ที่เหลือ · ≤900 คอลัมน์เดียว · มือถือปุ่มหลักกินที่ที่เหลือ · ปุ่มปิด 44px', () => {
  assert.match(shellCss, /grid-template-columns: minmax\(0, 376px\) minmax\(0, 1fr\);/);
  assert.match(shellCss, /grid-template-areas: "aside main" "tail main";/);
  assert.match(shellCss, /@media \(max-width: 900px\) \{[\s\S]*?grid-template-areas: "aside" "main" "tail";/);
  assert.match(shellCss, /@media \(max-width: 640px\) \{[\s\S]*?\.primary \{\s*flex: 1 1 auto;/);
  assert.match(shellCss, /\.shell :global\(\.drawer-close\) \{[^}]*width: var\(--ctl-h-touch\);[^}]*height: var\(--ctl-h-touch\);/);
  assert.match(shellCss, /\.touch \{\s*min-height: var\(--ctl-h-touch\);/);
});

test('⭐ แผงด่าน: วาดจาก gatePanelView อย่างเดียว — ไม่ตัดสินผ่าน/ไม่ผ่านเอง · สถานะไม่พึ่งสีอย่างเดียว', () => {
  assert.doesNotMatch(gate, /evaluateVisitGate|gateSummary\(|gatePassed\(|state === "blocked"/);
  assert.match(gate, /\{view\.summary\}|label=\{view\.summary\}/);
  assert.match(gate, /data-state=\{row\.state\}/);
  assert.match(gate, /STATE_WORDS\[row\.state\]/, 'คำอ่านออกเสียงของสถานะต่อแถว');
  assert.match(gate, /onClick=\{\(\) => onFix\(row\.fix\.field\)\}/);
  assert.match(gate, /\{children\}/, 'ช่องของแผ่นข้ามด่านต่อท้ายรายการ');
});

test('⭐ ช่องวัน/เวลา: แผ่นเวลาเป็น radiogroup จริง (เลือกอยู่ = aria-checked · roving tabIndex) · ไม่มีเวลาจบ = ไม่มีช่องจบ', () => {
  assert.match(time, /role="radiogroup"/);
  assert.match(time, /role="radio"\s+aria-checked=\{on\}\s+tabIndex=\{on \? 0 : -1\}/);
  assert.match(time, /nextEnabledIndex\(options, index, key, "horizontal"\)/);
  assert.match(time, /timePresetOf\(\{ startTime, endTime \}, \{ withEnd \}\)/);
  assert.match(time, /timePresetOptions\(\{ withEnd \}\)/);
  assert.match(time, /onTime\?\.\(withEnd \? next : \{ startTime: next\.startTime, endTime: "" \}\)/,
    'ลงคิวเข้าพื้นที่ส่งเวลาจบว่างเสมอ (เก็บได้แค่ committedDueTime · D1)');
  assert.match(time, /<div className=\{styles\.date\} ref=\{dateRef\}>/, 'โมดัลพาโฟกัสมาที่ช่องวันผ่าน ref ของกล่อง');
  // แจ้งกำหนดส่ง (หัวข้ออื่น) = วันอย่างเดียว — ไม่มีช่องเวลา ไม่มีแผ่นเวลา (ช่องวันตัวเดียวกันทุกงาน)
  assert.match(time, /withTime = true,/);
  assert.match(time, /const timeBlock = withTime \? \(/);
  assert.match(time, /const tiles = withTime \? \(/);
  assert.match(timeCss, /\.when\[data-with-time="no"\] \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(timeCss, /\.tile \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(timeCss, /\.tile\[data-on\] \{[^}]*background: var\(--accent-soft\);/);
});

test('ชิปผู้ไปด้วย: ปุ่มนำออกมีชื่อบอกว่าเอาใครออก · ส่งออกตามลำดับรายชื่อ ไม่มีผู้รับผิดชอบ · เป้านิ้ว 44px', () => {
  assert.match(helpers, /aria-label=\{`นำ \$\{helper\.name\} ออกจากผู้ไปด้วย`\}/);
  // ชื่อ ลำดับ ตัวเลือก มาจาก lib ตัวเดียว (เทสต์ค่าจริงที่ scheduleModal.test.mjs)
  assert.match(helpers, /const view = helperChipsView\(\{ value, technicians, assigneeId, rosterState \}\);/);
  assert.match(helpers, /onChange\?\.\(orderHelperIds\(next, \{ technicians, assigneeId \}\)\)/);
  assert.doesNotMatch(helpers, /\?\.name \|\| id\b/, '🐞 ห้ามถอยไปโชว์รหัสผู้ใช้ดิบ');
  assert.match(helpers, /<SearchableSelect/);
  assert.match(helpersCss, /\.remove \{[^}]*width: var\(--ctl-h-touch\);[^}]*height: var\(--ctl-h-touch\);/);
  assert.match(helpersCss, /\.add \{[^}]*min-height: var\(--ctl-h-touch\);/);
});

test('ตัวเลือกเจ้าหน้าที่: แผ่นและแถวสูงเท่าเป้านิ้ว · มือถือแผ่นว่างคอลัมน์เดียว แถบภาระลงแถวสอง', () => {
  assert.match(pickerCss, /\.tile,\s*\.row,\s*\.none \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(pickerCss, /@media \(max-width: 640px\) \{[\s\S]*?\.grid \{\s*grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.load \{ grid-column: 2; \}/);
  assert.match(picker, /data-cap=\{cell\.cap \? "1" : undefined\}/, 'เส้นเพดานบนแถบ (ขีดละหนึ่งจุด ไม่มี style width)');
});

test('🔴 ชิ้นส่วนใหม่ไม่มี style={{…}} (เพดาน inlineStyle ของโมดูลส่วนกลางขึ้นไม่ได้)', () => {
  for (const [name, src] of [['เปลือก', shell], ['แผงด่าน', gate], ['วัน/เวลา', time], ['ผู้ไปด้วย', helpers], ['ตัวเลือกคน', picker]]) {
    assert.doesNotMatch(src, /style=\{\{/, name);
  }
});

/* ═══ ขั้น B2 — "สองงาน เปลือกเดียว" (มติเจ้าของ 24/09 แบบ A) ═══════════════════════════════════════
   🐞 ก่อนหน้านี้สองโมดัลเป็นสองเปลือก (820 vs 600 · แถบปุ่มลอยกลางเนื้อ vs แถบจริง · ปุ่มหลักสองปุ่ม · pain 1 6 13)
   ⇒ ล็อกว่าทั้งสองวาด `ScheduleModalShell` ตัวเดียว และช่องหลักเป็นชิ้นเดียวกัน */
const visitModal = code(read('./ServiceVisitModal.js'));
const dueDialog = code(read('../requests/CommitDueDialog.js'));
const MODALS = [['โมดัลนัด', visitModal], ['โมดัลลงคิว', dueDialog]];

test('⭐ B2: สองโมดัลวาดเปลือกเดียว — ไม่ประกอบ Modal/แถบปุ่ม/ปุ่มหลักเอง', () => {
  assert.match(visitModal, /import ScheduleModalShell from "\.\/ScheduleModalShell";/);
  assert.match(dueDialog, /import ScheduleModalShell from "@\/components\/service\/ScheduleModalShell";/);
  for (const [name, src] of MODALS) {
    assert.equal((src.match(/<ScheduleModalShell\b/g) || []).length, 1, `${name}: เปลือกตัวเดียว`);
    assert.doesNotMatch(src, /from "@\/components\/Modal"/, `${name}: ไม่ประกอบ Modal เอง`);
    assert.doesNotMatch(src, /form-actions|footer=/, `${name}: ไม่มีแถบปุ่มของตัวเอง`);
    assert.doesNotMatch(src, /tone="primary"/, `${name}: ปุ่มหลักมีที่เปลือกที่เดียว`);
    assert.doesNotMatch(src, /style=\{\{/, name);
  }
});

test('⭐ B2: ช่องหลักเป็นชิ้นเดียวกัน — ตัวเลือกคน · ช่องวัน/เวลา · แผงด่าน อย่างละหนึ่งในแต่ละโมดัล', () => {
  for (const [name, src] of MODALS) {
    for (const tag of ['<CrewLoadPicker', '<TimeWindowField', '<GatePanel', '<JobFacts']) {
      assert.equal((src.match(new RegExp(`${tag}\\b`, 'g')) || []).length, 1, `${name}: ${tag}`);
    }
    // ไม่มีกติกาด่านในโมดัล — ด่านมาจาก lib (visitGate ผ่าน gatePanelView / commitDueGateView)
    assert.doesNotMatch(src, /state === "blocked"|gateSummary\(|gatePassed\(/, name);
  }
  // ช่องวันของสองโมดัล: นัด = เวลาเริ่ม–จบ · ลงคิว = เวลาเริ่มอย่างเดียว (D1) · แจ้งกำหนดส่ง = วันอย่างเดียว
  assert.doesNotMatch(visitModal.match(/<TimeWindowField[\s\S]*?\/>/)[0], /withEnd=/);
  assert.match(dueDialog.match(/<TimeWindowField[\s\S]*?\/>/)[0], /withEnd=\{false\}/);
});

test('⭐ B2: เปลือกได้ busy ของงานนั้น (โมดัลนัด = บันทึก หรือ ลบ) — ปุ่มท้ายทุกตัวดับพร้อมกัน', () => {
  assert.match(visitModal, /<ScheduleModalShell[\s\S]*?busy=\{saving \|\| deleting\}/);
  assert.match(dueDialog, /<ScheduleModalShell[\s\S]*?busy=\{busy\}/);
  // เปลือก: ทุกปุ่มท้ายดับตอน busy (ยามข้างบน) · error ทับผลลัพธ์ (role="alert" ในแถบท้ายที่ไม่เลื่อน)
  assert.match(visitModal, /<ScheduleModalShell[\s\S]*?error=\{error\}/);
  assert.match(visitModal, /<ScheduleModalShell[\s\S]*?outcome=\{view\.outcome\}/);
  assert.match(dueDialog, /<ScheduleModalShell[\s\S]*?outcome=\{outcome\}/);
});

test('⭐ B2: Modal มีสามตัวเลือกของเปลือก · มือถือเป็นแผ่นเต็มจอ (≤640)', () => {
  const modalSrc = read('../Modal.js');
  assert.match(modalSrc, /titleAside,/);
  assert.match(modalSrc, /sheetOnPhone = false,/);
  assert.match(modalSrc, /className = "",/);
  const globals = read('../../app/globals.css');
  assert.match(globals, /@media \(max-width: 640px\) \{\s*\.overlay\.phone-sheet \{/);
  assert.match(globals, /\.drawer\.phone-sheet \.drawer-footer \{\s*padding-bottom: calc\(var\(--space-3\) \+ env\(safe-area-inset-bottom\)\);/);
});

test('ชิ้นส่วนร่วม (ScheduleModalParts): ส่วนพับเมานต์เนื้อไว้เสมอ · ปุ่มกดได้สูงเท่าเป้านิ้ว · ไม่มี style={{}}', () => {
  const parts = code(read('./ScheduleModalParts.js'));
  const partsCss = code(read('./ScheduleModalParts.module.css'));
  // เธรดในส่วนพับต้องโหลด/มาร์คว่าอ่านแล้วตอนเปิดโมดัลเหมือนเดิม ⇒ ซ่อนด้วย hidden ไม่ใช่ถอด
  assert.match(parts, /<div id=\{panelId\} className=\{styles\.discPanel\} hidden=\{!open\}>\{children\}<\/div>/);
  assert.match(parts, /aria-expanded=\{open\} aria-controls=\{panelId\}/);
  assert.match(partsCss, /\.discButton \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(partsCss, /\.wishApply \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.doesNotMatch(parts, /style=\{\{/);
  // โมดัลนัดส่งก้อนของเธรดเข้าบรรทัดย่อ (ไม่ยิง API ซ้ำ)
  assert.match(visitModal, /onItemsChange=\{setThreadItems\}/);
  assert.match(visitModal, /const digest = threadDigest\(threadItems\);/);
});


/* ═══ รีวิว UAT 24/09 — ยามของข้อที่แก้หลังเปิดจอจริง ═══════════════════════════════════════════ */
const parts = code(read('./ScheduleModalParts.js'));
const partsCss = code(read('./ScheduleModalParts.module.css'));
const gateCss = code(read('./GatePanel.module.css'));

test('🐞 ลิงก์แก้บนแผงด่าน ("เลือกเจ้าหน้าที่" · "แก้วัน/เวลา") เป็นเป้านิ้ว 44px โดยไม่ดันบรรทัดให้สูงขึ้น', () => {
  const fix = gateCss.match(/\.fix \{[^}]*\}/);
  assert.ok(fix, 'ต้องมีกฎ .fix ของตัวเอง (เดิมสูง 20px)');
  assert.match(fix[0], /display: inline-flex;/);
  assert.match(fix[0], /min-block-size: var\(--ctl-h-touch\);/);
  assert.match(fix[0], /margin-block: calc\(\(var\(--ctl-h-touch\) - 1lh\) \/ -2\);/, 'กล่องสูง 44 แต่กินที่บรรทัดเท่าเดิม');
});

test('🐞 แผงด่านมีสถานะ "เตือน" (ข้อ ④ ของงานสำรวจ) ที่ไม่ใช่ทั้งผ่านและไม่ผ่าน — ไอคอน/คำอ่านของตัวเอง', () => {
  assert.match(gate, /warn: AlertTriangle/);
  assert.match(gate, /warn: "เตือน"/);
  assert.match(gateCss, /\.row\[data-state="warn"\] \.mark \{[^}]*background: var\(--amber-soft\);/);
});

test('🐞 ช่วงเวลา/วันที่ไม่ถูกหั่นกลางบรรทัด — บรรทัดช่วงเข้าไซต์ · เหตุบนแผงด่าน · บรรทัดผลลัพธ์ ผ่าน KeepTogether', () => {
  assert.match(parts, /export function KeepTogether\(\{ text \}\)/);
  assert.match(parts, /keepTogetherRuns\(text\)/);
  assert.match(partsCss, /\.keep \{[^}]*white-space: nowrap;/);
  assert.match(time, /<KeepTogether text=\{access\.text\} \/>/);
  assert.match(time, /<KeepTogether text=\{access\.windowText\} \/>/);
  assert.match(gate, /<KeepTogether text=\{row\.detail\} \/>/);
  assert.match(shell, /<KeepTogether text=\{shown\.text\} \/>/);
});

test('🐞 ตัวพาโฟกัสไปช่อง (ลิงก์แก้ · ปุ่มบนการ์ด) มีที่เดียว — สองโมดัลเรียก focusFieldBox ตัวเดียวกัน', () => {
  assert.match(parts, /export function focusFieldBox\(box\)/);
  assert.match(parts, /export const FIELD_FOCUSABLE = /);
  for (const [name, src] of MODALS) {
    assert.doesNotMatch(src, /const FOCUSABLE = /, `${name}: ไม่ประกาศตัวเลือกซ้ำ`);
    assert.match(src, /focusFieldBox\(/, name);
  }
});

test('🐞 ชิป "ใช้ตามผู้ขอ" กดแล้วโฟกัสไม่หล่นหาย — ย้ายไปที่ชิป "ตรงกัน" ที่มาแทนปุ่ม', () => {
  const wish = parts.slice(parts.indexOf('export function WishChip'));
  assert.match(wish, /ref=\{sameRef\} tabIndex=\{-1\}/);
  assert.match(wish, /applied\.current = true;\s*onApply\?\.\(wish\.patch\);/);
  assert.match(wish, /if \(applied\.current && wish\?\.same\) \{\s*applied\.current = false;\s*sameRef\.current\?\.focus\(\);/);
});

test('🐞 ผู้ไปด้วย: กด "+ เพิ่ม" แล้วรายการกางเลย · มีปุ่มยกเลิก · เลือก/นำออกแล้วโฟกัสไปที่ถัดไป ไม่หล่นไป body', () => {
  // กางรายการทันที (เดิมต้องกดสองครั้ง)
  assert.match(helpers, /if \(adding\) pickerRef\.current\?\.querySelector\("button"\)\?\.click\(\);/);
  // ยกเลิกได้โดยไม่ต้องเลือกใคร
  assert.match(helpers, /aria-label="ยกเลิกการเพิ่มผู้ไปด้วย"/);
  // โฟกัสหลังเปลี่ยน: เลือกแล้ว → ปุ่มเพิ่ม (ไม่มีแล้วก็ชิปใหม่) · นำออก → ชิปถัดไป/ก่อนหน้า/ปุ่มเพิ่ม
  assert.match(helpers, /focusAfter\.current = \{ prefer: "add", fallback: id \};/);
  assert.match(helpers, /focusAfter\.current = \{ prefer: next \|\| "add", fallback: "add" \};/);
  assert.match(helpers, /data-helper-add/);
  assert.match(helpers, /data-helper-remove=\{helper\.id\}/);
  // รายชื่อกำลังโหลด ⇒ ชื่อบนชิปเป็นข้อความโหลด (โมดัลนัดส่งสถานะรายชื่อมา)
  assert.match(visitModal, /<HelperChips[\s\S]*?rosterState=\{rosterState\}/);
});

test('🐞 วันที่ในช่องเป็นวันไทยมีวันในสัปดาห์ (pain 10) — ช่องวันนัด · วันส่งผล · วันที่เข้าจริง', () => {
  assert.match(time, /<DateInput id=\{dateId\} value=\{date \|\| ""\} onChange=\{onDate\} disabled=\{disabled\} required=\{required\} weekday \/>/);
  // ข้างหัวช่องเหลือระยะห่าง ("อีก 7 วัน") — วันไทยอยู่ในช่องแล้ว ไม่พูดซ้ำ
  assert.match(time, /const dateAside = rel\.text;/);
  assert.match(dueDialog, /<DateInput id=\{resultId\} value=\{form\.resultDate \|\| ""\} onChange=\{set\("resultDate"\)\} required weekday \/>/);
  assert.match(visitModal, /<DateInput id=\{actualDateId\} value=\{form\.actualDate\}[^\n]*\bweekday \/>/);
});

test('🐞 ลงคิว: แผ่นเวลา เช้า/บ่าย กลับมา (เติมแค่เวลาเริ่ม) · ช่องเวลาจบเป็นช่องจาง "ไม่ระบุ" ตามแบบ A', () => {
  assert.match(time, /\{withEnd \? \(\s*<TimeInput/);
  assert.match(time, /<span className=\{styles\.endNone\}>\s*ไม่ระบุ<span className=\{styles\.srOnly\}> — เวลาจบ ลงคิวเข้าพื้นที่ไม่เก็บเวลาจบ<\/span>/);
  assert.match(timeCss, /\.endNone \{[^}]*min-height: var\(--ctl-h\);/);
  // กดแผ่น = pickTimePreset (จำเวลาที่พิมพ์เองไว้ตอนออกจาก "กำหนดเอง")
  assert.match(time, /const remembered = useRef\(null\);/);
  assert.match(time, /pickTimePreset\(key, \{ selected, current: \{ startTime, endTime \}, remembered: remembered\.current, withEnd \}\)/);
  assert.match(time, /remembered\.current = step\.remembered;/);
});

test('🐞 ตัวเลือกคนที่บังคับแต่ยังว่าง (ลงคิว) ขอบสีเตือน + aria-invalid — ไม่ใช่บอกแค่ท้ายโมดัล', () => {
  assert.match(picker, /data-invalid=\{view\.invalid \? "1" : undefined\}/);
  assert.match(picker, /aria-invalid=\{view\.invalid \? "true" : undefined\}/);
  assert.match(pickerCss, /\.picker\[data-invalid\] \{[^}]*border-color: var\(--red\);/, 'สีเดียวกับช่องกรอกผิดของระบบ');
});

test('🐞 เปลือกทึบ (ไม่เห็นตารางทะลุ) · เนื้อยังมีต่อข้างล่าง = เงาที่ขอบบนของแถบท้าย', () => {
  assert.match(shellCss, /\.shell \{[^}]*background: var\(--panel-solid\);/);
  assert.match(shellCss, /\.more :global\(\.drawer-footer\) \{[^}]*box-shadow:/);
  assert.match(shell, /className=\{more \? `\$\{styles\.shell\} \$\{styles\.more\}` : styles\.shell\}/);
  assert.match(shell, /new ResizeObserver\(update\)/);
});

test('🐞 โมดัลนัด: เลือกไซต์จากช่องที่กางเองตอนเปิด แล้วช่องไม่หายไปกับโฟกัส · ร่างพับชิปสถานะ', () => {
  assert.match(visitModal, /if \(sections\.siteEditOpen\) setWhatOpen\(true\);/);
  assert.match(visitModal, /sections\.statusFold === "none" \?/);
  assert.match(visitModal, /title="ปิดร่างนี้แทนการปล่อย"/);
  assert.match(visitModal, /open=\{statusOpen \|\| sections\.statusFold === "open"\}/);
  // บรรทัดผลลัพธ์รู้ภาระของวันนั้น (เตือนเกินภาระ) และไซต์ (ป้ายสั้นของข้อ ④)
  assert.match(visitModal, /visitModalView\(\{[\s\S]*?load: dayLoad, siteLoad, site,[\s\S]*?\}\)/);
});
