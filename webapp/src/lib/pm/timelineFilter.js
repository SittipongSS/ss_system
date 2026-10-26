import { businessDate } from '@/lib/businessDate';

export const TIMELINE_CENTRAL = '__central__';

export function filterTimelineTasks(tasks, selections = []) {
  const rows = tasks || [];
  if (!selections?.length) return rows;
  const selected = new Set(selections);
  return rows.filter((task) => (
    task.dealId ? selected.has(task.dealId) : selected.has(TIMELINE_CENTRAL)
  ));
}

export function singleSelectedDeal(selections = []) {
  return selections.length === 1 && selections[0] !== TIMELINE_CENTRAL
    ? selections[0]
    : null;
}

/* ── ตัวกรองขั้นตอน (สถานะ · ฝ่าย) ของแผงไทม์ไลน์ — ตารางกับตัวนับของหน้าแม่ใช้ตัวเดียวกัน ──
   🐞 (ตรวจตัวเลข M18a · 20/10) ตัวเลือก "ดีลที่แสดง" บนหน้าโครงการเคยนับ "n ขั้นตอน" จากทุกขั้นของดีล
      ทั้งที่แผงกรองสถานะ/ฝ่ายอยู่ (state ส่วนตัวของ DealTimelineTable) ⇒ ตัวเลือกบอก 24 แต่แผงโชว์ 2
   ⭐ ตอนนี้กติกาอยู่ที่นี่ที่เดียว · หน้าโครงการถือ state ตัวกรอง (controlled) แล้วนับด้วย `timelineStepMatches`
   ⚠️ ขั้นที่ไม่ระบุฝ่าย / ฝ่าย 'ALL' เกี่ยวกับทุกคน ⇒ ผ่านตัวกรองฝ่ายเสมอ
   ⚠️ มุมมองเอกสาร (Gantt) ไม่กรองสถานะ/ฝ่าย — ผู้นับต้องข้ามตัวกรองนี้เองเมื่ออยู่มุมมองนั้น
   ⭐ (ตรวจตัวเลข L1 · 26/10) มิติที่สาม `overdue` = "เลยกำหนด" — ป้าย "เลยกำหนด n" บนแผงเคยกดไม่ได้และแผงกรองไม่มีมิตินี้
      ⇒ เห็นเลขแต่เรียกแถวชุดนั้นขึ้นจอไม่ได้ · ตอนนี้ป้ายทั้งสี่เป็นปุ่มที่ตั้งตัวกรองทั้งชุด (`timelineSummaryPick`)
      · เก็บเป็นธง ไม่ใช่วันที่ — "วันนี้" อ่านจากนาฬิกาไทยตอนนับ/กรองทุกครั้ง (เปิดจอค้างข้ามเที่ยงคืน ป้ายกับแถวยังใช้วันเดียวกัน) */
export const EMPTY_STEP_FILTER = Object.freeze({ statuses: Object.freeze([]), depts: Object.freeze([]), overdue: false });

export const TIMELINE_STEP_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: 'pending', label: 'รอดำเนินการ' }),
  Object.freeze({ value: 'progress', label: 'กำลังทำ' }),
  Object.freeze({ value: 'completed', label: 'เสร็จแล้ว' }),
]);

/** คีย์สถานะของขั้น — สถานะอื่นที่ไม่ใช่ In Progress / Completed นับเป็น "รอดำเนินการ" */
export function timelineStepStatusKey(task) {
  if (task?.status === 'In Progress') return 'progress';
  if (task?.status === 'Completed') return 'completed';
  return 'pending';
}

/** ขั้นนี้เลยกำหนดไหม — ยังไม่เสร็จ และวันเสร็จตามแผนอยู่ก่อนวันนี้ (วันไทย) · ตัวเดียวของป้ายและตัวกรอง */
export function timelineStepOverdue(task, today = businessDate()) {
  return task?.status !== 'Completed' && !!task?.finishDate && task.finishDate < today;
}

/** ขั้นนี้ผ่านตัวกรองสถานะ/ฝ่าย/เลยกำหนดของแผงไทม์ไลน์ไหม — ว่าง = ทั้งหมด
 *  @param today วันไทย 'YYYY-MM-DD' ของมิติเลยกำหนด (ค่าตั้งต้น = นาฬิกาไทยตอนนี้ · เทสต์ส่งเอง) */
export function timelineStepMatches(task, stepFilter = EMPTY_STEP_FILTER, today = undefined) {
  const statuses = stepFilter?.statuses || [];
  const depts = stepFilter?.depts || [];
  if (statuses.length && !statuses.includes(timelineStepStatusKey(task))) return false;
  if (depts.length && task?.role && task.role !== 'ALL' && !depts.includes(task.role)) return false;
  if (stepFilter?.overdue && !timelineStepOverdue(task, today ?? businessDate())) return false;
  return true;
}

