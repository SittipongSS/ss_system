import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALES_ORDER_CANCEL_REASONS,
  WON_REVERSAL_TARGETS,
  canEditSalesOrderContent,
  canHardDeleteSalesOrder,
  canRevokeAndReviseSalesOrder,
  canSalesOrderTransition,
  canWithdrawSalesOrderSubmission,
  cancelReasonLabel,
  dealActualFromSalesOrders,
  isCustomerCancelReason,
  isForeignKeyViolation,
  isSalesOrderReviewer,
  isSalesOrderSubmitter,
  isValidCancelReasonCode,
  isValidReversalTarget,
  salesOrderActual,
  salesOrderRevisionChainDeleteBlock,
} from './salesOrderWorkflow.js';

test('Actual is counted only after SO approval', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'revised', 'cancelled']) {
    assert.equal(salesOrderActual({ status, actualAmount: 1250 }), 0);
  }
  assert.equal(salesOrderActual({ status: 'approved', actualAmount: 1250 }), 1250);
});

test('sales user submits drafts and rejected SO, reviewer approves pending SO', () => {
  assert.equal(canSalesOrderTransition('draft', 'submit'), true);
  assert.equal(canSalesOrderTransition('rejected', 'submit'), true);
  assert.equal(canSalesOrderTransition('pending_approval', 'approve'), false);
  assert.equal(canSalesOrderTransition('pending_approval', 'approve', { reviewer: true }), true);
  assert.equal(canSalesOrderTransition('approved', 'submit'), false);
});

test('only AE Supervisor and admin are SO reviewers', () => {
  assert.equal(isSalesOrderReviewer('ae_supervisor'), true);
  assert.equal(isSalesOrderReviewer('admin'), true);
  assert.equal(isSalesOrderReviewer('senior_ae'), false);
  assert.equal(isSalesOrderReviewer('ae'), false);
});

test('pending SO withdrawal belongs to the proposer alone — reviewers use rejection', () => {
  const order = { status: 'pending_approval', submittedBy: 'USR-PROPOSER' };
  assert.equal(isSalesOrderSubmitter(order, 'USR-PROPOSER'), true);
  assert.equal(isSalesOrderSubmitter(order, 'USR-OTHER'), false);
  assert.equal(canWithdrawSalesOrderSubmission(order, { userId: 'USR-PROPOSER' }), true);
  // ผู้รีวิวดึงกลับไม่ได้แล้ว (มติ 2026-07-26) — ใช้ "ตีกลับ" ที่เก็บเหตุผลและแจ้งทีมขาย
  assert.equal(canWithdrawSalesOrderSubmission(order, { userId: 'USR-REVIEWER', reviewer: true }), false);
  assert.equal(canWithdrawSalesOrderSubmission(order, { userId: 'USR-OTHER' }), false);
  assert.equal(
    canWithdrawSalesOrderSubmission({ ...order, status: 'approved' }, { userId: 'USR-PROPOSER' }),
    false,
  );
});

test('SO direct editing stops after submission and approved changes require reviewer revision', () => {
  const access = { canEdit: true, inScope: true };
  assert.equal(canEditSalesOrderContent({ status: 'draft' }, access), true);
  assert.equal(canEditSalesOrderContent({ status: 'rejected' }, access), true);
  assert.equal(canEditSalesOrderContent({ status: 'pending_approval' }, access), false);
  assert.equal(canEditSalesOrderContent({ status: 'approved' }, access), false);
  assert.equal(canRevokeAndReviseSalesOrder({ status: 'approved' }, { reviewer: true }), true);
  assert.equal(canRevokeAndReviseSalesOrder({ status: 'approved' }, { reviewer: false }), false);
});

test('hard delete is limited to unsigned drafts that never entered approval', () => {
  assert.equal(canHardDeleteSalesOrder({ status: 'draft' }), true);
  assert.equal(canHardDeleteSalesOrder({ status: 'draft', signatureEvidenceId: 'DSE-1' }), false);
  assert.equal(canHardDeleteSalesOrder({ status: 'draft', hasSignatureEvidence: true }), false);
  for (const status of ['pending_approval', 'approved', 'rejected', 'revised', 'cancelled']) {
    assert.equal(canHardDeleteSalesOrder({ status }), false);
  }
});

test('deal Actual is accepted only from the approved SO cache', () => {
  assert.equal(dealActualFromSalesOrders({ wonValue: 1380, metadata: {} }), 0);
  assert.equal(dealActualFromSalesOrders({ wonValue: 1380, metadata: { actualSource: 'manual' } }), 0);
  assert.equal(dealActualFromSalesOrders({ wonValue: 1380, metadata: { actualSource: 'sale_order' } }), 1380);
  assert.equal(dealActualFromSalesOrders({ wonValue: -5, metadata: { actualSource: 'sale_order' } }), 0);
});

