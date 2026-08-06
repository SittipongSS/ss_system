// ไฟล์แนบ — ตัวช่วยที่ไม่มี I/O
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_TYPES,
  ACCEPTED_UPLOAD_EXT,
  UPLOAD_ACCEPT_ATTR,
  IMAGE_ACCEPT_ATTR,
  attachmentTypeLabel,
  attachmentFileHeaders,
  customerDocTypes,
  documentValidity,
  fileExt,
  missingDocsMessage,
  isInlineSafeMime,
  isPreviewableImage,
  requiredDocKeys,
  resolveUploadMime,
} from './attachmentTypes.js';

test('พรีวิวรูป: ยึด mimeType เป็นหลัก', () => {
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.equal(isPreviewableImage({ mimeType }), true, mimeType);
  }
  for (const mimeType of ['application/pdf', 'text/csv', 'text/plain']) {
    assert.equal(isPreviewableImage({ mimeType }), false, mimeType);
  }
  // ตัวพิมพ์ใหญ่จากบางเบราว์เซอร์ก็ต้องผ่าน
  assert.equal(isPreviewableImage({ mimeType: 'IMAGE/PNG' }), true);
});

test('พรีวิวรูป: ไฟล์เก่าที่ไม่มี mimeType เดาจากนามสกุลแทน', () => {
  assert.equal(isPreviewableImage({ fileName: 'artwork.PNG' }), true);
  assert.equal(isPreviewableImage({ fileName: 'ตัวอย่างขวด.jpg' }), true);
  assert.equal(isPreviewableImage({ fileName: 'spec.pdf' }), false);
  // ชื่อไฟล์ไม่มีนามสกุล / ไม่มีข้อมูลเลย = ไม่พรีวิว (fallback ปลอดภัย)
  assert.equal(isPreviewableImage({ fileName: 'scan' }), false);
  assert.equal(isPreviewableImage({}), false);
  assert.equal(isPreviewableImage(null), false);
});

test('พรีวิวรูป: mimeType ที่ระบุมาชนะนามสกุลที่ขัดกัน', () => {
  // ไฟล์ชื่อ .png แต่ mime บอกว่าเป็น pdf → เชื่อ mime (ไม่เอาไปยัดใส่ <img>)
  assert.equal(isPreviewableImage({ mimeType: 'application/pdf', fileName: 'a.png' }), false);
});

// 🐞 ชุดชนิดไฟล์เดิมแคบเกินจริง: รูปจาก iPhone (.heic) และไฟล์ Artwork (.ai/.psd/.eps)
// ที่กราฟิกส่งมา อัปไม่ขึ้นเลยทั้งที่ Artwork เป็นเอกสารบังคับของสินค้า — และ UI เดิม
// กลืนข้อความจาก server ผู้ใช้จึงเห็นแค่ "อัปโหลดไม่สำเร็จ"
test('รับชนิดไฟล์ที่คนใช้ทำงานจริง', () => {
  for (const ext of ['heic', 'heif', 'ai', 'psd', 'eps', 'doc', 'xls', 'ppt', 'zip']) {
    assert.ok(ACCEPTED_UPLOAD_EXT.includes(ext), `ต้องรับ .${ext}`);
  }
  for (const ext of ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'webp']) {
    assert.ok(ACCEPTED_UPLOAD_EXT.includes(ext), `ของเดิมต้องไม่หาย: .${ext}`);
  }
});

test('accept ของช่องเลือกไฟล์สร้างจากลิสต์เดียวกัน — ไม่มีทางหลุดกัน', () => {
  for (const ext of ACCEPTED_UPLOAD_EXT) {
    assert.ok(UPLOAD_ACCEPT_ATTR.includes(`.${ext}`), `accept ต้องมี .${ext}`);
  }
  assert.ok(IMAGE_ACCEPT_ATTR.includes('.heic'));
  assert.ok(!IMAGE_ACCEPT_ATTR.includes('.pdf'), 'ช่องที่รับเฉพาะรูปต้องไม่รับเอกสาร');
});

// 🐞 เดิมเก็บ contentType ที่ client ประกาศมาดิบ ๆ = ตั้งชื่อ x.pdf แต่บอกว่า text/html
// ก็ได้ → กลายเป็น stored XSS ทันทีที่ไฟล์ถูกเสิร์ฟกลับแบบเปิดในหน้า
test('Content-Type ตัดสินจากนามสกุล ไม่เชื่อค่าที่ client ส่ง', () => {
  assert.equal(resolveUploadMime('งบ.pdf', 'text/html'), 'application/pdf');
  assert.equal(resolveUploadMime('รูป.HEIC', ''), 'image/heic');
  assert.equal(resolveUploadMime('artwork.ai', 'application/octet-stream'), 'application/postscript');
  // นามสกุลไม่รู้จัก + client ส่งชนิดนอกลิสต์ → octet-stream (ดาวน์โหลดอย่างเดียว)
  assert.equal(resolveUploadMime('ของแปลก.xyz', 'text/html'), 'application/octet-stream');
  // นามสกุลไม่รู้จักแต่ client ส่งชนิดที่อนุญาต → ใช้ค่านั้นได้
  assert.equal(resolveUploadMime('scan.xyz', 'application/pdf'), 'application/pdf');
});

test('เปิดในหน้าได้เฉพาะชนิดที่ปลอดภัย', () => {
  assert.ok(isInlineSafeMime('application/pdf'));
  assert.ok(isInlineSafeMime('image/png'));
  assert.ok(!isInlineSafeMime('text/html'));
  assert.ok(!isInlineSafeMime('image/svg+xml'), 'SVG รันสคริปต์ได้ ห้าม inline');
  assert.ok(!isInlineSafeMime('application/zip'));
});

