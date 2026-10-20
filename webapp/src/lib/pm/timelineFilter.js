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
   ⚠️ มุมมองเอกสาร (Gantt) ไม่กรองสถานะ/ฝ่าย — ผู้นับต้องข้ามตัวกรองนี้เองเมื่ออยู่มุมมองนั้น */
export const EMPTY_STEP_FILTER = Object.freeze({ statuses: Object.freeze([]), depts: Object.freeze([]) });

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

/** ขั้นนี้ผ่านตัวกรองสถานะ/ฝ่ายของแผงไทม์ไลน์ไหม — ว่าง = ทั้งหมด */
export function timelineStepMatches(task, stepFilter = EMPTY_STEP_FILTER) {
  const statuses = stepFilter?.statuses || [];
  const depts = stepFilter?.depts || [];
  if (statuses.length && !statuses.includes(timelineStepStatusKey(task))) return false;
  if (depts.length && task?.role && task.role !== 'ALL' && !depts.includes(task.role)) return false;
  return true;
}

/** จำนวนขั้นที่แผงไทม์ไลน์จะโชว์ — ดีลที่เลือก (`filterTimelineTasks`) × ตัวกรองขั้น (ข้ามเมื่อเป็นมุมมองเอกสาร) */
export function countTimelineSteps(tasks, { deals = [], stepFilter = EMPTY_STEP_FILTER, documentView = false } = {}) {
  const scoped = filterTimelineTasks(tasks, deals);
  return documentView ? scoped.length : scoped.filter((task) => timelineStepMatches(task, stepFilter)).length;
}
