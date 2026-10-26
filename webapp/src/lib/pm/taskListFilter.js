// ── คิวงาน /sa/tasks: ตัวตัดสินแถว "ชุดเดียว" ของตาราง · ตัวเลขบนแท็บ · ป้ายเมนู · ป้าย "ค้าง n" บนหน้าดีล ──────
//
// กติกาเจ้าของ (ตรวจตัวเลข 20/10/2026): **ตัวเลขบนแท็บ/ป้าย/การ์ด = แถวที่เห็นหลังกด** — ตัวนับกับตารางต้องเรียก
// ตัวตัดสินตัวเดียวกัน ขอบเขตเดียวกัน ⇒ ไฟล์นี้เป็นตรรกะล้วน (ไม่แตะ DB · ไม่มี JSX) ให้หน้าเว็บ ตัวนับเมนู และ route
// ของหน้าดีลเรียกตัวเดียวกัน
//
// 🐞 ที่มา
//   · M8 — เลขบนแท็บ "ต้องทำ / มอบหมายโดยฉัน / ทั้งหมดของฉัน" นับงานค้างของฉันทั้งหมด **ไม่สนตัวกรองที่ตั้งอยู่**
//     (ค้นหา · หมวด · ดีลจาก `?dealId=` · การ์ดสถานะ) ⇒ มาจากหน้าดีล แท็บบอก 23 ตารางขึ้น 2
//   · M9 — ป้ายเมนู "งานของฉัน" ไม่นับงาน "รอคนอื่น" (มติ docs/task-waiting-and-chain.md §6) แต่กดแล้วเปิดแท็บ "ต้องทำ"
//     ซึ่งรวมงานรอคนอื่น ⇒ ป้าย 5 ตาราง 7 · แก้ด้วยลิงก์ที่กรองแล้ว (`?count=tasks` → สถานะ `todo`) ไม่ใช่นับกลับเข้าไป
//   · M8b — ปุ่ม "เปิดคิวงาน" บนหน้าดีลพาไปเจอแค่ "งานค้างที่ฉันรับผิดชอบ" ทั้งที่การ์ดนับงานทุกคน
//     ⇒ มติ 20/10: ลิงก์จากดีล = ขอบเขตกว้างสุดที่มีสิทธิ์ + มุมมอง "ทั้งหมดของฉัน" (`dealQueueLanding`)
//        และการ์ดบอก "ค้าง n" ด้วยตัวตัดสินตัวเดียวกับคิวตอนเปิดมาถึง
import { MINE_TASK_VIEWS, matchesMineTaskView, responsibleTaskUserId } from './taskViews';
import { isWaitingStatus } from './tasks';
import { daysToDue, isUrgent } from './derived';
import { TASK_CENTRAL_EXCLUDE, TASK_CENTRAL_ONLY, isDealTask, isProjectTask } from './dealTaskLink';

/** สถานะของตัวกรองสถานะ — ห้าตัวแรกเป็นการ์ดบนหน้า · `todo` มาจากป้ายเมนูเท่านั้น (ไม่มีการ์ด) ·
 *  `waiting_overdue` มาจากบรรทัดรองของการ์ด "รอคนอื่น" (ตรวจตัวเลข L3) */
export const TASK_STATUS_FILTER_KEYS = ['all', 'progress', 'urgent', 'waiting', 'done', 'todo', 'waiting_overdue'];
export const TASK_TODO_FILTER = 'todo';
/** ป้ายของตัวกรอง `todo` บนชิป "กรอง: … ×" — ไม่มีการ์ดของตัวเองให้ยืมชื่อ */
export const TASK_TODO_FILTER_LABEL = 'รอฉันลงมือ (ไม่รวมรอคนอื่น)';
/** งาน "รอคนอื่น" ที่เลยกำหนดแล้ว — บรรทัดรองของการ์ด "รอคนอื่น" (กดได้ · ไม่มีการ์ดของตัวเอง) */
export const TASK_WAITING_OVERDUE_FILTER = 'waiting_overdue';
export const TASK_WAITING_OVERDUE_FILTER_LABEL = 'รอคนอื่น · เลยกำหนดแล้ว';

/**
 * งานที่ **รอคนอื่นอยู่และเลยกำหนดแล้ว** — ตัวนับของบรรทัดรอง "ในนี้เลยกำหนด n งาน" กับตัวกรอง `waiting_overdue`
 * เรียกตัวนี้ตัวเดียว (ตรวจตัวเลข L3 · docs/task-waiting-and-chain.md §3.2)
 * 🐞 เดิมหน้า /sa/tasks นับด้วยเงื่อนไขของตัวเองนอก `taskStatusPasses` ⇒ บรรทัดรองบอก n แต่ไม่มีรายการไหนแสดง n ใบนั้น
 * ⚠️ "เลยกำหนด" = `daysToDue < 0` ตัวเดียวกับป้าย "เลยกำหนด X วัน · รอคนอื่น" ของแถว (`taskUrgency`) · ไม่มีกำหนด = ไม่เลย
 */
