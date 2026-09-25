// ── โมดัลลงคิว/แจ้งกำหนดส่ง = ตัวเดียวของสองหน้า (มติเจ้าของ 23/09) ─────────────────────
//
// ⭐ TS ลงคิวคำร้องประเมินพื้นที่ได้ทั้งจากหน้าใบ (/requests/[id]) และจากการ์ดบนหน้าจัดคิว
//    (/service/schedule) ⇒ กติกา AGENTS.md "ฟอร์มเดียวกันสองที่ = component เดียว" — ฟอร์มที่ก๊อป
//    สองชุดเพี้ยนหากันเสมอ (วันหนึ่งหน้าหนึ่งลืมส่ง `committedResultDate` · อีกหน้าเลือกคนโดยไม่เห็นภาระ)
// ⚠️ ไฟล์พวกนี้เป็น JSX (import ใต้ raw Node ไม่ได้) ⇒ ยามอ่านซอร์ส · ตรรกะจริงเทสต์ที่
//    `lib/requests/commitDue.test.mjs` · `lib/service/useCrewLoad.test.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const dialog = read('./CommitDueDialog.js');
const requestPage = read('../../app/requests/[id]/page.js');
const schedulePage = read('../../app/service/schedule/page.js');

/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์ที่เล่าประวัติยังพูดถึงของเดิมได้ */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('⭐ สองหน้าใช้โมดัลตัวเดียว — import เดียวกัน · วางคนละจุดแต่เป็น component เดียว', () => {
  for (const [name, src] of [['หน้าใบ', requestPage], ['หน้าจัดคิว', schedulePage]]) {
    assert.match(src, /import CommitDueDialog from "@\/components\/requests\/CommitDueDialog";/, name);
    assert.equal((code(src).match(/<CommitDueDialog\b/g) || []).length, 1, `${name}: วางโมดัลที่เดียว`);
  }
});

