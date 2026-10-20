import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_STEP_FILTER,
  TIMELINE_CENTRAL,
  TIMELINE_STEP_STATUS_OPTIONS,
  countTimelineSteps,
  filterTimelineTasks,
  singleSelectedDeal,
  timelineStepMatches,
  timelineStepStatusKey,
} from './timelineFilter.js';

const tasks = [
  { id: 'PT-1', dealId: 'DL-1' },
  { id: 'PT-2', dealId: null },
  { id: 'PT-3', dealId: 'DL-2' },
  { id: 'PT-4', dealId: 'DL-1' },
];

test('all timeline keeps every deal segment and central task', () => {
  assert.deepEqual(filterTimelineTasks(tasks, []).map((task) => task.id), ['PT-1', 'PT-2', 'PT-3', 'PT-4']);
});

test('deal timeline shows only the selected deal segment', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-1']).map((task) => task.id), ['PT-1', 'PT-4']);
  assert.equal(singleSelectedDeal(['DL-1']), 'DL-1');
});

test('timeline can combine multiple selected deal segments', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-1', 'DL-2']).map((task) => task.id), ['PT-1', 'PT-3', 'PT-4']);
  assert.equal(singleSelectedDeal(['DL-1', 'DL-2']), null);
});

test('central timeline shows only tasks without a deal', () => {
  assert.deepEqual(filterTimelineTasks(tasks, [TIMELINE_CENTRAL]).map((task) => task.id), ['PT-2']);
  assert.equal(singleSelectedDeal([TIMELINE_CENTRAL]), null);
});

test('central tasks can be combined with selected deals', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-2', TIMELINE_CENTRAL]).map((task) => task.id), ['PT-2', 'PT-3']);
});

