// Tests for the SAHAMIT dashboard pure derivations (multi-select filters +
// year filter + unit + KPI). Run: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fgCodeFilterSet, filterRoundsByFg, filterPosByFg,
  categoryOptions, volumeOptions, yearOptions, priceMap, unitMultiplier, dashboardKpis,
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

test('fgCodeFilterSet: all empty → null (means all, keeps unknown codes)', () => {
  assert.equal(fgCodeFilterSet(PRODUCTS, {}), null);
  assert.equal(fgCodeFilterSet(PRODUCTS, { cats: [], vols: [], skus: [] }), null);
});

test('fgCodeFilterSet: category multi-select narrows to matching fgCodes (lowercased)', () => {
  assert.deepEqual([...fgCodeFilterSet(PRODUCTS, { cats: ['Lotion'] })].sort(), ['a', 'b']);
  assert.deepEqual([...fgCodeFilterSet(PRODUCTS, { cats: ['Lotion', 'Perfume'] })].sort(), ['a', 'b', 'c']);
});

test('fgCodeFilterSet: volume (string) + category combine (AND across dims)', () => {
  const set = fgCodeFilterSet(PRODUCTS, { cats: ['Lotion'], vols: ['250'] });
  assert.deepEqual([...set], ['a']);
});

test('fgCodeFilterSet: multiple volumes = OR within the dimension', () => {
  assert.deepEqual([...fgCodeFilterSet(PRODUCTS, { vols: ['250', '500'] })].sort(), ['a', 'b']);
});

test('filterRoundsByFg / filterPosByFg drop lines outside the set, keep shape', () => {
  const set = fgCodeFilterSet(PRODUCTS, { cats: ['Lotion'], vols: ['250'] }); // {a}
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

test('categoryOptions / volumeOptions: unique, sorted (no All prefix — FilterPopover adds none)', () => {
  assert.deepEqual(categoryOptions(PRODUCTS), ['Lotion', 'Perfume']);
  assert.deepEqual(volumeOptions(PRODUCTS), [30, 250, 500]);
});

test('yearOptions: years present from FC month + PO delivery month, sorted', () => {
  const rounds = [{ lines: [{ fgCode: 'A', month: '2025-12', qty: 1 }, { fgCode: 'A', month: '2026-01', qty: 1 }] }];
  const pos = [{ lines: [{ fgCode: 'A', qty: 1, expectedDate: '2027-01-10' }] }];
  assert.deepEqual(yearOptions(rounds, pos), ['2025', '2026', '2027']);
});

test('priceMap + unitMultiplier: qty→1, value→price (null price→0)', () => {
  const m = priceMap(PRODUCTS);
  assert.equal(m.get('a'), 10);
  assert.equal(m.get('c'), null);
  assert.equal(unitMultiplier(PRODUCTS, 'qty')('A'), 1);
  assert.equal(unitMultiplier(PRODUCTS, 'value')('A'), 10);
  assert.equal(unitMultiplier(PRODUCTS, 'value')('C'), 0); // unpriced → 0
});

test('dashboardKpis qty: totals & statuses across all SKUs', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'qty' });
  assert.equal(k.fcTotal, 150);          // A100 + B50 (peak)
  assert.equal(k.poTotal, 140);          // A100 + B40
  // A: fc100=po100 → match ; B: fc50>po40 (po>0) → discrepancy
  assert.equal(k.statusCounts.match, 1);
  assert.equal(k.statusCounts.discrepancy, 1);
  assert.equal(k.alertCount, 1);         // discrepancy(1) + pending(0) + unforecasted(0)
});

test('dashboardKpis value: multiplies by price, coverage in ฿', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'value' });
  assert.equal(k.fcTotal, 100 * 10 + 50 * 20); // 2000
  assert.equal(k.poTotal, 100 * 10 + 40 * 20); // 1800
  assert.equal(k.coveragePct, 90);
});

test('dashboardKpis respects fg filter (Lotion 250 → only A)', () => {
  const k = dashboardKpis(ROUNDS, POS, [], PRODUCTS, { unit: 'qty', filter: { cats: ['Lotion'], vols: ['250'] } });
  assert.equal(k.fcTotal, 100);
  assert.equal(k.poTotal, 100);
  assert.equal(k.statusCounts.match, 1);
  assert.equal(k.statusCounts.discrepancy, undefined);
});

test('dashboardKpis year filter: only counts months in selected years', () => {
  const rounds = [{ roundNo: 1, lines: [
    { fgCode: 'A', month: '2025-12', qty: 30, productName: 'A' },
    { fgCode: 'A', month: '2026-01', qty: 100, productName: 'A' },
  ] }];
  const pos = [{ id: 'p1', lines: [
    { fgCode: 'A', qty: 30, status: 'open', expectedDate: '2025-12-10' },
    { fgCode: 'A', qty: 100, status: 'open', expectedDate: '2026-01-10' },
  ] }];
  const all = dashboardKpis(rounds, pos, [], PRODUCTS, { unit: 'qty' });
  assert.equal(all.fcTotal, 130);
  const y26 = dashboardKpis(rounds, pos, [], PRODUCTS, { unit: 'qty', years: ['2026'] });
  assert.equal(y26.fcTotal, 100);       // 2025-12 column hidden
  assert.equal(y26.poTotal, 100);
});
