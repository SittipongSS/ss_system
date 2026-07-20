import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_QUOTATION_MASTER_VARIANT,
  QUOTATION_MASTER_TEMPLATE_VERSION,
  QUOTATION_MASTER_TEMPLATE_VERSIONS,
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
    assert.equal(model.templateVariant, DEFAULT_QUOTATION_MASTER_VARIANT);
    assert.ok(model.lines.length > 0, scenario.id);
    assert.ok(model.pages.length > 0, scenario.id);
    assert.equal(model.pages.flatMap((page) => page.lines).length, model.lines.length, scenario.id);
    assert.deepEqual(
      model.pages.flatMap((page) => page.lines).map((line) => line.id),
      model.lines.map((line) => line.id),
      scenario.id,
    );
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
  const pages = paginateQuotationMasterLines(lines, { totalsReserve: 3 });
  assert.deepEqual(lines, before);
  assert.deepEqual(pages.flat().map((line) => line.id), lines.map((line) => line.id));
  assert.ok(pages.length > 1);
});

test('preview exposes stable V1, V2 and V3 template identities', () => {
  for (const variant of QUOTATION_MASTER_TEMPLATE_VERSIONS) {
    const model = buildQuotationMasterPreview('compact', 'approved', variant.id);
    assert.equal(model.templateVariant, variant.id);
    assert.equal(model.templateVersion, variant.templateVersion);
  }
});

test('semantic pagination separates commercial value from payment details', () => {
  const standard = buildQuotationMasterPreview('standard', 'approved');
  const installments = buildQuotationMasterPreview('installments', 'approved');
  const compact = buildQuotationMasterPreview('compact', 'approved');
  assert.deepEqual(standard.pages.map((page) => page.kind), ['items', 'payment']);
  assert.deepEqual(standard.linePages.map((page) => page.length), [4]);
  assert.equal(standard.pages[0].showTotals, true);
  assert.equal(standard.pages[1].lines.length, 0);
  assert.equal(standard.pages[1].showPayment, true);
  assert.deepEqual(installments.pages.map((page) => page.kind), ['items', 'payment']);
  assert.deepEqual(installments.linePages.map((page) => page.length), [5]);
  assert.equal(compact.pages.length, 1, 'a genuinely compact quotation still fits one page');
  assert.equal(compact.pages[0].kind, 'combined');
  assert.equal(compact.pages[0].showPayment, true);
  assert.equal(compact.pages[0].showSignatures, true);
});

test('every scenario keeps totals with the final item page and payment after all items', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved');
    const itemPages = model.pages.filter((page) => page.lines.length > 0);
    const totalsPages = model.pages.filter((page) => page.showTotals);
    const paymentPageIndex = model.pages.findIndex((page) => page.showPayment);
    assert.ok(itemPages.every((page) => page.lines.length > 0), `${scenario.id} item pages must not be empty`);
    assert.equal(totalsPages.length, 1, `${scenario.id} must render totals once`);
    assert.equal(totalsPages[0], itemPages.at(-1), `${scenario.id} totals must close the final item page`);
    assert.ok(paymentPageIndex >= 0, `${scenario.id} must render payment details`);
    assert.ok(
      paymentPageIndex >= model.pages.indexOf(itemPages.at(-1)),
      `${scenario.id} payment details must follow all items`,
    );
  }
});

test('fixture page distributions stay balanced by semantic section', () => {
  const expected = {
    compact: [['combined', 1]],
    standard: [['items', 4], ['payment', 0]],
    dense: [['items', 6], ['items', 5], ['payment', 0]],
    multipage: [['items', 11], ['items', 10], ['items', 6], ['payment', 0]],
    'long-content': [['items', 3], ['items', 3], ['payment', 0]],
    installments: [['items', 5], ['payment', 0]],
  };

  for (const [scenarioId, distribution] of Object.entries(expected)) {
    const model = buildQuotationMasterPreview(scenarioId, 'approved');
    assert.deepEqual(model.pages.map((page) => [page.kind, page.lines.length]), distribution);
  }
});

test('print stylesheet locks explicit sheets to A4 with legacy page-break fallback', () => {
  const css = readFileSync(
    new URL('../../components/documents/QuotationMasterDocument.module.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /@media print[\s\S]*height: 297mm/);
  assert.match(css, /page-break-after: always/);
  assert.match(css, /\.sheet:last-child \{ break-after: auto; page-break-after: auto; \}/);
  assert.match(css, /\.sheetContent \{[\s\S]*display: flex;[\s\S]*padding-bottom: 4mm;/);
  assert.match(css, /\.signatures \{[^}]*margin-top: auto;[^}]*padding-top: 3mm;/);
});

test('V1, V2 and V3 preserve their approved accent hierarchy', () => {
  const css = readFileSync(
    new URL('../../components/documents/QuotationMasterDocument.module.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.identityBlock h1 \{[^}]*color: var\(--doc-accent\)/);
  assert.match(css, /\.grandTotal \{[^}]*background: var\(--doc-paper\)/);
  assert.match(css, /\.installmentTable th \{[^}]*background: var\(--doc-neutral-soft\)/);
  assert.match(css, /\.watermark \{[\s\S]*color: var\(--doc-watermark\)/);
  assert.match(css, /\.v1 \.grandTotal \{[^}]*background: var\(--doc-accent\)/);
  assert.match(css, /\.v3 \.installmentTable th \{[^}]*background: var\(--doc-accent-soft\)/);
  assert.match(css, /\.v3 \.watermark \{[^}]*color: var\(--doc-accent-watermark\)/);
  assert.doesNotMatch(css, /\.v3 \.itemCode/);
  assert.doesNotMatch(css, /\.v3 \.termsGrid/);
});

test('every preview variant omits the controlled-document footer wording', () => {
  const component = readFileSync(
    new URL('../../components/documents/QuotationMasterDocument.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(component, /เอกสารควบคุม/);
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
