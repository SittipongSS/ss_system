import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recentSystemForUser,
  SYSTEM_ORDER,
  systemLandingForUser,
  systemsForUser,
} from './systems.js';

const keysFor = (user) => systemsForUser(user).map((system) => system.key);

test('system catalog keeps the agreed global order and role visibility', () => {
  assert.deepEqual(SYSTEM_ORDER, ['salesplan', 'tax', 'sahamit', 'master', 'mgmt']);
  assert.deepEqual(keysFor({ role: 'admin', team: null, extraCaps: [] }), SYSTEM_ORDER);
  assert.deepEqual(keysFor({ role: 'ae', team: 'ODM', extraCaps: [] }), ['salesplan', 'tax', 'master']);
  assert.deepEqual(keysFor({ role: 'ae', team: 'KA', extraCaps: [] }), ['salesplan', 'tax', 'sahamit', 'master']);
  assert.deepEqual(keysFor({ role: 'secretary', team: null, extraCaps: [] }), ['mgmt']);
  assert.deepEqual(keysFor({ role: 'legal', team: null, extraCaps: [] }), ['tax', 'master']);
});

test('system visibility covers every supported role and sales team', () => {
  const cases = [
    ['admin', null, SYSTEM_ORDER],
    ['secretary', null, ['mgmt']],
    ['ae_supervisor', null, ['salesplan', 'tax', 'sahamit', 'master']],
    ['marketing', null, ['salesplan']],
    ['legal', null, ['tax', 'master']],
    ['rd', null, ['salesplan', 'master']],
    ['viewer', null, SYSTEM_ORDER],
    ['staff', null, ['salesplan', 'master']],
    ['senior_ae', 'ODM', ['salesplan', 'tax', 'master']],
    ['senior_ae', 'KA', ['salesplan', 'tax', 'sahamit', 'master']],
    ['senior_ae', 'SV', ['salesplan', 'tax', 'master']],
    ['ac', 'ODM', ['salesplan', 'tax', 'master']],
    ['ac', 'KA', ['salesplan', 'tax', 'sahamit', 'master']],
    ['ac', 'SV', ['salesplan', 'tax', 'master']],
    ['ae', 'ODM', ['salesplan', 'tax', 'master']],
    ['ae', 'KA', ['salesplan', 'tax', 'sahamit', 'master']],
    ['ae', 'SV', ['salesplan', 'tax', 'master']],
  ];

  for (const [role, team, expected] of cases) {
    assert.deepEqual(keysFor({ role, team, extraCaps: [] }), expected, `${role}:${team || '-'}`);
  }
});

test('specialized users land on the one workspace they can use', () => {
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  const staff = { role: 'staff', team: null, extraCaps: [] };

  assert.deepEqual(keysFor(marketing), ['salesplan']);
  assert.equal(systemLandingForUser('salesplan', marketing), '/sa/leads');
  assert.deepEqual(keysFor(staff), ['salesplan', 'master']);
  assert.equal(systemLandingForUser('salesplan', staff), '/sa/tasks');
});

test('recent system is accepted only while the current user can access it', () => {
  const secretary = { role: 'secretary', team: null, extraCaps: [] };
  const grantedSales = { role: 'ae', team: 'ODM', extraCaps: ['mgmt:view'] };

  assert.equal(recentSystemForUser(secretary, 'salesplan'), null);
  assert.equal(recentSystemForUser(secretary, 'mgmt')?.key, 'mgmt');
  assert.equal(recentSystemForUser(grantedSales, 'mgmt')?.key, 'mgmt');
  assert.equal(recentSystemForUser(grantedSales, 'unknown'), null);
});
