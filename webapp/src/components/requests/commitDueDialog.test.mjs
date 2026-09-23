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

test('⭐ โมดัล: ตัวเลือกคนเห็นภาระ · ไม่มี "ยังไม่มอบหมาย" · ก้อนที่ส่งและด่านมาจาก lib ตัวเดียว', () => {
  const live = code(dialog);
  assert.match(live, /<CrewLoadPicker\s+allowUnassigned=\{false\}/);
  // 🐞 คำใบ้ใต้ตัวเลือกคนมาจาก lib (บอกเงื่อนไขด่าน ④) — ไม่ใช่ประโยคเด็ดขาดที่เขียนในโมดัล
  assert.match(live, /<small className=\{styles\.hint\}>\{labels\.assigneeHint\}<\/small>/);
  assert.doesNotMatch(live, /นัดจะขึ้นตารางและงานวันนี้ของคนนี้/);
  assert.match(live, /onSubmit\?\.\(commitDuePayload\(request, form, \{ technicians \}\)\)/);
  assert.match(live, /const gaps = commitDueGaps\(request, form\);/);
  assert.match(live, /<GatedAction[^>]*blocker=\{gaps\.join\(" · "\)\}/);
  assert.match(live, /useState\(\(\) => commitDueDefaults\(request, \{ requeue, today \}\)\)/);
  // โหมด/ลงคิวใหม่ ตัดสินในโมดัลเอง — ผู้เรียกส่งผิดไม่ได้
  assert.match(live, /const site = commitDueMode\(request\) === "site";/);
  assert.match(live, /const requeue = surveyQueueStep\(request\) === "requeue";/);
  assert.doesNotMatch(live, /request\.kind ===/);
});

test('⭐ ภาระ: ผู้เรียกส่งมา = ใช้ของผู้เรียก (หน้าจัดคิว) · ไม่ส่ง = โมดัลโหลดเอง (หน้าใบ)', () => {
  const live = code(dialog);
  assert.match(live, /useCrewLoad\(\{ enabled: site && !staffLoadFor, technicians \}\)/);
  assert.match(live, /const loadFor = staffLoadFor \|\| ownLoadFor;/);
  // ⚠️ ฮุกอยู่ในตัวฟอร์มที่เมานต์เฉพาะตอนเปิด (ไม่ใช่ตัวนอกที่ early-return)
  assert.match(live, /if \(!open \|\| !request\) return null;\s*return <CommitDueForm key=\{request\.id\}/);
  assert.match(code(schedulePage), /<CommitDueDialog[\s\S]*?staffLoadFor=\{staffLoadFor\}[\s\S]*?\/>/);
  assert.doesNotMatch(code(requestPage).match(/<CommitDueDialog[\s\S]*?\/>/)[0], /staffLoadFor=/,
    'หน้าใบไม่มีรายการงานในมือ — ส่ง null ไปจะได้ "ไม่รู้" ตลอด');
});

test('ลำดับช่อง: วัน · เวลา → วันส่งผล → เจ้าหน้าที่ → หมายเหตุ (ความรับผิดชอบอยู่ท้าย · ตัวเลือกคนต้องรู้วันก่อน)', () => {
  const live = code(dialog);
  const at = (needle) => {
    const i = live.indexOf(needle);
    assert.ok(i >= 0, `หา ${needle} ไม่เจอ`);
    return i;
  };
  const order = [
    at('{labels.dateLabel} *'),
    at('เวลานัด (ไม่บังคับ)'),
    at('{labels.resultLabel} *'),
    at('เจ้าหน้าที่ผู้รับผิดชอบ *'),
    at('หมายเหตุ (ไม่บังคับ)'),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // รายชื่อกำลังโหลด / โหลดพัง / ไม่มีใครเลย — สามข้อความ ไม่ใช่ข้อความเดียว
  assert.match(live, /กำลังโหลดรายชื่อเจ้าหน้าที่…/);
  assert.match(live, /โหลดรายชื่อเจ้าหน้าที่ไม่สำเร็จ/);
  assert.match(live, /ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน/);
});
