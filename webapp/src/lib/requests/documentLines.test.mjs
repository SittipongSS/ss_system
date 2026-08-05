// บรรทัดของ "ขอเอกสาร" (P5) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REQUEST_ITEMS, normalizeDocumentItems } from './lines.js';
import { REQUEST_DOC_TYPES, docTypeLabel, docTypeNeedsDetail } from './docTypes.js';

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

test('ชนิดเดียวกันซ้ำได้ถ้ารายละเอียดต่าง — ขอ COA สองล็อตคือคนละใบ', () => {
  const rows = [
    { docType: 'coa', spec: 'ล็อต A' },
    { docType: 'coa', spec: 'ล็อต B' },
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
