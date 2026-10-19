// บรรทัดของ "ขอเอกสาร" (P5) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REQUEST_ITEMS, normalizeDocumentItems } from './lines.js';
import {
  REQUEST_DOC_TYPES, REQUEST_DOC_TYPE_VALUES, REQUEST_DOC_VOCABULARY, docTypeLabel, docTypeNeedsDetail,
} from './docTypes.js';

test('ชนิดเอกสารบังคับ และต้องอยู่ในทะเบียน', () => {
  assert.match(normalizeDocumentItems([]).error, /อย่างน้อย 1 รายการ/);
  assert.match(normalizeDocumentItems([{}]).error, /ชนิดเอกสาร/);
  assert.match(normalizeDocumentItems([{ docType: 'ใบอะไรก็ไม่รู้' }]).error, /ไม่ถูกต้อง/);
  assert.equal(normalizeDocumentItems([{ docType: 'ifra' }]).error, null);
});

test('⭐ "อื่น ๆ" ต้องมีรายละเอียด — ไม่งั้นแถวนั้นไม่ได้บอกอะไรเลยว่าขออะไร', () => {
  // ฝ่ายปลายทางจะต้องเดาหรือถามกลับ ซึ่งเสียรอบไปหนึ่งรอบเปล่า ๆ
  assert.equal(docTypeNeedsDetail('other'), true);
  assert.equal(docTypeNeedsDetail('ifra'), false);
  assert.match(normalizeDocumentItems([{ docType: 'other' }]).error, /ระบุว่าขอเอกสารอะไร/);
  assert.equal(normalizeDocumentItems([{ docType: 'other', spec: 'ใบรับรองฮาลาล' }]).error, null);
});

test('ชนิดเดียวกันซ้ำได้ถ้ารายละเอียดต่าง — ขอ Spec Sheet สองสินค้าคือคนละใบ', () => {
  const rows = [
    { docType: 'spec_sheet', spec: 'สินค้า A' },
    { docType: 'spec_sheet', spec: 'สินค้า B' },
  ];
  assert.equal(normalizeDocumentItems(rows).error, null);
  // ซ้ำทั้งคู่ = ของชิ้นเดียวกัน
  assert.match(normalizeDocumentItems([rows[0], { ...rows[0] }]).error, /ซ้ำกับรายการก่อนหน้า/);
});

test('label เป็นชื่อชนิด — คอลัมน์เป็น NOT NULL และต้องอ่านออกโดยไม่ต้องแปลรหัส', () => {
  const { items } = normalizeDocumentItems([{ docType: 'msds' }]);
  assert.equal(items[0].label, docTypeLabel('msds'));
  assert.equal(items[0].lineKind, 'document');
  assert.equal(items[0].docType, 'msds');
});

test('ชนิดที่ไม่รู้จักคืนค่าดิบ ไม่ใช่ค่าว่าง — ของเก่าต้องยังอ่านออก', () => {
  assert.equal(docTypeLabel('ของเก่า'), 'ของเก่า');
  assert.equal(docTypeLabel(null), '—');
});

test('ทะเบียนชนิดต้องมีทางออก "อื่น ๆ" เสมอ', () => {
  // ไม่มีทางออก = คนจะเลือกชนิดที่ใกล้เคียงที่สุดแล้วอธิบายในรายละเอียด
  // ซึ่งทำให้ตัวเลข "ขอ IFRA กี่ครั้ง" ผิดไปโดยไม่มีใครรู้
  assert.ok(REQUEST_DOC_TYPES.some((t) => t.value === 'other'));
  assert.ok(REQUEST_DOC_TYPES.length <= MAX_REQUEST_ITEMS);
});

test('⭐ ม-156 Specification Sheet แทน COA — ใบใหม่เลือก COA ไม่ได้ แต่ใบเก่ายังอ่านชื่อออก', () => {
  assert.equal(normalizeDocumentItems([{ docType: 'spec_sheet' }]).error, null);
  assert.equal(docTypeLabel('spec_sheet'), 'Specification Sheet');

  // แผ่นเลือก + ตัวตรวจ ไม่มี COA แล้ว
  assert.ok(!REQUEST_DOC_VOCABULARY.types.some((t) => t.value === 'coa'));
  assert.ok(!REQUEST_DOC_TYPE_VALUES.includes('coa'));
  assert.match(normalizeDocumentItems([{ docType: 'coa' }]).error, /ไม่ถูกต้อง/);

  // ⚠️ แถวเก่าในฐานยังถือ 'coa' — บอร์ด/ประวัติ/แท็บเอกสารของดีลต้องได้ชื่อเดิม ไม่ใช่รหัสดิบ
  assert.equal(docTypeLabel('coa'), 'COA — Certificate of Analysis');
  assert.equal(REQUEST_DOC_VOCABULARY.label('coa'), 'COA — Certificate of Analysis');
});