test('SO cancel reason codes validate + label, grouped by customer/document/data', () => {
  assert.equal(isValidCancelReasonCode('customer_cancelled'), true);
  assert.equal(isValidCancelReasonCode('reissue_correction'), true);
  assert.equal(isValidCancelReasonCode('other'), true);
  assert.equal(isValidCancelReasonCode('bogus'), false);
  assert.equal(isValidCancelReasonCode(''), false);
  assert.equal(isValidCancelReasonCode(undefined), false);
  assert.equal(cancelReasonLabel('customer_no_payment'), 'ลูกค้าไม่ชำระ / ผิดเงื่อนไข');
  // ครบ 3 กลุ่มตามมติ (ฝั่งลูกค้า / แก้เอกสาร / ข้อมูลพลาด)
  const groups = new Set(SALES_ORDER_CANCEL_REASONS.map((r) => r.group));
  assert.deepEqual([...groups].sort(), ['customer', 'data', 'document']);
  // ทุก code ที่อยู่ใน migration CHECK ต้องมีใน list (กันหลุด)
  assert.equal(SALES_ORDER_CANCEL_REASONS.length, 7);
});

test('Won reversal: customer-group reasons flag deal reversal; targets validate', () => {
  // เฉพาะกลุ่มลูกค้าเท่านั้นที่เสนอย้อน Won
  assert.equal(isCustomerCancelReason('customer_cancelled'), true);
  assert.equal(isCustomerCancelReason('customer_no_payment'), true);
  assert.equal(isCustomerCancelReason('switched_option'), true);
  assert.equal(isCustomerCancelReason('wrong_document'), false);
  assert.equal(isCustomerCancelReason('reissue_correction'), false);
  assert.equal(isCustomerCancelReason('duplicate_test'), false);
  assert.equal(isCustomerCancelReason('other'), false);
  // ปลายทางย้อน
  assert.equal(isValidReversalTarget('reopen'), true);
  assert.equal(isValidReversalTarget('lost'), true);
  assert.equal(isValidReversalTarget('won'), false);
  assert.equal(isValidReversalTarget(''), false);
  assert.deepEqual(WON_REVERSAL_TARGETS, ['reopen', 'lost']);
});

// A4 (2026-07-26): FK ของ revision chain เป็น ON DELETE RESTRICT — เดิมลบแล้วได้ error
// Postgres ดิบออกหน้าเว็บ ตอนนี้ต้องเป็นข้อความที่บอกว่าต้องทำอะไรต่อ
test('deleting a Sale Order inside a revision chain is blocked with guidance, not a raw FK error', () => {
  const history = [
    { id: 'SO-B', orderNumber: 'SO-26070001-1' },
    { id: 'SO-A', orderNumber: 'SO-26070001-0' },
  ];

  // ใบต้นทางที่ถูกแทนที่แล้ว — ฉบับ Revision ชี้กลับมาด้วย revisedFromId
  const source = { id: 'SO-A', supersededById: 'SO-B', revisionHistory: history };
  const sourceBlock = salesOrderRevisionChainDeleteBlock(source);
  assert.match(sourceBlock, /SO-26070001-1/);
  assert.match(sourceBlock, /ลบถาวรไม่ได้/);

  // ฉบับ Revision — ใบต้นทางยังชี้มาด้วย supersededById
  const revision = { id: 'SO-B', revisedFromId: 'SO-A', revisionHistory: history };
  const revisionBlock = salesOrderRevisionChainDeleteBlock(revision);
  assert.match(revisionBlock, /SO-26070001-0/);
  assert.match(revisionBlock, /ยกเลิก SO/);

  // ไม่มี chain = ลบได้ตามกติกาเดิม (canHardDeleteSalesOrder เป็นผู้ตัดสินต่อ)
  assert.equal(salesOrderRevisionChainDeleteBlock({ id: 'SO-C', revisionHistory: [] }), null);
  assert.equal(salesOrderRevisionChainDeleteBlock(null), null);

  // ไม่มี revisionHistory ก็ยังบล็อกได้ แค่โชว์ id แทนเลขที่
  assert.match(salesOrderRevisionChainDeleteBlock({ id: 'SO-A', supersededById: 'SO-B' }), /SO-B/);
});

test('foreign key violations are recognised from either the code or the message', () => {
  assert.equal(isForeignKeyViolation({ code: '23503' }), true);
  assert.equal(isForeignKeyViolation({ message: 'violates foreign key constraint "x_fkey"' }), true);
  assert.equal(isForeignKeyViolation({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isForeignKeyViolation(null), false);
});
