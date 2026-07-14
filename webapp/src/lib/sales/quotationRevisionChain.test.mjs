import test from 'node:test';
import assert from 'node:assert/strict';
import { latestQuotationRevisions } from './quotationRevisionChain.js';

test('keeps only the highest revision from each quotation chain', () => {
  const rows = [
    { id: 'a0', baseNumber: 'QT-001', quoteNumber: 'QT-001', revisionNo: 0, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b0', baseNumber: 'QT-002', quoteNumber: 'QT-002', revisionNo: 0, createdAt: '2026-01-02T00:00:00Z' },
    { id: 'a2', baseNumber: 'QT-001', quoteNumber: 'QT-001-2', revisionNo: 2, createdAt: '2026-01-03T00:00:00Z' },
    { id: 'a1', baseNumber: 'QT-001', quoteNumber: 'QT-001-1', revisionNo: 1, createdAt: '2026-01-04T00:00:00Z' },
  ];

  assert.deepEqual(latestQuotationRevisions(rows).map((row) => row.id), ['a2', 'b0']);
});

test('treats legacy quotations without baseNumber as separate chains', () => {
  const rows = [
    { id: 'legacy-a', quoteNumber: 'OLD-001', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'legacy-b', quoteNumber: 'OLD-002', createdAt: '2026-01-02T00:00:00Z' },
  ];

  assert.deepEqual(latestQuotationRevisions(rows).map((row) => row.id), ['legacy-b', 'legacy-a']);
});