export function isWaitingOverdueTask(task) {
  if (!task || task.status === 'Completed' || !isWaitingStatus(task.status)) return false;
  return (daysToDue(task) ?? 0) < 0;
}
/** คีย์ `?count=` ของป้ายเมนู "งานของฉัน" (menuRegistry `countHref`) */
export const TASKS_NAV_COUNT_PARAM = 'tasks';

/**
 * งานที่ **รอฉันลงมือ** — ป้ายเมนู "งานของฉัน" · ตัวกรองสถานะ `todo`
 * ยังไม่เสร็จ · ไม่ได้ "รอคนอื่น" (mig 0266 — กดเข้าไปก็ทำอะไรไม่ได้) · ฉันเป็นผู้รับผิดชอบ (proxy → ผู้รับมอบ → เจ้าของ)
 */
export function isMyTodoTask(task, meId) {
  if (!task || !meId) return false;
  if (task.status === 'Completed' || isWaitingStatus(task.status)) return false;
  return responsibleTaskUserId(task) === meId;
}

/**
 * ตัวกรองสถานะของคิว (เดิม `matchStatus` + "งานเสร็จโผล่เฉพาะตอนกรองเสร็จแล้ว" ที่อยู่ในหน้า)
 * ⚠️ "ต้องรีบ" = งานในมือเรา — งานที่รอคนอื่นมีการ์ดของตัวเอง (มติผู้ใช้ 2026-08-17)
 */
export function taskStatusPasses(task, status = 'all', meId = null) {
  if (!task) return false;
  if (status === 'done') return task.status === 'Completed';
  if (task.status === 'Completed') return false;
  if (status === 'progress') return task.status === 'In Progress';
  if (status === 'waiting') return isWaitingStatus(task.status);
  if (status === TASK_WAITING_OVERDUE_FILTER) return isWaitingOverdueTask(task);
  if (status === 'urgent') return isUrgent(task) && !isWaitingStatus(task.status);
  if (status === TASK_TODO_FILTER) return isMyTodoTask(task, meId);
  return true;
}

const lower = (value) => String(value || '').trim().toLowerCase();

/**
 * ตัวกรองทุกตัว **ยกเว้นสถานะ** — ชุดนี้คือ "pool" ที่การ์ดสถานะห้าใบนับ (การ์ดเป็นตัวกรองสถานะเอง จึงต้องไม่ถูกมันตัด)
 * @param {object} f
 * @param {string|null} f.meId
 * @param {'mine'|'team'|'all'} f.scope
 * @param {string} f.mineView  มีผลเฉพาะขอบเขต "ของฉัน"
 * @param {string} f.q         คำค้น (ชื่องาน · หมายเหตุ · หมวด)
 * @param {string[]} f.assignees ผู้รับผิดชอบที่แสดงบนตาราง (assigneeId || ownerId)
 * @param {string[]} f.categories
 * @param {string[]} f.deals   id ดีล — ตัดสินด้วย `isDealTask` (รวมงานเดิมของโครงการที่ไม่มี dealId)
 * @param {string|null} f.project id โครงการ — ตัดสินด้วย `isProjectTask` (ชุดเดียวกับแท็บงานของหน้าโครงการ)
 * @param {string|null} f.central ธง `?central=` ของลิงก์หน้าโครงการ — `none` คู่กับ `deals` (ตัดงานไม่มี dealId) ·
 *   `only` คู่กับ `project` (เหลือแต่งานไม่มี dealId) · ไม่มีคู่ = ไม่มีผล (ไม่กรองงานส่วนตัวที่ไม่ผูกดีลทั้งคิว)
 * @param {(dealId: string) => string|null} f.dealProjectOf โครงการของดีล
 */
export function taskPasses(task, f = {}) {
  if (!task) return false;
  if (f.scope === 'mine' && !matchesMineTaskView(task, f.meId, f.mineView || MINE_TASK_VIEWS.RESPONSIBLE)) return false;
  const q = lower(f.q);
  if (q && ![task.title, task.note, task.category].some((v) => lower(v).includes(q))) return false;
  const assignees = f.assignees || [];
  if (assignees.length && !assignees.includes(task.assigneeId || task.ownerId)) return false;
  const categories = f.categories || [];
  if (categories.length && !categories.includes(task.category)) return false;
  const projectOf = f.dealProjectOf || (() => null);
  const deals = f.deals || [];
  if (deals.length) {
    if (!deals.some((id) => isDealTask(task, { id, projectId: projectOf(id) }))) return false;
    if (f.central === TASK_CENTRAL_EXCLUDE && !task.dealId) return false;
  }
  if (f.project) {
    if (!isProjectTask(task, f.project, projectOf)) return false;
    if (f.central === TASK_CENTRAL_ONLY && task.dealId) return false;
  }
  return true;
}

