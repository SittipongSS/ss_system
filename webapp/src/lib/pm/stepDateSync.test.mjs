// ── สามช่องของขั้นตอน: วันเริ่ม · วันจบ · จำนวนวันทำการ ต้องเดินตามกันเสมอ ──────
//
// อาการที่ผู้ใช้เจอ (2026-08-12): "แก้วันเริ่มหรือวันจบแล้วจำนวนวันไม่ขยับ"
// สูตรใน stepSchedule.js ถูกและมีเทสต์ครอบอยู่แล้ว รอยรั่วอยู่ที่ตารางกับ API:
//
//   1. ช่องจำนวนวันในตารางเป็น uncontrolled (`defaultValue` ไม่มี `key`) แถวไม่ remount
//      ค่าที่คำนวณใหม่จึงไม่เข้า DOM — เลขค้างเป็นซากค่าเก่าจนกว่าจะรีเฟรชทั้งหน้า
//   2. ล้างช่องวันจบส่ง `finishDate: null` ทะลุถึง PATCH → เขียน null ลงฐานโดย
//      durationDays เดิมค้าง และ SCHEDULE_FIELDS ไม่มี finishDate จึงไม่ recalc ต่อ
//   3. ส่งวันจบมาโดยขั้นตอนยังไม่มีวันเริ่ม → แปลงเป็นจำนวนวันไม่ได้ ค่าถูกลบทิ้งเงียบ ๆ
//   4. เพิ่มขั้นตอนพร้อมวันเริ่มที่กรอกเอง แต่ POST ไม่ตั้ง startLocked → recalculateGraph
//      ดึงกลับไปเกาะ anchor/predecessors ทันที วันที่กรอกหายตั้งแต่แถวแรกที่สร้าง
//
// กติกาที่ตรึงไว้: **วันจบเป็นค่าคำนวณเสมอ (วันเริ่ม + จำนวนวันทำการ)** ไม่มีทางไหน
// เขียนวันจบที่ client ส่งมาลงฐานตรง ๆ · ของจริงอยู่ใน route handler ที่เรียก supabase
// เรียกตรงในเทสต์ไม่ได้ถ้าไม่ stub ทั้งไคลเอนต์ จึงเป็น ratchet อ่าน source
// (แพตเทิร์นเดียวกับ dealStageIntegrity.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setHolidays } from './dateHelpers.js';
import { computeFinish, durationFromDates, syncStepForm, syncStepPatch } from './stepSchedule.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const PATCH_ROUTE = 'app/api/pm/project-tasks/[id]/route.js';
const CREATE_ROUTE = 'app/api/pm/project-tasks/route.js';
const TABLE = 'components/salesPlanning/DealTimelineTable.js';
const DOC_VIEW = 'components/pm/ProjectDocumentView.js';

setHolidays([]); // เทสต์สูตรสนใจเสาร์-อาทิตย์อย่างเดียว

// ── ฝั่ง server ───────────────────────────────────────────────────────────────

