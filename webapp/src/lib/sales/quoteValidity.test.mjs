import test from 'node:test';
import assert from 'node:assert/strict';
import { addValidityDays, validityDaysBetween } from './quoteValidity.js';

test('addValidityDays computes a date-only validity deadline', () => {
  assert.equal(addValidityDays('2026-07-14', 30), '2026-08-13');
  assert.equal(addValidityDays('2024-02-28', 2), '2024-03-01');
});

test('validityDaysBetween derives the number of days from existing quotations', () => {
  assert.equal(validityDaysBetween('2026-07-14', '2026-08-13'), 30);
  assert.equal(validityDaysBetween('2026-07-14', '2026-07-10'), 0);
});

test('validity helpers reject empty and invalid date values', () => {
  assert.equal(addValidityDays('2026-02-31', 30), '');
  assert.equal(addValidityDays('2026-07-14', 0), '');
  assert.equal(validityDaysBetween('', '2026-08-13'), '');
});
