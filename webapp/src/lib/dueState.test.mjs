// ── ตัวกลางวันกำหนด + ยามคำชุดเดียว (งวด 2 · docs/due-overdue-system.md · มติเจ้าของ 23/11/2026) ─────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  DUE_SOON_DAYS, ageDays, ageText, calendarDays, dueInfo, dueState, dueText, dueTone, thaiDay,
} from './dueState.js';

const TODAY = '2026-11-23';

test('dueState: เลย · ครบวันนี้ · อีก ≤ 3 วัน (เหลือง) · ไกลกว่า · ไม่มีวัน/ไม่รู้วันนี้ = none', () => {
  assert.deepEqual(dueState('2026-11-20', TODAY), { key: 'late', days: -3 });
  assert.deepEqual(dueState(TODAY, TODAY), { key: 'today', days: 0 }, 'วันครบเองยังไม่เลย');
  assert.deepEqual(dueState('2026-11-26', TODAY), { key: 'soon', days: 3 });
  assert.deepEqual(dueState('2026-11-27', TODAY), { key: 'later', days: 4 });
  assert.equal(DUE_SOON_DAYS, 3, 'มติ 23/11/2026: ช่วงเตือนมาตรฐาน 3 วัน');
  assert.equal(dueState('2026-12-01', TODAY, { soonDays: 14 }).key, 'soon', 'ของหมดอายุส่งช่วงของตัวเอง');
  assert.equal(dueState(null, TODAY).key, 'none');
  assert.equal(dueState('2026-11-20', null).key, 'none', 'เฟรมแรกก่อน effect = ไม่ตัดสิน');
});

test('คำและสีชุดเดียว: เลยกำหนด N วัน (แดง) · ครบกำหนดวันนี้ / อีก N วัน (เหลือง) · ค้าง N วัน', () => {
  assert.equal(dueText(dueState('2026-11-20', TODAY)), 'เลยกำหนด 3 วัน');
  assert.equal(dueText(dueState(TODAY, TODAY)), 'ครบกำหนดวันนี้');
  assert.equal(dueText(dueState('2026-11-25', TODAY)), 'อีก 2 วัน');
  assert.equal(dueText(dueState(null, TODAY)), null);
  assert.equal(dueTone(dueState('2026-11-20', TODAY)), 'danger');
  assert.equal(dueTone(dueState('2026-11-25', TODAY)), 'warning');
  assert.equal(dueTone(dueState('2026-12-25', TODAY)), 'neutral');
  assert.deepEqual(dueInfo('2026-11-20', TODAY), { key: 'late', days: -3, text: 'เลยกำหนด 3 วัน', tone: 'danger' });
  assert.equal(ageText(0), 'วันนี้');
  assert.equal(ageText(5), 'ค้าง 5 วัน');
  assert.equal(ageText(null), null);
});

test('วันไทย: timestamp ช่วงเช้ามืด = วันไทย ไม่ใช่วัน UTC · เลขคณิตปฏิทินไม่ขึ้นกับโซนเครื่อง', () => {
  assert.equal(thaiDay('2026-11-15T23:30:00Z'), '2026-11-16');
  assert.equal(thaiDay('2026-11-16'), '2026-11-16');
  assert.equal(thaiDay('ไม่ใช่วัน'), null);
  assert.equal(calendarDays('2026-11-15T23:30:00Z', TODAY), 7);
  assert.equal(ageDays('2026-11-15T23:30:00Z', TODAY), 7);
  assert.equal(ageDays('2026-11-30', TODAY), 0, 'อนาคตไม่ติดลบ');
});

/* ── ยาม: คำที่มติ 23/11/2026 เลิกใช้ ห้ามกลับมาในข้อความที่ผู้ใช้เห็น ─────────────────────────────
   ⚠️ ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์ที่เล่าว่าเคยพูดคำเก่าไม่ใช่ข้อความบนจอ
   ⚠️ "ใหญ่/ยาวเกินกำหนด" (ขนาดไฟล์ · ความยาวข้อความ) เป็นคนละความหมาย — ไม่ใช่วันกำหนด */
