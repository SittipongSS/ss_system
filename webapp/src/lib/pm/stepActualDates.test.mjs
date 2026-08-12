// ── แผน vs ของจริง ของแต่ละขั้นตอน (มติผู้ใช้ 2026-08-12 · แบบ B) ────────────
//
// ไทม์ไลน์เก็บสองชั้นที่ห้ามปนกัน:
//   แผน     — startDate / finishDate · คำนวณจากจำนวนวันทำการ ขยับได้เมื่อ predecessor เลื่อน
//   ของจริง — actualStartDate / actualFinishDate · สแตมตอนคนเดินสถานะ ขยับเองไม่ได้
//
// ก่อน mig 0239 ฐานเก็บของจริงไว้ครึ่งเดียว (มีแต่วันเสร็จ) จึงตอบไม่ได้ว่าขั้นไหน
// "เริ่มทำจริง" วันไหน — ทั้งที่การกด "กำลังทำ" เป็นการกระทำของคนล้วน ๆ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setHolidays } from './dateHelpers.js';
import { actualVariance } from './stepSchedule.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const PATCH_ROUTE = 'app/api/pm/project-tasks/[id]/route.js';
const MIGRATION = '../supabase/migrations/0239_project_task_actual_start.sql';
const TABLE = 'components/salesPlanning/DealTimelineTable.js';
const DOC_VIEW = 'components/pm/ProjectDocumentView.js';

setHolidays([]); // สนใจเสาร์-อาทิตย์อย่างเดียว

// ── สูตรส่วนต่าง ──────────────────────────────────────────────────────────────

test('actualVariance: บวก = ช้ากว่าแผน · ลบ = เร็วกว่า · 0 = ตรงวัน', () => {
  // พุธ 12/08/2026 → พฤหัส 13 = ช้า 1 วันทำการ
  assert.equal(actualVariance('2026-08-12', '2026-08-13'), 1);
  assert.equal(actualVariance('2026-08-13', '2026-08-12'), -1);
  assert.equal(actualVariance('2026-08-12', '2026-08-12'), 0);
});

test('actualVariance: นับเป็นวันทำการ ไม่ใช่วันปฏิทิน', () => {
  // ศุกร์ 14/08 → จันทร์ 17/08 = ช้า 1 วันทำงาน (ไม่ใช่ 3)
  assert.equal(actualVariance('2026-08-14', '2026-08-17'), 1);
});

test('actualVariance: ยังไม่มีของจริง = null (คนละเรื่องกับ 0 ที่แปลว่าตรงวัน)', () => {
  assert.equal(actualVariance('2026-08-12', null), null);
  assert.equal(actualVariance('2026-08-12', ''), null);
  assert.equal(actualVariance(null, '2026-08-12'), null);
  assert.equal(actualVariance('ไม่ใช่วันที่', '2026-08-12'), null);
});

// ── ฐานข้อมูล ────────────────────────────────────────────────────────────────

test('mig 0239: เพิ่มคอลัมน์ + กันวันจริงกลับด้าน', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "actualStartDate" date/);
  assert.match(sql, /CHECK \(\s*"actualStartDate" IS NULL/, 'ต้องมี CHECK กันเสร็จจริงมาก่อนเริ่มจริง');
});

test('mig 0239: ย้อน Rev ต้องไม่กลืนวันเริ่มจริง — RPC ต้องต่อคอลัมน์ด้วย', () => {
  const sql = read(MIGRATION);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.pm_restore_snapshot/,
    'pm_restore_snapshot ลบ task ทั้งโครงการแล้ว insert ใหม่ด้วยลิสต์คอลัมน์ตายตัว — คอลัมน์ใหม่ต้องเข้าลิสต์ในคอมมิตเดียวกัน',
  );
  const insertCols = sql.match(/INSERT INTO public\.project_tasks \([\s\S]*?\)/)?.[0] || '';
  assert.ok(insertCols.includes('"actualStartDate"'), 'ไม่งั้นกดย้อน Rev แล้ววันเริ่มจริงหายทั้งโครงการเงียบ ๆ');
  assert.match(sql, /NULLIF\(t->>'actualStartDate', ''\)::date/, 'ต้องอ่านค่าจาก snapshot กลับมาด้วย');
});