/** แถวก่อนตัวกรองสถานะ — ฐานของการ์ดสถานะห้าใบ */
export function taskPoolRows(tasks = [], f = {}) {
  return (tasks || []).filter((task) => taskPasses(task, f));
}

/** แถวที่ตารางแสดง (ยังไม่เรียง) — ตัวกรองทุกตัวรวมสถานะ */
export function taskListRows(tasks = [], f = {}) {
  return (tasks || []).filter((task) => taskPasses(task, f) && taskStatusPasses(task, f.status || 'all', f.meId));
}

/**
 * เลขบนแท็บบทบาท (ต้องทำ · มอบหมายโดยฉัน · ทั้งหมดของฉัน) — **นับพร้อมตัวกรองอื่นทุกตัวที่ตั้งอยู่**
 * = จำนวนแถวที่ตารางจะแสดงหลังกดแท็บนั้น (ตัวกรองอื่นไม่ขยับตอนสลับแท็บ)
 */
export function mineViewCounts(tasks = [], f = {}) {
  return Object.fromEntries(Object.values(MINE_TASK_VIEWS).map((view) => [
    view, taskListRows(tasks, { ...f, scope: 'mine', mineView: view }).length,
  ]));
}

/* ── ขอบเขต (scope) ของคิว: ชุดแถวที่ API โหลด ────────────────────────────────────────────────────── */

/** ขอบเขตกว้างสุดที่ role มีสิทธิ์ — `pmTaskScopes` เรียงแคบ→กว้างเสมอ */
export function widestTaskScope(allowed = []) {
  const list = Array.isArray(allowed) ? allowed : [];
  return list[list.length - 1] || 'mine';
}

/** ขอบเขต "ของฉัน" ของ API (`/api/pm/my-work`) — เจ้าของ ∪ ผู้รับมอบ ∪ คนดึงมาทำแทน ∪ คนที่มอบหมาย */
export function mineTaskClauses(userId) {
  return ['ownerId', 'assigneeId', 'proxyBy', 'assignedBy'].map((column) => [column, [userId]]);
}

/**
 * แถวนี้อยู่ในขอบเขตที่ API โหลดไหม — ตีความ "clause" ชุดเดียวกับที่ `lib/pm/taskScope.js` แปลงเป็น query
 * @param clauses `null` = ทุกงาน (ขอบเขต "ทั้งหมด") · อาร์เรย์ `[คอลัมน์, ids]` = ผ่านข้อใดข้อหนึ่ง (OR)
 */
export function taskInScope(task, clauses) {
  if (!task) return false;
  if (clauses === null) return true;
  return (clauses || []).some(([column, ids]) => task[column] != null && ids.includes(task[column]));
}

/**
 * ตัวกรองของคิวตอน **เปิดมาจากหน้าดีล** (`/sa/tasks?dealId=X` · มติเจ้าของ 20/10/2026 M8b ข้อ 1)
 * ขอบเขตกว้างสุดที่มีสิทธิ์ · มุมมอง "ทั้งหมดของฉัน" · สถานะทั้งหมด (งานค้าง) · ล้างคำค้น/หมวด/ผู้รับ · คงชิปดีล
 * ⚠️ ทั้งหน้าคิว (ตอนอ่าน `?dealId=`) และ route ของหน้าดีล (ป้าย "ค้าง n") สร้างตัวกรองจากตัวนี้ตัวเดียว
 * `central` = ธง `?central=` จากลิงก์หน้าโครงการ (`projectTasksQueueHref`) — หน้าดีลไม่ส่ง
 */
export function dealQueueLanding({ allowedScopes = [], meId = null, dealIds = [], projectId = null, central = null, dealProjectOf } = {}) {
  return {
    meId,
    scope: widestTaskScope(allowedScopes),
    mineView: MINE_TASK_VIEWS.ALL,
    q: '',
    assignees: [],
    categories: [],
    deals: [...dealIds],
    project: projectId || null,
    central: central || null,
    status: 'all',
    dealProjectOf: dealProjectOf || (() => null),
  };
}

/**
 * ตัวกรองของคิวตอนกดป้ายเมนู "งานของฉัน" (`/sa/tasks?count=tasks` · M9)
 * ขอบเขต "ของฉัน" · แท็บ "ต้องทำ" · สถานะ `todo` · ล้างตัวกรองอื่นทั้งหมด ⇒ แถว = `myTasksTodoCount` (navCounts.js)
 */
export function tasksNavLanding({ meId = null } = {}) {
  return {
    meId,
    scope: 'mine',
    mineView: MINE_TASK_VIEWS.RESPONSIBLE,
    q: '',
    assignees: [],
    categories: [],
    deals: [],
    project: null,
    central: null,
    status: TASK_TODO_FILTER,
    dealProjectOf: () => null,
  };
}