/** จำนวนขั้นที่แผงไทม์ไลน์จะโชว์ — ดีลที่เลือก (`filterTimelineTasks`) × ตัวกรองขั้น (ข้ามเมื่อเป็นมุมมองเอกสาร) */
export function countTimelineSteps(tasks, { deals = [], stepFilter = EMPTY_STEP_FILTER, documentView = false, today = undefined } = {}) {
  const scoped = filterTimelineTasks(tasks, deals);
  return documentView ? scoped.length : scoped.filter((task) => timelineStepMatches(task, stepFilter, today)).length;
}

/* ── ป้ายสรุปบนแผง (รอดำเนินการ · กำลังทำ · เสร็จแล้ว · เลยกำหนด) — ตรวจตัวเลข L1 (26/10) ──────────────
   🐞 ป้ายสี่ตัวนับทุกขั้นของแผง (ไม่สนตัวกรองฝ่าย) และกดไม่ได้ · "เลยกำหนด 3" เรียกสามขั้นนั้นขึ้นจอไม่ได้เลย
   ⭐ ป้าย = ปุ่ม · กด = ตัวกรองชุดใหม่ **ทั้งชุด** (`timelineSummaryPick` · แทนที่ ไม่ใช่เติม · ล้างฝ่ายด้วย เพราะป้ายนับทุกฝ่าย
      — กติกาเดียวกับ leadListFilter #1877) ⇒ เลขบนป้าย = ขั้นที่แผงเหลือหลังกด (เทสต์ล็อกไว้)
   ⚠️ ป้ายไม่ล้าง "ดีลที่แสดง" ของหน้าโครงการ — ป้ายนับจาก `tasks` ที่แผงได้รับ (ผ่านตัวเลือกดีลมาแล้ว) */
export const TIMELINE_SUMMARY_KINDS = Object.freeze(['pending', 'progress', 'completed', 'overdue']);

/** เลขบนป้ายสรุปทั้งสี่ — นับด้วยตัวตัดสินเดียวกับตัวกรอง (`timelineStepStatusKey` · `timelineStepOverdue`) */
export function timelineSummaryCounts(tasks, today = businessDate()) {
  const counts = { pending: 0, progress: 0, completed: 0, overdue: 0 };
  for (const task of tasks || []) {
    counts[timelineStepStatusKey(task)] += 1;
    if (timelineStepOverdue(task, today)) counts.overdue += 1;
  }
  return counts;
}

/** ตัวกรองขั้นชุดใหม่ทั้งชุดของป้าย `kind` — 'overdue' = เลยกำหนด · อื่น ๆ = สถานะนั้นสถานะเดียว */
export function timelineSummaryPick(kind) {
  if (kind === 'overdue') return { statuses: [], depts: [], overdue: true };
  return { statuses: [kind], depts: [], overdue: false };
}

/** ป้ายนี้คือตัวกรองที่ใช้อยู่ไหม (aria-pressed) — ตรงทุกมิติ ไม่ใช่แค่มีสถานะนี้ติดอยู่ */
export function timelineSummaryActive(stepFilter, kind) {
  const pick = timelineSummaryPick(kind);
  const statuses = stepFilter?.statuses || [];
  const depts = stepFilter?.depts || [];
  return !!stepFilter?.overdue === pick.overdue && !depts.length
    && statuses.length === pick.statuses.length && pick.statuses.every((s) => statuses.includes(s));
}

/* ── กลุ่มเฟส + เลขขั้น 1.1/1.2 ของแผง — ตรวจตัวเลข L13 (26/10) ──────────────────────────────────────
   🐞 มุมมองตารางกรองเฟสที่ว่างทิ้งแล้วใช้ลำดับในอาร์เรย์ที่กรองแล้วเป็นเลขหัวเฟส ⇒ กรองจนเฟส 1 หาย
      หัวเฟสขึ้น "1. <เฟส 2>" เหนือแถว 2.1 · 2.2 และสีเฟสเลื่อนไปหนึ่ง (มุมมองรายการถูกอยู่แล้ว)
   ⭐ ทุกกลุ่มพก `index` ของตัวเอง (ตำแหน่งในไทม์ไลน์ทั้งเส้น ก่อนกรอง) ⇒ หัวเฟส · สีเฟส · เลขขั้น มาจากเลขเดียวกัน */
export function timelinePhaseGroups(tasks) {
  const groups = [];
  const numberOf = new Map();
  for (const task of tasks || []) {
    const last = groups[groups.length - 1];
    if (!last || last.phase !== (task.phase || '')) groups.push({ phase: task.phase || '', index: groups.length, tasks: [task] });
    else last.tasks.push(task);
  }
  groups.forEach((group) => group.tasks.forEach((task, ti) => numberOf.set(task.id, `${group.index + 1}.${ti + 1}`)));
  return { groups, numberOf };
}
