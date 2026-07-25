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
