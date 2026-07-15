import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWonEvidence, sanitizeWonAttachments, isPaymentDocType, MAX_WON_ATTACHMENTS,
  DEFAULT_WON_EVIDENCE_BUCKET,
} from './quotationWonEvidence.js';

const file = { fileUrl: 'https://drive.example/f1', driveFileId: 'd1', fileName: 'slip.pdf', mimeType: 'application/pdf', sizeBytes: 1024 };

test('payment slip: file + doc date is enough (no due date required)', () => {
  const r = validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15', attachments: [file] });
  assert.equal(r.ok, true);
  assert.equal(r.evidence.paymentDueDate, null);
  assert.equal(r.evidence.attachments.length, 1);
});

test('non-payment doc (po/order_confirmation) requires paymentDueDate', () => {
  for (const docType of ['po', 'order_confirmation']) {
    const missing = validateWonEvidence({ docType, docDate: '2026-07-15', attachments: [file] });
    assert.equal(missing.ok, false, `${docType} without due date must fail`);
    const withDue = validateWonEvidence({ docType, docDate: '2026-07-15', paymentDueDate: '2026-08-15', attachments: [file] });
    assert.equal(withDue.ok, true);
    assert.equal(withDue.evidence.paymentDueDate, '2026-08-15');
  }
});

test('attachments are mandatory', () => {
  assert.equal(validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15', attachments: [] }).ok, false);
  assert.equal(validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15' }).ok, false);
  // ref ไม่มี fileUrl = ไม่นับเป็นไฟล์
  assert.equal(validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15', attachments: [{ fileName: 'x' }] }).ok, false);
});

test('doc date and doc type are mandatory + validated', () => {
  assert.equal(validateWonEvidence({ docType: 'payment_slip', attachments: [file] }).ok, false);
  assert.equal(validateWonEvidence({ docType: 'payment_slip', docDate: 'ไม่ใช่วันที่', attachments: [file] }).ok, false);
  assert.equal(validateWonEvidence({ docType: 'invoice', docDate: '2026-07-15', attachments: [file] }).ok, false);
});

test('optional due date on payment slip is kept when valid, rejected when malformed', () => {
  const kept = validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15', paymentDueDate: '2026-07-30', attachments: [file] });
  assert.equal(kept.ok, true);
  assert.equal(kept.evidence.paymentDueDate, '2026-07-30');
  const bad = validateWonEvidence({ docType: 'payment_slip', docDate: '2026-07-15', paymentDueDate: '30/07/2026', attachments: [file] });
  assert.equal(bad.ok, false);
});

test('sanitizeWonAttachments strips unknown fields and caps the list', () => {
  const dirty = Array.from({ length: MAX_WON_ATTACHMENTS + 3 }, (_, i) => ({
    fileUrl: `https://x/${i}`, evil: 'payload', fileName: 'n'.repeat(300), sizeBytes: 'NaN',
  }));
  const clean = sanitizeWonAttachments(dirty);
  assert.equal(clean.length, MAX_WON_ATTACHMENTS);
  assert.equal('evil' in clean[0], false);
  assert.equal(clean[0].fileName.length, 200);
  assert.equal(clean[0].sizeBytes, null);
});

test('private evidence refs are accepted only for the configured bucket and quotation path', () => {
  const privateFile = {
    storageBucket: DEFAULT_WON_EVIDENCE_BUCKET,
    storagePath: 'quotations/QT-1/won/receipt.pdf',
    fileName: 'receipt.pdf',
  };
  const options = {
    allowedStorageBucket: DEFAULT_WON_EVIDENCE_BUCKET,
    allowedStoragePathPrefix: 'quotations/QT-1/won/',
  };
  const accepted = validateWonEvidence({
    docType: 'payment_slip', docDate: '2026-07-15', attachments: [privateFile],
  }, options);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.evidence.attachments[0].fileUrl, null);
  assert.equal(accepted.evidence.attachments[0].storagePath, privateFile.storagePath);

  const wrongBucket = validateWonEvidence({
    docType: 'payment_slip', docDate: '2026-07-15',
    attachments: [{ ...privateFile, storageBucket: 'other-private-data' }],
  }, options);
  assert.equal(wrongBucket.ok, false);

  const wrongQuote = validateWonEvidence({
    docType: 'payment_slip', docDate: '2026-07-15',
    attachments: [{ ...privateFile, storagePath: 'quotations/QT-2/won/receipt.pdf' }],
  }, options);
  assert.equal(wrongQuote.ok, false);
});

test('isPaymentDocType', () => {
  assert.equal(isPaymentDocType('payment_slip'), true);
  assert.equal(isPaymentDocType('po'), false);
  assert.equal(isPaymentDocType('order_confirmation'), false);
  assert.equal(isPaymentDocType('other'), false);
});
