import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOrderConfirmation, sanitizeEvidenceAttachments, isPaymentDocType,
  MAX_CONFIRM_ATTACHMENTS, DEFAULT_EVIDENCE_BUCKET, MAX_CONFIRM_DOC_NO, confirmDocNoRule,
  orderConfirmationOf, salesOrderConfirmationGate,
} from './orderConfirmationDocs.js';

const file = { fileUrl: 'https://drive.example/f1', driveFileId: 'd1', fileName: 'slip.pdf', mimeType: 'application/pdf', sizeBytes: 1024 };

test('สลิป: ไฟล์ + วันที่ ก็พอ (ไม่มีช่องกำหนดชำระในชุดนี้แล้ว)', () => {
  const r = validateOrderConfirmation({ docType: 'payment_slip', docDate: '2026-08-24', attachments: [file] });
  assert.equal(r.ok, true);
  assert.equal(r.confirmation.attachments.length, 1);
  assert.equal('paymentDueDate' in r.confirmation, false, 'กำหนดชำระอยู่ที่งวด ไม่ใช่ที่เอกสารยืนยัน');
});

/* ⭐ มติ 2026-08-24: ใบร่างที่ยังไม่ได้เอกสารจากลูกค้าต้องออกได้ — ด่านอยู่ตอนยื่นอนุมัติ */
test('ว่างทั้งชุดผ่านได้ และคืน confirmation = null', () => {
  for (const input of [undefined, {}, { docType: '', docNo: '  ', attachments: [] }]) {
    const r = validateOrderConfirmation(input);
    assert.equal(r.ok, true);
    assert.equal(r.confirmation, null);
  }
});

test('กรอกมาครึ่งเดียวไม่ผ่าน', () => {
  assert.equal(validateOrderConfirmation({ docType: 'po' }).ok, false, 'มีชนิดแต่ไม่มีวันที่/ไฟล์');
  assert.equal(validateOrderConfirmation({ docDate: '2026-08-24' }).ok, false, 'มีวันที่แต่ไม่มีชนิด');
  assert.equal(validateOrderConfirmation({ attachments: [file] }).ok, false, 'มีไฟล์แต่ไม่มีชนิด');
});

/* ── เลขที่เอกสาร (mig 0246 · มติผู้ใช้ 2026-08-13) ────────────────────────
   ⭐ ใบสั่งขายใช้เป็นค่าตั้งต้นของ "เอกสารอ้างอิง" ⇒ ยืนยันด้วย PO ต้องมีเลขจริง */
