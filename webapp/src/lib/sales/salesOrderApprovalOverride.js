export const ADMIN_OVERRIDE_REASON_MIN = 10;
export const ADMIN_OVERRIDE_REASON_MAX = 500;

export function normalizeAdminOverrideReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function adminOverrideReasonError(value) {
  const reason = normalizeAdminOverrideReason(value);
  if (reason.length < ADMIN_OVERRIDE_REASON_MIN) {
    return `กรุณาระบุเหตุผลอย่างน้อย ${ADMIN_OVERRIDE_REASON_MIN} ตัวอักษร`;
  }
  if (reason.length > ADMIN_OVERRIDE_REASON_MAX) {
    return `เหตุผลต้องไม่เกิน ${ADMIN_OVERRIDE_REASON_MAX} ตัวอักษร`;
  }
  return '';
}

export function isSalesOrderSelfApproval(order, userId) {
  if (!order || !userId) return false;
  return order.createdBy === userId || order.submittedBy === userId;
}
