const EDITABLE_DOCUMENT_STATUSES = new Set(['draft', 'sent', 'rejected']);

export function validateDocumentReadiness({
  action,
  status,
  lineCount = 0,
  approvalStatus = 'not_required',
  approvalFingerprint = null,
  currentFingerprint = null,
} = {}) {
  if (action === 'edit' && !EDITABLE_DOCUMENT_STATUSES.has(status)) {
    return { ok: false, error: `document status "${status}" is read-only` };
  }
  if (action === 'send' || action === 'accept') {
    if (!(Number(lineCount) > 0)) return { ok: false, error: 'document must contain at least one line' };
    // ยอด 0 ผ่านได้ทั้ง send และ accept/Won (มติผู้ใช้ 2026-08-03 ขยายจากมติ 2026-07-18
    // ที่เปิดเฉพาะ send): บางใบลด/แถมจนเหลือ 0 แต่ยังเป็นดีลที่ปิดได้จริง — ยอด Won 0
    // ที่เขียนลงดีลคือค่าที่ถูกต้องของใบนั้น ไม่ใช่ข้อมูลหาย
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
