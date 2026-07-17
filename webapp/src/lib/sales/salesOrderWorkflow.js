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

// เหตุผลยกเลิก SO แบบมาตรฐาน (มติผู้ใช้ 2026-07-18) — 3 กลุ่ม:
//   customer = ฝั่งลูกค้า (ดีลหลุดจริง → พิจารณาย้อน Won ในอนาคต)
//   document = แก้เอกสาร (ดีลยังอยู่ ออก SO ใหม่)
//   data     = ข้อมูลพลาด
// เก็บเป็น cancelReasonCode (โครงสร้าง) คู่กับ cancelReason (หมายเหตุอิสระ) เพื่อรายงาน.
export const SALES_ORDER_CANCEL_REASONS = [
  { code: 'customer_cancelled', group: 'customer', label: 'ลูกค้ายกเลิกคำสั่งซื้อ' },
  { code: 'customer_no_payment', group: 'customer', label: 'ลูกค้าไม่ชำระ / ผิดเงื่อนไข' },
  { code: 'switched_option', group: 'customer', label: 'เปลี่ยนไปใช้ข้อเสนอ/ใบเสนอราคาอื่น' },
  { code: 'wrong_document', group: 'document', label: 'ออก SO ผิด (ผิดใบ/ดีล/ลูกค้า)' },
  { code: 'reissue_correction', group: 'document', label: 'แก้รายการ/ราคา — ออก SO ใหม่' },
  { code: 'duplicate_test', group: 'data', label: 'รายการซ้ำ / ทดสอบ' },
  { code: 'other', group: 'data', label: 'อื่น ๆ (ระบุในหมายเหตุ)' },
];

const CANCEL_REASON_CODES = new Set(SALES_ORDER_CANCEL_REASONS.map((r) => r.code));
export function isValidCancelReasonCode(code) {
  return CANCEL_REASON_CODES.has(code);
}
export function cancelReasonLabel(code) {
  return SALES_ORDER_CANCEL_REASONS.find((r) => r.code === code)?.label || code || '';
}

// เหตุกลุ่ม "ฝั่งลูกค้า" = ดีลหลุดจริง → เสนอให้ย้อน Won (มติ 2026-07-18).
// กลุ่ม document/data = ดีลยังอยู่ (แก้เอกสาร/ข้อมูลพลาด) ไม่ต้องถอยดีล.
export function isCustomerCancelReason(code) {
  return SALES_ORDER_CANCEL_REASONS.find((r) => r.code === code)?.group === 'customer';
}

// ปลายทางเมื่อย้อน Won: reopen = กลับสถานะเปิดก่อน Won · lost = ลูกค้าเลิกถาวร
export const WON_REVERSAL_TARGETS = ['reopen', 'lost'];
export function isValidReversalTarget(target) {
  return WON_REVERSAL_TARGETS.includes(target);
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
