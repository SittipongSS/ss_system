import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOrderConfirmation, sanitizeEvidenceAttachments, isPaymentDocType,
  MAX_CONFIRM_ATTACHMENTS, DEFAULT_EVIDENCE_BUCKET, MAX_CONFIRM_DOC_NO, confirmDocNoRule,
  orderConfirmationOf, salesOrderConfirmationGate, evidenceRefsDropped, EVIDENCE_REFS_DROPPED_TEXT,
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

/* ── โหมดเข้ม `privateOnly` ของฝั่ง server (รอบสองของด่านที่มาไฟล์ · 2026-10-09) ──────────
   🐞 โหมดตั้งต้นปล่อย `{ fileUrl:'x', driveFileId }` และ `{ fileUrl:'x', storagePath }` ที่ไม่มี bucket
   ⇒ confirm-file สตรีม Drive id ที่ client เลือกเอง · เส้นลบใบสั่งขายลบ object ที่ไม่ใช่ของใบ */
const PREFIX = 'quotations/QT-1/order-confirmation/';
const STRICT = { privateOnly: true, allowedStorageBucket: DEFAULT_EVIDENCE_BUCKET, allowedStoragePathPrefix: PREFIX };
const GENERATED = '1700000000000_3f2b8c1e-9a4d-4e7b-8f10-2c5d6e7f8a9b_PO-2569.pdf';
const own = (name = GENERATED, extra = {}) => ({
  storageBucket: DEFAULT_EVIDENCE_BUCKET, storagePath: `${PREFIX}${name}`, fileName: 'PO.pdf', ...extra,
});

