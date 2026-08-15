// Tests ด่าน "ยื่นขึ้นทะเบียนได้หรือยัง" เฉพาะส่วนราคาขายปลีก. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { missingRetailPriceEntry } from './requirements.js';

const reg = (over = {}) => ({ id: 'REG-1', productId: 'PRD-1', isExciseTaxable: true, ...over });

test('มีราคาขายปลีกแล้ว → ไม่ขาดอะไร', () => {
  assert.equal(missingRetailPriceEntry(reg(), { fgCode: 'FG-1', retailPriceIncVat: 107 }), null);
});

test('ไม่มีราคา / เป็น 0 / ติดลบ → บล็อกการยื่น พร้อมบอกรหัส FG', () => {
  for (const retailPriceIncVat of [null, undefined, 0, '', -5]) {
    const entry = missingRetailPriceEntry(reg(), { fgCode: 'FG-109-01-002-0340', retailPriceIncVat });
    assert.ok(entry, `ควรบล็อกเมื่อราคาเป็น ${JSON.stringify(retailPriceIncVat)}`);
    assert.equal(entry.entity, 'product');
    assert.match(entry.label, /FG-109-01-002-0340/);
    assert.match(entry.label, /ราคาขายปลีก/);
  }
});

test('ฝ่ายกฎหมายยกเว้นภาษีไว้ → ไม่ต้องมีราคา (ภาษี 0 เพราะยกเว้นจริง ไม่ใช่ข้อมูลขาด)', () => {
  assert.equal(missingRetailPriceEntry(reg({ isExciseTaxable: false }), { retailPriceIncVat: null }), null);
});

test('ทะเบียนที่ไม่ผูกสินค้า → ข้ามด่านนี้ (มีด่านอื่นจับอยู่แล้ว)', () => {
  assert.equal(missingRetailPriceEntry(reg({ productId: null }), null), null);
});

test('หาสินค้าไม่เจอ → ถือว่าขาดราคา ไม่ใช่ปล่อยผ่าน', () => {
  // ยื่นทะเบียนที่ชี้สินค้าซึ่งหาไม่เจอ = ยังพิสูจน์ไม่ได้ว่ามีฐานภาษี ⇒ ต้องบล็อก
  assert.ok(missingRetailPriceEntry(reg(), null));
});
