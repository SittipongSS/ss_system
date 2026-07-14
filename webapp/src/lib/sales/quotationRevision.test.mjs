import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationRevisionContent } from './quotationRevision.js';

test('revision content uses edited values without mutating the source quotation', () => {
  const source = {
    validUntil: '2026-08-14',
    notes: 'old note',
    discountType: null,
    discountValue: 0,
    vatRate: 7,
    paymentTerms: 'old terms',
    paymentPlan: { type: 'full', paymentMethod: 'cash' },
    lines: [{ description: 'Old item', qty: 1, unitPrice: 100 }],
  };

  const result = buildQuotationRevisionContent(source, {
    validUntil: '2026-09-01',
    notes: 'new note',
    paymentTerms: 'new terms',
    paymentPlan: { type: 'full', paymentMethod: 'transfer' },
    lines: [{ description: 'New item', qty: 2, unitPrice: 250 }],
    vatRate: 7,
  });

  assert.equal(result.ok, true);
  assert.equal(result.lines[0].description, 'New item');
  assert.equal(result.totals.subtotal, 500);
  assert.equal(result.totals.totalAmount, 535);
  assert.equal(result.paymentPlan.paymentMethod, 'transfer');
  assert.equal(result.paymentTerms, 'new terms');
  assert.equal(result.validUntil, '2026-09-01');
  assert.equal(result.notes, 'new note');
  assert.equal(source.lines[0].description, 'Old item');
  assert.equal(source.notes, 'old note');
});

test('revision content rejects an invalid installment plan', () => {
  const result = buildQuotationRevisionContent({ lines: [] }, {
    paymentPlan: { type: 'installment', installments: [{ percent: 90 }] },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /อย่างน้อย 2 งวด/);
});
