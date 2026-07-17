// เฟส F — ด่านอนุมัติปิดโครงการ (มติผู้ใช้ 2026-07-18).
// ครอบ "ทุกการปิด": ปิดสำเร็จ (ส่งมอบครบ) และยกเลิกโครงการ — ทั้งคู่ต้องให้
// AE Supervisor อนุมัติ. ปิดแล้วเปิดใหม่ได้ (Supervisor/admin) เพื่อรองรับ RE-ORDER
// (ดีลใหม่ในโครงการเดิม). คนละเรื่องกับ status free text (New/On Hold/Dropped) เดิม —
// closeStatus เป็นชั้น "เซ็นรับรอง" ทางการที่แยกออกมา.
import { isSuperuser } from '@/lib/permissions';

export const PROJECT_CLOSE_STATUSES = ['open', 'pending_close', 'closed'];

export const PROJECT_CLOSE_TYPES = ['completed', 'cancelled'];
export const PROJECT_CLOSE_TYPE_LABELS = {
  completed: 'ปิดสำเร็จ (ส่งมอบครบ)',
  cancelled: 'ยกเลิกโครงการ',
};
export function isValidCloseType(type) {
  return PROJECT_CLOSE_TYPES.includes(type);
}

export const PROJECT_CLOSE_STATUS_LABELS = {
  open: 'เปิดอยู่',
  pending_close: 'รออนุมัติปิด',
  closed: 'ปิดแล้ว',
};

// อนุมัติ/ตีกลับ/เปิดใหม่ = AE Supervisor + admin (superuser). ผู้ขอปิด (ผู้ดูแลโครงการ)
// อนุมัติของตัวเองไม่ได้ — ตรวจ requester ≠ approver ใน handler (เหมือน SO).
export function canApproveProjectClose(user) {
  return !!user && isSuperuser(user.role);
}

// transition ที่ทำได้จากแต่ละ closeStatus (role/scope บังคับเพิ่มใน handler):
//   request        = open → pending_close (ผู้ดูแลโครงการ)
//   cancel_request = pending_close → open (ผู้ขอถอนคำขอ / approver)
//   approve        = pending_close → closed (approver, ไม่ใช่ผู้ขอ)
//   reject         = pending_close → open (approver, ไม่ใช่ผู้ขอ)
//   reopen         = closed → open (approver — RE-ORDER)
export function canProjectCloseTransition(closeStatus, action, { approver = false } = {}) {
  const s = closeStatus || 'open';
  if (action === 'request') return s === 'open';
  if (action === 'cancel_request') return s === 'pending_close';
  if (action === 'approve' || action === 'reject') return approver && s === 'pending_close';
  if (action === 'reopen') return approver && s === 'closed';
  return false;
}
