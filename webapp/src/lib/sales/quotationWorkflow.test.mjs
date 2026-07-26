import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditQuotationContent,
  canReviseQuotation,
  canWithdrawQuotationSubmission,
  isQuotationSubmitter,
  isRevisableQuotationApprovalStatus,
} from './quotationWorkflow.js';

const pending = {
  status: 'draft',
  approvalStatus: 'pending',
  approvalRequestedBy: 'USR-PROPOSER',
};

test('QT submission may be withdrawn by its proposer or approver only', () => {
  assert.equal(isQuotationSubmitter(pending, 'USR-PROPOSER'), true);
  assert.equal(isQuotationSubmitter(pending, 'USR-OTHER'), false);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-PROPOSER' }), true);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-APPROVER', approver: true }), true);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-OTHER' }), false);
});

test('QT withdrawal is unavailable before submission and after approval', () => {
  for (const approvalStatus of ['not_submitted', 'approved', 'not_required']) {
    assert.equal(
      canWithdrawQuotationSubmission({ ...pending, approvalStatus }, { userId: 'USR-PROPOSER', approver: true }),
      false,
    );
  }
});

test('QT content is editable only before submission', () => {
  const access = { canEdit: true, inScope: true };
  assert.equal(canEditQuotationContent({ ...pending, approvalStatus: 'not_submitted' }, access), true);
  assert.equal(canEditQuotationContent(pending, access), false);
  assert.equal(canEditQuotationContent({ ...pending, approvalStatus: 'approved' }, access), false);
  assert.equal(canEditQuotationContent({ ...pending, approvalStatus: 'not_submitted' }, { ...access, inScope: false }), false);
});

test('approved QT changes require a revision, never direct editing', () => {
  const approved = { ...pending, approvalStatus: 'approved' };
  const access = { canEdit: true, inScope: true };
  assert.equal(canEditQuotationContent(approved, access), false);
  assert.equal(canReviseQuotation(approved, access), true);
  assert.equal(canReviseQuotation({ ...approved, status: 'accepted' }, access), false);
  assert.equal(canReviseQuotation({ ...approved, approvalStatus: 'pending' }, access), false);
});

// ใบ grandfather (mig 0114) — ระบบนับเป็น "อนุมัติแล้ว" ทุกด่าน จึงต้องแก้ผ่าน Revision
// เท่านั้น เหมือนใบ approved (มติ 2026-07-26). ก่อนหน้านี้ถูกล็อกตายทั้งสามทาง
test('grandfather QT (not_required) is revisable but never editable in place', () => {
  const access = { canEdit: true, inScope: true };
  const grandfather = { ...pending, approvalStatus: 'not_required' };

  assert.equal(isRevisableQuotationApprovalStatus('not_required'), true);
  assert.equal(isRevisableQuotationApprovalStatus('approved'), true);
  assert.equal(isRevisableQuotationApprovalStatus('not_submitted'), false);
  assert.equal(isRevisableQuotationApprovalStatus('pending'), false);
  assert.equal(isRevisableQuotationApprovalStatus('rejected'), false);

  assert.equal(canReviseQuotation(grandfather, access), true);
  for (const status of ['draft', 'sent', 'rejected']) {
    assert.equal(canReviseQuotation({ ...grandfather, status }, access), true);
  }
  // ปลายทางแล้ว (Won/ปิด/มีฉบับใหม่) — ออก Revision ไม่ได้ เหมือนใบ approved
  for (const status of ['accepted', 'closed', 'revised', 'cancelled']) {
    assert.equal(canReviseQuotation({ ...grandfather, status }, access), false);
  }
  // สิทธิ์ยังต้องผ่านเหมือนเดิม — ไม่ใช่ประตูหลัง
  assert.equal(canReviseQuotation(grandfather, { ...access, canEdit: false }), false);
  assert.equal(canReviseQuotation(grandfather, { ...access, inScope: false }), false);

  // แก้ทับฉบับเดิมยังห้าม และถอนการยื่นก็ไม่เกี่ยว (ไม่เคยยื่น)
  assert.equal(canEditQuotationContent(grandfather, access), false);
  assert.equal(canWithdrawQuotationSubmission(grandfather, { userId: 'USR-PROPOSER', approver: true }), false);
});
