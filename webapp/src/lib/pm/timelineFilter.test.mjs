import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_STEP_FILTER,
  TIMELINE_CENTRAL,
  TIMELINE_STEP_STATUS_OPTIONS,
  TIMELINE_SUMMARY_KINDS,
  countTimelineSteps,
  filterTimelineTasks,
  singleSelectedDeal,
  timelinePhaseGroups,
  timelineStepMatches,
  timelineStepOverdue,
  timelineStepStatusKey,
  timelineSummaryActive,
  timelineSummaryCounts,
  timelineSummaryPick,
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

/* ── ตรวจตัวเลข L1 (26/10): ป้ายสรุป "รอดำเนินการ · กำลังทำ · เสร็จแล้ว · เลยกำหนด" = ขั้นที่แผงเหลือหลังกด ──
   คำบนป้ายสถานะมาจาก TIMELINE_STEP_STATUS_OPTIONS (คำเดียวกับตัวเลือกในแผงกรองและหัว "เสร็จแล้ว n จาก m") */
const TODAY = '2026-10-26';
const dated = [
  { id: 'D1', dealId: 'DL-1', status: 'Pending', role: 'SA', finishDate: '2026-10-20' },      // เลยกำหนด
  { id: 'D2', dealId: 'DL-1', status: 'In Progress', role: 'RD', finishDate: '2026-10-25' },  // เลยกำหนด
  { id: 'D3', dealId: 'DL-1', status: 'Completed', role: 'RD', finishDate: '2026-10-01' },    // เสร็จแล้ว = ไม่เลย
  { id: 'D4', dealId: 'DL-1', status: 'In Progress', role: 'PC', finishDate: TODAY },         // วันนี้ = ยังไม่เลย
  { id: 'D5', dealId: 'DL-2', status: 'Pending', role: null, finishDate: null },              // ไม่มีวัน = ไม่เลย
  { id: 'D6', dealId: 'DL-2', status: 'Blocked', role: 'ALL', finishDate: '2026-09-30' },     // สถานะอื่น = รอดำเนินการ · เลย
  { id: 'D7', dealId: null, status: 'Pending', role: 'PC', finishDate: '2026-11-02' },
];

test('🔴 L1: timelineStepOverdue — ยังไม่เสร็จ + วันเสร็จก่อนวันนี้ · วันนี้พอดี/ไม่มีวัน/เสร็จแล้ว ไม่นับ', () => {
  assert.deepEqual(dated.filter((t) => timelineStepOverdue(t, TODAY)).map((t) => t.id), ['D1', 'D2', 'D6']);
  assert.equal(timelineStepOverdue({ status: 'Pending', finishDate: '2026-10-25' }, '2026-10-26'), true);
  assert.equal(timelineStepOverdue({ status: 'Pending', finishDate: '2026-10-26' }, '2026-10-26'), false);
  assert.equal(timelineStepOverdue({ status: 'Completed', finishDate: '2026-01-01' }, '2026-10-26'), false);
  assert.equal(timelineStepOverdue(null, '2026-10-26'), false);
});

test('🔴 L1: ทุกป้าย × ตัวกรองที่ค้าง (สถานะ · ฝ่าย · เลยกำหนด) × ดีลที่แสดง — กดป้ายแล้วแผงเหลือเท่าเลขบนป้าย', () => {
  const STALE = [];
  for (const statuses of STATUS_SETS) {
    for (const depts of DEPT_SETS) {
      for (const overdue of [false, true]) STALE.push({ statuses, depts, overdue });
    }
  }
  for (const deals of [[], ['DL-1'], ['DL-2', TIMELINE_CENTRAL], [TIMELINE_CENTRAL]]) {
    // แผงได้ `tasks` ที่ผ่านตัวเลือกดีลมาแล้ว — ป้ายนับจากชุดนั้น (ปุ่มไม่แตะตัวเลือกดีล)
    const panelTasks = filterTimelineTasks(dated, deals);
    const counts = timelineSummaryCounts(panelTasks, TODAY);
    for (const kind of TIMELINE_SUMMARY_KINDS) {
      const pick = timelineSummaryPick(kind);
      // ทุกมิติของตัวกรองอยู่ในชุด — เพิ่มมิติใหม่แล้วลืมใส่ = ของค้างหลุดรอด
      assert.deepEqual(Object.keys(pick).sort(), Object.keys(EMPTY_STEP_FILTER).sort());
      for (const stale of STALE) {
        // ป้ายแทนที่ทั้งชุด — `{ ...stale, ...pick }` ต้องเท่ากับ pick เพราะ pick ระบุครบทุกมิติ
        const after = countTimelineSteps(dated, { deals, stepFilter: { ...stale, ...pick }, today: TODAY });
        assert.equal(after, counts[kind], `${kind} หลัง ${JSON.stringify(stale)} · ดีล ${deals.join()}`);
      }
      assert.equal(timelineSummaryActive(pick, kind), true, `${kind}: หลังกด ป้ายต้องขึ้นว่ากำลังใช้`);
      for (const other of TIMELINE_SUMMARY_KINDS.filter((k) => k !== kind)) {
        assert.equal(timelineSummaryActive(pick, other), false, `${kind} ทำให้ ${other} ขึ้นว่าใช้อยู่ไม่ได้`);
      }
    }
    // สามสถานะรวมกันครบทุกขั้นของแผง (สถานะอื่นนับเป็นรอดำเนินการ ไม่หายไปไหน)
    assert.equal(counts.pending + counts.progress + counts.completed, panelTasks.length);
  }
  // 🐞 ของเดิม: ฝ่าย RD ติดอยู่ → ป้าย "เลยกำหนด 3" แต่แผงเหลือ 2 (D1 ของ SA ถูกซ่อน) และไม่มีทางกรองเลยกำหนด
  assert.equal(timelineSummaryCounts(dated, TODAY).overdue, 3);
  assert.equal(countTimelineSteps(dated, { stepFilter: { statuses: [], depts: ['RD'], overdue: true }, today: TODAY }), 2);
  // ตัวกรองว่าง / ป้ายที่มีฝ่ายติดอยู่ไม่ใช่ "ป้ายที่ใช้อยู่"
  for (const kind of TIMELINE_SUMMARY_KINDS) assert.equal(timelineSummaryActive(EMPTY_STEP_FILTER, kind), false);
  assert.equal(timelineSummaryActive({ statuses: ['progress'], depts: ['RD'], overdue: false }, 'progress'), false);
  assert.equal(timelineSummaryActive({ statuses: ['progress', 'pending'], depts: [], overdue: false }, 'progress'), false);
  // ตัวกรองรูปเดิม (ไม่มีคีย์ overdue) ยังใช้ได้ = ไม่กรองเลยกำหนด
  assert.equal(countTimelineSteps(dated, { stepFilter: { statuses: [], depts: [] }, today: TODAY }), dated.length);
});

