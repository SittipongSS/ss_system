import test from 'node:test';
import assert from 'node:assert/strict';
import { canLinkTaskToDeal, taskDealScope } from './taskDealScope.js';

test('task deal linking is limited to the user team', () => {
  const user = { role: 'ae', team: 'KA' };
  assert.equal(canLinkTaskToDeal(user, { team: 'KA' }), true);
  assert.equal(canLinkTaskToDeal(user, { team: 'ODM' }), false);
  assert.equal(canLinkTaskToDeal(user, { team: null }), false);
  assert.deepEqual(taskDealScope(user), { kind: 'team', team: 'KA' });
});

test('users without a team cannot manually link a deal', () => {
  assert.equal(canLinkTaskToDeal({ role: 'rd', team: null }, { team: 'KA' }), false);
  assert.deepEqual(taskDealScope({ role: 'rd', team: null }), { kind: 'none', team: null });
});

test('superusers retain cross-team administration access', () => {
  assert.equal(canLinkTaskToDeal({ role: 'admin' }, { team: 'KA' }), true);
  assert.deepEqual(taskDealScope({ role: 'admin' }), { kind: 'all', team: null });
});
