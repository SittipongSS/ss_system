// ── "งานของดีลนี้" นิยามเดียว (ตรวจตัวเลข M8c · 20/10/2026) ──────────────────────────────────────────────
// 🐞 หน้าดีลเคยโหลด `dealId = X OR projectId = P` ⇒ งานของดีลพี่น้องในโครงการเดียวกันติดมาทั้งหมด
//    (โครงการ 2 ดีล ดีลละ 2 งาน ⇒ การ์ดทั้งสองดีลบอก 0/4 · คิวที่กรองดีลใดดีลหนึ่งเจอแค่ 2)
// ⭐ ตรึงสองเรื่อง: (1) สตริง `.or()` ที่ส่งให้ DB ตอบชุดเดียวกับตัวตัดสินฝั่ง JS ทีละแถว (แปลสตริงจริงแล้วรัน)
//    (2) ลิงก์จากหน้าดีล/หน้าโครงการพาชุดที่ถูกไปที่คิว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TASK_CENTRAL_EXCLUDE, TASK_CENTRAL_ONLY, dealTaskOrFilter, idListParam, idParam, isDealTask, isProjectTask,
  projectSelectionPasses, projectTasksQueueHref, readTasksQueueLink, tasksQueueHref,
} from './dealTaskLink.js';
import { dealQueueLanding, taskListRows, taskPoolRows } from './taskListFilter.js';

/* ตัวแปลตัวกรอง PostgREST แบบย่อ — รองรับเฉพาะรูปที่ไฟล์นั้นสร้าง: `col.eq.v` · `col.is.null` · `and(...)` · `or(...)`
   ⚠️ เขียนเองในเทสต์เพื่อพิสูจน์ว่า "สตริงที่ส่งจริง" กับตัวตัดสิน JS ตอบตรงกัน ไม่ใช่เทียบสตริงกับสตริง */
function splitTop(list) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
function compileTerm(term) {
  const group = /^(and|or)\((.*)\)$/.exec(term);
  if (group) {
    const preds = splitTop(group[2]).map(compileTerm);
    return group[1] === 'and' ? (row) => preds.every((p) => p(row)) : (row) => preds.some((p) => p(row));
  }
  const [column, op, ...rest] = term.split('.');
  const value = rest.join('.');
  if (op === 'eq') return (row) => row[column] != null && String(row[column]) === value;
  if (op === 'is' && value === 'null') return (row) => row[column] == null;
  throw new Error(`ตัวแปลไม่รู้จัก ${term}`);
}
const compileOr = (filter) => compileTerm(`or(${filter})`);

const DEAL_A = { id: 'deal-A', projectId: 'proj-1' };
const DEAL_B = { id: 'deal-B', projectId: 'proj-1' };
const DEAL_LOOSE = { id: 'deal-L', projectId: null }; // ดีลที่ยังไม่ผูกโครงการ
const TASKS = [
  { id: 'a1', dealId: 'deal-A', projectId: 'proj-1' },
  { id: 'a2', dealId: 'deal-A', projectId: 'proj-1' },
  { id: 'b1', dealId: 'deal-B', projectId: 'proj-1' },
  { id: 'b2', dealId: 'deal-B', projectId: 'proj-1' },
  { id: 'legacy', dealId: null, projectId: 'proj-1' }, // งานเดิมผูกผ่านไทม์ไลน์ ไม่มี dealId
  { id: 'other-proj', dealId: null, projectId: 'proj-2' },
  { id: 'loose1', dealId: 'deal-L', projectId: null },
  { id: 'moved', dealId: 'deal-A', projectId: 'proj-9' }, // ผูกดีล A ตรง แม้ projectId เพี้ยน
  { id: 'nothing', dealId: null, projectId: null },
];

test('🔴 สตริง .or() ที่ส่งให้ DB = ตัวตัดสิน isDealTask ทีละแถว (ทุกดีลในฟิกซ์เจอร์)', () => {
  for (const deal of [DEAL_A, DEAL_B, DEAL_LOOSE]) {
    const db = compileOr(dealTaskOrFilter(deal));
    for (const task of TASKS) {
      assert.equal(db(task), isDealTask(task, deal), `${deal.id} × ${task.id}`);
    }
  }
});