// ── สแตมตอนเดินสถานะ ─────────────────────────────────────────────────────────

test('PATCH: กด "กำลังทำ" = สแตมวันเริ่มจริง · ถอยกลับ Pending = ล้าง', () => {
  const src = read(PATCH_ROUTE);
  assert.match(
    src,
    /if \(body\.status !== 'Pending' && !task\.actualStartDate\) updates\.actualStartDate = todayStr\(\)/,
    'ออกจาก Pending ครั้งแรก = เริ่มทำจริงวันนี้ (ข้ามไป Completed รวดเดียวก็ต้องสแตม)',
  );
  assert.match(
    src,
    /else if \(body\.status === 'Pending'\) updates\.actualStartDate = null/,
    'ถอยกลับ Pending = ยังไม่ได้เริ่ม ต้องล้างทิ้ง (กระจกเงาของกติกาวันเสร็จ)',
  );
  // สแตมซ้ำไม่ได้ — ค่าแรกคือความจริง
  assert.match(src, /!task\.actualStartDate/, 'มีค่าแล้วห้ามเขียนทับตอนสลับสถานะไปมา');
});

test('PATCH: วันของจริงทั้งคู่แก้ได้ด้วยสิทธิ์ workflow และรับค่าว่างได้', () => {
  const src = read(PATCH_ROUTE);
  const workflow = src.match(/const WORKFLOW_FIELDS = \[[^\]]*\]/)?.[0] || '';
  assert.ok(workflow.includes("'actualStartDate'"), 'คนทำงานต้องแก้วันของจริงของตัวเองได้');
  const nullable = src.match(/nullable: \[[^\]]*\]/)?.[0] || '';
  assert.ok(nullable.includes("'actualStartDate'"), 'ต้องล้างค่าได้เมื่อถอยสถานะ');
});

// ── หน้าจอ ───────────────────────────────────────────────────────────────────

test('ตาราง: เซลล์วันเริ่มและวันจบมีบรรทัดรองของจริงทั้งคู่', () => {
  const src = read(TABLE);
  assert.match(src, /<ActualLine plan=\{t\.startDate\} actual=\{t\.actualStartDate\} \/>/);
  assert.match(src, /<ActualLine plan=\{t\.finishDate\} actual=\{t\.actualFinishDate\} \/>/);
});

test('ตาราง: มีเซลล์สองบรรทัดแล้ว ทั้งตารางต้องชิดบน (UI_DESIGN_SYSTEM กฎ 5)', () => {
  const css = read('app/globals.css');
  const block = css.match(/\.timeline-task-table tbody tr:not\(\.timeline-phase-row\) > td \{[^}]*\}/)?.[0] || '';
  assert.ok(block, 'หากฎของแถวในตารางไทม์ไลน์ไม่เจอ — เทสต์นี้ต้องอัปเดตตามโครงใหม่');
  assert.match(block, /vertical-align: top/, 'สลับทั้งตาราง ไม่ใช่ทีละเซลล์');
});

test('Gantt: เส้นของจริงเป็นคนละชั้นกับบาร์แผน — ลากไม่ได้ ไม่มี handle', () => {
  const src = read(DOC_VIEW);
  assert.match(src, /function ActualBar\(/);
  const bar = src.match(/function ActualBar\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(bar, /pointerEvents: "none"/, 'ของจริงสแตมมาแล้ว ลากแก้ไม่ได้');
  assert.doesNotMatch(bar, /onPointerDown/, 'ห้ามมี handle ลากบนเส้นของจริง');
  assert.match(bar, /var\(--red\)/, 'ช้ากว่าแผน = แดง');
  assert.match(bar, /var\(--green\)/, 'ทันแผน = เขียว');
});