test('ด่านซอร์ส L1: ป้ายสรุปเป็นปุ่มที่ตั้งตัวกรองทั้งชุด · นับด้วยตัวตัดสินกลาง · แผงกรองมีมิติเลยกำหนด', () => {
  const table = readSrc('../../components/salesPlanning/DealTimelineTable.js');
  assert.match(table, /const today = businessDate\(\);\s*const summaryCounts = timelineSummaryCounts\(tasks, today\);/);
  assert.match(table, /const pickSummary = \(kind\) => setStepFilter\(timelineSummaryActive\(stepFilter, kind\) \? EMPTY_STEP_FILTER : timelineSummaryPick\(kind\)\);/);
  assert.match(table, /<button key=\{kind\} type="button" className="ui-badge" aria-pressed=\{pressed\} onClick=\{\(\) => pickSummary\(kind\)\}/);
  assert.match(table, /\{label\} \{summaryCounts\[kind\]\}/);
  assert.doesNotMatch(table, /task\.finishDate < today/, 'ห้ามนับเลยกำหนดด้วยสูตรในคอมโพเนนต์ — ใช้ timelineStepOverdue');
  assert.doesNotMatch(table, /<span className="ui-badge"[^>]*>[^<]*<(?:CircleDashed|Clock|CheckCircle2|AlertTriangle)/, 'ป้ายสรุปต้องไม่เหลือเป็น span ที่กดไม่ได้');
  assert.match(table, /key: "due", label: "กำหนด",\s*options: \[\{ value: "overdue", label: "เลยกำหนด" \}\],/);
  assert.match(table, /const filterCount = statusFilter\.length \+ deptFilter\.length \+ \(stepFilter\.overdue \? 1 : 0\);/);
  assert.equal(EMPTY_STEP_FILTER.overdue, false);
  assert.equal(Object.isFrozen(EMPTY_STEP_FILTER), true);
  // 🐞 รีวิว L1: ป้าย "เสร็จสิ้น" กับตัวเลือก "เสร็จแล้ว" เป็นตัวกรองชุดเดียวกันแต่คนละคำ ⇒ คำบนป้ายต้องมาจากตัวเลือก
  assert.match(table, /const statusOptionLabel = \(kind\) => TIMELINE_STEP_STATUS_OPTIONS\.find\(\(option\) => option\.value === kind\)\.label;/);
  for (const kind of ['pending', 'progress', 'completed']) {
    assert.ok(table.includes(`{ kind: "${kind}", `) && table.includes(`label: statusOptionLabel("${kind}") }`), kind);
  }
  assert.doesNotMatch(table, /เสร็จสิ้น/, 'คำ "เสร็จสิ้น" ต้องไม่เหลือในแผง — ทั้งแผงใช้ "เสร็จแล้ว"');
  assert.deepEqual(TIMELINE_STEP_STATUS_OPTIONS.map((o) => o.label), ['รอดำเนินการ', 'กำลังทำ', 'เสร็จแล้ว']);
  // 🐞 รีวิว L1: ป้ายกดได้แม้เลข 0 ⇒ ตัวกรองที่ไม่เหลือสักขั้นต้องมีสถานะว่าง + ปุ่มล้าง ทั้งมุมมองรายการและตาราง
  assert.match(table, /const filteredEmpty = view !== "document" && tasks\.length > 0 && shownCount === 0 \? \(/);
  assert.match(table, /action=\{\{ label: "ล้างตัวกรอง", onClick: \(\) => setStepFilter\(EMPTY_STEP_FILTER\) \}\}/);
  assert.match(table, /ยังไม่มีขั้นตอนในไทม์ไลน์นี้<\/EmptyState>\}\s*\{filteredEmpty\}/, 'มุมมองรายการ');
  assert.match(table, /\{filteredEmpty && <tr><td colSpan=\{canEdit \? 11 : 10\}>\{filteredEmpty\}<\/td><\/tr>\}\s*<\/tbody>/, 'มุมมองตาราง');
});