test('🔴 หน้าใบไม่มีฟอร์มลงคิวชุดที่สองเหลืออยู่', () => {
  const live = code(requestPage);
  assert.doesNotMatch(live, /action: "commit-due"/, 'ก้อน PATCH ต้องมาจาก commitDuePayload ในโมดัล ไม่ใช่เขียนเองในหน้า');
  assert.doesNotMatch(live, /\[commitDue, setCommitDue\]/, 'หน้าใบถือแค่เปิด/ปิด ไม่ถือค่าฟอร์ม');
  assert.doesNotMatch(live, /committedResultDate: commitDue/);
  // ตัวเลือกคนแบบดรอปดาวน์ที่ไม่เห็นภาระ (ของเดิม) ต้องไม่กลับมา
  assert.doesNotMatch(live, /<SearchableSelect\b/);
  assert.doesNotMatch(live, /หรือใส่ทีม SV/);
  assert.match(live, /onClick: \(\) => setDueDialogOpen\(true\)/);
  // ส่งผ่าน call() ของหน้า (ดึงใบใหม่ · toast · _warning) ด้วยก้อนที่โมดัลประกอบ
  assert.match(live, /onSubmit=\{\(payload\) => call\("", \{\s*method: "PATCH",\s*body: JSON\.stringify\(payload\),/);
});

test('⭐ "ลงคิวใหม่" ถามตัวตัดสินเดียวกับการ์ดหน้าจัดคิว · ข้อความรับเรื่องชุดเดียวกัน', () => {
  const live = code(requestPage);
  assert.match(live, /const needsRequeue = surveyQueueStep\(req\) === "requeue";/);
  // 🐞 ของเดิม: ไม่มีนัดที่ยังมีชีวิต = ลงคิวใหม่ ⇒ ใบที่ช่างไปถึงไซต์แล้วก็ได้ปุ่มนี้
  assert.doesNotMatch(live, /!holdsRequestSlot\(req\.surveyVisit\)/);
  assert.match(live, /label: dueDialogLabels\.action,/);
  assert.match(live, /hint: dueDialogLabels\.hint,/);
  assert.match(live, /if \(confirm\.kind === "acknowledge"\) return acknowledgeConfirmCopy\(req\);/);
  assert.match(code(schedulePage), /acknowledgeConfirmCopy\(ackRow\.request\)/);
});

/* ⭐ แบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) — ทุกคำ/การตัดสินมาจาก lib ตัวเดียว · โมดัลวาดอย่างเดียว */
test('⭐ โมดัล: ตัวเลือกคนเห็นภาระ · ไม่มี "ยังไม่มอบหมาย" · ก้อนที่ส่ง ด่าน หัว และผลลัพธ์มาจาก lib ตัวเดียว', () => {
  const live = code(dialog);
  assert.match(live, /<CrewLoadPicker\s+allowUnassigned=\{false\}/);
  assert.match(live, /onSubmit\?\.\(commitDuePayload\(request, form, \{ technicians \}\)\)/);
  assert.match(live, /const gaps = commitDueGaps\(request, form\);/);
  assert.match(live, /blocker: gaps\.join\(" · "\),/);
  assert.match(live, /useState\(\(\) => commitDueDefaults\(request, \{ requeue, today \}\)\)/);
  // หัว · "งานนี้" · ชิปผู้ขอ · แผงด่าน · บรรทัดผลลัพธ์ — ทุกตัวถามจาก lib ด้วยบริบทเดียวกัน
  assert.match(live, /const header = commitDueHeader\(request, \{ site \}\);/);
  assert.match(live, /const jobRows = commitDueJobRows\(request, \{ site, todayIso: today, siteLoad \}\);/);
  assert.match(live, /const wishes = commitDueWishes\(request, form\);/);
  assert.match(live, /const gateView = commitDueGateView\(request, form, \{ site, accessKnown, technicians \}\);/);
  assert.match(live, /const outcome = commitDueOutcome\(request, form, \{ site, accessKnown, technicians, load, siteLoad \}\);/);
  assert.match(live, /const load = form\.date \? loadFor\(form\.date\) : null;/);
  assert.match(live, /load=\{load\}/, 'ตัวเลือกคนกับบรรทัดผลลัพธ์อ่านภาระชุดเดียวกัน');
  // 🐞 คำใบ้ที่สัญญาว่า "ขึ้นตารางเสมอ" ผิดทุกครั้งที่ด่าน ④ ไม่ผ่าน — ผลของการเลือกอยู่ที่บรรทัดผลลัพธ์เท่านั้น
  assert.doesNotMatch(live, /นัดจะขึ้นตารางและงานวันนี้ของคนนี้|นัดจะขึ้นตารางของคนนี้ทันที/);
  // โหมด/ลงคิวใหม่ ตัดสินในโมดัลเอง — ผู้เรียกส่งผิดไม่ได้
  assert.match(live, /const siteMode = commitDueMode\(request\) === "site";/);
  assert.match(live, /const requeue = surveyQueueStep\(request\) === "requeue";/);
  assert.doesNotMatch(live, /request\.kind ===/);
  // ไม่มีกติกาด่านเขียนเองในโมดัล
  assert.doesNotMatch(live, /evaluateVisitGate|state === "blocked"|gateSummary\(/);
});

/* ⭐ ก้อนที่ส่งต้องเท่าของเดิมทุกตัว (ขอบเขต "UI อย่างเดียว") — ทางส่งทางเดียว · ตัวประกอบก้อนตัวเดียว
   ค่าในก้อนล็อกด้วยค่าจริงที่ `lib/requests/commitDue.test.mjs` (commitDuePayload) */
test('🔒 ก้อน PATCH: ส่งทางเดียวผ่าน commitDuePayload · ชิปผู้ขอแค่เติมช่องของฟอร์ม · ไม่มีช่องใหม่', () => {
  const live = code(dialog);
  assert.equal((live.match(/onSubmit\?\.\(/g) || []).length, 1, 'ทางส่งทางเดียว');
  assert.equal((live.match(/commitDuePayload\(/g) || []).length, 1);
  // ชิป "ใช้ตามผู้ขอ" เติมค่าผ่านฟอร์มเดิม (patch ของ lib = date/time/resultDate) — ไม่ใช่ส่งตรง
  assert.match(live, /const apply = \(patch\) => setForm\(\(prev\) => \(\{ \.\.\.prev, \.\.\.patch \}\)\);/);
  assert.equal((live.match(/<WishChip wish=\{wishes\.(visit|result)\} onApply=\{apply\}/g) || []).length, 2);
  // เวลาเก็บได้แค่เวลาเริ่ม (committedDueTime · D1) — ช่องเวลาไม่มีเวลาจบ
  assert.match(live, /onTime=\{\(\{ startTime \}\) => set\("time"\)\(startTime\)\}/);
  assert.match(live, /withEnd=\{false\}/);
  // ฟอร์มมีห้าช่องเท่าเดิม (date · time · resultDate · assigneeId · reason) — ไม่มี set ของช่องอื่น
  const keys = [...live.matchAll(/set\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['assigneeId', 'date', 'reason', 'resultDate', 'time']);
});

test('⭐ ภาระ: ผู้เรียกส่งมา = ใช้ของผู้เรียก (หน้าจัดคิว) · ไม่ส่ง = โมดัลโหลดเอง (หน้าใบ)', () => {
  const live = code(dialog);
  assert.match(live, /useCrewLoad\(\{ enabled: siteMode && !staffLoadFor, technicians \}\)/);
  assert.match(live, /const loadFor = staffLoadFor \|\| ownLoadFor;/);
  // ⚠️ ฮุกอยู่ในตัวฟอร์มที่เมานต์เฉพาะตอนเปิด (ไม่ใช่ตัวนอกที่ early-return)
  assert.match(live, /if \(!open \|\| !request\) return null;\s*return <CommitDueForm key=\{request\.id\}/);
  const scheduleTag = code(schedulePage).match(/<CommitDueDialog[\s\S]*?\/>/)[0];
  const requestTag = code(requestPage).match(/<CommitDueDialog[\s\S]*?\/>/)[0];
  assert.match(scheduleTag, /staffLoadFor=\{staffLoadFor\}/);
  assert.doesNotMatch(requestTag, /staffLoadFor=/, 'หน้าใบไม่มีรายการงานในมือ — ส่ง null ไปจะได้ "ไม่รู้" ตลอด');
  /* ⭐ หน้าจัดคิวมีไซต์เต็มแถว (ช่วงเวลาที่ให้เข้า) ⇒ เตือนข้อ ④ ก่อนกด
     ⭐ **หน้าใบเห็นเท่าหน้าจัดคิวแล้ว** (หน้าคำร้องแบบไทม์ไลน์ · มติเจ้าของ 25/09 ปิดข้อจำกัดจากรีวิว UAT 24/09) —
        `surveySite` select ช่วงเวลาเข้าไซต์มาด้วย และ GET ติด `surveySiteLoad` จาก `visitBundle` สูตรเดียวกับหน้าจัดคิว */
  assert.match(scheduleTag, /site=\{dueRow\?\.site \|\| null\}/);
  assert.match(scheduleTag, /accessKnown=\{!!dueRow\?\.site\}/);
  assert.match(scheduleTag, /siteLoad=\{dueRow \? workloadAll\[dueRow\.request\.siteId\] \|\| null : null\}/);
  assert.match(requestTag, /site=\{req\.surveySite \|\| null\}/);
  assert.match(requestTag, /accessKnown=\{!!req\.surveySite\}/);
  assert.match(requestTag, /siteLoad=\{req\.surveySiteLoad \|\| null\}/);
  assert.match(live, /accessKnown = false,/, 'ไม่ส่ง = ไม่รู้');
  // หัวมาจาก lib ทั้งสองหน้า — ไม่มีบรรทัดรองที่หน้าประกอบเอง
  for (const tag of [scheduleTag, requestTag]) assert.doesNotMatch(tag, /subtitle=/);
});

test('ลำดับช่อง: ซ้าย งานนี้ → ด่าน · ขวา วัน/เวลา → วันส่งผล → เจ้าหน้าที่ · หมายเหตุท้ายซ้าย (ความรับผิดชอบอยู่ท้าย)', () => {
  const live = code(dialog);
  const aside = live.slice(live.indexOf('const aside = siteMode'), live.indexOf('const main = ('));
  const main = live.slice(live.indexOf('const main = ('), live.indexOf('const tail = ('));
  const tail = live.slice(live.indexOf('const tail = ('), live.indexOf('return (\n    <ScheduleModalShell'));
  assert.ok(aside.indexOf('<JobFacts') >= 0 && aside.indexOf('<JobFacts') < aside.indexOf('<GatePanel'));
  const at = (needle) => {
    const i = main.indexOf(needle);
    assert.ok(i >= 0, `หา ${needle} ไม่เจอ`);
    return i;
  };
  const order = [at('<TimeWindowField'), at('label={labels.resultLabel}'), at('<CrewLoadPicker')];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(tail, /label="หมายเหตุ \(ไม่บังคับ\)"/);
  assert.match(tail, /placeholder=\{labels\.notePlaceholder\}/);
  assert.match(live, /aside=\{aside\}\s+main=\{main\}\s+tail=\{tail\}/);
  // แจ้งกำหนดส่ง (หัวข้ออื่น) = คอลัมน์เดียว วันอย่างเดียว
  assert.match(live, /layout=\{siteMode \? "split" : "single"\}/);
  assert.match(live, /withTime=\{siteMode\}/);
  // รายชื่อกำลังโหลด / โหลดพัง / ไม่มีใครเลย — สามข้อความของตัวเลือก (ไม่ใช่ข้อความเดียว)
  assert.match(live, /const rosterState = techniciansLoading \? "loading" : techniciansError \? "error" : "ready";/);
  assert.match(live, /rosterState=\{rosterState\}/);
  const lib = read('../../lib/service/scheduleModal.js');
  assert.match(lib, /กำลังโหลดรายชื่อเจ้าหน้าที่…/);
  assert.match(lib, /โหลดรายชื่อเจ้าหน้าที่ไม่สำเร็จ/);
  assert.match(lib, /ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน/);
});