const FORBIDDEN = [
  { word: 'เลยกำหนดมา', use: 'เลยกำหนด N วัน' },
  { word: 'ใกล้ครบกำหนด', use: 'ครบกำหนดวันนี้ / อีก N วัน' },
  // "ค้างมา" ตามด้วยตัวเลข/ค่า (อายุงาน) เท่านั้น — "ของค้างมากสุด" (ค้าง + มากสุด) ไม่ใช่คำนี้
  { word: /ค้างมา\s*(?:\d|\$\{|\{)/, label: 'ค้างมา N', use: 'ค้าง N วัน' },
  { word: /(?<!ใหญ่|ยาว)เกินกำหนด/, label: 'เกินกำหนด', use: 'เลยกำหนด' },
];
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

test('🔴 คำชุด "เลยกำหนด": ไม่มี เลยกำหนดมา · ใกล้ครบกำหนด · ค้างมา · เกินกำหนด ในโค้ดที่ผู้ใช้เห็น', () => {
  const files = execSync('git ls-files "src/**/*.js" "src/**/*.jsx"', { encoding: 'utf8' })
    .split('\n').filter((f) => f && !f.includes('.test.'));
  const hits = [];
  for (const file of files) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const code = stripComments(src);
    for (const { word, label, use } of FORBIDDEN) {
      const found = typeof word === 'string' ? code.includes(word) : word.test(code);
      if (found) hits.push(`${file}: "${label || word}" → ใช้ "${use}"`);
    }
  }
  assert.deepEqual(hits, [], `คำที่เลิกใช้แล้วกลับมา:\n${hits.join('\n')}`);
});

/* ── ยาม: "วันนี้" ระดับคอมโพเนนต์ต้องมาจาก `useThaiToday` (งวด 2) ─────────────────────────────────────
   🐞 ก่อนงวดนี้ ~25 จอเขียน `const today = businessDate();` / `useMemo(() => businessDate(), [])` ในตัวคอมโพเนนต์ ⇒
      แท็บที่เปิดค้างข้ามคืนพูด "ครบกำหนดวันนี้" ของเมื่อวาน · `useThaiToday({ seed: true })` อ่านค่าแรกแบบเดิมและอ่านใหม่เมื่อกลับมาที่แท็บ
   ⚠️ จับเฉพาะ **ระดับคอมโพเนนต์** (ย่อหน้า 2 ช่อง) — ค่าตั้งต้นของฟอร์ม/ในตัวจัดการปุ่มอ่านนาฬิกาตอนกดได้ ไม่ใช่ปัญหานี้
   ⭐ เพดานรายไฟล์ ขึ้นไม่ได้ ลงได้อย่างเดียว (ลดเมื่อแก้ ต้องรูดเพดานลงด้วย) */
const RENDER_TODAY_ALLOWED = new Map([
  // ⏸ ใบต้นทุน — ด่านส่งใบอ่านวันเดียวกัน (พักไว้ตาม check:thaitime · มติผู้ใช้ 2026-08-26)
  ['src/app/sa/costing/[id]/page.js', 1],
  // ⏸ โมดูลวางแผนผลิตปิดอยู่ (มติ 13/11/2026 · closed-modules) — ไม่แตะจนกว่าจะเปิดใหม่
  ['src/app/production/page.js', 1],
  ['src/app/production/board/page.js', 1],
  // ⏸ หน้าภาพรวม /rd — เจ้าของสั่ง "ข้ามไปก่อน เพราะต้องรื้อ" (23/11/2026)
  ['src/app/rd/page.js', 1],
  // ⏸ ตัวแปรที่ไม่มีใครอ่าน (ฟอร์มสร้าง SO) — ถอดได้เมื่อแตะไฟล์นี้ครั้งหน้า
  ['src/app/sales-planning/sales-orders/new/page.js', 1],
]);
const RENDER_TODAY = /^ {2}const [A-Za-z_]\w* = (?:businessDate\(\)|todayKey\(\)|businessDayKey\(new Date\(\)\.toISOString\(\)\));|useMemo\(\(\) => (?:businessDate|todayKey)\(\), \[\]\)/gm;

test('🔴 "วันนี้" ระดับคอมโพเนนต์มาจาก useThaiToday — ไม่อ่านนาฬิกาตอนเรนเดอร์ (เพดานรายไฟล์)', () => {
  const files = execSync('git ls-files "src/**/*.js"', { encoding: 'utf8' }).split('\n').filter((f) => f && !f.includes('.test.'));
  const found = new Map();
  for (const file of files) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    if (!/^["']use client["']/m.test(src)) continue;
    const n = (stripComments(src).match(RENDER_TODAY) || []).length;
    if (n) found.set(file, n);
  }
  const over = [...found].filter(([f, n]) => n > (RENDER_TODAY_ALLOWED.get(f) ?? 0)).map(([f, n]) => `${f}: ${n}`);
  assert.deepEqual(over, [], `อ่าน "วันนี้" ตอนเรนเดอร์ — ใช้ useThaiToday({ seed: true }):\n${over.join('\n')}`);
  const stale = [...RENDER_TODAY_ALLOWED].filter(([f, cap]) => (found.get(f) ?? 0) < cap).map(([f]) => f);
  assert.deepEqual(stale, [], 'เพดานเกินของจริง — รูดลงใน RENDER_TODAY_ALLOWED');
});