test('🔴 ดีล B ได้งานของตัวเอง + งานเดิมของโครงการ — ไม่ได้งานของดีลพี่น้อง A', () => {
  const ofB = TASKS.filter((t) => isDealTask(t, DEAL_B)).map((t) => t.id);
  assert.deepEqual(ofB, ['b1', 'b2', 'legacy']);
  const ofA = TASKS.filter((t) => isDealTask(t, DEAL_A)).map((t) => t.id);
  assert.deepEqual(ofA, ['a1', 'a2', 'legacy', 'moved']);
  // ดีลที่ไม่มีโครงการ = เฉพาะงานที่ผูกดีลตรง
  assert.deepEqual(TASKS.filter((t) => isDealTask(t, DEAL_LOOSE)).map((t) => t.id), ['loose1']);
  assert.equal(dealTaskOrFilter(DEAL_LOOSE), 'dealId.eq.deal-L');
  assert.equal(dealTaskOrFilter(null), null);
  assert.equal(isDealTask(TASKS[0], null), false);
});

test('isProjectTask = ชุดของแท็บงานหน้าโครงการ (projectId = P หรือ dealId เป็นดีลของโครงการ)', () => {
  const projectOf = (id) => ({ 'deal-A': 'proj-1', 'deal-B': 'proj-1', 'deal-L': null }[id] ?? null);
  // ชุดของ API หน้าโครงการ: projectId.eq.P OR dealId.in.(ดีลของ P)
  const projectApi = (t) => t.projectId === 'proj-1' || ['deal-A', 'deal-B'].includes(t.dealId);
  for (const task of TASKS) {
    assert.equal(isProjectTask(task, 'proj-1', projectOf), projectApi(task), task.id);
  }
  assert.equal(isProjectTask(TASKS[0], null, projectOf), false);
});

test('ลิงก์คิว: ดีล = ?dealId= · หน้าโครงการพาชุดที่เลือก/ทั้งโครงการ ไม่ตกไป /sa/tasks เปล่า', () => {
  assert.equal(tasksQueueHref({ dealIds: ['deal-A'] }), '/sa/tasks?dealId=deal-A');
  assert.equal(tasksQueueHref({ projectId: 'proj-1' }), '/sa/tasks?projectId=proj-1');
  assert.equal(tasksQueueHref({}), '/sa/tasks');
  const CENTRAL = '__central__';
  assert.equal(projectTasksQueueHref('proj-1', [], CENTRAL), '/sa/tasks?projectId=proj-1');
  // ดีลอย่างเดียว (ไม่เลือกงานกลาง) = ตัดงานกลางออก (รีวิว M8b — เดิม `isDealTask` รวมงานกลางมาให้ ⇒ หน้าโครงการ 2 คิว 3)
  assert.equal(projectTasksQueueHref('proj-1', ['deal-A'], CENTRAL), '/sa/tasks?dealId=deal-A&central=none');
  assert.equal(projectTasksQueueHref('proj-1', ['deal-A', 'deal-B'], CENTRAL), '/sa/tasks?dealId=deal-A%2Cdeal-B&central=none');
  // หมุด "งานกลางโครงการ" ไม่ใช่ id ดีล — ห้ามหลุดไปเป็น ?dealId=__central__ (บั๊กเดิม)
  assert.equal(projectTasksQueueHref('proj-1', [CENTRAL], CENTRAL), '/sa/tasks?projectId=proj-1&central=only');
  assert.equal(projectTasksQueueHref('proj-1', ['deal-A', CENTRAL], CENTRAL), '/sa/tasks?dealId=deal-A');
  // คู่ผิดถูกทิ้งทั้งตอนสร้างลิงก์และตอนอ่าน
  assert.equal(tasksQueueHref({ dealIds: ['deal-A'], central: TASK_CENTRAL_ONLY }), '/sa/tasks?dealId=deal-A');
  assert.equal(tasksQueueHref({ projectId: 'proj-1', central: TASK_CENTRAL_EXCLUDE }), '/sa/tasks?projectId=proj-1');
  assert.deepEqual(readTasksQueueLink({ dealId: 'deal-A', central: 'only' }), { dealIds: ['deal-A'], projectId: '', central: null });
  assert.deepEqual(readTasksQueueLink({ projectId: 'proj-1', central: 'none' }), { dealIds: [], projectId: 'proj-1', central: null });
  assert.deepEqual(readTasksQueueLink({ dealId: 'deal-A', projectId: 'proj-1', central: 'none' }),
    { dealIds: ['deal-A'], projectId: '', central: 'none' }, 'ดีลมาก่อนโครงการ');
  assert.deepEqual(readTasksQueueLink({ central: 'bogus' }), { dealIds: [], projectId: '', central: null });
});

