import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_QUOTATION_STATUSES,
  activeQuotationConflictMessage,
  isConcurrentQuotationCreate,
} from './quotationCreateGuard.js';

test('active quotation statuses cover drafts, sent documents, and accepted documents', () => {
  assert.deepEqual(ACTIVE_QUOTATION_STATUSES, ['draft', 'sent', 'accepted']);
});

test('concurrent quotation create identifies its database constraint only', () => {
  assert.equal(isConcurrentQuotationCreate({
    code: '23505',
    message: 'duplicate key value violates unique constraint "quotations_one_active_initial_per_deal_uidx"',
  }), true);
  assert.equal(isConcurrentQuotationCreate({
    code: '23505',
    message: 'duplicate key value violates unique constraint "quotations_quoteNumber_key"',
  }), false);
  assert.equal(isConcurrentQuotationCreate({ code: '500' }), false);
});

test('active quotation conflict message includes the existing document number', () => {
  assert.match(activeQuotationConflictMessage({ quoteNumber: 'QT-26070001-0' }), /QT-26070001-0/);
});