test('PATCH: วันจบต้องถูกถอดออกจาก updates ทุกกรณี ไม่ใช่เฉพาะตอนมีค่า', () => {
  const src = read(PATCH_ROUTE);
  assert.match(
    src,
    /if\s*\('finishDate'\s+in\s+updates\)/,
    'ต้องเข้าเงื่อนไขด้วย "มีคีย์ finishDate ไหม" — เช็คค่า truthy ทำให้ null รอดไปเขียนฐาน',
  );
  assert.doesNotMatch(
    src,
    /if\s*\(updates\.finishDate\s*&&/,
    'ห้ามกลับไปเช็ค truthy — `finishDate: null` จะรอดไปถึง .update() อีก',
  );
  assert.match(src, /delete updates\.finishDate;/, 'ต้องถอด finishDate ออกก่อนเขียนฐานเสมอ');
});

test('PATCH: ส่งวันจบมาโดยไม่มีวันเริ่ม = ปฏิเสธพร้อมเหตุผล ไม่ใช่กลืนเงียบ', () => {
  const src = read(PATCH_ROUTE);
  assert.match(
    src,
    /if\s*\(!startForCalc\)\s*return badRequest\(/,
    'ไม่มีวันเริ่มต้องตอบ badRequest — เดิมลบค่าทิ้งแล้วตอบ 200 ผู้ใช้ไม่รู้ว่าค่าหาย',
  );
  assert.match(src, /badRequest/, 'ต้อง import badRequest มาใช้จริง');
});

test('PATCH: SCHEDULE_FIELDS ไม่ต้องมี finishDate เพราะถูกแปลงเป็น durationDays แล้ว', () => {
  const src = read(PATCH_ROUTE);
  const line = src.match(/const SCHEDULE_FIELDS = \[[^\]]*\]/)?.[0] || '';
  assert.ok(line.includes("'durationDays'"), 'durationDays ต้องอยู่ในลิสต์ที่กระตุ้น recalc');
  assert.ok(line.includes("'startDate'"), 'startDate ต้องอยู่ในลิสต์ที่กระตุ้น recalc');
  assert.ok(
    !line.includes("'finishDate'"),
    'finishDate ไม่ควรอยู่ในลิสต์ — ถ้าจะใส่ แปลว่ามีทางที่ปล่อยให้มันรอดไปถึง .update()',
  );
});

test('POST: กรอกวันเริ่มตอนเพิ่มขั้นตอน = ปักหมุด (ไม่งั้น recalc ดึงวันกลับทันที)', () => {
  const src = read(CREATE_ROUTE);
  assert.match(
    src,
    /startLocked:\s*!!body\.startDate/,
    'แถวใหม่ต้องตั้ง startLocked ตามวันเริ่มที่ผู้ใช้กรอก',
  );
  assert.doesNotMatch(
    src,
    /ไม่ใส่ startLocked ตอนสร้าง/,
    'เหตุผลเดิมอ้าง migration 0032 ที่ยังไม่รัน — รันไปแล้ว ห้ามกลับมา',
  );
});

// ── ฝั่ง client ───────────────────────────────────────────────────────────────

test('ตาราง: ช่องจำนวนวันต้องมี key ผูกกับค่าปัจจุบัน ไม่งั้นค่าที่คำนวณใหม่ไม่เข้า DOM', () => {
  const src = read(TABLE);
  assert.match(
    src,
    /key=\{`dur-\$\{t\.id\}-\$\{t\.durationDays \?\? 1\}`\}/,
    'ช่องจำนวนวันในตารางต้องผูก key กับค่าปัจจุบัน (ท่าเดียวกับมุมมองเอกสาร)',
  );
  // มุมมองเอกสารทำถูกอยู่แล้ว — ล็อกไว้ไม่ให้หลุดตอนรีแฟกเตอร์
  assert.match(read(DOC_VIEW), /key=\{`dur-\$\{task\.durationDays\}`\}/);
});

test('ตาราง: ล้างช่องวันจบต้องไม่ยิง patch และไม่ส่ง null ต่อ', () => {
  const src = read(TABLE);
  assert.doesNotMatch(
    src,
    /patch\(t,\s*\{\s*finishDate:\s*v \|\| null\s*\}\)/,
    'ห้ามส่ง `finishDate: null` — วันจบเป็นค่าคำนวณ ไม่มีสถานะ "ไม่มีวันจบ"',
  );
  assert.match(
    src,
    /if\s*\(v && v !== t\.finishDate\)\s*patch\(t,\s*\{\s*finishDate:\s*v\s*\}\)/,
    'ต้องยิงเฉพาะตอนมีค่าจริงและค่าเปลี่ยน',
  );
  assert.match(
    read('lib/pm/stepSchedule.js'),
    /if\s*\("finishDate" in next && !next\.finishDate\) delete next\.finishDate;/,
    'syncStepPatch ต้องทิ้งคีย์ finishDate ที่ว่าง ไม่ปล่อยลง drafts',
  );
});

// ── เฟส 2: สูตรวันมีชุดเดียว ──────────────────────────────────────────────────

test('ไม่มีใครคำนวณวันเอง — ตารางกับ API ต้องเรียกสูตรกลางที่ stepSchedule', () => {
  const table = read(TABLE);
  assert.match(table, /import \{[^}]*\bsyncStepPatch\b[^}]*\} from "@\/lib\/pm\/stepSchedule"/, 'ตารางต้องเรียกสูตรกลาง');
  assert.doesNotMatch(
    table,
    /(addBusinessDays|countBusinessDays|isBusinessDay)\s*\(/,
    'ตารางห้ามนับวันทำการเอง — เคยมีก๊อบปี้ของสูตรอยู่ในไฟล์นี้ (withOptimisticSchedule)',
  );
  assert.doesNotMatch(table, /withOptimisticSchedule/, 'ก๊อบปี้เดิมต้องไม่กลับมา');
  assert.match(
    read(PATCH_ROUTE),
    /durationFromDates\(startForCalc, updates\.finishDate\)/,
    'server ต้องใช้ durationFromDates ตัวเดียวกับฝั่ง client ไม่ใช่สะกดสูตรเอง',
  );
});

