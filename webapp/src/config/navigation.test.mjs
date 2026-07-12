import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMobileNavigation, systemForPathname } from './navigation.js';

test('systemForPathname keeps public and legacy sales routes in one system', () => {
  assert.equal(systemForPathname('/sa/quotations/1'), 'salesplan');
  assert.equal(systemForPathname('/sales-planning/deals'), 'salesplan');
  assert.equal(systemForPathname('/pm/projects/1'), 'salesplan');
  assert.equal(systemForPathname('/sahamit/po'), 'sahamit');
});

test('splitMobileNavigation limits the bottom bar to four contextual items', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(splitMobileNavigation(items), { primary: ['a', 'b', 'c', 'd'], more: ['e', 'f'] });
});
