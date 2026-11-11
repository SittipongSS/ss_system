// สัญญาของ route ทะเบียนสินค้าเรื่อง "ธงเสียภาษี" — ตรรกะอยู่ใน handler ที่ยังเรียกตรง ๆ
// ไม่ได้ จึงล็อกด้วยการอ่าน source (แพตเทิร์นเดียวกับ registrationRoute.test.mjs)
//
// 🐞 บั๊กจริง: PATCH เคยเขียน `const isExciseTaxable = (await categoryFlagsOf(...)).isExcise`
// = คิดใหม่จากธงของหมวดล้วนทุกครั้งที่บันทึก ⇒ **การยกเว้นรายตัวของฝ่าย RA
// (taxableOverride) หายทันทีที่มีคนแก้อะไรก็ตามในสินค้า** แม้แต่แก้ชื่อ
//
// ทำไมถึงเป็นเรื่องเงิน: product.exciseTax ถูกใช้เป็น **อัตราจริง** ตอนสร้างใบยื่นจาก
// ใบสั่งขาย (lib/excise/soFiling.js) ⇒ override หาย = เก็บภาษีจากสินค้าที่ถูกยกเว้น
// ไปแล้ว โดยไม่มีใครสั่งและไม่มีอะไรฟ้อง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะโค้ดจริง — คอมเมนต์ที่อธิบายบั๊กเดิมต้องพูดถึง
// สูตรเก่าได้โดยไม่ทำให้เทสต์แดงเอง
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const patchRoute = read('../../app/api/products/[id]/route.js');
const createRoute = read('../../app/api/products/route.js');
const soFiling = read('../excise/soFiling.js');

const productExcise = read('../excise/productExcise.js');

test('ทั้งตอนสร้างและตอนแก้ ตัดสินธงเสียภาษีด้วยกติกาตัวเดียวกัน', () => {
  /* 11/11 (ชุดของขวัญ · mig 0430): สอง route เรียกตัวคิดกลางตัวเดียว `productExciseFields` ซึ่งใช้ resolveProductTaxable ข้างใน
     — ไม่ใช่ต่างคนต่างเขียนสูตร (เดิม "ต้องเป็นสูตรเดียวกับตอนสร้าง" ลอกกันสองที่) */
  for (const [label, src] of [['PATCH', patchRoute], ['POST', createRoute]]) {
    assert.match(codeOnly(src), /await productExciseFields\(\{/, `${label} ต้องใช้ตัวคิดกลาง`);
    assert.doesNotMatch(codeOnly(src), /productTaxRates\(|resolveProductTaxable\(/, `${label} ห้ามคิดธง/อัตราเองข้างตัวคิดกลาง`);
  }
  assert.match(codeOnly(productExcise), /resolveProductTaxable\(\{ taxableOverride, autoTaxable \}\)/, 'ตัวคิดกลางใช้กติกากลาง (override ของ RA ชนะ)');
  assert.match(codeOnly(patchRoute), /taxableOverride: updated\.taxableOverride/, 'PATCH ส่ง override ที่ตรึงบนสินค้าเข้าไปเสมอ');
});

test('PATCH ห้ามคิดธงเสียภาษีใหม่จากหมวดล้วน — override ของฝ่าย RA จะหาย', () => {
  assert.doesNotMatch(
    codeOnly(patchRoute),
    /isExciseTaxable\s*=\s*\(await categoryFlagsOf\([^)]*\)\)\.isExcise/,
    'บรรทัดเดิมห้ามกลับมา — ทำให้การยกเว้นรายตัวหายทุกครั้งที่บันทึกสินค้า',
  );
});

test('อัตราภาษีตอนออกใบยื่นจากใบสั่งขาย ยังอ่านจากทะเบียนสินค้า (เหตุผลที่บั๊กนี้เป็นเรื่องเงิน)', () => {
  assert.match(codeOnly(soFiling), /exciseRatePerUnit:\s*product\.exciseTax/);
});
