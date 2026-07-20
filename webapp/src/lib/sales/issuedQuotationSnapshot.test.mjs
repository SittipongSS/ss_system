import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssuedQuotationPayload,
  buildIssuedQuotationArtifactHtml,
  issuedContentFingerprint,
  artifactSha256,
  ISSUED_QUOTATION_LAYOUT_VERSION,
} from './issuedQuotationSnapshot.js';

const baseQuote = {
  id: 'QT-1',
  quoteNumber: 'QT-2026-0001',
  quoteDate: '2026-07-20',
  validUntil: '2026-08-20',
  revisionNo: 0,
  customerName: 'ลูกค้า ก',
  branchCode: null,
  billingAddress: '123 ถนนทดสอบ',
  shippingAddress: '123 ถนนทดสอบ',
  contactName: 'คุณเอ',
  contactPhone: '0800000000',
  subtotal: 1000,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  vatRate: 7,
  vatAmount: 70,
  totalAmount: 1070,
  paymentPlan: { type: 'full', paymentMethod: 'โอน' },
  paymentTerms: 'เครดิต 30 วัน',
  notes: 'หมายเหตุ',
  approvedByName: 'เจ้าของดีล',
  approvedAt: '2026-07-20T03:00:00.000Z',
  createdByName: 'ผู้สร้าง',
  approvalStatus: 'pending',
  deal: { title: 'ดีลทดสอบ', ownerName: 'เจ้าของดีล' },
  lines: [
    { id: 'L1', sortOrder: 1, fgCode: 'FG-1', description: 'สินค้า A', qty: 2, unitPrice: 500, lineTotal: 1000 },
  ],
};

const evidence = {
  id: 'DSE-1',
  documentStandardVersionId: 'DSV-1',
  controlledFormSnapshot: { versionId: 'DSV-1', formCode: 'FM-SA-01', revision: '00', versionNumber: 1 },
};

test('payload pins commercial content, customer, company and standard', () => {
  const payload = buildIssuedQuotationPayload(baseQuote, evidence);
  assert.equal(payload.document.quoteNumber, 'QT-2026-0001');
  assert.equal(payload.content.totalAmount, 1070);
  assert.equal(payload.customer.customerName, 'ลูกค้า ก');
  assert.equal(payload.standard.formCode, 'FM-SA-01');
  assert.ok(payload.company.legalName, 'company snapshot is captured');
});

test('content fingerprint is deterministic and content-sensitive', () => {
  const a = issuedContentFingerprint(buildIssuedQuotationPayload(baseQuote, evidence));
  const b = issuedContentFingerprint(buildIssuedQuotationPayload(baseQuote, evidence));
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);

  const changed = { ...baseQuote, totalAmount: 2000, subtotal: 1900 };
  const c = issuedContentFingerprint(buildIssuedQuotationPayload(changed, evidence));
  assert.notEqual(a, c);
});

test('artifact renders approved HTML without draft watermark', () => {
  const html = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.match(html, /^<!doctype html>/);
  assert.ok(!html.includes('>ฉบับร่าง<'), 'approved artifact carries no draft watermark');
  assert.match(artifactSha256(html), /^sha256:[0-9a-f]{64}$/);
});

test('artifact sha256 is stable for identical HTML', () => {
  const html = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.equal(artifactSha256(html), artifactSha256(html));
});

test('layout version is tagged for regeneration tracking', () => {
  assert.equal(ISSUED_QUOTATION_LAYOUT_VERSION, 'quote-html-v1');
});
