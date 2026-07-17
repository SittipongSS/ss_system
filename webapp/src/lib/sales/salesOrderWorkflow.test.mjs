import test from 'node:test';
import assert from 'node:assert/strict';
import { SALES_ORDER_CANCEL_REASONS, canSalesOrderTransition, cancelReasonLabel, dealActualFromSalesOrders, isSalesOrderReviewer, isValidCancelReasonCode, salesOrderActual } from './salesOrderWorkflow.js';

test('Actual is counted only after SO approval', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'cancelled']) {
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
