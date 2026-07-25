import test from 'node:test';
import assert from 'node:assert/strict';

import {
  productBrandName,
  productDisplayName,
  productIdentity,
  productVolumeLabel,
} from './productIdentity.js';

test('product identity shows one preferred language but searches both languages', () => {
  const product = {
    fgCode: 'FG-000-01-002-0000',
    brandName: 'เซนท์ แอนด์ เซนส์',
    brandNameEn: 'SCENT AND SENSE',
    productDescription: 'สินค้าเซนท์ แอนด์ เซนส์',
    productDescriptionEn: 'SCENT AND SENSE PRODUCT',
    volume: 30,
    volumeUnit: 'ml',
  };
  const identity = productIdentity(product);
  assert.equal(identity.meta, 'FG-000-01-002-0000 · SCENT AND SENSE');
  assert.equal(identity.detail, 'สินค้าเซนท์ แอนด์ เซนส์ · 30 ml');
  assert.equal(identity.text, 'FG-000-01-002-0000 · SCENT AND SENSE · สินค้าเซนท์ แอนด์ เซนส์ · 30 ml');
  assert.match(identity.search, /เซนท์ แอนด์ เซนส์/);
  assert.match(identity.search, /SCENT AND SENSE PRODUCT/);
});

test('product identity fallbacks are EN→TH for brand and TH→EN for product', () => {
  assert.equal(productBrandName({ brandName: 'แบรนด์ไทย' }), 'แบรนด์ไทย');
  assert.equal(productDisplayName({ productDescriptionEn: 'English product' }), 'English product');
  assert.equal(productVolumeLabel({ volume: 0, volumeUnit: 'g' }), '0 g');
  assert.equal(productIdentity({}).text, '-');
});

test('quotation line snapshot brand is preferred without duplicating languages', () => {
  const identity = productIdentity({
    fgCode: 'FG-1',
    description: 'สินค้าฉบับตรึง · 50 ml',
    metadata: { productBrand: 'OFFICIAL BRAND' },
  });
  assert.equal(identity.meta, 'FG-1 · OFFICIAL BRAND');
  assert.equal(identity.detail, 'สินค้าฉบับตรึง · 50 ml');
});
