// ── คิวงาน /sa/tasks: เลขบนแท็บ/การ์ด/ป้ายเมนู/ป้ายหน้าดีล = แถวที่เห็นหลังกด (ตรวจตัวเลข M8 · M8b · M9 · 20/10/2026) ─────
// 🐞 สามอาการเดิม
//   · M8  — แท็บ "ต้องทำ/มอบหมายโดยฉัน/ทั้งหมดของฉัน" นับงานค้างของฉันทั้งหมด ไม่สนตัวกรองที่ตั้งอยู่ (ดีลจาก ?dealId= · คำค้น ·
//           หมวด · การ์ดสถานะ) ⇒ มาจากหน้าดีล แท็บบอก 23 ตารางขึ้น 2
//   · M9  — ป้ายเมนูไม่นับงาน "รอคนอื่น" แต่กดแล้วเปิดแท็บ "ต้องทำ" ที่รวมงานรอ ⇒ ป้าย 5 ตาราง 7
//   · M8b — การ์ดหน้าดีลนับงานทุกคน แต่ปุ่ม "เปิดคิวงาน" ลงที่ "ของฉัน · ต้องทำ"
// ⚠️ `isUrgent` อ่านนาฬิกาเครื่อง ⇒ ฟิกซ์เจอร์ใช้กำหนดที่ไกลจากวันนี้มาก (ปี 2000 = เลยกำหนดแน่ · ปี 2999 = ไม่ด่วนแน่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TASK_STATUS_FILTER_KEYS, TASK_WAITING_OVERDUE_FILTER, TASK_WAITING_OVERDUE_FILTER_LABEL, dealQueueLanding, isMyTodoTask,
  isWaitingOverdueTask, mineTaskClauses, mineViewCounts, taskInScope, taskListRows,
  taskPoolRows, taskStatusPasses, tasksNavLanding, widestTaskScope,
} from './taskListFilter.js';
import { MINE_TASK_VIEWS } from './taskViews.js';
import { isDealTask } from './dealTaskLink.js';
import { myTasksTodoCount } from '../nav/navCounts.js';

const ME = 'u-me';
const OVERDUE = '2000-01-01';
const FAR = '2999-12-31';
const DEALS = { 'deal-X': 'proj-1', 'deal-Y': 'proj-1', 'deal-Z': null };
const dealProjectOf = (id) => DEALS[id] ?? null;

let seq = 0;
const task = (over) => ({
  id: `t${(seq += 1)}`, title: 'งาน', note: '', category: 'ติดตามลูกค้า', status: 'Pending',
  ownerId: ME, assigneeId: null, proxyBy: null, assignedBy: null, dealId: null, projectId: null, dueDate: FAR, ...over,
});

/* งานของ "ทั้งระบบ" — ครอบทุกความสัมพันธ์กับฉัน × สถานะ × ดีล/โครงการ */
const ALL_TASKS = [
  task({ title: 'โทรตามลูกค้า', dealId: 'deal-X', projectId: 'proj-1' }), // ของฉัน · ดีล X
  task({ status: 'In Progress', dealId: 'deal-X', projectId: 'proj-1', dueDate: OVERDUE }), // ด่วน
  task({ status: 'Blocked', dealId: 'deal-X', projectId: 'proj-1', blockedReason: 'รอลูกค้า' }), // รอคนอื่น
  task({ status: 'Completed', dealId: 'deal-X', projectId: 'proj-1' }), // เสร็จ
  task({ ownerId: ME, assigneeId: 'u2', assignedBy: ME, dealId: 'deal-X', projectId: 'proj-1' }), // ฉันมอบให้ u2
  task({ ownerId: 'u2', assigneeId: 'u2', dealId: 'deal-X', projectId: 'proj-1', category: 'ประสานงานภายใน' }), // ของคนอื่นในดีล X
  task({ ownerId: 'u2', assigneeId: 'u3', proxyBy: ME, dealId: 'deal-Y', projectId: 'proj-1' }), // ฉันดึงมาทำแทน · ดีล Y
  task({ ownerId: 'u3', dealId: null, projectId: 'proj-1', title: 'งานเดิมของโครงการ' }), // งานเดิม (ไม่มี dealId)
  task({ ownerId: 'u2', assigneeId: ME, assignedBy: 'u2', dealId: 'deal-Z', title: 'ใบเสนอราคา', dueDate: OVERDUE }), // รับมอบ · ด่วน
  task({ ownerId: 'u3', assigneeId: 'u4', dealId: 'deal-Z' }), // ไม่เกี่ยวกับฉัน
  task({ ownerId: ME, status: 'Blocked', dealId: null }), // ของฉัน รอคนอื่น ไม่ผูกดีล
  task({ ownerId: ME, dealId: null, category: 'ประสานงานภายใน', note: 'โทรหาโรงพิมพ์' }),
];

