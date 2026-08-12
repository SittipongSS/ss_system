// ── โมดูล "งานบริหาร" (mgmt) — ค่าคงที่ + label + helper (pure) ─────────
// ใช้ได้ทั้ง client + server. สถานะ/ลำดับ/flag ตรงกับต้นแบบ Apps Script
// ("แผนติดตามงาน"). ปีเก็บเป็น ค.ศ. ใน DB, แปลง พ.ศ. ตอนแสดง.

// สถานะงาน (4) — key ในเครื่อง = อังกฤษ, label = ไทยตามต้นแบบ.
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'];
export const TASK_STATUS_LABELS = {
  todo: 'รอเริ่ม',
  in_progress: 'กำลังดำเนิน',
  done: 'เสร็จสมบูรณ์',
  cancelled: 'ยกเลิก',
};

// ลำดับความสำคัญ (2).
export const TASK_PRIORITIES = ['normal', 'urgent'];
export const TASK_PRIORITY_LABELS = { normal: 'ปกติ', urgent: 'ด่วน' };

// flag ติดตามผลของการประชุม.
export const MEETING_FOLLOWUPS = ['none', 'follow'];
export const MEETING_FOLLOWUP_LABELS = { none: 'ไม่ติดตาม', follow: 'ติดตามต่อ' };

export const isDoneStatus = (status) => status === 'done';
export const isOpenStatus = (status) => status === 'todo' || status === 'in_progress';

/* "รอฉันลงมือ" ของงานบริหาร = งานที่ยังไม่จบและ **มอบหมายให้ฉัน** (ม-116)
   ⚠️ คนละตารางกับ "งานของฉัน" ใต้ระบบขาย (`personal_tasks`) — งานจากที่ประชุม
   อยู่ `mgmt_tasks` ⇒ ป้ายสองตัวนี้นับคนละก้อน ไม่ใช่ตัวเลขซ้ำ
   ⚠️ ผู้สั่งงาน (คนสร้าง) ไม่นับ — งานที่เรามอบให้คนอื่นไม่ใช่งานที่รอเรา
   (กติกาเดียวกับ `myTasksTodoCount` ที่ตัด assignedBy ออก) */
export const isMyOpenTask = (task, userId) => Boolean(userId)
  && isOpenStatus(task?.status)
  && task?.assigneeId === userId;

// %เสร็จ (live badge) = สัดส่วนงานที่ done จากงานที่ไม่ถูกยกเลิก.
export function completionPercent(tasks) {
  const counted = (tasks || []).filter((t) => t.status !== 'cancelled');
  if (!counted.length) return 0;
  const done = counted.filter((t) => isDoneStatus(t.status)).length;
  return Math.round((done / counted.length) * 100);
}

// นับจำนวนงานตามสถานะ (ใช้โดนัท/KPI หน้า Overview).
export function statusCounts(tasks) {
  const out = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const t of tasks || []) {
    if (out[t.status] != null) out[t.status] += 1;
  }
  return out;
}

/* ── ปี: เก็บ ค.ศ. · แสดง ค.ศ. ────────────────────────────────────────
   เคยมี toBuddhistYear/toGregorianYear คู่หนึ่งไว้แปลงตอนแสดงผล — ถอดออกพร้อมกับ
   ที่ระบบเปลี่ยนเป็น **ปี ค.ศ. ทั้งระบบ** (มติผู้ใช้ 2026-08-05 ดู lib/datePeriods)
   ⇒ ถ้าจะเอา พ.ศ. กลับมา ให้กลับมาที่ชั้นแสดงผลกลางที่เดียว อย่าเขียน +543
     กระจายรายหน้าอีก (ของเดิมมี 15 จุดใน 8 ไฟล์) */
// ปี ค.ศ. ของ date string ('YYYY-MM-DD') — null ถ้าไม่มีวันที่.
export function yearOf(dateStr) {
  if (!dateStr) return null;
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}