/* ⭐ รีวิว M8b: ตัวเลือก "ดีลที่แสดง" ของหน้าโครงการ × ลิงก์ "เปิดหน้างาน" — คิวต้องได้ชุดเดียวกับตารางงานของหน้าโครงการ
   ทุกตัวเลือก (ก่อนตัดขอบเขต/สถานะของคิว — ขอบเขต "ทั้งหมด" + สถานะเดียวกันทั้งสองฝั่ง)
   หน้าโครงการ: งานของโครงการ (API: projectId = P OR dealId ∈ ดีลของ P) → `projectSelectionPasses`
   คิว:        งานทั้งระบบ (ขอบเขต "ทั้งหมด") → อ่าน URL (`readTasksQueueLink`) → `dealQueueLanding` → ตัวกรองของคิว */
test('⭐ M8b: ทุกตัวเลือกบนหน้าโครงการ → ลิงก์ → คิว ได้งานชุดเดียวกับตารางงานของหน้าโครงการ', () => {
  const CENTRAL = '__central__';
  const projectOf = (id) => ({ 'deal-A': 'proj-1', 'deal-B': 'proj-1', 'deal-L': null }[id] ?? null);
  const QUEUE_TASKS = [
    ...TASKS,
    { id: 'a-done', dealId: 'deal-A', projectId: 'proj-1', status: 'Completed' },
    { id: 'legacy-done', dealId: null, projectId: 'proj-1', status: 'Completed' },
    { id: 'personal', dealId: null, projectId: null, ownerId: 'u9' }, // งานส่วนตัวไม่ผูกอะไร — ห้ามโผล่ทุกตัวเลือก
  ].map((t) => ({ status: 'Pending', ownerId: 'u1', ...t }));
  const projectTasks = QUEUE_TASKS.filter((t) => t.projectId === 'proj-1' || ['deal-A', 'deal-B'].includes(t.dealId));
  const options = ['deal-A', 'deal-B', CENTRAL];
  let checked = 0;
  for (let mask = 0; mask < 1 << options.length; mask += 1) {
    const selection = options.filter((_, i) => mask & (1 << i));
    const href = projectTasksQueueHref('proj-1', selection, CENTRAL);
    const params = new URLSearchParams(href.split('?')[1] || '');
    const link = readTasksQueueLink({ dealId: params.get('dealId'), projectId: params.get('projectId'), central: params.get('central') });
    const landing = dealQueueLanding({ allowedScopes: ['mine', 'team', 'all'], meId: 'u1', ...link, dealProjectOf: projectOf });
    const page = projectTasks.filter((t) => projectSelectionPasses(t, selection, CENTRAL)).map((t) => t.id).sort();
    const queue = taskPoolRows(QUEUE_TASKS, landing).map((t) => t.id).sort();
    assert.deepEqual(queue, page, `ตัวเลือก ${JSON.stringify(selection)} → ${href}`);
    // หลังตัดงานเสร็จ (คิวเปิดที่ "งานค้าง") ก็ยังตรงกับงานค้างของหน้าโครงการ
    const pageOpen = page.filter((id) => QUEUE_TASKS.find((t) => t.id === id).status !== 'Completed');
    assert.deepEqual(taskListRows(QUEUE_TASKS, landing).map((t) => t.id).sort(), pageOpen);
    assert.ok(!queue.includes('personal'));
    checked += 1;
  }
  assert.equal(checked, 8);
  // ตัวอย่างจากรีวิว: เลือกดีล A อย่างเดียว — หน้าโครงการไม่มีงานกลาง คิวก็ต้องไม่มี
  const onlyA = readTasksQueueLink(Object.fromEntries(new URLSearchParams(projectTasksQueueHref('proj-1', ['deal-A'], CENTRAL).split('?')[1])));
  const rowsA = taskPoolRows(QUEUE_TASKS, dealQueueLanding({ allowedScopes: ['all'], ...onlyA, dealProjectOf: projectOf }));
  assert.ok(!rowsA.some((t) => !t.dealId), 'เลือกดีล A อย่างเดียว ห้ามมีงานกลางโครงการ');
});

