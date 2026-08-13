import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALES_ORDER_CANCEL_REASONS,
  WON_REVERSAL_TARGETS,
  canEditSalesOrderContent,
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canSalesOrderTransition,
  canSubmitSalesOrder,
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
  salesOrderActionNeedsEditScope,
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
  assert.equal(canRevokeSalesOrderApproval({ status: 'approved' }, { reviewer: true }), true);
  assert.equal(canRevokeSalesOrderApproval({ status: 'approved' }, { reviewer: false }), false);
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

// mig 0166: ยกเลิกอนุมัติ กับ ออก Rev. เป็นสองขั้นแยกกัน โดยมีสถานะกลางที่แก้ไม่ได้คั่น
// เดิมเป็นปุ่มเดียว approved → revised ในคลิกเดียว
test('SO revision is two steps with a locked intermediate state between them', () => {
  const reviewer = { reviewer: true };

  // ขั้นที่ 1 ทำได้เฉพาะจาก approved
  assert.equal(canRevokeSalesOrderApproval({ status: 'approved' }, reviewer), true);
  assert.equal(canIssueSalesOrderRevision({ status: 'approved' }, reviewer), false);

  // ขั้นที่ 2 ทำได้เฉพาะจากสถานะกลาง
  assert.equal(canIssueSalesOrderRevision({ status: 'approval_revoked' }, reviewer), true);
  assert.equal(canRevokeSalesOrderApproval({ status: 'approval_revoked' }, reviewer), false);

  // ทั้งสองขั้นเป็นของผู้รีวิวเท่านั้น
  assert.equal(canRevokeSalesOrderApproval({ status: 'approved' }, { reviewer: false }), false);
  assert.equal(canIssueSalesOrderRevision({ status: 'approval_revoked' }, { reviewer: false }), false);

  // สถานะอื่นเข้าทั้งสองขั้นไม่ได้
  for (const status of ['draft', 'pending_approval', 'rejected', 'revised', 'cancelled']) {
    assert.equal(canRevokeSalesOrderApproval({ status }, reviewer), false);
    assert.equal(canIssueSalesOrderRevision({ status }, reviewer), false);
  }
});

// ⚠️ หัวใจของมติ: สถานะกลาง **ห้ามแก้เนื้อหาได้** ไม่งั้นกลายเป็นช่องแก้ทับใบที่เคยอนุมัติ
test('the revoked state is read-only and out of Actual', () => {
  const revoked = { status: 'approval_revoked', actualAmount: 5000 };
  assert.equal(canEditSalesOrderContent(revoked, { canEdit: true, inScope: true }), false);
  assert.equal(salesOrderActual(revoked), 0);
  assert.equal(canHardDeleteSalesOrder(revoked), false);
  assert.equal(canWithdrawSalesOrderSubmission(revoked, { userId: 'USR-PROPOSER' }), false);

  assert.equal(canSalesOrderTransition('approved', 'revoke', { reviewer: true }), true);
  assert.equal(canSalesOrderTransition('approval_revoked', 'revise', { reviewer: true }), true);
  assert.equal(canSalesOrderTransition('approval_revoked', 'save'), false);
  assert.equal(canSalesOrderTransition('approval_revoked', 'submit'), false);
  // ยกเลิก SO ยังทำได้ — กันเอกสารค้างในสถานะกลางถ้าเปลี่ยนใจไม่ออก Rev.
  assert.equal(canSalesOrderTransition('approval_revoked', 'cancel'), true);
});

// การยื่น SO = การลงนามช่อง "ฝ่ายขาย" ซึ่งเป็นของ AE เจ้าของดีล — AC สร้างใบแทนได้
// แต่ต้องส่งให้เจ้าของดีลกดยื่น (มติผู้ใช้ 2026-08-05)
test('canSubmitSalesOrder: ยื่นได้เฉพาะ AE เจ้าของดีล (และ superuser)', () => {
  const deal = { id: 'DL-1', ownerId: 'u-ae-owner' };
  assert.equal(canSubmitSalesOrder({ id: 'u-ae-owner', role: 'ae' }, deal), true);
  // AC ที่ช่วยสร้างใบให้ ยื่นเองไม่ได้ — ต้องส่งกลับให้เจ้าของดีล
  assert.equal(canSubmitSalesOrder({ id: 'u-ac', role: 'ac' }, deal), false);
  // AE คนอื่นในทีมเดียวกันก็ยื่นแทนไม่ได้
  assert.equal(canSubmitSalesOrder({ id: 'u-ae-other', role: 'ae' }, deal), false);
  assert.equal(canSubmitSalesOrder({ id: 'u-admin', role: 'admin' }, deal), true);
  // ดีลไม่มีเจ้าของ / ไม่มีดีล = ยื่นไม่ได้ (ไม่มีใครรับผิดชอบช่องลงนาม)
  assert.equal(canSubmitSalesOrder({ id: 'u-ae-owner', role: 'ae' }, { id: 'DL-2' }), false);
  assert.equal(canSubmitSalesOrder({ id: 'u-ae-owner', role: 'ae' }, null), false);
  assert.equal(canSubmitSalesOrder(null, deal), false);
});

