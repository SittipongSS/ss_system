import test from 'node:test';
import assert from 'node:assert/strict';

import { brandDisplayFromList, brandLabel } from './brands.js';

test('system brand labels render EN before TH', () => {
  assert.equal(brandLabel('วันซ์อะพอนอะไทย', 'Once Upon A Thai'), 'Once Upon A Thai · วันซ์อะพอนอะไทย');
  assert.equal(brandLabel('แบรนด์ไทย', ''), 'แบรนด์ไทย');
  assert.equal(brandLabel('', 'English Brand'), 'English Brand');
});

test('legacy single-language values resolve through the customer brand master', () => {
  const brands = [{ th: 'วันซ์อะพอนอะไทย', en: 'Once Upon A Thai' }];
  assert.equal(brandDisplayFromList(brands, 'วันซ์อะพอนอะไทย'), 'Once Upon A Thai · วันซ์อะพอนอะไทย');
  assert.equal(brandDisplayFromList(brands, 'Once Upon A Thai'), 'Once Upon A Thai · วันซ์อะพอนอะไทย');
  assert.equal(brandDisplayFromList(brands, 'Legacy'), 'Legacy');
});
