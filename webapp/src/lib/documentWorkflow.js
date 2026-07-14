const EDITABLE_DOCUMENT_STATUSES = new Set(['draft', 'sent', 'rejected']);

export function validateDocumentReadiness({
  action,
  status,
  lineCount = 0,
  totalAmount = 0,
  approvalStatus = 'not_required',
  approvalFingerprint = null,
  currentFingerprint = null,
} = {}) {
  if (action === 'edit' && !EDITABLE_DOCUMENT_STATUSES.has(status)) {
    return { ok: false, error: `document status "${status}" is read-only` };
  }
  if (action === 'send' || action === 'accept') {
    if (!(Number(lineCount) > 0)) return { ok: false, error: 'document must contain at least one line' };
    if (!(Number(totalAmount) > 0)) return { ok: false, error: 'document total must be greater than zero' };
  }
  if (action === 'send' || action === 'accept') {
    if (!['not_required', 'approved'].includes(approvalStatus)) {
      return { ok: false, error: 'document approval is required' };
    }
    if (approvalStatus === 'approved'
      && (!approvalFingerprint || approvalFingerprint !== currentFingerprint)) {
      return { ok: false, error: 'document content changed after approval' };
    }
  }
  return { ok: true, error: null };
}
