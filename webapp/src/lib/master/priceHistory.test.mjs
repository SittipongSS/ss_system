import { test } from 'node:test';
import assert from 'node:assert';
import { hasPriceChange } from './priceHistory';

test('hasPriceChange ignores non-price field changes', () => {
  assert.equal(
    hasPriceChange(
      { costPrice: 10, retailPriceIncVat: 20, productDescription: 'Old' },
      { costPrice: 10, retailPriceIncVat: 20, productDescription: 'New' }
    ),
    false
  );
});

test('hasPriceChange detects current and derived price changes', () => {
  assert.equal(hasPriceChange({ costPrice: 10 }, { costPrice: 11 }), true);
  assert.equal(hasPriceChange({ exciseTax: 1.5 }, { exciseTax: 2 }), true);
});

test('hasPriceChange treats null and blank as equivalent missing values', () => {
  assert.equal(hasPriceChange({ costPrice: null }, { costPrice: '' }), false);
});
