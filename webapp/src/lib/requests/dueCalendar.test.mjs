// ── ปฏิทินคำสัญญาของฝ่าย (แบบ ข) ─────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dueCalendar, weekDays, weekOffsetLabel, weekRangeText, weekStart,
} from './dueCalendar.js';
import { fmtDate, fmtDayMonth } from '../format.js';

// 2026-08-12 = วันพุธ
const todayIso = '2026-08-12';
const req = (over = {}) => ({ id: 'DR-1', dept: 'RD', docNo: 'RQ-1', items: [], ...over });

test('⭐ สัปดาห์เริ่มวันอาทิตย์ (อา–ส) — มติเจ้าของ 2026-09-26 ทุกปฏิทินเริ่มวันเดียวกัน', () => {
  assert.equal(weekStart(todayIso), '2026-08-09');       // พุธ → อาทิตย์
  assert.equal(weekStart('2026-08-09'), '2026-08-09');   // อาทิตย์ → ตัวเอง
  assert.equal(weekStart('2026-08-10'), '2026-08-09');   // จันทร์ → อาทิตย์ก่อนหน้า
  assert.equal(weekStart('2026-08-15'), '2026-08-09');   // เสาร์ = วันสุดท้ายของสัปดาห์เดียวกัน
  assert.equal(weekStart('2026-08-16'), '2026-08-16');   // อาทิตย์ถัดไป = สัปดาห์ใหม่
  assert.equal(weekStart(todayIso, 1), '2026-08-16');
  assert.equal(weekStart(todayIso, -1), '2026-08-02');
  assert.equal(weekStart('ไม่ใช่วันที่'), null);
  assert.equal(weekStart(null), null);
});

test('เจ็ดวันของสัปดาห์ — ป้ายวัน อา.–ส. · วันหยุดหัวกับท้ายแถว · วันนี้', () => {
  const days = weekDays('2026-08-09', { todayIso });
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.label), ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
  assert.deepEqual(days.map((d) => d.iso).slice(0, 3), ['2026-08-09', '2026-08-10', '2026-08-11']);
  assert.deepEqual(days.filter((d) => d.weekend).map((d) => d.iso), ['2026-08-09', '2026-08-15']);
  assert.equal(days.filter((d) => d.today).length, 1);
  assert.equal(days.find((d) => d.today).iso, todayIso);
  assert.equal(days[0].dayOfMonth, 9);
  assert.deepEqual(weekDays('ไม่ใช่วันที่'), []);
});

test('ป้ายวันมาจากวันจริง ไม่ใช่ลำดับคอลัมน์ — ส่งวันเริ่มกลางสัปดาห์มาก็ไม่โกหก', () => {
  const days = weekDays('2026-08-12');   // พุธ
  assert.deepEqual(days.map((d) => d.label), ['พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.', 'จ.', 'อ.']);
  assert.deepEqual(days.filter((d) => d.weekend).map((d) => d.iso), ['2026-08-15', '2026-08-16']);
});

test('⭐ ใบลงวันของตัวเอง · ใบนอกสัปดาห์ไม่โผล่แต่ยังถูกนับ', () => {
  const cal = dueCalendar([
    req({ id: 'A', committedDueDate: '2026-08-12', items: [{}, {}, {}] }),
    req({ id: 'B', committedDueDate: '2026-08-12' }),
    req({ id: 'C', committedDueDate: '2026-08-14' }),
    req({ id: 'ไกล', committedDueDate: '2026-09-30' }),
  ], { todayIso });

  const wed = cal.days.find((d) => d.iso === '2026-08-12');
  assert.deepEqual(wed.items.map((i) => i.id), ['A', 'B']);
  assert.equal(wed.items[0].lines, 3, 'จำนวนบรรทัด = หนักแค่ไหน');
  assert.equal(cal.inWeek, 3, 'สามใบที่ตกในสัปดาห์นี้');
  assert.equal(cal.dated, 4, 'ทั้งคิวมีสี่ใบที่ให้วันแล้ว');
});

test('🔴 "ยังไม่ได้ให้วัน" นับจากทั้งคิว — ไม่งั้นปฏิทินโล่งแล้วคนสรุปว่าสัปดาห์นี้ว่าง', () => {
  /* ⚠️ ของจริงตอนทำ: 8 จาก 15 ใบยังไม่มีใครให้วัน ⇒ ตัวเลขนี้ต้องอยู่คู่ปฏิทินเสมอ */
  const cal = dueCalendar([
    req({ id: 'A', committedDueDate: '2026-08-13' }),
    req({ id: 'B' }),
    req({ id: 'C', committedDueDate: null }),
  ], { todayIso });
  assert.equal(cal.undated, 2);
  assert.equal(cal.inWeek, 1);
});