test('header ของ proxy: nosniff เสมอ + บังคับดาวน์โหลดเมื่อไม่ปลอดภัย', () => {
  const pdf = attachmentFileHeaders({ fileName: 'ใบเสร็จ.pdf', mimeType: 'text/html' });
  assert.equal(pdf['Content-Type'], 'application/pdf');
  assert.match(pdf['Content-Disposition'], /^inline;/);
  assert.equal(pdf['X-Content-Type-Options'], 'nosniff');
  // ชื่อไฟล์ไทยต้องถูก encode ไม่งั้น header พัง
  assert.match(pdf['Content-Disposition'], /filename\*=UTF-8''%/);

  const zip = attachmentFileHeaders({ fileName: 'งาน.zip', mimeType: 'application/zip' });
  assert.match(zip['Content-Disposition'], /^attachment;/);

  const html = attachmentFileHeaders({ fileName: 'x.html', mimeType: 'text/html' });
  assert.equal(html['Content-Type'], 'application/octet-stream');
  assert.match(html['Content-Disposition'], /^attachment;/);
});

test('fileExt: ตัดนามสกุลแบบไม่สนตัวพิมพ์', () => {
  assert.equal(fileExt('a/b/ค.PDF'), 'pdf');
  assert.equal(fileExt(''), '');
});

test('ระบบรู้จัก entity ไฟล์แนบของใบขอราคาผลิต', () => {
  assert.ok(ATTACHMENT_ENTITY_TYPES.includes('costing_item'));
  const keys = ATTACHMENT_TYPES.costing_item.map((t) => t.key);
  assert.deepEqual(keys, ['reference_image', 'spec', 'other']);
  // ไม่มีเอกสารบังคับ — ใบขอราคาแนบรูปเสริมเท่านั้น ไม่ควรบล็อกการส่งขอราคา
  assert.deepEqual(requiredDocKeys('costing_item'), []);
  assert.equal(attachmentTypeLabel('costing_item', 'spec'), 'สเปก / แบบบรรจุภัณฑ์');
  // docType ที่ไม่รู้จักคืนค่าเดิม ไม่ throw
  assert.equal(attachmentTypeLabel('costing_item', 'bogus'), 'bogus');
});

// ── อายุเอกสาร + Bookbank (2026-08-06) ──────────────────────────────────

test('Bookbank อยู่ในชุดเอกสารทั้งนิติบุคคลและบุคคลธรรมดา และไม่บังคับ', () => {
  for (const type of ['company', 'individual']) {
    const card = customerDocTypes(type).find((t) => t.key === 'bank_book');
    assert.ok(card, `${type} ต้องมีการ์ด Bookbank`);
    assert.equal(card.required, false);
  }
  // ไม่บังคับ ⇒ ต้องไม่โผล่ในด่านอนุมัติ (ลูกค้าเป็นฝ่ายจ่ายเงินให้เรา
  // เล่มบัญชีจำเป็นเฉพาะตอนคืนมัดจำ)
  assert.ok(!requiredDocKeys('customer', customerDocTypes('company')).includes('bank_book'));
  // ป้ายชื่อต้อง lookup ได้ ไม่ตกเป็นคีย์ดิบบนไฟล์ที่แนบแล้ว
  assert.match(attachmentTypeLabel('customer', 'bank_book'), /Bookbank/);
});

test('หนังสือรับรองมีอายุ 6 เดือนนับจากวันที่ออก', () => {
  const doc = (issuedDate) => ({ docType: 'company_certificate', metadata: { issuedDate } });
  const v = documentValidity('customer', doc('2026-01-31'), '2026-06-01');
  // 31 ม.ค. + 6 เดือน ต้องได้ 31 ก.ค. — และเดือนที่ไม่มีวันที่ 31 ต้องถอยมาสิ้นเดือน
  assert.equal(v.expiresAt, '2026-07-31');
  assert.equal(v.expired, false);
  assert.equal(documentValidity('customer', doc('2025-08-31'), '2026-08-06').expiresAt, '2026-02-28');
  assert.equal(documentValidity('customer', doc('2025-08-31'), '2026-08-06').expired, true);
});

test('เอกสารที่ยังไม่ได้กรอกวันที่ = "ไม่รู้" ไม่ใช่ "หมดอายุ"', () => {
  // ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้ต้องไม่กลายเป็นของเสียข้ามคืน
  const v = documentValidity('customer', { docType: 'company_certificate', metadata: {} }, '2026-08-06');
  assert.equal(v.unknown, true);
  assert.equal(v.expired, false);
});

test('เอกสารที่ไม่มีอายุกำกับคืน null — ผู้เรียกจะได้ไม่ต้องเดาเอง', () => {
  assert.equal(documentValidity('customer', { docType: 'address_map', metadata: {} }, '2026-08-06'), null);
  assert.equal(documentValidity('product', { docType: 'artwork', metadata: {} }, '2026-08-06'), null);
});

test('ข้อความตอนอนุมัติแยก "ยังไม่มี" ออกจาก "หมดอายุแล้ว"', () => {
  const msg = missingDocsMessage([
    { key: 'vat_pp20', label: 'ภ.พ.20', reason: 'absent' },
    { key: 'company_certificate', label: 'หนังสือรับรอง', reason: 'expired', expiresAt: '2026-02-28' },
  ], 'ลูกค้า ก. ');
  assert.match(msg, /ขาด ภ\.พ\.20/);
  assert.match(msg, /หมดอายุแล้ว หนังสือรับรอง \(ถึง 2026-02-28\)/);
});