test('privateOnly: ref ที่ไม่ใช่ไฟล์ใน bucket ส่วนตัวถูกทิ้ง', () => {
  const dropped = [
    { fileUrl: 'x', driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345' },
    { fileUrl: 'x', storagePath: `${PREFIX}${GENERATED}` },
    { fileUrl: 'pending', fileName: 'PO.pdf' },
    own(GENERATED, { storageBucket: 'other-private-data' }),
    { ...own(), storagePath: `quotations/QT-2/order-confirmation/${GENERATED}` },
    { ...own(), storagePath: `sales-orders/SOR-1/payments/${GENERATED}` },
    { ...own(), storageBucket: 123 },
    { ...own(), storagePath: null },
  ];
  for (const ref of dropped) {
    assert.deepEqual(sanitizeEvidenceAttachments([ref], STRICT), [], JSON.stringify(ref));
  }
});

test('privateOnly: ส่วนที่ต่อจากโฟลเดอร์ต้องเป็นชื่อ object เดียว', () => {
  const bad = [
    'sub/file.pdf', '../won/slip.pdf', '%2e%2e%2fwon%2fslip.pdf', '%2e%2e', 'a.pdf?download=1', 'a.pdf#x',
    'a\\b.pdf', 'a\u0000.pdf', 'a\n.pdf', 'a.pdf\n', 'a b.pdf', 'ไฟล์.pdf', '.', '..', '',
  ];
  for (const name of bad) {
    assert.deepEqual(sanitizeEvidenceAttachments([own(name)], STRICT), [], JSON.stringify(name));
  }
  const good = [GENERATED, '1700000000000_3f2b8c1e-9a4d-4e7b-8f10-2c5d6e7f8a9b_PO..final.pdf', '...', 'file'];
  for (const name of good) {
    const clean = sanitizeEvidenceAttachments([own(name)], STRICT);
    assert.equal(clean.length, 1, name);
    assert.equal(clean[0].storagePath, `${PREFIX}${name}`);
  }
});

test('privateOnly: ไม่ได้ส่งโฟลเดอร์หรือ bucket มา = ไม่รับสักไฟล์', () => {
  const base = { privateOnly: true, allowedStorageBucket: DEFAULT_EVIDENCE_BUCKET };
  for (const prefix of ['', null, undefined, 0, {}]) {
    assert.deepEqual(
      sanitizeEvidenceAttachments([own()], { ...base, allowedStoragePathPrefix: prefix }), [], String(prefix),
    );
  }
  assert.deepEqual(sanitizeEvidenceAttachments([own()], base), [], 'ไม่มี key โฟลเดอร์');
  for (const bucket of ['', null, undefined]) {
    assert.deepEqual(
      sanitizeEvidenceAttachments([own()], { privateOnly: true, allowedStorageBucket: bucket, allowedStoragePathPrefix: PREFIX }),
      [], String(bucket),
    );
  }
  assert.deepEqual(
    sanitizeEvidenceAttachments([own()], { privateOnly: true, allowedStoragePathPrefix: PREFIX }), [], 'ไม่มี key bucket',
  );
  assert.deepEqual(sanitizeEvidenceAttachments([own()], { privateOnly: true }), []);
  // ref ที่ไม่มี bucket + option ที่ไม่มี bucket ต้องไม่ "เท่ากัน" จนผ่าน
  assert.deepEqual(
    sanitizeEvidenceAttachments([{ storagePath: `${PREFIX}${GENERATED}` }], { privateOnly: true, allowedStoragePathPrefix: PREFIX }),
    [],
  );
});

test('privateOnly: ผลลัพธ์ไม่มีค่า Drive แม้ client ส่งมาด้วย และล้างฟิลด์เหมือนเดิม', () => {
  const clean = sanitizeEvidenceAttachments([own(GENERATED, {
    fileUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view',
    driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    fileName: 'n'.repeat(300), mimeType: 'application/pdf', sizeBytes: 2048, evil: 'payload',
  })], STRICT);
  assert.deepEqual(clean, [{
    fileUrl: null,
    driveFileId: null,
    storageBucket: DEFAULT_EVIDENCE_BUCKET,
    storagePath: `${PREFIX}${GENERATED}`,
    fileName: 'n'.repeat(200),
    mimeType: 'application/pdf',
    sizeBytes: 2048,
  }]);
});

test('privateOnly: path ที่ยาวเกินเพดานถูกทิ้ง ไม่ใช่ตัดจนชี้ object อื่น', () => {
  assert.deepEqual(sanitizeEvidenceAttachments([own('a'.repeat(1000))], STRICT), []);
});

test('privateOnly: ของปนกัน — เก็บเฉพาะตัวที่ผ่าน และยังตัดที่เพดานจำนวน', () => {
  const mixed = [{ fileUrl: 'x', driveFileId: 'd1' }, own('a.pdf'), own('../b.pdf'), own('c.pdf')];
  assert.deepEqual(sanitizeEvidenceAttachments(mixed, STRICT).map((a) => a.storagePath), [`${PREFIX}a.pdf`, `${PREFIX}c.pdf`]);
  const many = Array.from({ length: MAX_CONFIRM_ATTACHMENTS + 3 }, (_, i) => own(`f${i}.pdf`));
  assert.equal(sanitizeEvidenceAttachments(many, STRICT).length, MAX_CONFIRM_ATTACHMENTS);
});

test('validateOrderConfirmation ส่ง privateOnly ต่อจาก attachmentOptions', () => {
  const base = { docType: 'payment_slip', docDate: '2026-08-24' };
  const ok = validateOrderConfirmation({ ...base, attachments: [own(GENERATED, { fileUrl: 'x', driveFileId: 'd1' })] }, STRICT);
  assert.equal(ok.ok, true);
  assert.equal(ok.confirmation.attachments[0].fileUrl, null);
  assert.equal(ok.confirmation.attachments[0].driveFileId, null);

  // ไฟล์ถูกทิ้งหมด = ชุดที่ "เริ่มกรอกแล้วแต่ไม่มีไฟล์" ⇒ ปฏิเสธทั้งคำขอ ไม่ใช่เงียบ
  for (const attachments of [
    [{ fileUrl: 'x', driveFileId: 'd1' }],
    [{ fileUrl: 'x', storagePath: `${PREFIX}${GENERATED}` }],
    [own('../won/slip.pdf')],
  ]) {
    const r = validateOrderConfirmation({ ...base, attachments }, STRICT);
    assert.equal(r.ok, false);
    assert.match(r.error, /แนบไฟล์เอกสารยืนยัน/);
    // ⚠️ ส่งมาแต่ไฟล์ (ไม่มีชนิด/วันที่) ก็ต้องไม่กลายเป็น "ว่างทั้งชุด"
    assert.equal(validateOrderConfirmation({ attachments }, STRICT).ok, false);
  }
  const emptyPrefix = validateOrderConfirmation({ ...base, attachments: [own()] }, { ...STRICT, allowedStoragePathPrefix: '' });
  assert.equal(emptyPrefix.ok, false);
});

/* ⚠️ ฟอร์มสร้างใบสั่งขาย (sales-orders/new/page.js) เรียกแบบไม่ส่ง option ด้วยตัวแทน `{ fileUrl:'pending' }`
   ของไฟล์ที่ยังไม่ได้อัป — โหมดเข้มห้ามกลายเป็นค่าตั้งต้น ไม่งั้นปุ่มสร้างดับทั้งหน้า */
test('ไม่ส่ง option: ตัวแทนไฟล์ที่ยังไม่ได้อัปของฟอร์มสร้างใบยังนับเป็นไฟล์เหมือนเดิม', () => {
  const placeholders = [{ fileUrl: 'pending', fileName: 'PO.pdf' }, { fileUrl: 'pending', fileName: 'slip.jpg' }];
  const r = validateOrderConfirmation({ docType: 'po', docDate: '2026-08-24', docNo: 'PO-1', attachments: placeholders });
  assert.equal(r.ok, true);
  assert.deepEqual(r.confirmation.attachments, placeholders.map((p) => ({
    fileUrl: 'pending', driveFileId: null, storageBucket: null, storagePath: null,
    fileName: p.fileName, mimeType: null, sizeBytes: null,
  })));
  // privateOnly ที่ไม่ใช่ true ล้วน (false · undefined · 'true') = โหมดเดิม
  for (const privateOnly of [false, undefined, 'true', 1]) {
    assert.equal(sanitizeEvidenceAttachments(placeholders, { privateOnly }).length, 2, String(privateOnly));
  }
  // โหมดเดิมยังเก็บค่า Drive และ ref ที่ไม่มี bucket ตามเดิม (ผู้เรียกเก่าที่ยังไม่ย้าย)
  assert.deepEqual(
    sanitizeEvidenceAttachments([{ fileUrl: 'x', driveFileId: 'd1' }])[0],
    { fileUrl: 'x', driveFileId: 'd1', storageBucket: null, storagePath: null, fileName: null, mimeType: null, sizeBytes: null },
  );
  assert.equal(
    sanitizeEvidenceAttachments([{ fileUrl: 'x', storagePath: 'anything/else.pdf' }], {
      allowedStorageBucket: DEFAULT_EVIDENCE_BUCKET, allowedStoragePathPrefix: PREFIX,
    }).length,
    1,
  );
});

/* ── ชุดที่ผ่านด่านสั้นกว่าชุดที่ส่ง = ผู้เรียกฝั่ง server ปฏิเสธทั้งคำขอ ─────────────── */
const DROP_OPTS = { allowedStorageBucket: 'sales-evidence', allowedStoragePathPrefix: 'quotations/QT-1/order-confirmation/', privateOnly: true };
const ownRef = (n) => ({ storageBucket: 'sales-evidence', storagePath: `quotations/QT-1/order-confirmation/${n}_a_po.pdf`, fileName: `po-${n}.pdf` });

test('evidenceRefsDropped: ไม่ได้ส่งไฟล์ (ไม่ใช่อาร์เรย์/ว่าง) = false เสมอ', () => {
  for (const sent of [undefined, null, '', 'x', 0, {}, { length: 3 }, []]) {
    assert.equal(evidenceRefsDropped(sent, []), false, JSON.stringify(sent));
    assert.equal(evidenceRefsDropped(sent, undefined), false);
  }
});

test('evidenceRefsDropped: ผ่านครบ = false · ถูกตัดแม้ตัวเดียว = true · ไม่เหลือเลย = true', () => {
  const foreign = { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-2/order-confirmation/1_a_po.pdf', fileName: 'x.pdf' };
  const drive = { fileUrl: 'https://drive.google.com/file/d/abc/view', driveFileId: 'abc', fileName: 'd.pdf' };
  const arrayPath = { fileUrl: 'x', storageBucket: 'sales-evidence', storagePath: [ownRef(9).storagePath] };
  const cases = [
    [[ownRef(1)], false],
    [[ownRef(1), ownRef(2), ownRef(3)], false],
    [[ownRef(1), ownRef(1)], false], // ตัวกรองไม่ตัดตัวซ้ำ ⇒ ส่งซ้ำไม่ใช่การถูกปฏิเสธ
    [[ownRef(1), foreign], true],
    [[drive, ownRef(1), ownRef(2)], true],
    [[ownRef(1), arrayPath], true],
    [[ownRef(1), null], true],
    [[foreign], true],
    [[drive, foreign], true],
  ];
  for (const [sent, expected] of cases) {
    assert.equal(evidenceRefsDropped(sent, sanitizeEvidenceAttachments(sent, DROP_OPTS)), expected, JSON.stringify(sent));
  }
  // ผลของตัวกรองที่ไม่ใช่อาร์เรย์ = ไม่มีอะไรผ่าน
  assert.equal(evidenceRefsDropped([ownRef(1)], undefined), true);
  assert.equal(evidenceRefsDropped([ownRef(1)], null), true);
});

test('evidenceRefsDropped: นับกับเพดานของตัวกรอง — ส่งเกินเพดานไม่ใช่การถูกปฏิเสธ แต่ตัวที่ไม่ผ่านในชุดเกินเพดานยังจับได้', () => {
  const many = Array.from({ length: MAX_CONFIRM_ATTACHMENTS + 3 }, (_, i) => ownRef(i + 1));
  const kept = sanitizeEvidenceAttachments(many, DROP_OPTS);
  assert.equal(kept.length, MAX_CONFIRM_ATTACHMENTS);
  assert.equal(evidenceRefsDropped(many, kept), false);
  const exact = many.slice(0, MAX_CONFIRM_ATTACHMENTS);
  assert.equal(evidenceRefsDropped(exact, sanitizeEvidenceAttachments(exact, DROP_OPTS)), false);
  const holed = [...many.slice(0, MAX_CONFIRM_ATTACHMENTS - 1), { fileUrl: 'x', driveFileId: 'abc' }];
  assert.equal(evidenceRefsDropped(holed, sanitizeEvidenceAttachments(holed, DROP_OPTS)), true);
  const mostlyBad = [...Array.from({ length: MAX_CONFIRM_ATTACHMENTS }, () => ({ fileUrl: 'x' })), ownRef(1)];
  assert.equal(evidenceRefsDropped(mostlyBad, sanitizeEvidenceAttachments(mostlyBad, DROP_OPTS)), true);
});

test('evidenceRefsDropped: ใช้กับผลของ validateOrderConfirmation ได้ตรง ๆ (confirmation.attachments) · ชุดว่างทั้งก้อน = false', () => {
  const sent = [ownRef(1), { fileUrl: 'x', driveFileId: 'abc', fileName: 'd.pdf' }];
  const check = validateOrderConfirmation({ docType: 'payment_slip', docDate: '2026-10-09', attachments: sent }, DROP_OPTS);
  assert.equal(check.ok, true, 'ตัวตรวจเองยังผ่าน (เหลือ 1 ไฟล์) — ผู้เรียกฝั่ง server ต้องถามตัวนับต่อ');
  assert.equal(check.confirmation.attachments.length, 1);
  assert.equal(evidenceRefsDropped(sent, check.confirmation?.attachments), true);
  const empty = validateOrderConfirmation({}, DROP_OPTS);
  assert.equal(evidenceRefsDropped(undefined, empty.confirmation?.attachments), false);
  // ข้อความบอกสิ่งที่ต้องทำ ไม่ใช่แค่บอกว่าผิด
  assert.match(EVIDENCE_REFS_DROPPED_TEXT, /ไฟล์แนบบางไฟล์.+ลบไฟล์นั้นออกแล้วแนบใหม่อีกครั้ง/);
});

test('ไม่ส่ง option: ตัวนับไม่ถูกฝังในตัวตรวจ — ฟอร์มสร้างใบ (ตัวแทนไฟล์) ผ่านเหมือนเดิม', () => {
  const placeholders = [{ fileUrl: 'pending', fileName: 'a.pdf' }, { fileUrl: 'pending', fileName: 'b.pdf' }];
  const check = validateOrderConfirmation({ docType: 'payment_slip', docDate: '2026-10-09', attachments: placeholders });
  assert.equal(check.ok, true);
  assert.equal(check.confirmation.attachments.length, 2);
});
