import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  median,
  yoyGrowths,
  projectTarget,
  splitByProportion,
  seasonalProfile,
  distributeBySeasonal,
  normalizeToPercent,
} from './salesForecast';

test('median handles odd and even counts', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test('yoyGrowths skips years with a zero base', () => {
  assert.deepEqual(yoyGrowths([90, 200]), [200 / 90 - 1]);
  assert.deepEqual(yoyGrowths([0, 100, 150]), [0.5]); // 0→100 skipped, 100→150 kept
});

test('projectTarget damps growth to the cap for the base but not the stretch', () => {
  // User's example: 2568 target 80 actual 90, 2569 target 100 actual 200.
  const p = projectTarget([
    { year: 2568, target: 80, actual: 90 },
    { year: 2569, target: 100, actual: 200 },
  ], { cap: 0.3 });
  assert.equal(p.hasData, true);
  assert.equal(p.lastActual, 200);
  assert.ok(Math.abs(p.rawGrowth - (200 / 90 - 1)) < 1e-9);
  assert.equal(p.dampedGrowth, 0.3);
  assert.equal(p.base, 260);          // 200 × 1.30
  assert.equal(p.conservative, 230);  // 200 × 1.15
  assert.equal(p.stretch, Math.round(200 * (1 + (200 / 90 - 1)))); // 444 full trend
  assert.equal(p.attainment, 2);      // sold 200 vs target 100
});

test('projectTarget returns no-data shape when there are no actuals', () => {
  const p = projectTarget([{ year: 2569, target: 100, actual: 0 }]);
  assert.equal(p.hasData, false);
  assert.equal(p.base, 0);
});

test('projectTarget keeps stretch at or above base when the trend declines', () => {
  const p = projectTarget([
    { year: 2567, target: 0, actual: 200 },
    { year: 2568, target: 0, actual: 100 },
  ], { cap: 0.3 });
  assert.ok(p.stretch >= p.base);
});

test('splitByProportion divides by weight and the last node absorbs the remainder', () => {
  const parts = splitByProportion(300, [
    { key: 'ODM', weight: 100 },
    { key: 'KA', weight: 60 },
    { key: 'SV', weight: 40 },
  ]);
  assert.deepEqual(parts, [
    { key: 'ODM', amount: 150 },
    { key: 'KA', amount: 90 },
    { key: 'SV', amount: 60 },
  ]);
  assert.equal(parts.reduce((s, p) => s + p.amount, 0), 300);
});

test('splitByProportion falls back to an even split when weights are all zero', () => {
  const parts = splitByProportion(100, [{ key: 'a', weight: 0 }, { key: 'b', weight: 0 }, { key: 'c', weight: 0 }]);
  assert.equal(parts.reduce((s, p) => s + p.amount, 0), 100);
  assert.equal(parts[2].amount, 100 - parts[0].amount - parts[1].amount);
});

test('seasonalProfile derives fractions that sum to 1, flat when empty', () => {
  const prof = seasonalProfile([10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10]);
  assert.ok(Math.abs(prof.reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.equal(prof[0], 0.5);
  const flat = seasonalProfile([]);
  assert.ok(Math.abs(flat[0] - 1 / 12) < 1e-9);
});

test('distributeBySeasonal spreads by profile and sums back to the annual amount', () => {
  const prof = seasonalProfile([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  const months = distributeBySeasonal(1200, prof);
  assert.equal(months.reduce((s, v) => s + v, 0), 1200);
  assert.ok(months[0] > months[1]); // January weighted heavier than February
});

test('distributeBySeasonal with a flat profile is an even split with December remainder', () => {
  const months = distributeBySeasonal(1000, Array(12).fill(1 / 12));
  assert.equal(months.reduce((s, v) => s + v, 0), 1000);
});

test('normalizeToPercent rescales to sum 100', () => {
  const pct = normalizeToPercent([1, 1, 2]);
  assert.ok(Math.abs(pct.slice(0, 3).reduce((s, v) => s + v, 0) - 100) < 1e-9);
});
