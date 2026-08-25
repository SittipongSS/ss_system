// ── ด่านอ่านสลิปงวดต้องรู้จักทุกโฟลเดอร์ที่ด่านเขียนสร้างขึ้น ────────────────
//
// 🐞 ผู้ใช้แจ้ง 2026-08-25: กดดูสลิปของงวดแรกแล้วได้ `{"error":"ไม่พบไฟล์แนบ"}`
// ทั้งที่ไฟล์อยู่ครบใน bucket · `payment-file` เขียนรายการโฟลเดอร์ที่ยอมรับไว้เอง
// (`won` อย่างเดียว) แล้ว #1391 เพิ่มโฟลเดอร์ที่สาม (`order-confirmation`) สำหรับ
// เอกสารยืนยันคำสั่งซื้อ โดยไม่มีใครกลับมาแก้ด่านอ่าน ⇒ งวดที่ ref ตามไฟล์ยืนยัน
// คำสั่งซื้อมา เปิดไม่ได้ทั้งหมด (วัดบน prod: 6 จาก 43 งวดที่มีหลักฐาน)
//
// กติกา: รายการโฟลเดอร์ต้องมาจาก `TARGETS` ตัวเดียวกับที่ใช้ตอนเขียนไฟล์ ห้ามก๊อป
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTATION_EVIDENCE_FOLDERS,
  isQuotationEvidencePath,
  privateEvidencePrefix,
} from './privateEvidence.js';

test('รู้จักครบทั้งสองแหล่งที่แนบไว้ใต้ใบเสนอราคา', () => {
  assert.deepEqual([...QUOTATION_EVIDENCE_FOLDERS].sort(), ['order-confirmation', 'won']);
});

test('โฟลเดอร์ที่รู้จักต้องตรงกับ prefix ที่ใช้ตอนเขียนไฟล์จริง', () => {
  for (const [entityType, folder] of [
    ['quotation_won_evidence', 'won'],
    ['sales_order_confirmation', 'order-confirmation'],
  ]) {
    const prefix = privateEvidencePrefix(entityType, 'QT-abc123');
    assert.equal(prefix, `quotations/QT-abc123/${folder}/`);
    assert.ok(
      isQuotationEvidencePath(`${prefix}1787633969933_uuid_file.jpg`),
      `${entityType}: ด่านอ่านต้องรับ path ที่ด่านเขียนสร้างเอง`,
    );
  }
});

test('ไม่รับ path นอกโฟลเดอร์หลักฐาน — ค่าใน jsonb ต้องชี้ไฟล์มั่วไม่ได้', () => {
  for (const bad of [
    'quotations/QT-abc123/private/secret.pdf',
    'quotations/QT-abc123/won',                 // ไม่มี `/` ปิดท้าย = ไม่ใช่โฟลเดอร์
    'quotations//won/file.jpg',                 // id ว่าง
    'quotations/QT-abc/../QT-xyz/won/file.jpg', // ไต่ขึ้นโฟลเดอร์อื่น
    'sales-orders/SOR-1/payments/file.jpg',     // ของใบสั่งขาย — ตรวจแยกด้วย orderId
    '',
    null,
  ]) {
    assert.equal(isQuotationEvidencePath(bad), false, `ต้องไม่รับ: ${bad}`);
  }
});

test('ผูกกับใบเสนอราคาของใบตัวเอง — ref ที่ชี้ใบอื่นต้องไม่ผ่าน', () => {
  const own = 'quotations/QT-abc123/order-confirmation/1_uuid_f.jpg';
  const other = 'quotations/QT-zzz999/order-confirmation/1_uuid_f.jpg';
  assert.equal(isQuotationEvidencePath(own, 'QT-abc123'), true);
  assert.equal(isQuotationEvidencePath(other, 'QT-abc123'), false, 'ใบอื่นต้องไม่ผ่านเมื่อผูก id แล้ว');
  // ไม่ส่ง id = โหมดกว้าง (ผู้เรียกที่ยังไม่รู้ว่าใบไหน) — ยังต้องรับของตัวเองได้
  assert.equal(isQuotationEvidencePath(other), true);
});

test('id ถูกล้างด้วยกฎเดียวกับตอนเขียน path', () => {
  // ชื่อใบที่มีอักขระนอก [A-Za-z0-9_-] ถูกแทนด้วย `_` ทั้งตอนเขียนและตอนตรวจ
  const prefix = privateEvidencePrefix('sales_order_confirmation', 'QT 26/08');
  assert.equal(prefix, 'quotations/QT_26_08/order-confirmation/');
  assert.equal(isQuotationEvidencePath(`${prefix}f.jpg`, 'QT 26/08'), true);
});
