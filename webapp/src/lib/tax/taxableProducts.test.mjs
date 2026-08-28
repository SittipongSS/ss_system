import test from 'node:test';
import assert from 'node:assert/strict';
import { isMissingRetailPrice, isProductExciseTaxable, missingRetailPriceProducts } from './taxableProducts.js';

/* หมวด 01-002 = น้ำหอม (ติ๊ก isExcise) · 03-001 = ไม่เสียภาษี
   ⚠️ รหัสหมวดที่ระบบเก็บคือ `mainCategoryCode-typeCode` ไม่ใช่ `typeCode` เดี่ยว
   (ทะเบียนมี typeCode ซ้ำข้ามหมวดหลักได้ — ดู categoryRow ใน master/categoryOf.js) */
const TYPES = [
  { mainCategoryCode: '01', typeCode: '002', isExcise: true },
  { mainCategoryCode: '03', typeCode: '001', isExcise: false },
];

test('ธงรายตัวชนะหมวดเสมอ — ทั้งสองทาง', () => {
  // ฝ่าย RA บังคับให้เสีย แม้หมวดไม่ติ๊ก
  assert.equal(isProductExciseTaxable({ categoryCode: '03-001', isExciseTaxable: true }, TYPES), true);
  // ฝ่าย RA ยกเว้น แม้หมวดติ๊ก
  assert.equal(isProductExciseTaxable({ categoryCode: '01-002', isExciseTaxable: false }, TYPES), false);
});

test('ไม่มีธงรายตัว → ตามหมวด', () => {
  assert.equal(isProductExciseTaxable({ categoryCode: '01-002' }, TYPES), true);
  assert.equal(isProductExciseTaxable({ categoryCode: '03-001' }, TYPES), false);
  assert.equal(isProductExciseTaxable({ categoryCode: '01-002', isExciseTaxable: null }, TYPES), true);
});

/* 🐞 นิยามเดิมบนหน้าสินค้าคือ `isExciseTaxable !== false` เฉย ๆ ⇒ สินค้าหมวดที่
   **ไม่เสียภาษี** และไม่มีธงรายตัว จะถูกนับว่า "ต้องเสียภาษี" ทั้งหมด
   การ์ดบนหน้าสินค้าจึงโป่งกว่ารายงานมาตลอด */
test('สินค้าหมวดที่ไม่เสียภาษีและไม่มีธง ต้องไม่ถูกนับว่าเสียภาษี', () => {
  const p = { categoryCode: '03-001' };
  assert.equal(p.isExciseTaxable !== false, true, 'นิยามเดิมตอบว่าเสีย (นี่คือบั๊ก)');
  assert.equal(isProductExciseTaxable(p, TYPES), false, 'นิยามที่ถูกต้องตอบว่าไม่เสีย');
});

test('หมวดที่ไม่รู้จัก / ไม่มีทะเบียนหมวด = ไม่เสียภาษี', () => {
  assert.equal(isProductExciseTaxable({ categoryCode: '99-999' }, TYPES), false);
  assert.equal(isProductExciseTaxable({ categoryCode: '01-002' }, []), false);
  assert.equal(isProductExciseTaxable(null, TYPES), false);
});

test('ขาดราคาขายปลีก = ต้องเสียภาษี + ไม่มีราคา', () => {
  const base = { categoryCode: '01-002' };
  assert.equal(isMissingRetailPrice({ ...base }, TYPES), true, 'ไม่มีช่องราคาเลย');
  assert.equal(isMissingRetailPrice({ ...base, retailPriceIncVat: null }, TYPES), true);
  assert.equal(isMissingRetailPrice({ ...base, retailPriceIncVat: 0 }, TYPES), true, '0 ไม่ใช่ราคา');
  assert.equal(isMissingRetailPrice({ ...base, retailPriceIncVat: -5 }, TYPES), true, 'ติดลบไม่ใช่ราคา');
  assert.equal(isMissingRetailPrice({ ...base, retailPriceIncVat: 110 }, TYPES), false);
});

/* สินค้าที่ไม่ต้องเสียภาษีไม่ต้องมีราคาขายปลีก — ไม่ควรโผล่ในรายการให้ตามเก็บ */
test('สินค้าที่ยกเว้นภาษีไม่นับว่าขาดราคา แม้ไม่มีราคาจริง', () => {
  assert.equal(isMissingRetailPrice({ categoryCode: '01-002', isExciseTaxable: false }, TYPES), false);
  assert.equal(isMissingRetailPrice({ categoryCode: '03-001' }, TYPES), false);
});

test('ตัวกรองทั้งลิสต์ทำงาน และไม่ระเบิดกับค่าว่าง', () => {
  const products = [
    { id: 'a', categoryCode: '01-002' },                              // ขาด
    { id: 'b', categoryCode: '01-002', retailPriceIncVat: 110 },      // ครบ
    { id: 'c', categoryCode: '03-001' },                              // ไม่เสียภาษี
    { id: 'd', categoryCode: '03-001', isExciseTaxable: true },       // บังคับเสีย → ขาด
  ];
  assert.deepEqual(missingRetailPriceProducts(products, TYPES).map((p) => p.id), ['a', 'd']);
  assert.deepEqual(missingRetailPriceProducts([], TYPES), []);
  assert.deepEqual(missingRetailPriceProducts(undefined, TYPES), []);
});
