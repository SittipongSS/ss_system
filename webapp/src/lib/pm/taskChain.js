// ── งานต่อเนื่อง (chain) ของงานติดตาม — ตรรกะล้วน JSX-free ใช้ร่วม API + client
//
// โมเดล: หนึ่งงานมี **งานก่อนหน้าได้ใบเดียว** (`predecessorId`) และมีงานถัดไปกี่ใบก็ได้
// (อ่านกลับด้านจากคอลัมน์เดียวกัน) — พอสำหรับ "จบใบนี้แล้วต่อใบหน้า" ที่เป็นเคสจริง
// ต่างจากขั้นตอนไทม์ไลน์ (project_tasks.predecessors = array + กราฟเต็ม) โดยตั้งใจ:
// งานติดตามเป็นสายเส้นเดียว ไม่ใช่แผนงานที่ต้องคำนวณ critical path
//
// กติกาสองข้อที่ทั้ง POST และ PATCH ต้องใช้เหมือนกัน:
//   1. ผูกกับงานก่อนหน้าที่ยังไม่เสร็จ → งานใหม่เข้าสถานะ "รอคนอื่น" พร้อมเหตุผลอัตโนมัติ
//   2. ปิดงานใบหนึ่ง → งานถัดไปที่ยังติดล็อกอยู่ เด้งกลับเป็น "รอดำเนินการ" ให้เอง
//      (ไม่กระโดดไป "กำลังทำ" — คนต้องกดเริ่มเอง แบบเดียวกับ lib/pm/status.js)
import { TASK_STATUS_BLOCKED, TASK_STATUS_COMPLETED, TASK_STATUS_PENDING } from '@/lib/pm/tasks';

// ข้อความ "รออะไรอยู่" ของงานที่ติดล็อกเพราะรอใบก่อนหน้า — ต้องอ่านรู้เรื่องเดี่ยว ๆ
// เพราะมันไปโผล่ในคิวของคนอื่นที่ไม่รู้จักสายงานนี้
export function chainBlockReason(predecessorTitle) {
  const title = (predecessorTitle || '').trim();
  return title ? `รองาน “${title}” ให้เสร็จก่อน` : 'รองานก่อนหน้าให้เสร็จก่อน';
}

// งานยังติดล็อกเพราะสายงานอยู่ไหม — ใบก่อนหน้ายังไม่ปิด = ยังเริ่มไม่ได้
export function isChainBlocked(predecessor) {
  return !!predecessor && predecessor.status !== TASK_STATUS_COMPLETED;
}

/** สถานะ + เหตุผล ที่งานควรได้เมื่อผูกกับงานก่อนหน้า
 *  @param requestedStatus สถานะที่ผู้ใช้ขอมา (สร้างใหม่ปกติ = 'Pending')
 *  @param predecessor     แถวงานก่อนหน้า (null = ไม่ได้ผูก)
 *  @returns {{status, blockedReason, blockedSince}|null} null = ไม่ต้องแทรกแซง
 *
 *  ไม่แตะงานที่ผู้ใช้สั่งปิดมาเลย (`Completed`) — คนที่บันทึกงานย้อนหลังทั้งสาย
 *  ต้องปิดใบท้ายได้โดยไม่ถูกระบบเด้งกลับ
 */
export function chainStatusOnLink(requestedStatus, predecessor, today) {
  if (requestedStatus === TASK_STATUS_COMPLETED) return null;
  if (!isChainBlocked(predecessor)) return null;
  return {
    status: TASK_STATUS_BLOCKED,
    blockedReason: chainBlockReason(predecessor.title),
    blockedSince: today,
  };
}

/** งานถัดไปที่ต้องปลดล็อกเมื่อใบก่อนหน้าปิด
 *  ปลดเฉพาะใบที่ยัง 'Blocked' — ใบที่คนลงมือไปแล้ว (หรือปิดไปแล้ว) ห้ามถูกดึงกลับ
 *  @returns [{ id, status, title }] เฉพาะใบที่ต้องอัปเดตจริง
 */
export function followersToUnlock(followers = []) {
  return followers.filter((task) => task && task.status === TASK_STATUS_BLOCKED);
}

// ค่าที่เขียนกลับเมื่อปลดล็อก — เหตุผลที่รอถูกล้างพร้อมกัน ไม่งั้นงานที่เดินได้แล้ว
// ยังโชว์ว่า "รองาน X" ค้างอยู่บนหน้าจอ
export const UNLOCK_PATCH = {
  status: TASK_STATUS_PENDING,
  blockedReason: null,
  blockedSince: null,
};

// จำนวนวันที่รออยู่ — null เมื่อไม่รู้ว่าเริ่มรอเมื่อไร (ข้อมูลเก่าก่อน mig 0266)
export function daysWaiting(task, today) {
  if (!task?.blockedSince || !today) return null;
  const from = new Date(task.blockedSince);
  const to = new Date(today);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to - from) / 86400000));
}
