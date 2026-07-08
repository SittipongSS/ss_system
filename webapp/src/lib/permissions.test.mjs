// Tests for the PM permission predicates consolidated into permissions.js.
// Pure functions → fully testable without a DB. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { pmViewScope, pmEditScope, pmTaskScopes, pmTaskEditTier, inPmProjectViewScope, inPmProjectScope, deleteScope, canAccessMgmt, can, capsFor, sanitizeExtraCaps, GRANTABLE_CAPS } from './permissions';

test('pmTaskScopes by role', () => {
  assert.deepEqual(pmTaskScopes('admin'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('ae_supervisor'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('senior_ae'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ac'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ae'), ['mine']);
  assert.deepEqual(pmTaskScopes('staff'), ['mine']);
  assert.deepEqual(pmTaskScopes('viewer'), ['mine']);
});

test('PM project auth scopes by sales role', () => {
  assert.equal(pmViewScope('ae'), 'own');
  assert.equal(pmEditScope('ae'), 'own');
  assert.equal(pmViewScope('senior_ae'), 'team');
  assert.equal(pmEditScope('senior_ae'), 'team');
  assert.equal(pmViewScope('ac'), 'team');
  assert.equal(pmEditScope('ac'), 'team');
  assert.equal(pmViewScope('ae_supervisor'), 'all');
  assert.equal(pmEditScope('ae_supervisor'), 'all');
  assert.equal(pmViewScope('admin'), 'all');
  assert.equal(pmEditScope('admin'), 'all');
});

test('deleteScope for projects (superuser=all, senior_ae=own team, else none)', () => {
  assert.equal(deleteScope('admin', 'projects'), 'all');
  assert.equal(deleteScope('ae_supervisor', 'projects'), 'all');
  assert.equal(deleteScope('senior_ae', 'projects'), 'team');
  assert.equal(deleteScope('ac', 'projects'), 'none');
  assert.equal(deleteScope('ae', 'projects'), 'none');
});

test('pmTaskEditTier: full edit for admin / scoped sales', () => {
  assert.equal(pmTaskEditTier({ role: 'admin', id: 'a' }, { assigneeId: null }, { team: 'KA', ownerId: 'x' }), 'full');
  assert.equal(pmTaskEditTier({ role: 'senior_ae', team: 'ODM', id: 's' }, { assigneeId: null }, { team: 'ODM' }), 'full');
  assert.equal(pmTaskEditTier({ role: 'ae', team: 'KA', id: 'u1' }, { assigneeId: null }, { team: 'KA', ownerId: 'u1' }), 'full');
  assert.equal(pmTaskEditTier({ role: 'ae', team: 'KA', id: 'u1', name: 'AE One' }, { assigneeId: null }, { team: 'KA', aeOwner: ' ae  one ' }), 'full');
});

test('inPmProjectScope: AE edits and views only own PM projects', () => {
  assert.equal(inPmProjectScope({ role: 'ae', team: 'KA', id: 'u1' }, { team: null, ownerId: 'u1' }), true);
  assert.equal(inPmProjectViewScope({ role: 'ae', team: 'KA', id: 'u1', name: 'AE One' }, { team: 'ODM', aeOwner: 'AE One' }), true);
  assert.equal(inPmProjectScope({ role: 'ac', team: 'KA', id: 'u1' }, { team: 'ODM', ownerId: 'u1' }), false);
  assert.equal(inPmProjectScope({ role: 'ae', team: 'KA', id: 'u1' }, { team: 'ODM', ownerId: 'u2' }), false);
});

test('pmTaskEditTier: workflow edit for assignee / same-dept staff', () => {
  // ae who owns neither project nor edit-scope, but IS the task assignee
  assert.equal(pmTaskEditTier({ role: 'ae', id: 'u1' }, { assigneeId: 'u1' }, { ownerId: 'u2' }), 'workflow');
  // staff in the same department as the step
  assert.equal(pmTaskEditTier({ role: 'staff', id: 'p', department: 'PC' }, { assigneeId: null, role: 'PC' }, { ownerId: 'u2' }), 'workflow');
});

test('canAccessMgmt: admin + secretary by role (NOT sales head)', () => {
  assert.equal(canAccessMgmt({ role: 'admin' }), true);
  assert.equal(canAccessMgmt({ role: 'secretary' }), true);
  // sales head must NOT inherit mgmt caps from the superuser set
  assert.equal(canAccessMgmt({ role: 'ae_supervisor' }), false);
  assert.equal(canAccessMgmt({ role: 'senior_ae' }), false);
  assert.equal(canAccessMgmt({ role: 'ae' }), false);
  assert.equal(canAccessMgmt({ role: 'legal' }), false);
  assert.equal(canAccessMgmt({ role: 'viewer' }), false);
  assert.equal(canAccessMgmt({ role: 'staff' }), false);
});

test('canAccessMgmt: honours a per-user mgmt:view grant (like LG)', () => {
  // an SA granted mgmt:view to help the secretary — no role change
  assert.equal(canAccessMgmt({ role: 'ae', extraCaps: ['mgmt:view'] }), true);
  assert.equal(canAccessMgmt({ role: 'ae_supervisor', extraCaps: ['mgmt:view', 'mgmt:edit'] }), true);
  // an mgmt:edit-only grant does NOT open the module (pages gate on mgmt:view)
  assert.equal(canAccessMgmt({ role: 'ae', extraCaps: ['mgmt:edit'] }), false);
});

test('mgmt caps are grantable per-user (whitelist)', () => {
  assert.ok(GRANTABLE_CAPS.includes('mgmt:view'));
  assert.ok(GRANTABLE_CAPS.includes('mgmt:edit'));
  assert.deepEqual(sanitizeExtraCaps(['mgmt:view', 'mgmt:edit', 'users:manage']), ['mgmt:view', 'mgmt:edit']);
});

test('secretary holds ONLY the mgmt caps (no tax/pm/master leak)', () => {
  assert.deepEqual(capsFor('secretary'), ['mgmt:view', 'mgmt:edit']);
  assert.equal(can('secretary', 'pm:view'), false);
  assert.equal(can('secretary', 'customers:view'), false);
  assert.equal(can('secretary', 'users:manage'), false);
  assert.equal(can('secretary', 'mgmt:edit'), true);
});

test('sales targets are limited to admin and sales head', () => {
  assert.equal(can('admin', 'salesplan:target'), true);
  assert.equal(can('ae_supervisor', 'salesplan:target'), true);
  assert.equal(can('senior_ae', 'salesplan:target'), false);
  assert.equal(can('ac', 'salesplan:target'), false);
  assert.equal(can('ae', 'salesplan:target'), false);
});

test('pmTaskEditTier: none for outsiders', () => {
  // senior_ae on another team's project, not the assignee
  assert.equal(pmTaskEditTier({ role: 'senior_ae', team: 'ODM', id: 's' }, { assigneeId: 'x', role: 'SA' }, { team: 'KA', ownerId: 'o' }), 'none');
  // ae who neither owns the project nor is the assignee
  assert.equal(pmTaskEditTier({ role: 'ae', id: 'u1' }, { assigneeId: 'u9' }, { ownerId: 'u2' }), 'none');
  // staff in a different department than the step
  assert.equal(pmTaskEditTier({ role: 'staff', id: 'p', department: 'PC' }, { assigneeId: null, role: 'QC' }, { ownerId: 'u2' }), 'none');
  // legal has no pm:view → never edits PM tasks
  assert.equal(pmTaskEditTier({ role: 'legal', id: 'l' }, { assigneeId: 'l', role: 'LG' }, { ownerId: 'l' }), 'none');
});
