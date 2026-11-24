// ── กระดิ่ง "งานเลยกำหนด" ของเมนูงานของฉัน (งวด 3 · มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §11) ──
//
// ⭐ ผู้รับ = **ผู้รับผิดชอบงาน** (`taskCreditId` — คนที่ดึงมาทำแทน › คนที่ถูกมอบหมาย › เจ้าของ) ตัวเดียวกับที่ KPI ให้เครดิต ·
//   คนมอบหมายไม่ได้กระดิ่ง (มติ "ส่งผู้รับผิดชอบงาน")
// ⭐ "เลยกำหนด" ตามป้ายแดงบนหน้างาน (`taskUrgency` tone `overdue`): ยังไม่เสร็จ · วันกำหนด (`targetDate`) ผ่านไปแล้ว ·
//   **ไม่ใช่งาน "รอคนอื่น"** (Blocked — จอโชว์ม่วงไม่ใช่แดง: เร่งเองไม่ได้ ทวงคนถือก็ไม่ช่วย)
// ⭐ ครั้งเดียวต่อ (งาน × วันกำหนด) — เลื่อนกำหนดแล้วเลยอีก = ยิงใหม่ · ไม่ยิงย้อนงานที่เลยเกิน 7 วัน
// 🪦 การ์ด Chat "งานโครงการใกล้ครบกำหนด" (สรุปทั้งทีม) ถูกถอด 12/08 — ตัวนี้เป็นกระดิ่งรายคน ไม่ใช่การ์ดตัวนั้นกลับมา
// ⚠️ ฟังก์ชันบริสุทธิ์ — cron daily-digest ดึงงานแล้วส่ง `todayIso` วันไทยเข้ามา
import { taskCreditId } from '@/lib/permissions';
import { TASK_STATUS_COMPLETED, isWaitingStatus } from '@/lib/pm/tasks';
import { targetDate } from '@/lib/pm/derived';
import { calendarDays, dueBellFresh } from '@/lib/dueState';
import { fmtDate } from '@/lib/format';

export const TASK_OVERDUE_KIND = 'task_overdue';
export const taskOverdueDedupeKey = (taskId, due) => `task_overdue:${taskId}:${due}`;

const text = (value) => String(value ?? '').trim();

/**
 * กระดิ่งของงานที่เพิ่งเลยกำหนด — หนึ่งแถวต่องาน ถึงผู้รับผิดชอบคนเดียว
 * @param tasks     แถว `personal_tasks`
 * @param directory Map id → ผู้ใช้ (ตัดบัญชีที่ปิดแล้ว)
 */
export function taskOverdueNotices(tasks = [], { todayIso, directory = null } = {}) {
  const out = [];
  for (const task of tasks || []) {
    if (!task?.id || task.status === TASK_STATUS_COMPLETED || isWaitingStatus(task.status)) continue;
    const due = text(targetDate(task)).slice(0, 10);
    if (!due || !dueBellFresh(due, todayIso)) continue;
    const holder = text(taskCreditId(task));
    if (!holder || directory?.get?.(holder)?.disabled) continue;
    out.push({
      userIds: [holder],
      entityType: 'personal_task',
      entityId: task.id,
      kind: TASK_OVERDUE_KIND,
      dedupeKey: taskOverdueDedupeKey(task.id, due),
      title: `งานเลยกำหนด ${calendarDays(due, todayIso)} วัน · ${text(task.title) || 'งาน'}`,
      body: `กำหนดเสร็จ ${fmtDate(due)}`,
    });
  }
  return out;
}
