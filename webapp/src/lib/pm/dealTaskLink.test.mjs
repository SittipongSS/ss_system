// ── "งานของดีลนี้" นิยามเดียว (ตรวจตัวเลข M8c · 20/10/2026) ──────────────────────────────────────────────
// 🐞 หน้าดีลเคยโหลด `dealId = X OR projectId = P` ⇒ งานของดีลพี่น้องในโครงการเดียวกันติดมาทั้งหมด
//    (โครงการ 2 ดีล ดีลละ 2 งาน ⇒ การ์ดทั้งสองดีลบอก 0/4 · คิวที่กรองดีลใดดีลหนึ่งเจอแค่ 2)
// ⭐ ตรึงสองเรื่อง: (1) สตริง `.or()` ที่ส่งให้ DB ตอบชุดเดียวกับตัวตัดสินฝั่ง JS ทีละแถว (แปลสตริงจริงแล้วรัน)
//    (2) ลิงก์จากหน้าดีลพาชุดที่ถูกไปที่คิว
// งวด P3b-2 ยุบโครงการ: ถอดสาขา "งานเดิมของโครงการที่ไม่มี dealId" (prod 0 แถว) + ลิงก์/ธงของหน้าโครงการ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dealTaskOrFilter, idListParam, isDealTask, readTasksQueueLink, tasksQueueHref } from './dealTaskLink.js';
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

test('🔴 ดีล B ได้เฉพาะงานของตัวเอง — ไม่ได้งานของดีลพี่น้อง A และไม่ได้งานเดิมที่ถือแค่ projectId', () => {
  const ofB = TASKS.filter((t) => isDealTask(t, DEAL_B)).map((t) => t.id);
  assert.deepEqual(ofB, ['b1', 'b2']);
  const ofA = TASKS.filter((t) => isDealTask(t, DEAL_A)).map((t) => t.id);
  assert.deepEqual(ofA, ['a1', 'a2', 'moved']);
  assert.deepEqual(TASKS.filter((t) => isDealTask(t, DEAL_LOOSE)).map((t) => t.id), ['loose1']);
  // projectId ของดีลไม่เปลี่ยนตัวกรองอีกแล้ว (งวด P3b-2) — ดีลมี/ไม่มีโครงการได้สตริงรูปเดียวกัน
  assert.equal(dealTaskOrFilter(DEAL_A), 'dealId.eq.deal-A');
  assert.equal(dealTaskOrFilter(DEAL_LOOSE), 'dealId.eq.deal-L');
  assert.equal(dealTaskOrFilter(null), null);
  assert.equal(isDealTask(TASKS[0], null), false);
  assert.equal(TASKS.filter((t) => [DEAL_A, DEAL_B, DEAL_LOOSE].some((d) => isDealTask(t, d))).some((t) => !t.dealId), false);
});

test('ลิงก์คิว: ดีล = ?dealId= · ไม่มีดีล = /sa/tasks · อ่านกลับได้ชุดเดิม', () => {
  assert.equal(tasksQueueHref({ dealIds: ['deal-A'] }), '/sa/tasks?dealId=deal-A');
  assert.equal(tasksQueueHref({ dealIds: ['deal-A', 'deal-B'] }), '/sa/tasks?dealId=deal-A%2Cdeal-B');
  assert.equal(tasksQueueHref({}), '/sa/tasks');
  // ตัวเลือกโครงการเดิมที่ผู้เรียกเก่ายังส่งมา = ไม่มีผล (ไม่มีหน้าโครงการให้ลิงก์มาแล้ว)
  assert.equal(tasksQueueHref({ projectId: 'proj-1', central: 'only' }), '/sa/tasks');
  for (const dealIds of [['deal-A'], ['deal-A', 'deal-B']]) {
    const params = new URLSearchParams(tasksQueueHref({ dealIds }).split('?')[1]);
    assert.deepEqual(readTasksQueueLink({ dealId: params.get('dealId') }), { dealIds });
  }
});

test('ลิงก์เก่าของหน้าโครงการ (?projectId= · ?central=) อ่านแล้วไม่มีผล — คิวได้ชุดเดียวกับไม่มีพารามิเตอร์', () => {
  assert.deepEqual(readTasksQueueLink({ projectId: 'proj-1', central: 'only' }), { dealIds: [] });
  assert.deepEqual(readTasksQueueLink({ dealId: 'deal-A', projectId: 'proj-1', central: 'none' }), { dealIds: ['deal-A'] });
  const rows = [
    ...TASKS,
    { id: 'personal', dealId: null, projectId: null, ownerId: 'u9' },
  ].map((t) => ({ status: 'Pending', ownerId: 'u1', ...t }));
  // ตัวกรองเก่า (project / central / dealProjectOf) ที่ผู้เรียกเก่ายังส่งมา — ถูกเมินทั้งชุด
  const landing = dealQueueLanding({ allowedScopes: ['mine', 'team', 'all'], meId: 'u1', dealIds: ['deal-A'],
    projectId: 'proj-1', central: 'none', dealProjectOf: () => 'proj-1' });
  assert.equal('project' in landing || 'central' in landing || 'dealProjectOf' in landing, false);
  assert.deepEqual(taskListRows(rows, landing).map((t) => t.id), ['a1', 'a2', 'moved']);
  const all = taskPoolRows(rows, { scope: 'all', project: 'proj-1', central: 'only' }).map((t) => t.id);
  assert.deepEqual(all, rows.map((t) => t.id), 'ตัวกรองโครงการเดิมต้องไม่ตัดแถว');
});

test('อ่าน id จาก URL: ลิสต์คั่นจุลภาค · ค่าที่ไม่ใช่ id ถูกทิ้ง (กันสตริงแปลกไหลเข้า .in())', () => {
  assert.deepEqual(idListParam('deal-A,deal-B'), ['deal-A', 'deal-B']);
  assert.deepEqual(idListParam('a,,a, b'), ['a', 'b']);
  assert.deepEqual(idListParam('x),or(id.neq.0'), []);
  assert.deepEqual(idListParam(null), []);
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

/* หน้าโครงการ (ปุ่ม projectTasksQueueHref + ตารางงานที่กรองด้วย projectSelectionPasses) ถูกลบใน P3a
   — ยุบโครงการ 16/11 · เหลือยามฝั่งหน้าดีลกับฝั่งคิวงานที่อ่านลิงก์ */
test('ยาม: ปุ่มบนหน้าดีลพาตัวกรองไปด้วย', () => {
  const deal = read('../../app/sales-planning/deals/[id]/page.js');
  assert.match(deal, /href=\{tasksQueueHref\(\{ dealIds: \[deal\.id\] \}\)\}/);
  assert.doesNotMatch(deal, /: "\/sa\/tasks"\}/, 'ห้ามตกไป /sa/tasks เปล่า');
  const queue = read('../../app/pm/tasks/page.js');
  assert.match(queue, /const \{ dealIds: linkDealIds \} = readTasksQueueLink\(\{ dealId: linkDealParam \}\);/);
  // งวด P3b-2: ลิงก์เก่าของหน้าโครงการถูกถอดออกจาก URL — ไม่กลายเป็นตัวกรองค้าง
  assert.match(queue, /const STALE_LINK_PARAMS = \["projectId", "central"\];/);
  assert.match(queue, /router\.replace\(tasksHrefWithout\(searchParams, STALE_LINK_PARAMS\), \{ scroll: false \}\);/);
  assert.doesNotMatch(queue, /\/api\/pm\/projects/, 'หน้าคิวต้องไม่โหลดรายชื่อโครงการ (route ถอดแล้ว)');
});
