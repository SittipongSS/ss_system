// ไฟล์แนบ — ตัวช่วยที่ไม่มี I/O
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_TYPES,
  attachmentTypeLabel,
  isPreviewableImage,
  requiredDocKeys,
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