/* ขอบเขตที่ API โหลด — ใช้ "clause" ชุดเดียวกับ lib/pm/taskScope.js */
const loaded = (clauses) => ALL_TASKS.filter((t) => taskInScope(t, clauses));
const MINE_ROWS = loaded(mineTaskClauses(ME));

const FACETS = [
  {}, { deals: ['deal-X'] }, { deals: ['deal-X', 'deal-Z'] }, { project: 'proj-1' }, { q: 'โทร' },
  { categories: ['ประสานงานภายใน'] }, { assignees: ['u2'] }, { deals: ['deal-Y'], q: 'งาน' },
];

test('⭐ M8: เลขบนแท็บบทบาท = แถวหลังกดแท็บ ทุกตัวกรอง × ทุกสถานะ (นับพร้อมตัวกรองอื่น)', () => {
  let checked = 0;
  for (const facet of FACETS) {
    for (const status of TASK_STATUS_FILTER_KEYS) {
      const f = { meId: ME, scope: 'mine', mineView: MINE_TASK_VIEWS.RESPONSIBLE, status, dealProjectOf, ...facet };
      const counts = mineViewCounts(MINE_ROWS, f);
      for (const view of Object.values(MINE_TASK_VIEWS)) {
        // "กดแท็บ" = เปลี่ยน mineView อย่างเดียว ตัวกรองอื่นอยู่ที่เดิม
        const shown = taskListRows(MINE_ROWS, { ...f, mineView: view });
        assert.equal(counts[view], shown.length, `${view} · ${status} · ${JSON.stringify(facet)}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 100);
});

test('🔴 M8 ของจริงที่พัง: มาจากหน้าดีล X — แท็บต้องไม่บอกงานค้างของฉันทั้งหมด', () => {
  const f = { meId: ME, scope: 'mine', mineView: MINE_TASK_VIEWS.ALL, status: 'all', deals: ['deal-X'], dealProjectOf };
  const counts = mineViewCounts(MINE_ROWS, f);
  const openMine = MINE_ROWS.filter((t) => t.status !== 'Completed').length;
  assert.ok(counts[MINE_TASK_VIEWS.ALL] < openMine, 'เลขเดิม (ไม่สนดีล) ใหญ่กว่าแถวที่เห็น');
  assert.equal(counts[MINE_TASK_VIEWS.ALL], taskListRows(MINE_ROWS, f).length);
  // งานเดิมของโครงการ (ไม่มี dealId) ไม่ได้อยู่ในขอบเขต "ของฉัน" ของคนนี้ ⇒ ไม่โผล่ · ดีล Y ไม่ปน
  assert.ok(taskListRows(MINE_ROWS, f).every((t) => isDealTask(t, { id: 'deal-X', projectId: 'proj-1' })));
});

test('การ์ดสถานะ: เลขบนการ์ด = แถวหลังกดการ์ด (นับจาก pool ที่ไม่ตัดสถานะ ด้วยตัวตัดสินเดียวกับตาราง)', () => {
  for (const facet of FACETS) {
    for (const current of TASK_STATUS_FILTER_KEYS) {
      const f = { meId: ME, scope: 'all', status: current, dealProjectOf, ...facet };
      const pool = taskPoolRows(ALL_TASKS, f);
      for (const card of ['all', 'progress', 'urgent', 'waiting', 'done']) {
        const onCard = pool.filter((t) => taskStatusPasses(t, card, ME)).length;
        assert.equal(onCard, taskListRows(ALL_TASKS, { ...f, status: card }).length, `${card} · ${JSON.stringify(facet)}`);
      }
    }
  }
});

/* ⭐ L3 (ตรวจตัวเลข 26/10/2026): บรรทัดรอง "ในนี้เลยกำหนด n งาน" ของการ์ด "รอคนอื่น" = แถวหลังกดบรรทัดนั้น
   🐞 เดิมหน้านับด้วยเงื่อนไขของตัวเอง (`isWaitingStatus && daysToDue < 0`) นอกตัวตัดสินกลาง และกดได้แค่ทั้งการ์ด
   ⇒ บรรทัดบอก 2 แต่ตารางขึ้นงานรอคนอื่นทุกใบ (ไม่มีรายการไหนแสดง 2 ใบนั้น) */
const WAITING_EXTRA = [
  task({ status: 'Blocked', dueDate: OVERDUE, blockedReason: 'รอลูกค้าเซ็น', dealId: 'deal-X', projectId: 'proj-1' }), // รอ · เลย
  task({ ownerId: 'u2', assigneeId: 'u2', status: 'Blocked', dueDate: OVERDUE, category: 'ประสานงานภายใน' }), // รอ · เลย · คนอื่น
  task({ status: 'Blocked', dueDate: null, blockedReason: 'รอ RD' }), // รอ · ไม่มีกำหนด = ไม่เลย
  task({ status: 'Completed', dueDate: OVERDUE }), // เสร็จแล้ว · ไม่นับ
  task({ status: 'In Progress', dueDate: OVERDUE }), // เลยแต่อยู่ในมือเรา = "ต้องรีบ" ไม่ใช่ "รอคนอื่น"
];
const WITH_WAITING = [...ALL_TASKS, ...WAITING_EXTRA];

test('⭐ L3: บรรทัดรอง "ในนี้เลยกำหนด n งาน" = แถวหลังกดบรรทัดนั้น ทุกตัวกรอง × ทุกสถานะที่ติดอยู่', () => {
  let nonZero = 0;
  for (const facet of FACETS) {
    for (const current of TASK_STATUS_FILTER_KEYS) {
      const f = { meId: ME, scope: 'all', status: current, dealProjectOf, ...facet };
      const pool = taskPoolRows(WITH_WAITING, f);
      // ตัวนับของหน้า = `count(TASK_WAITING_OVERDUE_FILTER)` บน pool (ไม่ตัดสถานะ)
      const note = pool.filter((t) => taskStatusPasses(t, TASK_WAITING_OVERDUE_FILTER, ME)).length;
      const shown = taskListRows(WITH_WAITING, { ...f, status: TASK_WAITING_OVERDUE_FILTER });
      assert.equal(note, shown.length, `${current} · ${JSON.stringify(facet)}`);
      // ชุดย่อยของการ์ด "รอคนอื่น" เสมอ — "ในนี้" ต้องเป็นคำจริง
      const waiting = taskListRows(WITH_WAITING, { ...f, status: 'waiting' });
      assert.ok(shown.every((t) => waiting.includes(t)), 'แถวเลยกำหนดต้องอยู่ในการ์ด "รอคนอื่น"');
      assert.ok(shown.every((t) => t.status === 'Blocked' && t.dueDate === OVERDUE));
      if (note > 0) nonZero += 1;
    }
  }
  assert.ok(nonZero > 0, 'ฟิกซ์เจอร์ต้องมีงานรอคนอื่นที่เลยกำหนดจริง');
  // ทั้งระบบไม่กรอง: สองใบที่เลยกำหนด — ไม่รวมใบไม่มีกำหนด · ใบเสร็จ · ใบเลยกำหนดที่อยู่ในมือเรา
  assert.equal(taskListRows(WITH_WAITING, { meId: ME, scope: 'all', status: TASK_WAITING_OVERDUE_FILTER, dealProjectOf }).length, 2);
  assert.equal(isWaitingOverdueTask({ status: 'Blocked', dueDate: null }), false);
  assert.equal(isWaitingOverdueTask({ status: 'Blocked', dueDate: FAR }), false);
  assert.equal(isWaitingOverdueTask({ status: 'Blocked', dueDate: OVERDUE }), true);
  assert.equal(isWaitingOverdueTask({ status: 'Pending', dueDate: OVERDUE }), false);
  assert.equal(TASK_WAITING_OVERDUE_FILTER_LABEL, 'รอคนอื่น · เลยกำหนดแล้ว');
});

test('ยาม L3: หน้าคิวนับบรรทัดรองด้วยตัวกรอง waiting_overdue และกดบรรทัดรองแล้วตั้งตัวกรองนั้น', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const page = read('../../app/pm/tasks/page.js');
  assert.match(page, /waitingOverdue: count\(TASK_WAITING_OVERDUE_FILTER\),/);
  assert.doesNotMatch(page, /isWaitingStatus\(t\.status\) && \(daysToDue\(t\)/, 'ห้ามมีเงื่อนไขเลยกำหนดสำเนาที่สองในหน้า');
  assert.doesNotMatch(page, /overrideNote/, 'บรรทัดรองต้องไม่ทับคำ "กำลังใช้ตัวกรองนี้" อีก');
  assert.match(page, /note=\{active \? "กำลังใช้ตัวกรองนี้" : "กดเพื่อกรองรายการ"\}/);
  assert.match(page, /onClick: \(\) => setStatusFilter\(noteActive \? "all" : c\.noteFilter\.key\)/);
  assert.match(page, /statusFilter === TASK_WAITING_OVERDUE_FILTER \? TASK_WAITING_OVERDUE_FILTER_LABEL/);
  // การ์ดกับบรรทัดรองเป็นปุ่มสองตัวเรียงกัน — ไม่ซ้อนปุ่มในปุ่ม
  const metric = read('../../components/ui/Workspace.js');
  assert.match(metric, /<div className=\{`ui-metric-wrap/);
  assert.match(metric, /className=\{`text-action ui-metric-note-action/);
  assert.match(metric, /aria-pressed=\{pressed\}/);
  assert.match(metric, /if \(!noteAction\) return card;/);
});

test('สถานะ: งานเสร็จโผล่เฉพาะตัวกรอง "เสร็จแล้ว" · "ต้องรีบ" ไม่รวมงานรอคนอื่น · todo = ของฉันที่ลงมือได้', () => {
  const f = { meId: ME, scope: 'all', dealProjectOf };
  assert.ok(taskListRows(ALL_TASKS, { ...f, status: 'all' }).every((t) => t.status !== 'Completed'));
  assert.ok(taskListRows(ALL_TASKS, { ...f, status: 'done' }).every((t) => t.status === 'Completed'));
  assert.ok(taskListRows(ALL_TASKS, { ...f, status: 'urgent' }).every((t) => t.status !== 'Blocked'));
  const todo = taskListRows(ALL_TASKS, { ...f, status: 'todo' });
  assert.ok(todo.length > 0);
  assert.ok(todo.every((t) => isMyTodoTask(t, ME)));
  assert.equal(isMyTodoTask({ status: 'Pending', ownerId: ME }, null), false);
});

/* ⭐ M9: ป้ายเมนูนับจากชุดของ nav/counts (owner/assignee/proxy) · คิวโหลดชุด "ของฉัน" ของ my-work (+ assignedBy)
   ⇒ ต่างชุดกันได้ แต่ตัวตัดสิน todo บังคับ "ฉันเป็นผู้รับผิดชอบ" ⇒ ผลต้องเท่ากันเสมอ */
test('⭐ M9: ป้ายเมนู "งานของฉัน" = แถวของคิวหลังกด ?count=tasks = เลขบนแท็บ "ต้องทำ" ตอนนั้น', () => {
  for (const me of [ME, 'u2', 'u3', 'u4']) {
    const navRows = ALL_TASKS.filter((t) => [t.ownerId, t.assigneeId, t.proxyBy].includes(me));
    const queueRows = loaded(mineTaskClauses(me));
    const landing = tasksNavLanding({ meId: me });
    const badge = myTasksTodoCount(navRows, me);
    assert.equal(taskListRows(queueRows, landing).length, badge, `แถว ${me}`);
    assert.equal(mineViewCounts(queueRows, landing)[MINE_TASK_VIEWS.RESPONSIBLE], badge, `แท็บต้องทำ ${me}`);
  }
  // งานรอคนอื่น/เสร็จ/ฉันมอบให้คนอื่น ไม่นับ · งานที่ดึงมาทำแทน/รับมอบนับ
  const mine = taskListRows(MINE_ROWS, tasksNavLanding({ meId: ME }));
  assert.ok(mine.every((t) => t.status !== 'Blocked' && t.status !== 'Completed'));
  assert.ok(mine.some((t) => t.proxyBy === ME));
  assert.ok(mine.some((t) => t.assigneeId === ME && t.ownerId !== ME));
  assert.ok(!mine.some((t) => t.assigneeId === 'u2' && t.ownerId === ME));
});

test('M9: ลงจากป้าย = ล้างตัวกรองอื่นทุกตัว (คำค้น · หมวด · ผู้รับ · ดีล · โครงการ)', () => {
  const landing = tasksNavLanding({ meId: ME });
  assert.deepEqual(
    { scope: landing.scope, mineView: landing.mineView, status: landing.status, q: landing.q, assignees: landing.assignees,
      categories: landing.categories, deals: landing.deals, project: landing.project },
    { scope: 'mine', mineView: MINE_TASK_VIEWS.RESPONSIBLE, status: 'todo', q: '', assignees: [], categories: [], deals: [], project: null },
  );
});

/* ⭐ M8b: ป้าย "ค้าง n" บนหน้าดีล (route) = แถวของคิวตอนเปิดจากปุ่มนั้น — ทุกชนิดขอบเขต
   route: งานของดีล (ตัวกรอง DB เดียวกับ isDealTask) → ตัดด้วยขอบเขต → taskListRows(landing)
   คิว:   งานทั้งขอบเขต (my-work) → taskListRows(landing) ซึ่งตัดดีลด้วย isDealTask */
test('⭐ M8b: ป้าย "ค้าง n" บนหน้าดีล = แถวของคิวเมื่อกด "เปิดคิวงาน" (ทั้งหมด · ทีม · ของฉันอย่างเดียว)', () => {
  const deal = { id: 'deal-X', projectId: 'proj-1' };
  const cases = [
    { allowed: ['mine', 'team', 'all'], clauses: null }, // superuser
    { allowed: ['all'], clauses: null }, // ผู้สังเกตการณ์
    { allowed: ['mine', 'team'], clauses: [['dealId', ['deal-X', 'deal-Y']], ['assigneeId', ['u2']]] }, // ทีม
    { allowed: ['mine', 'team'], clauses: [] }, // ทีมที่ไม่มีอะไรเลย
    { allowed: ['mine'], clauses: mineTaskClauses(ME) }, // WH/QC/PC — เห็นแค่ของตัวเอง
    { allowed: ['mine'], clauses: mineTaskClauses('u3') },
  ];
  for (const { allowed, clauses } of cases) {
    const scope = widestTaskScope(allowed);
    const meId = clauses && clauses.length && scope === 'mine' ? clauses[0][1][0] : ME;
    // route ของหน้าดีล
    const dealTasks = ALL_TASKS.filter((t) => isDealTask(t, deal));
    const landing = dealQueueLanding({ allowedScopes: allowed, meId, dealIds: [deal.id],
      dealProjectOf: (id) => (id === deal.id ? deal.projectId : null) });
    const card = taskListRows(dealTasks.filter((t) => taskInScope(t, clauses)), landing).length;
    // คิว: my-work โหลดทั้งขอบเขต แล้วกรองดีลด้วยแผนที่ดีลของ API (มี projectId)
    const queueLanding = dealQueueLanding({ allowedScopes: allowed, meId, dealIds: [deal.id], dealProjectOf });
    const queue = taskListRows(loaded(clauses), queueLanding).length;
    assert.equal(card, queue, `${allowed.join('/')} · ${JSON.stringify(clauses)}`);
    assert.equal(landing.scope, scope);
    assert.equal(landing.mineView, MINE_TASK_VIEWS.ALL);
  }
  // ทั้งระบบ: งานค้างทุกคนในดีล X รวมงานเดิมของโครงการ — ไม่รวมงานเสร็จ ไม่รวมดีล Y
  const all = dealQueueLanding({ allowedScopes: ['mine', 'team', 'all'], meId: ME, dealIds: ['deal-X'], dealProjectOf });
  const rows = taskListRows(ALL_TASKS, all);
  assert.ok(rows.some((t) => t.ownerId === 'u2'), 'งานคนอื่นในดีลต้องโผล่');
  assert.ok(rows.some((t) => !t.dealId && t.projectId === 'proj-1'), 'งานเดิมของโครงการต้องโผล่');
  assert.ok(rows.every((t) => t.status !== 'Completed' && t.dealId !== 'deal-Y'));
});

test('widestTaskScope: ตัวสุดท้ายของลิสต์ (pmTaskScopes เรียงแคบ→กว้าง) · ว่าง = mine', () => {
  assert.equal(widestTaskScope(['mine', 'team', 'all']), 'all');
  assert.equal(widestTaskScope(['mine', 'team']), 'team');
  assert.equal(widestTaskScope(['mine']), 'mine');
  assert.equal(widestTaskScope([]), 'mine');
});

test('taskInScope: null = ทุกงาน · [] = ไม่มี · ค่าว่างในคอลัมน์ไม่ตรงกับอะไร (เหมือน .in() ของ DB)', () => {
  assert.equal(taskInScope({ ownerId: 'a' }, null), true);
  assert.equal(taskInScope({ ownerId: 'a' }, []), false);
  assert.equal(taskInScope({ ownerId: null, assigneeId: 'a' }, [['ownerId', ['a']]]), false);
  assert.equal(taskInScope({ proxyBy: 'a' }, mineTaskClauses('a')), true);
  assert.equal(taskInScope({ assignedBy: 'a' }, mineTaskClauses('a')), true);
});

/* ── ยามซอร์ส: หน้า /sa/tasks ต่อสายตัวตัดสินกลาง · ป้ายเมนูมีลิงก์ที่กรองแล้ว ─────────────────────────── */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('ยาม: หน้าคิวนับแท็บ/การ์ด/ตารางด้วยตัวตัดสินกลาง ไม่ใช่เงื่อนไขของตัวเอง', () => {
  const page = read('../../app/pm/tasks/page.js');
  assert.match(page, /const mineViewCounts = useMemo\(\(\) => countMineViews\(personalTasks, listFilters\)/);
  assert.match(page, /const pool = useMemo\(\(\) => taskPoolRows\(personalTasks, listFilters\)/);
  assert.match(page, /taskListRows\(personalTasks, listFilters\)\.sort\(comparator\)/);
  assert.match(page, /pool\.filter\(\(t\) => taskStatusPasses\(t, key, me\?\.id\)\)/);
  assert.doesNotMatch(page, /const matchStatus = /, 'ตัวกรองสถานะต้องอยู่ที่ lib ที่เดียว');
  // pager รีเซ็ตเมื่อดีล/โครงการเปลี่ยน
  assert.match(page, /\$\{dealFilter\.join\(\)\}\|\$\{projectFacet \|\| ""\}/);
});

test('ยาม: ?dealId=/?projectId= → dealQueueLanding · ?count=tasks → tasksNavLanding แล้วถอดพารามิเตอร์', () => {
  const page = read('../../app/pm/tasks/page.js');
  assert.match(page, /const landing = dealQueueLanding\(\{ allowedScopes: pmTaskScopes\(role\), dealIds: linkDealIds, projectId: linkProjectId, central: linkCentral \}\);/);
  assert.match(page, /if \(countParam !== TASKS_NAV_COUNT_PARAM\) return;/);
  assert.match(page, /const landing = tasksNavLanding\(\{\}\);/);
  assert.match(page, /router\.replace\(tasksHrefWithout\(searchParams, \["count", "dealId", "projectId", "central"\]\), \{ scroll: false \}\);/);
  assert.match(page, /statusFilter === TASK_TODO_FILTER \? TASK_TODO_FILTER_LABEL/);
  // แต่ละ setter ของตัวกรองถูกตั้งจาก landing (ล้างตัวกรองค้าง) ทั้งสองทาง
  for (const setter of ['setScope', 'setMineView', 'setStatusFilter', 'setSearch', 'setAssigneeFilter', 'setCategoryFilter', 'setDealFilter', 'setProjectFacet', 'setCentralFacet']) {
    const n = (page.match(new RegExp(`${setter}\\(landing\\.`, 'g')) || []).length;
    assert.equal(n, 2, `${setter} ต้องถูกตั้งจาก landing ทั้งตอนมาจากดีลและจากป้ายเมนู`);
  }
});

/* 🐞 รีวิว M8b: กดย้อนกลับมาที่ /sa/tasks?dealId=X (URL ยังมีพารามิเตอร์) เคยลงทั้งชุดซ้ำ ⇒ ทับคำค้น/การ์ดสถานะ/ขอบเขตที่
   useStickyState เพิ่งคืนให้ (มติ 2026-08-25 "ย้อนกลับ = กลับไปที่เดิม") · ตอนนี้มาจากประวัติ = ตั้งแค่ชิปดีล/โครงการ */
test('ยาม: ลิงก์ดีล/โครงการ — มาจากการกดย้อน ตั้งแค่ชิปจาก URL ไม่ลงทั้งชุดทับตัวกรองที่คืนมา', () => {
  const page = read('../../app/pm/tasks/page.js');
  assert.match(page, /import arrivedByHistory from "@\/lib\/ui\/historyArrival";/);
  assert.match(page, /if \(!linkArrivalRef\.current\) linkArrivalRef\.current = \{ signature, byHistory: arrivedByHistory\(pathname\) \};/);
  const start = page.indexOf('const landing = dealQueueLanding(');
  const effect = page.slice(start, page.indexOf('}, [linkDealParam, linkProjectParam, linkCentral, role]);', start));
  assert.ok(effect.length > 0, 'หา effect ของลิงก์ไม่เจอ');
  const stop = effect.indexOf('if (restoreOnly) return;');
  assert.ok(stop > 0, 'ต้องหยุดก่อนลงทั้งชุดเมื่อมาจากประวัติ');
  // ชิปจาก URL ตั้งก่อนจุดหยุด (ไม่ใช่ sticky — ต้องมาจาก URL ทุกครั้ง)
  for (const setter of ['setDealFilter', 'setProjectFacet', 'setCentralFacet']) {
    const at = effect.indexOf(`${setter}(landing.`);
    assert.ok(at >= 0 && at < stop, `${setter} ต้องตั้งก่อน restoreOnly`);
  }
  // ตัวกรองที่ useStickyState คืนให้ ตั้งหลังจุดหยุดเท่านั้น
  for (const setter of ['setScope', 'setMineView', 'setStatusFilter', 'setSearch', 'setAssigneeFilter', 'setCategoryFilter']) {
    const at = effect.indexOf(`${setter}(landing.`);
    assert.ok(at > stop, `${setter} ต้องอยู่หลัง restoreOnly`);
  }
  // ตัวกรองทั้งหกตัวนั้นต้อง sticky จริง (ไม่งั้นย้อนกลับได้ค่าตั้งต้นแทนที่เดิม) — รวม mineView
  for (const key of ['scope', 'mineView', 'statusFilter', 'search', 'assigneeFilter', 'categoryFilter']) {
    assert.match(page, new RegExp(`useStickyState\\("${key}",`), `${key} ต้องเป็น useStickyState`);
  }
});

test('ยาม: เมนู "งานของฉัน" มี countHref ที่กรองแล้ว · ตัวนับเมนูใช้ isMyTodoTask', () => {
  const menu = read('../../config/menuRegistry.js');
  assert.match(menu, /href: '\/sa\/tasks', name: 'งานของฉัน', countHref: '\/sa\/tasks\?count=tasks'/);
  const nav = read('../nav/navCounts.js');
  assert.match(nav, /return tasks\.filter\(\(task\) => isMyTodoTask\(task, userId\)\)\.length;/);
});
