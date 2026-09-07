import test from 'node:test';
import assert from 'node:assert/strict';
import { productSelectOptions } from './productOption.js';

const products = [{
  id: 'PRODUCT-ID-1',
  fgCode: 'FG-000-01-002-0000',
  brandName: 'เซนท์ แอนด์ เซนส์',
  brandNameEn: 'SCENT AND SENSE',
  productDescription: 'สินค้าเซนท์ แอนด์ เซนส์',
  productDescriptionEn: 'Scent Product',
  volume: 30,
  volumeUnit: 'ml',
}];

test('product options keep stable link values while showing one preferred identity', () => {
  const [option] = productSelectOptions(products);
  assert.equal(option.value, 'PRODUCT-ID-1');
  assert.equal(
    option.label,
    'FG-000-01-002-0000 · SCENT AND SENSE · สินค้าเซนท์ แอนด์ เซนส์ · 30 ml',
  );
  assert.match(option.search, /เซนท์ แอนด์ เซนส์/);
  assert.match(option.search, /SCENT AND SENSE/);
  assert.match(option.search, /Scent Product/);
});

test('modules that link by FG can opt into FG values without changing display rules', () => {
  const [option] = productSelectOptions(products, (product) => product.fgCode);
  assert.equal(option.value, 'FG-000-01-002-0000');
  assert.match(option.label, /^FG-000-01-002-0000 · SCENT AND SENSE/);
});

/* ⭐ FG ของใบลูกค้าอื่นในนิติบุคคลเดียวกัน (มติผู้ใช้ 2026-09-07) — ลิสต์เรียงตามรหัส
   FG ปนกันทุกเจ้าของ ป้ายนี้จึงเป็นสัญญาณเดียวที่บอกว่าหยิบข้ามใบ */
test('FG ข้ามใบลูกค้ามีป้ายเจ้าของบนบรรทัดรหัส และค้นเจอทั้งรหัส AR และชื่อบริษัท', () => {
  const [option] = productSelectOptions([{
    ...products[0],
    ownerArCode: 'AR-148',
    ownerName: 'บริษัท ไวท์ วูด กรีน จำกัด',
    ownerBranchCode: '00000',
  }]);
  assert.match(option.label, /AR-148 · สาขา 00000/);
  assert.match(option.search, /AR-148/);
  assert.match(option.search, /ไวท์ วูด กรีน/);
});

test('FG ของใบลูกค้าตัวเอง = ไม่มีป้าย (ป้ายต้องแปลว่า "ข้ามใบ" เท่านั้น)', () => {
  const [option] = productSelectOptions(products);
  assert.doesNotMatch(option.label, /สาขา/);
});
