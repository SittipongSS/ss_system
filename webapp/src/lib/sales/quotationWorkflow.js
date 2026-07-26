const EDITABLE_QUOTATION_STATUSES = new Set(['draft', 'sent', 'rejected']);

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
    && quotation.approvalStatus === 'approved'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}
