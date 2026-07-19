import test from 'node:test';
import assert from 'node:assert/strict';
import {
  salesOrderApprovalContent,
  salesOrderApprovalFingerprint,
} from './salesOrderApprovalFingerprint.js';

const order = {
  orderNumber: 'SO-QT-26070001-0',
  quotationId: 'quote-1',
  dealId: 'deal-1',
  projectId: 'project-1',
  customerId: 'customer-1',
  customerName: 'บริษัท ทดสอบ จำกัด',
  orderDate: '2026-07-20',
  paymentDueDate: '2026-08-20',
  subtotal: 1000,
  discountAmount: 0,
  vatAmount: 70,
  totalAmount: 1070,
  actualAmount: 1000,
  notes: 'ส่งครบครั้งเดียว',
  lines: [
    { id: 'line-2', sortOrder: 2, productId: 'p2', description: 'สินค้า B', qty: 1, unitPrice: 500, lineTotal: 500 },
    { id: 'line-1', sortOrder: 1, productId: 'p1', description: 'สินค้า A', qty: 2, unitPrice: 250, lineTotal: 500 },
  ],
};

test('sales order approval fingerprint is stable across input line order', () => {
  const reversed = { ...order, lines: [...order.lines].reverse() };
  assert.equal(salesOrderApprovalFingerprint(order), salesOrderApprovalFingerprint(reversed));
  assert.deepEqual(salesOrderApprovalContent(order).lines.map((line) => line.productId), ['p1', 'p2']);
});

test('sales order approval fingerprint changes with approved commercial content', () => {
  assert.notEqual(
    salesOrderApprovalFingerprint(order),
    salesOrderApprovalFingerprint({ ...order, paymentDueDate: '2026-09-20' }),
  );
  assert.notEqual(
    salesOrderApprovalFingerprint(order),
    salesOrderApprovalFingerprint({ ...order, lines: [{ ...order.lines[0], qty: 2 }, order.lines[1]] }),
  );
});
