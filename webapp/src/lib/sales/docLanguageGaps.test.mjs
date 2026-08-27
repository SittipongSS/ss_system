import test from 'node:test';
import assert from 'node:assert/strict';

import { englishDocumentGaps, englishGapMessages } from '@/lib/sales/docLanguageGaps';

const line = (en) => ({ description: 'สินค้าไทย', metadata: en ? { descriptionEn: en } : {} });

test('นับบรรทัดที่ไม่มีชื่ออังกฤษ', () => {
  const gaps = englishDocumentGaps({ lines: [line('Reed Diffuser'), line(null), line('  ')] });
  assert.equal(gaps.linesTotal, 3);
  assert.equal(gaps.linesMissingEn, 2, 'ช่องว่างล้วนนับว่าไม่มี');
});

test('ไม่มีบรรทัดเลย = ไม่เตือนเรื่องสินค้า', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [] }));
  assert.equal(msgs.filter((m) => m.includes('ชื่อสินค้า')).length, 0);
});

test('ครบทุกบรรทัด = เหลือแต่ข้อจำกัดเรื่องลูกค้า', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line('A'), line('B')] }));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /ชื่อและที่อยู่ลูกค้า/);
});

test('ขาดทั้งหมด ใช้คำว่า "ทั้ง N บรรทัด" ไม่ใช่ "N จาก N"', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line(null), line(null)] }));
  assert.match(msgs[0], /ชื่อสินค้าทั้ง 2 บรรทัด/);
});

test('ขาดบางบรรทัด บอกเศษส่วน', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line('A'), line(null), line(null)] }));
  assert.match(msgs[0], /ชื่อสินค้า 2 จาก 3 บรรทัด/);
});

// ข้อจำกัดของเอกสาร ไม่ใช่ช่องที่ลืมกรอก — ต้องเตือนเสมอ ไม่ว่าทะเบียนลูกค้าจะกรอกไว้หรือยัง
test('ข้อความลูกค้าขึ้นเสมอ และไม่ชวนให้ไปกรอกในทะเบียน', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line('A')] }));
  assert.equal(msgs.at(-1).includes('ยังไม่ได้ต่อกับชื่ออังกฤษในทะเบียนลูกค้า'), true);
});

test('ไม่มี lines เลย (ใบเก่า/ข้อมูลไม่ครบ) ต้องไม่พัง', () => {
  assert.deepEqual(englishDocumentGaps(), { linesTotal: 0, linesMissingEn: 0, customerAlwaysThai: true });
  assert.equal(englishGapMessages(undefined).length, 0);
});
