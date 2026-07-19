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

test('account and central settings hub are open without broadening restricted child pages', () => {
  const viewer = { role: 'viewer', extraCaps: [] };

  assert.equal(lockedOut(viewer, '/account', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings/document-standards', 'GET', false), true);
  assert.equal(lockedOut(viewer, '/api/account/signature', 'POST', true), false);
});

test('AE Supervisor can open document standards while other business roles cannot', () => {
  assert.equal(
    lockedOut({ role: 'ae_supervisor', extraCaps: [] }, '/settings/document-standards', 'GET', false),
    false,
  );
  for (const role of ['senior_ae', 'ae', 'ac', 'legal', 'viewer', 'staff']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/settings/document-standards', 'GET', false),
      true,
      role,
    );
  }
});
