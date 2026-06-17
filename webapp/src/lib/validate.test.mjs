import { test } from 'node:test';
import assert from 'node:assert';
import { pickFields, missingField } from './validate';

test('pickFields keeps only allowed, present keys', () => {
  const out = pickFields({ a: 1, b: 2, c: 3 }, ['a', 'c', 'x']);
  assert.deepEqual(out, { a: 1, c: 3 });
});

test('pickFields coerces "" → null only for nullable keys', () => {
  const out = pickFields({ d1: '', d2: '', name: '' }, ['d1', 'd2', 'name'], { nullable: ['d1', 'd2'] });
  assert.deepEqual(out, { d1: null, d2: null, name: '' });
});

test('pickFields preserves other falsy values (0/false) and non-empty strings', () => {
  const out = pickFields({ qty: 0, flag: false, due: '2026-01-01' }, ['qty', 'flag', 'due'], { nullable: ['due'] });
  assert.deepEqual(out, { qty: 0, flag: false, due: '2026-01-01' });
});

test('missingField reports the first blank/absent required key', () => {
  assert.equal(missingField({ name: 'x' }, ['name']), null);
  assert.equal(missingField({}, ['name']), 'name');
  assert.equal(missingField({ name: '   ' }, ['name']), 'name');
  assert.equal(missingField({ name: null }, ['name']), 'name');
  // falsy-but-valid values are present
  assert.equal(missingField({ qty: 0 }, ['qty']), null);
});
