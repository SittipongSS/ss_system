import test from 'node:test';
import assert from 'node:assert/strict';

import { businessDate, businessMonthKey } from './businessDate.js';
import { documentApprovalFingerprint } from './documentApproval.js';
import { validateDocumentReadiness } from './documentWorkflow.js';
import { quotationApprovalFingerprint } from './sales/quotationApprovalFingerprint.js';

test('business date and quote month use Asia/Bangkok at the UTC boundary', () => {
  const instant = new Date('2026-07-31T17:30:00.000Z');
  assert.equal(businessDate(instant), '2026-08-01');
  assert.equal(businessMonthKey(instant), '2608');
});

test('central approval fingerprint is stable across object key order', () => {
  assert.equal(
    documentApprovalFingerprint({ amount: 100, customer: { id: 'C1', name: 'A' } }),
    documentApprovalFingerprint({ customer: { name: 'A', id: 'C1' }, amount: 100 }),
  );
});

test('quotation fingerprint changes when commercial terms change', () => {
  const quote = {
    subtotal: 100,
    totalAmount: 107,
    vatRate: 7,
    vatAmount: 7,
    paymentTerms: '30 days',
    lines: [{ sortOrder: 0, description: 'A', qty: 1, unitPrice: 100, lineTotal: 100 }],
  };
  assert.notEqual(
    quotationApprovalFingerprint(quote),
    quotationApprovalFingerprint({ ...quote, paymentTerms: 'cash' }),
  );
});

test('approved document is blocked when its fingerprint is stale', () => {
  const result = validateDocumentReadiness({
    action: 'accept',
    status: 'sent',
    lineCount: 1,
    totalAmount: 100,
    approvalStatus: 'approved',
    approvalFingerprint: 'sha256:old',
    currentFingerprint: 'sha256:new',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /changed after approval/);
});

test('send rejects an empty or zero-total document', () => {
  assert.equal(validateDocumentReadiness({ action: 'send', lineCount: 0, totalAmount: 100 }).ok, false);
  assert.equal(validateDocumentReadiness({ action: 'send', lineCount: 1, totalAmount: 0 }).ok, false);
});