test('ยืนยันด้วย PO ต้องมีเลขที่ใบสั่งซื้อ', () => {
  const base = { docType: 'po', docDate: '2026-08-24', attachments: [file] };
  assert.equal(validateOrderConfirmation(base).ok, false);
  assert.match(validateOrderConfirmation(base).error, /เลขที่ใบสั่งซื้อ/);
  assert.equal(validateOrderConfirmation({ ...base, docNo: '   ' }).ok, false, 'ช่องว่างล้วนไม่นับ');
  const ok = validateOrderConfirmation({ ...base, docNo: '  PO-2569-00123 ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.confirmation.docNo, 'PO-2569-00123', 'ตัดช่องว่างหัวท้ายก่อนเก็บ');
});

test('เอกสารยืนยันการสั่งซื้อกรอกเลขที่ได้แต่ไม่บังคับ', () => {
  const base = { docType: 'order_confirmation', docDate: '2026-08-24', attachments: [file] };
  const without = validateOrderConfirmation(base);
  assert.equal(without.ok, true);
  assert.equal(without.confirmation.docNo, null);
  assert.equal(validateOrderConfirmation({ ...base, docNo: 'OC-77' }).confirmation.docNo, 'OC-77');
});

test('สลิปโอนเงินไม่มีช่องเลขที่ — ส่งมาก็ไม่เก็บ', () => {
  const r = validateOrderConfirmation({
    docType: 'payment_slip', docDate: '2026-08-24', docNo: 'เลขมั่ว', attachments: [file],
  });
  assert.equal(r.ok, true);
  assert.equal(r.confirmation.docNo, null);
});

test('เลขที่ยาวเกินเพดานถูกปฏิเสธ ไม่ใช่ตัดเงียบ ๆ', () => {
  const r = validateOrderConfirmation({
    docType: 'po', docDate: '2026-08-24',
    docNo: 'P'.repeat(MAX_CONFIRM_DOC_NO + 1), attachments: [file],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /ยาวเกิน/);
});

test('กติกาเลขที่ของแต่ละประเภทตรงกับที่ฟอร์มใช้ตัดสิน', () => {
  assert.equal(confirmDocNoRule('po'), 'required');
  assert.equal(confirmDocNoRule('order_confirmation'), 'optional');
  assert.equal(confirmDocNoRule('payment_slip'), 'none');
  assert.equal(confirmDocNoRule('ไม่มีชนิดนี้'), 'none');
});

test('ชุดที่เริ่มกรอกแล้วต้องมีไฟล์', () => {
  assert.equal(validateOrderConfirmation({ docType: 'payment_slip', docDate: '2026-08-24', attachments: [] }).ok, false);
  // ref ไม่มี fileUrl = ไม่นับเป็นไฟล์ (แต่ยังนับว่า "เริ่มกรอกแล้ว" จึงต้องไม่เงียบ)
  assert.equal(validateOrderConfirmation({ docType: 'payment_slip', docDate: '2026-08-24', attachments: [{ fileName: 'x' }] }).ok, false);
});

test('วันที่กับชนิดเอกสารถูกตรวจเมื่อเริ่มกรอกแล้ว', () => {
  assert.equal(validateOrderConfirmation({ docType: 'payment_slip', attachments: [file] }).ok, false);
  assert.equal(validateOrderConfirmation({ docType: 'payment_slip', docDate: 'ไม่ใช่วันที่', attachments: [file] }).ok, false);
  assert.equal(validateOrderConfirmation({ docType: 'invoice', docDate: '2026-08-24', attachments: [file] }).ok, false);
});

test('sanitizeEvidenceAttachments strips unknown fields and caps the list', () => {
  const dirty = Array.from({ length: MAX_CONFIRM_ATTACHMENTS + 3 }, (_, i) => ({
    fileUrl: `https://x/${i}`, evil: 'payload', fileName: 'n'.repeat(300), sizeBytes: 'NaN',
  }));
  const clean = sanitizeEvidenceAttachments(dirty);
  assert.equal(clean.length, MAX_CONFIRM_ATTACHMENTS);
  assert.equal('evil' in clean[0], false);
  assert.equal(clean[0].fileName.length, 200);
  assert.equal(clean[0].sizeBytes, null);
});

test('private evidence refs are accepted only for the configured bucket and path', () => {
  const privateFile = {
    storageBucket: DEFAULT_EVIDENCE_BUCKET,
    storagePath: 'quotations/QT-1/order-confirmation/receipt.pdf',
    fileName: 'receipt.pdf',
  };
  const options = {
    allowedStorageBucket: DEFAULT_EVIDENCE_BUCKET,
    allowedStoragePathPrefix: 'quotations/QT-1/order-confirmation/',
  };
  const accepted = validateOrderConfirmation({
    docType: 'payment_slip', docDate: '2026-08-24', attachments: [privateFile],
  }, options);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.confirmation.attachments[0].fileUrl, null);
  assert.equal(accepted.confirmation.attachments[0].storagePath, privateFile.storagePath);

  const wrongBucket = validateOrderConfirmation({
    docType: 'payment_slip', docDate: '2026-08-24',
    attachments: [{ ...privateFile, storageBucket: 'other-private-data' }],
  }, options);
  assert.equal(wrongBucket.ok, false);

  const wrongQuote = validateOrderConfirmation({
    docType: 'payment_slip', docDate: '2026-08-24',
    attachments: [{ ...privateFile, storagePath: 'quotations/QT-2/order-confirmation/receipt.pdf' }],
  }, options);
  assert.equal(wrongQuote.ok, false);
});

test('isPaymentDocType', () => {
  assert.equal(isPaymentDocType('payment_slip'), true);
  assert.equal(isPaymentDocType('po'), false);
  assert.equal(isPaymentDocType('order_confirmation'), false);
  assert.equal(isPaymentDocType('other'), false);
});

/* ── อ่านสองบ้าน: ใบใหม่ถือเอกสารเอง · ใบเก่าถอยไปดูใบเสนอราคาต้นทาง ─────── */
test('orderConfirmationOf: ใบสั่งขายมาก่อน ใบเสนอราคาเป็นทางถอย', () => {
  const order = {
    confirmDocType: 'po', confirmDocNo: 'PO-1', confirmDocDate: '2026-08-24', confirmAttachments: [file],
  };
  const quote = { wonDocType: 'payment_slip', wonDocDate: '2026-07-01', wonAttachments: [file] };

  assert.equal(orderConfirmationOf(order, quote).source, 'order');
  assert.equal(orderConfirmationOf(order, quote).docNo, 'PO-1');

  const legacy = orderConfirmationOf({ confirmAttachments: [] }, quote);
  assert.equal(legacy.source, 'quotation');
  assert.equal(legacy.docType, 'payment_slip');

  assert.equal(orderConfirmationOf({}, null), null);
  assert.equal(orderConfirmationOf({}, { wonAttachments: [] }), null);
});

test('ด่านยื่นอนุมัติ: ไม่มีเอกสาร = ยื่นไม่ได้ และบอกเหตุผลเป็นข้อความ', () => {
  assert.match(salesOrderConfirmationGate({}, null), /ยังไม่มีเอกสารยืนยัน/);
  // PO ที่ไม่มีเลขที่ (ใบเก่าที่แนบไว้ก่อน 0246) ต้องเติมเลขก่อนยื่น
  assert.match(
    salesOrderConfirmationGate({ confirmDocType: 'po', confirmAttachments: [file] }, null),
    /เลขที่ PO/,
  );
  assert.equal(
    salesOrderConfirmationGate({ confirmDocType: 'po', confirmDocNo: 'PO-1', confirmAttachments: [file] }, null),
    null,
  );
  // ใบเก่า: หลักฐานอยู่ที่ใบเสนอราคา ⇒ ยื่นได้ ไม่ต้องกรอกซ้ำ
  assert.equal(
    salesOrderConfirmationGate({}, { wonDocType: 'payment_slip', wonAttachments: [file] }),
    null,
  );
});
