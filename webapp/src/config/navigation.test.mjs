import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSettingsPathname, sortSystems, systemForPathname } from './navigation.js';

test('systemForPathname keeps public and legacy sales routes in one system', () => {
  assert.equal(systemForPathname('/sa/quotations/1'), 'salesplan');
  assert.equal(systemForPathname('/sales-planning/deals'), 'salesplan');
  assert.equal(systemForPathname('/pm/projects/1'), 'salesplan');
  assert.equal(systemForPathname('/sahamit/po'), 'sahamit');
});

test('sortSystems follows the global navigation order', () => {
  const groups = ['mgmt', 'master', 'tax', 'salesplan', 'sahamit'].map((system) => ({ system }));
  assert.deepEqual(sortSystems(groups).map((group) => group.system), ['salesplan', 'tax', 'sahamit', 'master', 'mgmt']);
});

test('settings surfaces use the global settings context instead of a business system', () => {
  const settingsRoutes = [
    '/settings',
    '/settings/company',
    '/settings/workflow-templates',
    '/settings/holidays',
    '/settings/chat-webhooks',
    '/users',
    '/audit',
  ];

  for (const route of settingsRoutes) {
    assert.equal(isSettingsPathname(route), true);
    assert.equal(systemForPathname(route), 'settings');
  }

  assert.equal(isSettingsPathname('/settings-extra'), false);
  assert.equal(systemForPathname('/database/products'), 'master');
});
