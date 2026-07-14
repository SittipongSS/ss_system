import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationWonAmount } from './quotationWonAmount.js';

test('Won amount excludes quotation VAT', () => {
  assert.equal(quotationWonAmount({ totalAmount: 107000, vatAmount: 7000 }), 100000);
});

test('Won amount remains the total when quotation has no added VAT', () => {
  assert.equal(quotationWonAmount({ totalAmount: 95000, vatAmount: 0 }), 95000);
});
