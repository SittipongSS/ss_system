import test from 'node:test';
import assert from 'node:assert/strict';
import { lockedOut } from './proxy.js';

test('every signed-in role can open its own account page', () => {
  const roles = ['ae', 'ac', 'rd', 'legal', 'staff', 'viewer', 'secretary'];

  for (const role of roles) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/account', 'GET', false),
      false,
      `${role} should reach /account`,
    );
  }
});

test('opening the account page does not broaden settings access', () => {
  const viewer = { role: 'viewer', extraCaps: [] };

  assert.equal(lockedOut(viewer, '/account', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings', 'GET', false), true);
  assert.equal(lockedOut(viewer, '/api/account/signature', 'POST', true), false);
});
