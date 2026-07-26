import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditQuotationContent,
  canReviseQuotation,
  canWithdrawQuotationSubmission,
  isQuotationSubmitter,
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