test('syncStepPatch: แก้จำนวนวัน → วันจบขยับ (ผลเท่ากับที่ฟอร์มคำนวณ)', () => {
  const task = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  const patch = syncStepPatch(task, { durationDays: 3 });
  assert.equal(patch.finishDate, '2026-08-14');
  assert.equal(patch.durationDays, 3);
  assert.equal(syncStepForm(task, { durationDays: 3 }).finishDate, patch.finishDate);
});

test('syncStepPatch: แก้วันจบ → จำนวนวันขยับ และวันจบถูก snap เป็นวันทำการ', () => {
  const task = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  const patch = syncStepPatch(task, { finishDate: '2026-08-16' }); // อาทิตย์
  assert.equal(patch.durationDays, 3); // พุธ→ศุกร์
  assert.equal(patch.finishDate, '2026-08-14');
});

test('syncStepPatch: ตั้งวันเริ่มเอง = ปักหมุด · วันเริ่มที่ตกวันหยุดถูกเลื่อนเป็นวันทำการ', () => {
  const task = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  const patch = syncStepPatch(task, { startDate: '2026-08-15' }); // เสาร์
  assert.equal(patch.startDate, '2026-08-17', 'เสาร์ → จันทร์ (ท่าเดียวกับที่ server ทำกับวันปักหมุด)');
  assert.equal(patch.startLocked, true);
  assert.equal(patch.finishDate, '2026-08-21');
});

test('syncStepPatch: ล้างวันเริ่ม = ปลดหมุด ไม่เดาวันให้ · ล้างวันจบ = ไม่มีอะไรเปลี่ยน', () => {
  const task = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  const cleared = syncStepPatch(task, { startDate: null });
  assert.equal(cleared.startLocked, false);
  assert.equal(cleared.finishDate, undefined, 'ไม่มีวันเริ่ม = ปล่อยให้ server กางตาม dependency');

  const clearedFinish = syncStepPatch(task, { finishDate: null });
  assert.deepEqual(clearedFinish, {}, 'ล้างวันจบต้องไม่เหลืออะไรให้ส่ง');
});

test('syncStepPatch: แพตช์ที่ไม่มีช่องวันเลย ต้องผ่านไปเหมือนเดิม', () => {
  const task = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  assert.deepEqual(syncStepPatch(task, { status: 'Completed' }), { status: 'Completed' });
});

// ── สูตรกลาง (ของเดิมที่ถูกอยู่แล้ว — ตรึงไว้ให้ทุกฝั่งอ้างตัวนี้) ─────────────

test('สูตรกลาง: วันเริ่ม + จำนวนวัน ↔ วันจบ เป็นผกผันกันจริง', () => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const finish = computeFinish('2026-08-12', 5);
  assert.equal(iso(finish), '2026-08-18'); // พุธ + 5 วันทำการ ข้ามเสาร์-อาทิตย์
  assert.equal(durationFromDates('2026-08-12', iso(finish)), 5);
});

test('สูตรกลาง: แก้ช่องใดช่องหนึ่งแล้วอีกสองช่องต้องสอดคล้องทันที', () => {
  const base = { startDate: '2026-08-12', finishDate: '2026-08-18', durationDays: 5 };
  // แก้จำนวนวัน → วันจบขยับ
  assert.equal(syncStepForm(base, { durationDays: 3 }).finishDate, '2026-08-14');
  // แก้วันจบ → จำนวนวันขยับ
  assert.equal(syncStepForm(base, { finishDate: '2026-08-14' }).durationDays, 3);
  // แก้วันเริ่ม → วันจบขยับตามจำนวนวันเดิม
  assert.equal(syncStepForm(base, { startDate: '2026-08-13' }).durationDays, 5);
  assert.equal(syncStepForm(base, { startDate: '2026-08-13' }).finishDate, '2026-08-19');
});
