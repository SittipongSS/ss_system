// Sales Task Management — shared constants + pure helpers (JSX-free) for the
// งานมอบหมาย system that replaced "งานของฉัน". Ported from the kinn Assignment
// Tracker template. Used by both the API (validation) and the client page.

// หมวดหมู่งาน — ค่าคงที่ฝั่งโค้ด (เทมเพลตมีหน้า Set up dropdown; เราดึงคน/ดีล/
// โปรเจกต์จากข้อมูลจริงแทน และตรึงหมวดไว้ก่อน จนกว่าจะมีเคสต้องเพิ่มเอง).
export const TASK_CATEGORIES = [
  'ติดต่อลูกค้า',
  'ใบเสนอราคา/เอกสาร',
  'ติดตามออเดอร์',
  'ประชุม/นัดหมาย',
  'ประสานงานภายใน',
  'อื่น ๆ',
];

// ระดับความยาก 1-3 (เทมเพลตมี 5 ระดับ — ละเอียดเกินการใช้จริง). ใช้ถ่วงน้ำหนัก KPI.
export const DIFFICULTY_LABELS = { 1: 'ง่าย', 2: 'ปานกลาง', 3: 'ยาก' };
export const DIFFICULTY_OPTIONS = [1, 2, 3];
export function normalizeDifficulty(v) {
  const n = Number(v);
  return n === 1 || n === 3 ? n : 2; // default ปานกลาง
}

// % ความคืบหน้าอนุมานจากสถานะ (แบบเดียวกับตรรกะเทมเพลต: ยังไม่เริ่ม/กำลังทำ/เสร็จ).
export function taskProgressPct(status) {
  if (status === 'Completed') return 100;
  if (status === 'In Progress') return 50;
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