/* ── ตรวจตัวเลข M18 (20/10): เลขบนตัวเลือก "ดีลที่แสดง" / ป้ายแท็บ "งาน" / การ์ดไทม์ไลน์ = แถวที่เห็นหลังกด ── */
const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const steps = [
  { id: 'S1', dealId: 'DL-1', status: 'Pending', role: 'SA' },
  { id: 'S2', dealId: 'DL-1', status: 'In Progress', role: 'RD' },
  { id: 'S3', dealId: 'DL-1', status: 'Completed', role: 'ALL' },
  { id: 'S4', dealId: 'DL-1', status: 'In Progress', role: null },
  { id: 'S5', dealId: 'DL-2', status: 'Completed', role: 'RD' },
  { id: 'S6', dealId: 'DL-2', status: 'Pending', role: 'PC' },
  { id: 'S7', dealId: null, status: 'In Progress', role: 'SA' },
  { id: 'S8', dealId: null, status: 'Blocked', role: 'PC' },
];
const DEALS = ['DL-1', 'DL-2', TIMELINE_CENTRAL];
const subsets = (values) => values.reduce((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);
const STATUS_SETS = subsets(TIMELINE_STEP_STATUS_OPTIONS.map((o) => o.value));
const DEPT_SETS = subsets(['SA', 'RD', 'PC']);

// แผงไทม์ไลน์ (DealTimelineTable): tasks = filterTimelineTasks(ดีลที่เลือก) → กรองขั้นด้วย timelineStepMatches
const panelShownCount = (selection, stepFilter, documentView = false) => {
  const scoped = filterTimelineTasks(steps, selection);
  return documentView ? scoped.length : scoped.filter((t) => timelineStepMatches(t, stepFilter)).length;
};
// ตัวเลือกบนหน้าโครงการ: page.js เรียก `countTimelineSteps(allTasks, { deals: [ตัวเลือก], stepFilter, documentView })`
// ตรง ๆ (ด่านซอร์สข้างล่างยืนยัน) ⇒ เทสต์เรียกตัวเดียวกัน ไม่ใช่สูตรที่ก๊อปมา
const optionCount = (deal, stepFilter, documentView = false) => countTimelineSteps(steps, { deals: [deal], stepFilter, documentView });

test('🔴 M18a: ทุกดีล × สถานะ × ฝ่าย — "n ขั้นตอน" บนตัวเลือก = ขั้นที่แผงโชว์หลังเลือก', () => {
  for (const statuses of STATUS_SETS) {
    for (const depts of DEPT_SETS) {
      const stepFilter = { statuses, depts };
      for (const deal of DEALS) {
        assert.equal(optionCount(deal, stepFilter), panelShownCount([deal], stepFilter), `${deal} ${JSON.stringify(stepFilter)}`);
      }
      // เลือกหลายตัวเลือก = ผลรวมของเลขบนตัวเลือกที่เลือก
      for (const selection of subsets(DEALS).filter((s) => s.length > 1)) {
        const sum = selection.reduce((acc, deal) => acc + optionCount(deal, stepFilter), 0);
        assert.equal(sum, panelShownCount(selection, stepFilter));
      }
      // มุมมองเอกสารไม่กรองสถานะ/ฝ่าย ⇒ ตัวเลือกนับทั้งดีล
      for (const deal of DEALS) {
        assert.equal(optionCount(deal, stepFilter, true), panelShownCount([deal], stepFilter, true));
        assert.equal(optionCount(deal, stepFilter, true), filterTimelineTasks(steps, [deal]).length);
      }
    }
  }
  // ตัวอย่างในผลตรวจ: กรอง "กำลังทำ" แล้วตัวเลือก DL-1 บอก 2 (ไม่ใช่ 4)
  assert.equal(optionCount('DL-1', { statuses: ['progress'], depts: [] }), 2);
});

test('timelineStepMatches: ขั้นไม่ระบุฝ่าย/ALL ผ่านตัวกรองฝ่ายเสมอ · สถานะอื่นนับเป็นรอดำเนินการ', () => {
  assert.equal(timelineStepMatches({ role: null, status: 'Pending' }, { statuses: [], depts: ['RD'] }), true);
  assert.equal(timelineStepMatches({ role: 'ALL', status: 'Pending' }, { statuses: [], depts: ['RD'] }), true);
  assert.equal(timelineStepMatches({ role: 'SA', status: 'Pending' }, { statuses: [], depts: ['RD'] }), false);
  assert.equal(timelineStepStatusKey({ status: 'Blocked' }), 'pending');
  assert.equal(timelineStepMatches({ status: 'Blocked' }, { statuses: ['pending'], depts: [] }), true);
  assert.equal(timelineStepMatches({ status: 'Completed' }, EMPTY_STEP_FILTER), true);
  assert.equal(timelineStepMatches({ status: 'Completed' }), true);
});

test('ด่านซอร์ส M18a: แผงกับหน้าโครงการกรอง/นับด้วย timelineStepMatches ตัวเดียว', () => {
  const table = readSrc('../../components/salesPlanning/DealTimelineTable.js');
  assert.match(table, /const stepMatches = \(task\) => timelineStepMatches\(task, stepFilter\);/);
  assert.equal((table.match(/\.filter\(stepMatches\)/g) || []).length, 2, 'ตาราง/รายการ และหัวเฟส ใช้ตัวกรองเดียวกัน');
  assert.doesNotMatch(table, /const matchDept =|const matchStatus =/, 'ห้ามมีนิยามที่สองในคอมโพเนนต์');
  assert.match(table, /stepFilter: controlledStepFilter = null/);
  assert.match(table, /if \(!controlledStepFilter\) setOwnStepFilter\(next\);\s*onStepFilterChange\?\.\(next\);/);
  const page = readSrc('../../app/sa/projects/[id]/page.js');
  assert.match(page, /const stepCountOf = \(selection\) => countTimelineSteps\(allTasks, \{ deals: \[selection\], stepFilter, documentView: view === "document" \}\);/,
    'ตัวเลือกต้องนับผ่าน countTimelineSteps ตัวเดียวกับเทสต์ ไม่ใช่สูตรในหน้า');
  assert.match(page, /\$\{deal\.title\} \(\$\{stepCountOf\(deal\.id\)\} ขั้นตอน/);
  assert.match(page, /งานกลางโครงการ \(\$\{stepCountOf\(TIMELINE_CENTRAL\)\} ขั้นตอน/);
  assert.doesNotMatch(page, /allTasks\.filter\(\(task\) => (?:!task\.dealId|task\.dealId === deal\.id)\)\.length\} ขั้นตอน/,
    'ห้ามกลับไปนับขั้นของตัวเลือกด้วยสูตรในหน้าเอง');
  assert.match(page, /stepFilter=\{stepFilter\}\s*onStepFilterChange=\{setStepFilter\}/);
});

test('ด่านซอร์ส M18b: ป้ายแท็บ "งาน" นับงานหลังกรองดีล (= ตารางงาน) + คำร้องทั้งหมด (= ตารางคำร้อง)', () => {
  const page = readSrc('../../app/sa/projects/[id]/page.js');
  assert.match(page, /tasks: shownPersonalTasks\.length \+ \(p\.inquiries \|\| \[\]\)\.length,/);
  assert.match(page, /<tbody>\{shownPersonalTasks\.map\(/, 'ตารางงานลิสต์ shownPersonalTasks');
  assert.match(page, /<RequestQueuePanel\s+scope="mine" rows=\{p\.inquiries \|\| \[\]\}/, 'ตารางคำร้องไม่กรองดีล');
});

test('ด่านซอร์ส M18c: ปุ่ม "เปิดไทม์ไลน์" ของการ์ดภาพรวมล้างตัวกรองดีล + สถานะ/ฝ่ายก่อนเปิด', () => {
  const page = readSrc('../../app/sa/projects/[id]/page.js');
  assert.match(page, /const openWholeTimeline = \(\) => \{\s*setDealFilters\(\[\]\);\s*setStepFilter\(EMPTY_STEP_FILTER\);\s*switchTab\("timeline"\);\s*\};/);
  assert.match(page, /onClick=\{openWholeTimeline\}/);
  // การ์ดนับจาก allTasks (ทั้งโครงการ) ⇒ หลังล้างตัวกรอง แผงโชว์ allTasks ครบ
  assert.match(page, /const total = allTasks\.length;/);
  assert.equal(countTimelineSteps(steps, { deals: [], stepFilter: EMPTY_STEP_FILTER }), steps.length);
});