test('⭐ ใบที่เลยกำหนดอยู่วันของมันเอง (ในอดีต) — ห้ามยัดเข้าวันนี้', () => {
  const cal = dueCalendar([
    req({ id: 'สาย', committedDueDate: '2026-08-11' }),
    req({ id: 'สายมาก', committedDueDate: '2026-07-30' }),
  ], { todayIso });
  const tue = cal.days.find((d) => d.iso === '2026-08-11');
  assert.deepEqual(tue.items.map((i) => i.id), ['สาย']);
  assert.equal(tue.items[0].overdue, true);
  const today = cal.days.find((d) => d.today);
  assert.equal(today.items.length, 0, 'ใบสายต้องไม่ถูกย้ายมาวันนี้');
  // ใบที่สายจนหลุดสัปดาห์ไปแล้วยังต้องถูกนับ ไม่งั้นมันหายไปเงียบ ๆ
  assert.equal(cal.overdue, 2);
  assert.equal(cal.inWeek, 1);
});

test('เลื่อนสัปดาห์ — ใบของสัปดาห์หน้าโผล่เมื่อเลื่อนไปดู', () => {
  const rows = [req({ id: 'หน้า', committedDueDate: '2026-08-18' })];
  assert.equal(dueCalendar(rows, { todayIso }).inWeek, 0);
  const next = dueCalendar(rows, { startIso: weekStart(todayIso, 1), todayIso });
  assert.equal(next.inWeek, 1);
  assert.equal(next.start, '2026-08-16');
  assert.equal(next.end, '2026-08-22');
  assert.equal(next.days.filter((d) => d.today).length, 0, 'สัปดาห์หน้าไม่มีวันนี้');
});

test('🔴 L9: ป้าย "N ใบใน…" พูดชื่อสัปดาห์ตามลูกศร — เลขกับคำเป็นของสัปดาห์เดียวกัน', () => {
  assert.equal(weekOffsetLabel(0), 'สัปดาห์นี้');
  assert.equal(weekOffsetLabel(), 'สัปดาห์นี้');
  assert.equal(weekOffsetLabel(-1), 'สัปดาห์ก่อน');
  assert.equal(weekOffsetLabel(1), 'สัปดาห์หน้า');
  // ไกลกว่าหนึ่งสัปดาห์ — แถวช่วงวันใต้หัวบอกวันจริงอยู่แล้ว
  assert.equal(weekOffsetLabel(2), 'สัปดาห์ที่เลือก');
  assert.equal(weekOffsetLabel(-5), 'สัปดาห์ที่เลือก');
  // เลขบนป้าย = ใบบนช่องรายวันของสัปดาห์ที่ offset ชี้ (ชุดเดียวกับตาราง) — ไม่ใช่ของสัปดาห์นี้
  const rows = [
    req({ id: 'นี้', committedDueDate: '2026-08-12' }),
    req({ id: 'หน้า1', committedDueDate: '2026-08-17' }),
    req({ id: 'หน้า2', committedDueDate: '2026-08-20' }),
  ];
  for (const [offset, expected] of [[0, 1], [1, 2], [-1, 0]]) {
    const cal = dueCalendar(rows, { startIso: weekStart(todayIso, offset), todayIso });
    assert.equal(cal.inWeek, cal.days.reduce((n, d) => n + d.items.length, 0));
    assert.equal(cal.inWeek, expected, `offset ${offset} (${weekOffsetLabel(offset)})`);
  }
});

test('🔴 L9 ด่านซอร์ส: ป้ายปฏิทินไม่เขียน "ใบในสัปดาห์นี้" ตายตัว · ปุ่มกลับมาสัปดาห์นี้ยังอยู่', () => {
  const panel = readFileSync(new URL('../../components/requests/DueWeekPanel.js', import.meta.url), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(panel, /ใบในสัปดาห์นี้/);
  assert.match(panel, /\{calendar\.inWeek\} ใบใน\{weekOffsetLabel\(offset\)\}/);
  assert.match(panel, />\s*สัปดาห์นี้\s*<\/Button>/, 'ปุ่มรีเซ็ตกลับมาสัปดาห์นี้ไม่เปลี่ยน');
});

test('ข้อความช่วงวัน — ใช้ตัวจัดรูปแบบกลาง ไม่ประกอบเดือนเอง (ratchet ม-105)', () => {
  assert.equal(weekRangeText('2026-08-09', '2026-08-15', { fmtDayMonth, fmtDate }), '9 – 15/08/2026');
  // ข้ามเดือน — ต้องเขียนเดือนของวันเริ่มด้วย ไม่งั้นอ่านเป็นเดือนเดียวกัน
  assert.equal(weekRangeText('2026-08-30', '2026-09-05', { fmtDayMonth, fmtDate }), '30 ส.ค. – 05/09/2026');
  assert.equal(weekRangeText(null, null, { fmtDayMonth, fmtDate }), '');
});

test('ว่างเปล่าไม่พัง — คิวว่างยังได้เจ็ดวันครบ', () => {
  const cal = dueCalendar([], { todayIso });
  assert.equal(cal.days.length, 7);
  assert.equal(cal.inWeek, 0);
  assert.equal(cal.undated, 0);
  assert.equal(cal.overdue, 0);
});
