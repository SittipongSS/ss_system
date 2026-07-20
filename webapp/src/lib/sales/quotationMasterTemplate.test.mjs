import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUOTATION_MASTER_TEMPLATE_VERSION,
  QUOTATION_PREVIEW_SCENARIOS,
  allocateInstallmentAmounts,
  buildQuotationMasterPreview,
  controlledFormLine,
  paginateQuotationMasterLines,
} from './quotationMasterTemplate.js';

test('controlled form line preserves the exact ISO punctuation and spacing', () => {
  assert.equal(controlledFormLine(), 'FM-SA-01: Rev. No.00. 08/05/2568');
});

test('every preview scenario builds a stable isolated master model', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved');
    assert.equal(model.templateVersion, QUOTATION_MASTER_TEMPLATE_VERSION);
    assert.ok(model.lines.length > 0, scenario.id);
    assert.ok(model.pages.length > 0, scenario.id);
    assert.equal(model.pages.flat().length, model.lines.length, scenario.id);
    assert.equal(model.formLine, 'FM-SA-01: Rev. No.00. 08/05/2568');
  }
});

test('installment allocation rounds to the document total without drift', () => {
  const rows = allocateInstallmentAmounts(107, [
    { percent: 33.33 },
    { percent: 33.33 },
    { percent: 33.34 },
  ]);
  assert.deepEqual(rows.map((row) => row.amount), [35.66, 35.66, 35.68]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 107);
});

test('four-installment scenario totals 100 percent and the grand total', () => {
  const model = buildQuotationMasterPreview('installments', 'approved');
  assert.equal(model.installments.reduce((sum, row) => sum + row.percent, 0), 100);
  assert.equal(model.installments.reduce((sum, row) => sum + row.amount, 0), model.totals.totalAmount);
});

test('pagination preserves order and does not mutate source lines', () => {
  const lines = Array.from({ length: 24 }, (_, index) => ({
    id: `L-${index}`,
    description: `รายการ ${index} ${'รายละเอียด'.repeat(index % 3)}`,
  }));
  const before = structuredClone(lines);
  const pages = paginateQuotationMasterLines(lines, 3);
  assert.deepEqual(lines, before);
  assert.deepEqual(pages.flat().map((line) => line.id), lines.map((line) => line.id));
  assert.ok(pages.length > 1);
});

test('summary-heavy short quotations move final content to a continuation page', () => {
  const standard = buildQuotationMasterPreview('standard', 'approved');
  const installments = buildQuotationMasterPreview('installments', 'approved');
  const compact = buildQuotationMasterPreview('compact', 'approved');
  assert.ok(standard.pages.length > 1, 'standard must not grow page 1 beyond A4');
  assert.ok(installments.pages.length > 1, 'four installments need a continuation page');
  assert.equal(compact.pages.length, 1, 'a genuinely compact quotation still fits one page');
});

test('print stylesheet locks explicit sheets to A4 with legacy page-break fallback', () => {
  const css = readFileSync(
    new URL('../../components/documents/QuotationMasterDocument.module.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /@media print[\s\S]*height: 297mm/);
  assert.match(css, /page-break-after: always/);
  assert.match(css, /\.sheet:last-child \{ break-after: auto; page-break-after: auto; \}/);
});

test('document states map to watermark and signature evidence variants', () => {
  const draft = buildQuotationMasterPreview('compact', 'draft');
  const approved = buildQuotationMasterPreview('compact', 'approved');
  const cancelled = buildQuotationMasterPreview('compact', 'cancelled');
  assert.equal(draft.watermark, 'ฉบับร่าง');
  assert.equal(draft.signature, null);
  assert.equal(approved.watermark, '');
  assert.ok(approved.signature?.evidenceId);
  assert.equal(cancelled.watermark, 'ยกเลิก');
  assert.equal(cancelled.signature, null);
});
