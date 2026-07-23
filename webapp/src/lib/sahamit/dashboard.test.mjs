// Tests for the SAHAMIT dashboard pure derivations (filters + unit + KPI).
// Run: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fgCodeFilterSet, filterRoundsByFg, filterPosByFg,
  categoryOptions, volumeOptions, priceMap, unitMultiplier, dashboardKpis,
} from './dashboard.js';

const PRODUCTS = [
  { fgCode: 'A', category: 'Lotion', volume: 250, price: 10 },
  { fgCode: 'B', category: 'Lotion', volume: 500, price: 20 },
  { fgCode: 'C', category: 'Perfume', volume: 30, price: null }, // unpriced
];
const ROUNDS = [
  { roundNo: 1, lines: [
    { fgCode: 'A', month: '2026-01', qty: 100, productName: 'A' },
    { fgCode: 'B', month: '2026-01', qty: 50, productName: 'B' },
  ] },
];
const POS = [
  { id: 'p1', lines: [
    { fgCode: 'A', month: '2026-01', qty: 100, status: 'open', expectedDate: '2026-01-15' },
    { fgCode: 'B', month: '2026-01', qty: 40, status: 'open', expectedDate: '2026-01-15' },
  ] },
];

test('fgCodeFilterSet: no filter → null (means all, keeps unknown codes)', () => {
  assert.equal(fgCodeFilterSet(PRODUCTS, {}), null);
  assert.equal(fgCodeFilterSet(PRODUCTS, { category: 'All', volume: 'All', fgCode: 'All' }), null);
});

test('fgCodeFilterSet: category filter narrows to matching fgCodes (lowercased)', () => {
  const set = fgCodeFilterSet(PRODUCTS, { category: 'Lotion' });
  assert.deepEqual([...set].sort(), ['a', 'b']);
});

test('fgCodeFilterSet: volume + category combine (AND)', () => {
  const set = fgCodeFilterSet(PRODUCTS, { category: 'Lotion', volume: 250 });
  assert.deepEqual([...set], ['a']);
});

test('filterRoundsByFg / filterPosByFg drop lines outside the set, keep shape', () => {
  const set = fgCodeFilterSet(PRODUCTS, { category: 'Lotion', volume: 250 }); // {a}
  const fr = filterRoundsByFg(ROUNDS, set);
  assert.equal(fr[0].lines.length, 1);
  assert.equal(fr[0].lines[0].fgCode, 'A');
  const fp = filterPosByFg(POS, set);
  assert.equal(fp[0].lines.length, 1);
  assert.equal(fp[0].lines[0].fgCode, 'A');
});

test('filter passthrough when set is null (no filter)', () => {
  assert.equal(filterRoundsByFg(ROUNDS, null), ROUNDS);
  assert.equal(filterPosByFg(POS, null), POS);
});

test('categoryOptions / volumeOptions: unique, sorted, All first', () => {
  assert.deepEqual(categoryOptions(PRODUCTS), ['All', 'Lotion', 'Perfume']);
  assert.deepEqual(volumeOptions(PRODUCTS), ['All', 30, 250, 500]);
});

test('priceMap + unitMultiplier: qty→1, value→price (null price→0)', () => {
  const m = priceMap(PRODUCTS);
  assert.equal(m.get('a'), 10);
  assert.equal(m.get('c'), null);
  const q = unitMultiplier(PRODUCTS, 'qty');
  assert.equal(q('A'), 1);
  const v = unitMultiplier(PRODUCTS, 'value');
  assert.equal(v('A'), 10);
  assert.equal(v('C'), 0); // unpriced → 0
});

test('dashboardKpis qty: totals & statuses across all SKUs', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'qty' });
  assert.equal(k.fcTotal, 150);          // A100 + B50 (peak)
  assert.equal(k.poTotal, 140);          // A100 + B40
  // A: fc100=po100 → match ; B: fc50>po40 (po>0) → discrepancy
  assert.equal(k.statusCounts.match, 1);
  assert.equal(k.statusCounts.discrepancy, 1);
  assert.equal(k.alertCount, 1);         // discrepancy(1) + pending(0) + unforecasted(0)
  assert.equal(Math.round((k.poTotal / k.fcTotal) * 100), k.coveragePct);
});

test('dashboardKpis value: multiplies by price, coverage in ฿', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'value' });
  assert.equal(k.fcTotal, 100 * 10 + 50 * 20); // 2000
  assert.equal(k.poTotal, 100 * 10 + 40 * 20); // 1800
  assert.equal(k.coveragePct, 90);
});

test('dashboardKpis respects filter (Lotion 250 → only A)', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'qty', filter: { category: 'Lotion', volume: 250 } });
  assert.equal(k.fcTotal, 100);
  assert.equal(k.poTotal, 100);
  assert.equal(k.statusCounts.match, 1);
  assert.equal(k.statusCounts.discrepancy, undefined);
});
