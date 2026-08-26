import assert from 'node:assert/strict';
import test from 'node:test';

import { amountInWords } from '@/lib/documents/amountInWords';

test('ไทย: จำนวนเต็มลงท้าย "บาทถ้วน"', () => {
  assert.equal(amountInWords(234567, 'th'), 'สองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทถ้วน');
  assert.equal(amountInWords(1000, 'th'), 'หนึ่งพันบาทถ้วน');
});

test('ไทย: กฎ สิบ / ยี่สิบ / เอ็ด', () => {
  assert.equal(amountInWords(10, 'th'), 'สิบบาทถ้วน'); // ไม่ใช่ "หนึ่งสิบ"
  assert.equal(amountInWords(11, 'th'), 'สิบเอ็ดบาทถ้วน');
  assert.equal(amountInWords(20, 'th'), 'ยี่สิบบาทถ้วน'); // ไม่ใช่ "สองสิบ"
  assert.equal(amountInWords(21, 'th'), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(amountInWords(101, 'th'), 'หนึ่งร้อยเอ็ดบาทถ้วน');
});

// กฎ "เอ็ด" ผูกกับทั้งจำนวน ไม่ใช่กลุ่มหกหลัก — เคสนี้พังได้ง่ายถ้าอ่านทีละกลุ่มแยกกัน
test('ไทย: เอ็ด ข้ามหลักล้าน', () => {
  assert.equal(amountInWords(1000001, 'th'), 'หนึ่งล้านเอ็ดบาทถ้วน');
  assert.equal(amountInWords(2000000, 'th'), 'สองล้านบาทถ้วน');
  assert.equal(amountInWords(1000000000000, 'th'), 'หนึ่งล้านล้านบาทถ้วน');
});

test('ไทย: สตางค์', () => {
  assert.equal(amountInWords(25.5, 'th'), 'ยี่สิบห้าบาทห้าสิบสตางค์');
  assert.equal(amountInWords(1.01, 'th'), 'หนึ่งบาทหนึ่งสตางค์');
  assert.equal(amountInWords(0.75, 'th'), 'เจ็ดสิบห้าสตางค์');
});

// ใบยอดศูนย์/ใบให้ฟรีมีจริงในระบบ (ดูคอมเมนต์ salesOrderPrint.js) — ห้ามคืนสตริงว่าง
test('ยอดศูนย์และค่าที่ใช้ไม่ได้ ต้องยังอ่านออก', () => {
  assert.equal(amountInWords(0, 'th'), 'ศูนย์บาทถ้วน');
  assert.equal(amountInWords(0, 'en'), 'Zero Baht Only');
  assert.equal(amountInWords(null, 'th'), 'ศูนย์บาทถ้วน');
  assert.equal(amountInWords(Number.NaN, 'th'), 'ศูนย์บาทถ้วน');
});

test('อังกฤษ: หลักและยัติภังค์', () => {
  assert.equal(amountInWords(234567, 'en'), 'Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Baht Only');
  assert.equal(amountInWords(1000000, 'en'), 'One Million Baht Only');
  assert.equal(amountInWords(15, 'en'), 'Fifteen Baht Only');
});

test('อังกฤษ: สตางค์ต่อท้ายก่อน Only', () => {
  assert.equal(amountInWords(25.5, 'en'), 'Twenty-Five Baht and Fifty Satang Only');
  assert.equal(amountInWords(0.75, 'en'), 'Seventy-Five Satang Only');
});

// ปัดเศษต้องตรงกับ money() ที่พิมพ์ตัวเลข ไม่งั้นตัวอักษรขัดกับตัวเลขบนใบเดียวกัน
test('ปัดสตางค์แบบเดียวกับตัวเลขบนใบ', () => {
  assert.equal(amountInWords(0.005, 'th'), 'หนึ่งสตางค์');
  assert.equal(amountInWords(99.999, 'th'), 'หนึ่งร้อยบาทถ้วน');
});

test('ยอดติดลบ', () => {
  assert.equal(amountInWords(-50, 'th'), 'ลบห้าสิบบาทถ้วน');
  assert.equal(amountInWords(-50, 'en'), 'Minus Fifty Baht Only');
});
