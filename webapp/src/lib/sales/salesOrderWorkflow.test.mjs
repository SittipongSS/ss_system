import test from 'node:test';
import assert from 'node:assert/strict';
import { canSalesOrderTransition, dealActualFromSalesOrders, isSalesOrderReviewer, salesOrderActual } from './salesOrderWorkflow.js';

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
