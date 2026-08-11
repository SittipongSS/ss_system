import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductName,
  productDuplicateWarning,
  productNameMatches,
  productOtherSizeHint,
  sizeKeyOf,
  splitProductMatches,
} from './productDuplicate.js';

// แถวจริงจากแคตตาล็อก (ชื่อเดียวกัน คนละขนาด = คนละ SKU ที่ถูกต้อง)
const ROWS = [
  {
    id: 'PRD-1', fgCode: 'FG-559-01-002-1482', volume: 30, volumeUnit: 'ml',
    productDescription: 'เกล็น โอ เดอ พาร์ฟูม', productDescriptionEn: 'Glenn Eau De Parfum',
  },
  {
    id: 'PRD-2', fgCode: 'FG-559-01-002-1485', volume: 5, volumeUnit: 'ml',
    productDescription: 'เกล็น โอ เดอ พาร์ฟูม', productDescriptionEn: 'Glenn Eau De Parfum',
  },
  {
    id: 'PRD-3', fgCode: 'FG-559-01-002-1481', volume: 30, volumeUnit: 'ml',
    productDescription: 'ออน พอยท์ โอ เดอ พาร์ฟูม', productDescriptionEn: 'On Point Eau De Parfum',
  },
];

test('เทียบชื่อแบบไม่สนตัวพิมพ์และช่องว่างซ้ำ', () => {
  assert.equal(normalizeProductName('  Glenn   Eau De  PARFUM '), 'glenn eau de parfum');
  assert.equal(normalizeProductName(null), '');
});

test('ขนาดเทียบเป็นตัวเลข หน่วยไม่สนตัวพิมพ์', () => {
  assert.equal(sizeKeyOf({ volume: '50.0', volumeUnit: 'ML' }), sizeKeyOf({ volume: 50, volumeUnit: 'ml' }));
  assert.equal(sizeKeyOf({ volume: '', volumeUnit: 'ml' }), null);
  assert.equal(sizeKeyOf({ volume: 0, volumeUnit: 'ml' }), null);
});

test('ชื่อตรงภาษาใดภาษาหนึ่งก็นับว่าตรง · ชื่อว่างไม่นับ', () => {
  assert.equal(productNameMatches({ productDescriptionEn: 'glenn eau de parfum' }, ROWS[0]), true);
  assert.equal(productNameMatches({ productDescription: 'เกล็น โอ เดอ พาร์ฟูม' }, ROWS[0]), true);
  assert.equal(productNameMatches({ productDescription: 'ชื่ออื่น' }, ROWS[0]), false);
  // 🐞 ถ้าไม่กันชื่อว่าง สินค้าทุกตัวที่ยังไม่มีชื่ออังกฤษจะซ้ำกันหมด
  assert.equal(productNameMatches({ productDescription: '', productDescriptionEn: '' }, ROWS[0]), false);
  assert.equal(
    productNameMatches({ productDescriptionEn: '' }, { productDescription: 'ก', productDescriptionEn: '' }),
    false,
  );
});

test('ชื่อ + ขนาดตรง = ซ้ำจริง · ชื่อตรงแต่คนละขนาด = คนละ SKU', () => {
  const hit = splitProductMatches(ROWS, {
    productDescriptionEn: 'Glenn Eau De Parfum', volume: '30', volumeUnit: 'ml',
  });
  assert.deepEqual(hit.sameSize.map((r) => r.fgCode), ['FG-559-01-002-1482']);
  assert.deepEqual(hit.otherSize.map((r) => r.fgCode), ['FG-559-01-002-1485']);

  const newSize = splitProductMatches(ROWS, {
    productDescriptionEn: 'Glenn Eau De Parfum', volume: '100', volumeUnit: 'ml',
  });
  assert.deepEqual(newSize.sameSize, []);
  assert.equal(newSize.otherSize.length, 2);
});

test('ยังไม่กรอกขนาด = ยังไม่ฟันธงว่าซ้ำ (แต่ยังบอกได้ว่าชื่อนี้มีอยู่)', () => {
  const hit = splitProductMatches(ROWS, { productDescriptionEn: 'Glenn Eau De Parfum', volume: '' });
  assert.deepEqual(hit.sameSize, []);
  assert.equal(hit.otherSize.length, 2);
});

test('โหมดแก้ต้องไม่รายงานว่าซ้ำกับตัวเอง', () => {
  const hit = splitProductMatches(
    ROWS,
    { productDescriptionEn: 'Glenn Eau De Parfum', volume: 30, volumeUnit: 'ml' },
    { excludeId: 'PRD-1' },
  );
  assert.deepEqual(hit.sameSize, []);
});

test('ข้อความเตือนบอกรหัส FG ที่ชน · ข้อความขนาดอื่นไม่ใช่คำเตือน', () => {
  const warning = productDuplicateWarning([ROWS[0]]);
  assert.match(warning, /FG-559-01-002-1482/);
  assert.match(warning, /30 ml/);
  assert.equal(productDuplicateWarning([]), null);

  const hint = productOtherSizeHint([ROWS[0], ROWS[1]]);
  assert.match(hint, /30 ml/);
  assert.match(hint, /5 ml/);
  assert.match(hint, /ตามปกติ/);
  assert.equal(productOtherSizeHint([]), null);
});