// ── "รอฉันลงมือ" — ชุดเดียวกับที่ป้ายตัวเลขบนเมนูใช้นับ ──────────────────
test('⭐ เลนผู้รีวิว: ใบที่ยื่นมาแล้วรออนุมัติต้องนับ (ม-119)', async () => {
  const { isSalesOrderWaitingOnMe } = await import('./salesOrderWorkflow.js');
  const pending = { status: 'pending_approval', createdBy: 'USR-MAKER' };
  // ผู้รีวิว = role ระดับหัวหน้า ไม่ใช่เจ้าของดีล ⇒ ตัดสินด้วยธง reviewer ไม่ใช่ userId
  assert.equal(isSalesOrderWaitingOnMe(pending, { userId: 'USR-BOSS', reviewer: true }), true);
  assert.equal(isSalesOrderWaitingOnMe(pending, { userId: 'USR-BOSS', reviewer: false }), false,
    'คนที่ไม่ใช่ผู้รีวิวไม่มีอะไรให้ทำกับใบที่รออนุมัติ');
  // ใบที่ตัวเองยื่นแล้วตัวเองอนุมัติได้ก็ยังนับ — ระบบเปิดให้จริง
  assert.equal(isSalesOrderWaitingOnMe(pending, { userId: 'USR-MAKER', reviewer: true }), true);
  // ผู้รีวิวไม่ได้ถูกทวงใบที่อนุมัติไปแล้ว
  assert.equal(isSalesOrderWaitingOnMe({ status: 'approved' }, { reviewer: true }), false);
  // ใบตีกลับของคนอื่น ผู้รีวิวก็ไม่ต้องแก้ให้
  assert.equal(isSalesOrderWaitingOnMe({ status: 'rejected', createdBy: 'USR-X' },
    { userId: 'USR-BOSS', reviewer: true }), false);
});

test('⭐ ใบสั่งขายที่ถูกตีกลับมาให้ฉันแก้ต้องนับ — ร่างของตัวเองไม่นับ', async () => {
  const { isSalesOrderWaitingOnMe } = await import('./salesOrderWorkflow.js');
  const me = 'USR-MAKER';
  assert.equal(isSalesOrderWaitingOnMe({ status: 'rejected', createdBy: me }, { userId: me }), true);
  // ร่างที่ยังไม่เคยยื่น = ไม่มีใครรออยู่ปลายทาง (กติกาเดียวกับใบร่างคำร้อง ม-112)
  assert.equal(isSalesOrderWaitingOnMe({ status: 'draft', createdBy: me }, { userId: me }), false);
  // ใบตีกลับของคนอื่นไม่ใช่ของค้างของเรา
  assert.equal(isSalesOrderWaitingOnMe({ status: 'rejected', createdBy: 'USR-OTHER' }, { userId: me }), false);
  assert.equal(isSalesOrderWaitingOnMe(null, { userId: me }), false);
});

// ── สิทธิ์ที่ต้องมีต่อคำสั่ง (บั๊กจริง 2026-08-13) ────────────────────────
/* 🔴 ด่านบนสุดของ PATCH เคยบังคับ `salesplan:edit` กับทุกคำสั่งที่ไม่ใช่ `withdraw`
   ⇒ **ฝ่ายบัญชีโดน 403 ก่อนถึงสาขา action ทุกครั้ง** ปุ่มขึ้นบนจอปกติแต่กดแล้วไม่สำเร็จ
   ที่คอนเฟิร์มงวดรอดเพราะอยู่คนละ route ซึ่งกั้นด้วยสิทธิ์อ่านเท่านั้น
   ⇒ อาการ "ปุ่มหนึ่งได้ อีกปุ่มไม่ได้" · ผู้ใช้แจ้งเข้ามาเองหลังมีบัญชีฝ่าย FN คนแรก */
test('ขั้นบัญชีใช้แค่สิทธิ์อ่านใบ ไม่ต้องมีสิทธิ์แก้งานขาย', () => {
  for (const action of ['finance_approve', 'finance_reject', 'finance_resubmit']) {
    assert.equal(salesOrderActionNeedsEditScope(action), false, action);
  }
  // ดึงกลับ = การถอยของผู้ยื่นเอง ใช้สิทธิ์อ่านเหมือนกัน (มติ 2026-07-26)
  assert.equal(salesOrderActionNeedsEditScope('withdraw'), false);
});

test('คำสั่งที่เปลี่ยนเนื้อหาใบหรือเดินสายอนุมัติ ยังต้องมีสิทธิ์แก้ตามเดิม', () => {
  for (const action of ['save', 'submit', 'approve', 'reject', 'revoke', 'revise', 'cancel', 'restore']) {
    assert.equal(salesOrderActionNeedsEditScope(action), true, action);
  }
  // คำสั่งที่ไม่รู้จักต้อง **เข้มไว้ก่อน** ไม่ใช่ปล่อยผ่าน
  assert.equal(salesOrderActionNeedsEditScope('อะไรก็ไม่รู้'), true);
  assert.equal(salesOrderActionNeedsEditScope(''), true);
  assert.equal(salesOrderActionNeedsEditScope(undefined), true);
  // ⚠️ ชื่อที่ขึ้นต้นคล้ายกันแต่ไม่ใช่ขั้นบัญชี ต้องไม่หลุดตาม
  assert.equal(salesOrderActionNeedsEditScope('finance'), true);
});
