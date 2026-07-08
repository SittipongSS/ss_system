// Tests for the PM permission predicates consolidated into permissions.js.
// Pure functions → fully testable without a DB. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { pmTaskScopes, pmTaskEditTier, deleteScope, canAccessMgmt, can, capsFor } from './permissions';

test('pmTaskScopes by role', () => {
  assert.deepEqual(pmTaskScopes('admin'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('ae_supervisor'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('senior_ae'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ac'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ae'), ['mine']);
  assert.deepEqual(pmTaskScopes('staff'), ['mine']);
  assert.deepEqual(pmTaskScopes('viewer'), ['mine']);
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
  assert.equal(pmTaskEditTier({ role: 'ae', id: 'u1' }, { assigneeId: null }, { ownerId: 'u1' }), 'full');
});

test('pmTaskEditTier: workflow edit for assignee / same-dept staff', () => {
  // ae who owns neither project nor edit-scope, but IS the task assignee
  assert.equal(pmTaskEditTier({ role: 'ae', id: 'u1' }, { assigneeId: 'u1' }, { ownerId: 'u2' }), 'workflow');
  // staff in the same department as the step
  assert.equal(pmTaskEditTier({ role: 'staff', id: 'p', department: 'PC' }, { assigneeId: null, role: 'PC' }, { ownerId: 'u2' }), 'workflow');
});

test('canAccessMgmt: admin + secretary only (NOT sales head)', () => {
  assert.equal(canAccessMgmt('admin'), true);
  assert.equal(canAccessMgmt('secretary'), true);
  // sales head must NOT inherit mgmt caps from the superuser set
  assert.equal(canAccessMgmt('ae_supervisor'), false);
  assert.equal(canAccessMgmt('senior_ae'), false);
  assert.equal(canAccessMgmt('ae'), false);
  assert.equal(canAccessMgmt('legal'), false);
  assert.equal(canAccessMgmt('viewer'), false);
  assert.equal(canAccessMgmt('staff'), false);
});

test('secretary holds ONLY the mgmt caps (no tax/pm/master leak)', () => {
  assert.deepEqual(capsFor('secretary'), ['mgmt:view', 'mgmt:edit']);
  assert.equal(can('secretary', 'pm:view'), false);
  assert.equal(can('secretary', 'customers:view'), false);
  assert.equal(can('secretary', 'users:manage'), false);
  assert.equal(can('secretary', 'mgmt:edit'), true);
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
