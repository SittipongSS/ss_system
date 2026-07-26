const EDITABLE_QUOTATION_STATUSES = new Set(['draft', 'sent', 'rejected']);

// ใบ grandfather (mig 0114 ตั้งใจไม่ backfill) นับเป็น "อนุมัติแล้ว" ทุกด่านในระบบอยู่แล้ว
// — ส่งลูกค้า/Won ผ่านได้ (documentWorkflow.js + accept RPC ตั้งแต่ mig 0098) — จึงต้องแก้
// ด้วย Revision เหมือนใบ approved ตามแผนแม่บท "หลังอนุมัติห้ามแก้ทับฉบับเดิม" (มติ 2026-07-26).
// เกิดใหม่ไม่ได้แล้ว (default = not_submitted ตั้งแต่ mig 0156) — รับไว้เพื่อใบเก่าเท่านั้น
const REVISABLE_APPROVAL_STATUSES = new Set(['approved', 'not_required']);

export function isRevisableQuotationApprovalStatus(approvalStatus) {
  return REVISABLE_APPROVAL_STATUSES.has(approvalStatus);
}

export function isQuotationSubmitter(quotation, userId) {
  return Boolean(userId)
    && quotation?.approvalStatus === 'pending'
    && quotation?.approvalRequestedBy === userId;
}

export function canWithdrawQuotationSubmission(
  quotation,
  { userId = '', approver = false } = {},
) {
  return Boolean(quotation)
    && quotation.approvalStatus === 'pending'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status)
    && (approver || isQuotationSubmitter(quotation, userId));
}

// ตีกลับ = ผู้อนุมัติส่งใบกลับให้ผู้จัดทำแก้ (mig 0164) — คู่ตรงข้ามของดึงกลับที่เป็น
// การกระทำของผู้ยื่นเอง. ผู้ยื่นตีกลับใบตัวเองไม่ได้ ต้องใช้ดึงกลับ
export function canRejectQuotationSubmission(quotation, { approver = false } = {}) {
  return Boolean(quotation)
    && approver
    && quotation.approvalStatus === 'pending'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}

// ใบที่เพิ่งถูกตีกลับ = ยังไม่ยื่น + มีเหตุผลค้างอยู่ (trigger ล้างให้เมื่อยื่นใหม่)
export function quotationRejectionNotice(quotation) {
  if (!quotation || quotation.approvalStatus !== 'not_submitted') return null;
  const reason = String(quotation.rejectionReason || '').trim();
  if (!reason) return null;
  return {
    reason,
    byName: String(quotation.rejectedByName || '').trim() || 'ผู้อนุมัติ',
    at: quotation.rejectedAt || null,
  };
}

export function canEditQuotationContent(
  quotation,
  { canEdit = false, inScope = false } = {},
) {
  return Boolean(quotation)
    && canEdit
    && inScope
    && quotation.approvalStatus === 'not_submitted'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}
export function canReviseQuotation(
  quotation,
  { canEdit = false, inScope = false } = {},
) {
  return Boolean(quotation)
    && canEdit
    && inScope
    && REVISABLE_APPROVAL_STATUSES.has(quotation.approvalStatus)
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}