test('🔴 รีวิว L1: ป้ายเลข 0 — กดแล้วแผงเหลือ 0 ขั้นจริง (ตรงเลข) และนั่นคือเงื่อนไขที่สถานะว่างของตัวกรองขึ้น', () => {
  const onlyPending = [
    { id: 'P1', status: 'Pending', role: 'SA', finishDate: '2026-11-01' },
    { id: 'P2', status: 'Pending', role: 'RD', finishDate: null },
  ];
  const counts = timelineSummaryCounts(onlyPending, TODAY);
  assert.equal(counts.progress, 0);
  const shown = countTimelineSteps(onlyPending, { stepFilter: timelineSummaryPick('progress'), today: TODAY });
  assert.equal(shown, counts.progress, 'เลขบนป้าย = ขั้นที่เหลือ แม้เป็น 0');
  assert.ok(onlyPending.length > 0 && shown === 0, 'มีขั้นแต่ตัวกรองไม่เหลือ = เงื่อนไขของ filteredEmpty');
  // ล้างตัวกรอง (EMPTY_STEP_FILTER) = กลับมาครบทุกขั้น
  assert.equal(countTimelineSteps(onlyPending, { stepFilter: EMPTY_STEP_FILTER, today: TODAY }), onlyPending.length);
});

/* ── ตรวจตัวเลข L13 (26/10): หัวเฟสของมุมมองตารางใช้เลขเฟสเดิม ไม่ใช่ลำดับหลังกรอง ── */
test('🔴 L13: timelinePhaseGroups — กรองจนเฟส 1 หาย หัวเฟสยังเป็น "2." เหนือขั้น 2.x', () => {
  const phased = [
    { id: 'A1', phase: 'ออกแบบ', status: 'Completed' },
    { id: 'A2', phase: 'ออกแบบ', status: 'Completed' },
    { id: 'B1', phase: 'ผลิต', status: 'In Progress' },
    { id: 'B2', phase: 'ผลิต', status: 'Pending' },
    { id: 'C1', phase: '', status: 'Pending' },
  ];
  const { groups, numberOf } = timelinePhaseGroups(phased);
  assert.deepEqual(groups.map((g) => [g.index, g.phase, g.tasks.map((t) => t.id)]),
    [[0, 'ออกแบบ', ['A1', 'A2']], [1, 'ผลิต', ['B1', 'B2']], [2, '', ['C1']]]);
  assert.deepEqual([...numberOf.entries()], [['A1', '1.1'], ['A2', '1.2'], ['B1', '2.1'], ['B2', '2.2'], ['C1', '3.1']]);
  // ตารางกรองแล้วทิ้งเฟสที่ว่าง (รูปเดียวกับ tableGroups ของแผง: `{ ...group, tasks }`)
  const match = (t) => timelineStepMatches(t, { statuses: ['progress', 'pending'], depts: [], overdue: false });
  const table = groups.map((g) => ({ ...g, tasks: g.tasks.filter(match) })).filter((g) => g.tasks.length);
  assert.deepEqual(table.map((g) => `${g.index + 1}. ${g.phase}`), ['2. ผลิต', '3. ']);
  for (const g of table) {
    for (const t of g.tasks) assert.ok(numberOf.get(t.id).startsWith(`${g.index + 1}.`), `${t.id} ใต้หัวเฟส ${g.index + 1}`);
  }
});

test('ด่านซอร์ส L13: หัวเฟส · สีเฟส · key ของทั้งสองมุมมองมาจาก index ของกลุ่ม', () => {
  const table = readSrc('../../components/salesPlanning/DealTimelineTable.js');
  assert.match(table, /const \{ groups, numberOf \} = useMemo\(\(\) => timelinePhaseGroups\(tasks\), \[tasks\]\);/);
  assert.match(table, /\{g\.index \+ 1\}\. \{g\.phase \|\| "ไม่ระบุเฟส"\}/);
  assert.match(table, /PHASE_COLORS\[g\.index % PHASE_COLORS\.length\]/);
  assert.match(table, /key=\{`\$\{g\.phase\}\|\$\{g\.index\}`\}/);
  assert.match(table, /\{group\.index \+ 1\}\. \{group\.phase \|\| "ไม่ระบุเฟส"\}/);
  assert.doesNotMatch(table, /\{gi \+ 1\}\.|PHASE_COLORS\[gi %|groupIndex/, 'ห้ามกลับไปใช้ลำดับในอาร์เรย์ที่กรองแล้ว');
});
