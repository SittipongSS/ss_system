import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditQuotationContent,
  canReviseQuotation,
  canRejectQuotationSubmission,
  canWithdrawQuotationSubmission,
  isQuotationSubmitter,
  isRevisableQuotationApprovalStatus,
  quotationRejectionNotice,
} from './quotationWorkflow.js';

const pending = {
  status: 'draft',
  approvalStatus: 'pending',
  approvalRequestedBy: 'USR-PROPOSER',
};

test('QT withdrawal belongs to the proposer alone — approvers use rejection', () => {
  assert.equal(isQuotationSubmitter(pending, 'USR-PROPOSER'), true);
  assert.equal(isQuotationSubmitter(pending, 'USR-OTHER'), false);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-PROPOSER' }), true);
  // ผู้อนุมัติดึงกลับไม่ได้แล้ว (มติ 2026-07-26) — ส่งเอกสารกลับต้องผ่าน "ตีกลับ" ที่ทิ้งเหตุผลไว้
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-APPROVER', approver: true }), false);
  assert.equal(canRejectQuotationSubmission(pending, { approver: true, userId: 'USR-APPROVER' }), true);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-OTHER' }), false);
});

test('QT withdrawal is unavailable before submission and after approval', () => {
  for (const approvalStatus of ['not_submitted', 'approved', 'not_required']) {
    assert.equal(
      canWithdrawQuotationSubmission({ ...pending, approvalStatus }, { userId: 'USR-PROPOSER' }),
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
  // ปลายทางแล้ว (Won/ปิด/มีฉบับใหม่) — ออก Rev. ไม่ได้ เหมือนใบ approved
  for (const status of ['accepted', 'closed', 'revised', 'cancelled']) {
    assert.equal(canReviseQuotation({ ...grandfather, status }, access), false);
  }
  // สิทธิ์ยังต้องผ่านเหมือนเดิม — ไม่ใช่ประตูหลัง
  assert.equal(canReviseQuotation(grandfather, { ...access, canEdit: false }), false);
  assert.equal(canReviseQuotation(grandfather, { ...access, inScope: false }), false);

  // แก้ทับฉบับเดิมยังห้าม และดึงกลับก็ไม่เกี่ยว (ไม่เคยยื่น)
  assert.equal(canEditQuotationContent(grandfather, access), false);
  assert.equal(canWithdrawQuotationSubmission(grandfather, { userId: 'USR-PROPOSER' }), false);
});

// ตีกลับ (mig 0164) — คู่ตรงข้ามของดึงกลับ: ต่างกันที่ "ใครทำ" และ "ทิ้งร่องรอยไหม"
test('QT rejection belongs to the approver, withdrawal belongs to the proposer', () => {
  assert.equal(canRejectQuotationSubmission(pending, { approver: true, userId: 'USR-APPROVER' }), true);
  assert.equal(canRejectQuotationSubmission(pending, { approver: false, userId: 'USR-APPROVER' }), false);
  assert.equal(canRejectQuotationSubmission(pending, {}), false);

  /* ⭐ เจ้าของดีลที่ยื่นใบของตัวเอง = เป็นทั้งผู้ยื่นและผู้อนุมัติ (canApproveQuotation
     ให้เจ้าของอนุมัติใบตัวเองได้) — ต้องเหลือ "ดึงกลับ" ทางเดียว ไม่งั้นแผงจัดการเอกสาร
     โชว์ "ดึงกลับมาแก้ไข" กับ "ตีกลับให้แก้ไข" ติดกันทั้งที่จบที่เดิม */
  assert.equal(canRejectQuotationSubmission(pending, { approver: true, userId: 'USR-PROPOSER' }), false);
  assert.equal(canWithdrawQuotationSubmission(pending, { userId: 'USR-PROPOSER' }), true);

  for (const approvalStatus of ['not_submitted', 'approved', 'not_required', 'rejected']) {
    assert.equal(canRejectQuotationSubmission({ ...pending, approvalStatus }, { approver: true }), false);
  }
  for (const status of ['accepted', 'closed', 'revised', 'cancelled']) {
    assert.equal(canRejectQuotationSubmission({ ...pending, status }, { approver: true }), false);
  }
});

test('rejection notice shows only while the document is waiting to be resubmitted', () => {
  const rejected = {
    status: 'draft',
    approvalStatus: 'not_submitted',
    rejectedByName: 'หัวหน้าทีม',
    rejectedAt: '2026-07-26T03:00:00+00:00',
    rejectionReason: 'ราคาบรรทัดที่ 3 ไม่ตรงกับที่ตกลงกับลูกค้า',
  };
  assert.deepEqual(quotationRejectionNotice(rejected), {
    reason: 'ราคาบรรทัดที่ 3 ไม่ตรงกับที่ตกลงกับลูกค้า',
    byName: 'หัวหน้าทีม',
    at: '2026-07-26T03:00:00+00:00',
  });

  // ยื่นใหม่/อนุมัติแล้ว = เรื่องจบ (trigger ล้างค่าให้ที่ DB ด้วย — นี่คือด่านสอง)
  for (const approvalStatus of ['pending', 'approved', 'not_required']) {
    assert.equal(quotationRejectionNotice({ ...rejected, approvalStatus }), null);
  }
  assert.equal(quotationRejectionNotice({ ...rejected, rejectionReason: '   ' }), null);
  assert.equal(quotationRejectionNotice(null), null);
  // ไม่มีชื่อผู้ตีกลับก็ยังต้องอ่านรู้เรื่อง
  assert.equal(quotationRejectionNotice({ ...rejected, rejectedByName: '' }).byName, 'ผู้อนุมัติ');
});
