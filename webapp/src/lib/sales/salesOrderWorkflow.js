export const SALES_ORDER_STATUS_LABELS = {
  draft: 'ฉบับร่าง',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับ',
  cancelled: 'ยกเลิก',
};

export function isSalesOrderReviewer(role) {
  return role === 'ae_supervisor' || role === 'admin';
}

export function salesOrderActual(order) {
  return order?.status === 'approved' ? Math.max(0, Number(order.actualAmount) || 0) : 0;
}

// sales_deals.wonValue is only a compatibility cache. Treat it as Actual only
// when the database marked the value as derived from approved Sale Orders.
export function dealActualFromSalesOrders(deal) {
  if (deal?.metadata?.actualSource !== 'sale_order') return 0;
  return Math.max(0, Number(deal?.wonValue) || 0);
}

export function canSalesOrderTransition(status, action, { reviewer = false, admin = false } = {}) {
  if (action === 'save' || action === 'submit') return status === 'draft' || status === 'rejected';
  if (action === 'approve' || action === 'reject') return reviewer && status === 'pending_approval';
  if (action === 'cancel') return status !== 'cancelled' && (status !== 'pending_approval' || reviewer);
  if (action === 'restore') return admin && status === 'cancelled';
  return false;
}
