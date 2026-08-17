// Sales Task Management — shared constants + pure helpers (JSX-free) for the
// งานมอบหมาย system that replaced "งานของฉัน". Ported from the kinn Assignment
// Tracker template. Used by both the API (validation) and the client page.

// หมวดหมู่งาน — ค่าคงที่ฝั่งโค้ด (เทมเพลตมีหน้า Set up dropdown; เราดึงคน/ดีล/
// โครงการจากข้อมูลจริงแทน และตรึงหมวดไว้ก่อน จนกว่าจะมีเคสต้องเพิ่มเอง).
export const TASK_CATEGORIES = [
  'ติดต่อลูกค้า',
  'ใบเสนอราคา/เอกสาร',
  'ติดตามออเดอร์',
  'ประชุม/นัดหมาย',
  'ประสานงานภายใน',
  'อื่น ๆ',
];

/* ── สถานะงานติดตาม (personal_tasks) ────────────────────────────────────────
   4 ค่า — 'Blocked' ("รอคนอื่น") เพิ่มเมื่อ 2026-08-17 ตามมติผู้ใช้: งานที่ส่งออกไป
   แล้วรอฝ่ายอื่น/ลูกค้าตอบ ไม่ใช่ทั้ง "กำลังทำ" (ไม่มีอะไรอยู่ในมือเรา) และไม่ใช่
   "รอดำเนินการ" (ซึ่งแปลว่ายังไม่ได้เริ่ม) — เดิมต้องเลือกผิดสักทางเสมอ

   ⚠️ ค่านี้ใช้กับ **งานติดตามเท่านั้น** ขั้นตอนไทม์ไลน์ (project_tasks) ยังมี 3 ค่า
   เพราะสถานะของมันถูกไล่อัตโนมัติจากกราฟ predecessor (lib/pm/status.js) ซึ่งไม่รู้จัก
   'Blocked' — StatusSelect จึงรับชุดสถานะเข้ามาเป็น prop แทนที่จะฮาร์ดโค้ดชุดเดียว */
export const TASK_STATUS_PENDING = 'Pending';
export const TASK_STATUS_IN_PROGRESS = 'In Progress';
export const TASK_STATUS_BLOCKED = 'Blocked';
export const TASK_STATUS_COMPLETED = 'Completed';

// เรียงตามลำดับเวลาที่งานเดินจริง: ยังไม่เริ่ม → ลงมือ → ส่งออกไปรอคนอื่น → ปิด
export const PERSONAL_TASK_STATUSES = [
  TASK_STATUS_PENDING, TASK_STATUS_IN_PROGRESS, TASK_STATUS_BLOCKED, TASK_STATUS_COMPLETED,
];
export const PROJECT_TASK_STATUSES = [
  TASK_STATUS_PENDING, TASK_STATUS_IN_PROGRESS, TASK_STATUS_COMPLETED,
];

export const TASK_STATUS_TH = {
  [TASK_STATUS_PENDING]: 'รอดำเนินการ',
  [TASK_STATUS_IN_PROGRESS]: 'กำลังทำ',
  [TASK_STATUS_BLOCKED]: 'รอคนอื่น',
  [TASK_STATUS_COMPLETED]: 'เสร็จแล้ว',
};

// งานที่ "ไม่ได้อยู่ในมือเรา" — นาฬิกาเกินกำหนดยังเดินต่อ (มติผู้ใช้: เดดไลน์คือ
// เดดไลน์ ไม่ว่าเหตุใด) แต่หน้าจอต้องแยกสีและแยกยอด ไม่ให้ปนกับงานที่เราดองเอง
export const isWaitingStatus = (status) => status === TASK_STATUS_BLOCKED;

// ระดับความยาก 1-3 (เทมเพลตมี 5 ระดับ — ละเอียดเกินการใช้จริง). ใช้ถ่วงน้ำหนัก KPI.
export const DIFFICULTY_LABELS = { 1: 'ง่าย', 2: 'ปานกลาง', 3: 'ยาก' };
export const DIFFICULTY_OPTIONS = [1, 2, 3];
export function normalizeDifficulty(v) {
  const n = Number(v);
  return n === 1 || n === 3 ? n : 2; // default ปานกลาง
}

// % ความคืบหน้าอนุมานจากสถานะ (แบบเดียวกับตรรกะเทมเพลต: ยังไม่เริ่ม/กำลังทำ/เสร็จ).
// 'Blocked' = 50 เท่ากับ "กำลังทำ" โดยตั้งใจ — งานที่รอคนอื่นคืองานที่เดินไปแล้วครึ่งทาง
// ไม่ใช่งานที่ถอยหลัง (ถ้าให้ต่ำกว่านี้ ความคืบหน้าโครงการจะลดลงตอนส่งงานออกไปรอ)
export function taskProgressPct(status) {
  if (status === 'Completed') return 100;
  if (status === 'In Progress' || status === 'Blocked') return 50;
  return 0;
}

// ช่อง Eisenhower ของงานจาก important × urgent.
//   do   = สำคัญ+ด่วน (ทำทันที) · plan = สำคัญ ไม่ด่วน (วางแผน)
//   deleg= ไม่สำคัญ+ด่วน (มอบหมายต่อ) · drop = ไม่สำคัญ ไม่ด่วน (ตัดทิ้ง)
export function eisenhowerQuadrant(task) {
  const imp = !!task?.important;
  const urg = !!task?.urgent;
  if (imp && urg) return 'do';
  if (imp && !urg) return 'plan';
  if (!imp && urg) return 'deleg';
  return 'drop';
}
export const QUADRANT_LABELS = {
  do: 'ทำทันที',
  plan: 'วางแผน',
  deleg: 'มอบหมายต่อ',
  drop: 'ตัดทิ้ง',
};