test('ธง central ไม่มีคู่ = ไม่มีผล (ไม่กรองงานส่วนตัวที่ไม่ผูกดีลทั้งคิว)', () => {
  const rows = [{ id: 'p', dealId: null, projectId: null, status: 'Pending' }, { id: 'd', dealId: 'deal-A', projectId: 'proj-1', status: 'Pending' }];
  for (const central of [TASK_CENTRAL_EXCLUDE, TASK_CENTRAL_ONLY]) {
    assert.deepEqual(taskPoolRows(rows, { scope: 'all', central }).map((t) => t.id), ['p', 'd'], central);
  }
});

test('อ่าน id จาก URL: ลิสต์คั่นจุลภาค · ค่าที่ไม่ใช่ id ถูกทิ้ง (กันสตริงแปลกไหลเข้า .in())', () => {
  assert.deepEqual(idListParam('deal-A,deal-B'), ['deal-A', 'deal-B']);
  assert.deepEqual(idListParam(new URLSearchParams(projectTasksQueueHref('p', ['a', 'b']).split('?')[1]).get('dealId')), ['a', 'b']);
  assert.deepEqual(idListParam('a,,a, b'), ['a', 'b']);
  assert.deepEqual(idListParam('x),or(id.neq.0'), []);
  assert.deepEqual(idListParam(null), []);
  assert.equal(idParam('proj-1'), 'proj-1');
  assert.equal(idParam('a b'), '');
});

/* ── ยามซอร์ส: route หน้าดีลใช้นิยามนี้ · หน้าดีล/หน้าโครงการลิงก์ผ่านตัวประกอบลิงก์ ─────────────── */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('ยาม: route ภาพรวมดีลโหลดงานด้วย dealTaskOrFilter (การ์ด · ตาราง · ฟีดอัปเดตงานชุดเดียวกัน)', () => {
  const route = read('../../app/api/sales-planning/deals/[id]/overview/route.js');
  assert.match(route, /\.or\(dealTaskOrFilter\(deal\)\)/);
  assert.doesNotMatch(route, /projectId\.eq\.\$\{deal\.projectId\}`/, 'สาขา projectId ล้วนดึงงานดีลพี่น้องมาปน');
  // รีวิว M8b: อ่านงานของดีลพลาด (`safe()` คืน [] + warning) = ไม่มีป้าย ไม่ใช่ "ค้าง 0"
  assert.match(route, /if \(can\(user\.role, 'pm:view'\) && !dealTasks\.warning\) \{/);
});

test('ยาม: ปุ่มบนหน้าดีล/หน้าโครงการพาตัวกรองไปด้วย', () => {
  const deal = read('../../app/sales-planning/deals/[id]/page.js');
  assert.match(deal, /href=\{tasksQueueHref\(\{ dealIds: \[deal\.id\] \}\)\}/);
  const project = read('../../app/sa/projects/[id]/page.js');
  assert.match(project, /href=\{projectTasksQueueHref\(p\.id, dealFilters, TIMELINE_CENTRAL\)\}/);
  // ตารางงานของหน้าโครงการกรองด้วยตัวตัดสินเดียวกับที่เทสต์ไปกลับข้างบนใช้
  assert.match(project, /projectPersonalTasks\.filter\(\(task\) => projectSelectionPasses\(task, dealFilters, TIMELINE_CENTRAL\)\)/);
  const queue = read('../../app/pm/tasks/page.js');
  assert.match(queue, /readTasksQueueLink\(\{\n\s+dealId: linkDealParam, projectId: linkProjectParam, central: linkCentralParam,\n\s+\}\)/);
  assert.doesNotMatch(project, /: "\/sa\/tasks"\}/, 'ห้ามตกไป /sa/tasks เปล่า');
});
