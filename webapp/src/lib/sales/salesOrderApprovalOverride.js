export const ADMIN_OVERRIDE_REASON_MAX = 500;

export function normalizeAdminOverrideReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

// เหตุผล Admin Override เป็น optional (มติผู้ใช้ 2026-07-25) — ตอนอนุมัติเด้งแค่กล่องยืนยัน
// ไม่บังคับพิมพ์เหตุผล; ยังตัดความยาวสูงสุดกัน payload บวมและให้ตรงกับ CHECK ระดับ DB (mig 0150).
// การอนุมัติใบตัวเองยังถูกบันทึกเป็นหลักฐาน (approvalMode=admin_override + contextSnapshot) เสมอ
export function adminOverrideReasonError(value) {
  const reason = normalizeAdminOverrideReason(value);
  if (reason.length > ADMIN_OVERRIDE_REASON_MAX) {
    return `เหตุผลต้องไม่เกิน ${ADMIN_OVERRIDE_REASON_MAX} ตัวอักษร`;
  }
  return '';
}

export function isSalesOrderSelfApproval(order, userId) {
  if (!order || !userId) return false;
  return order.createdBy === userId || order.submittedBy === userId;
}
