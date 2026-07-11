// Tests for the PM permission predicates consolidated into permissions.js.
// Pure functions → fully testable without a DB. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { pmTaskScopes, pmTaskEditTier, inPmProjectScope, deleteScope, canAccessMgmt, canAccessSahamit, can, canUser, capsFor, editScope, viewScope, pmEditScope, sanitizeExtraCaps, canAssignTask, canEditRecord, canDeleteRecord, GRANTABLE_CAPS } from './permissions';

test('canAssignTask: teammates assign to each other; sup/admin to anyone', () => {
  const ae = { id: 'u1', role: 'ae', team: 'KA' };
  const acMate = { id: 'u2', role: 'ac', team: 'KA' };
  const seniorMate = { id: 'u3', role: 'senior_ae', team: 'KA' };
  const otherTeam = { id: 'u9', role: 'ae', team: 'ODM' };

  // assigning to oneself is always allowed
  assert.equal(canAssignTask(ae, { id: 'u1', team: 'KA' }), true);

  // any team member → any teammate (peer-to-peer, not just top-down)
  assert.equal(canAssignTask(ae, acMate), true);            // AE → AC
  assert.equal(canAssignTask(ae, seniorMate), true);        // AE → Senior AE (upward)
  assert.equal(canAssignTask(acMate, ae), true);            // AC → AE
  assert.equal(canAssignTask(seniorMate, ae), true);        // Senior AE → AE

  // cross-team is blocked for team roles
  assert.equal(canAssignTask(ae, otherTeam), false);
  // a team member with no team set can only self-assign
  assert.equal(canAssignTask({ id: 'u1', role: 'ae', team: null }, acMate), false);

  // superuser → anyone, any team (sup/admin)
  assert.equal(canAssignTask({ id: 's', role: 'ae_supervisor', team: null }, otherTeam), true);
  assert.equal(canAssignTask({ id: 'a', role: 'admin', team: null }, otherTeam), true);

  // read-only / non-sales roles cannot assign to others (even same team)
  assert.equal(canAssignTask({ id: 'v', role: 'viewer', team: 'KA' }, acMate), false);
  assert.equal(canAssignTask({ id: 'w', role: 'staff', team: 'KA' }, acMate), false);

  // missing ids → false
  assert.equal(canAssignTask(null, acMate), false);
  assert.equal(canAssignTask(ae, null), false);
});

test('pmTaskScopes by role', () => {
  assert.deepEqual(pmTaskScopes('admin'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('ae_supervisor'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('senior_ae'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ac'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ae'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('staff'), ['mine']);
  // viewer = whole-system observer → sees every team's tasks ('all'), not just 'mine'
  assert.deepEqual(pmTaskScopes('viewer'), ['all']);
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
  assert.equal(pmTaskEditTier({ role: 'ae', team: 'KA', id: 'u1' }, { assigneeId: null }, { team: 'KA', ownerId: 'u2' }), 'full');
});

test('inPmProjectScope: PM editors may edit own project even when team is missing or stale', () => {
  assert.equal(inPmProjectScope({ role: 'ae', team: 'KA', id: 'u1' }, { team: null, ownerId: 'u1' }), true);
  assert.equal(inPmProjectScope({ role: 'ac', team: 'KA', id: 'u1' }, { team: 'ODM', ownerId: 'u1' }), true);
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
  // viewer is a read-only observer of the WHOLE system → sees mgmt too (read-only)
  assert.equal(canAccessMgmt({ role: 'viewer' }), true);
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

test('viewer: sees every module read-only, but can never write', () => {
  // Holds every :view capability across all modules...
  for (const cap of [
    'customers:view', 'products:view', 'sales:view', 'legal:view', 'history:view',
    'pm:view', 'salesplan:view', 'sahamit:view', 'mgmt:view',
  ]) {
    assert.equal(can('viewer', cap), true, `viewer should hold ${cap}`);
  }
  // ...at 'all'-team view scope (sees every team's records)...
  assert.equal(viewScope('viewer'), 'all');
  // ...but holds NO write/act/delete/approve/manage capability.
  for (const cap of [
    'customers:edit', 'customers:delete', 'products:edit', 'products:delete',
    'sales:act', 'sales:delete', 'legal:approve', 'pm:edit', 'salesplan:edit',
    'salesplan:target', 'salesplan:review', 'sahamit:edit', 'mgmt:edit',
    'users:manage', 'master:manage', 'audit:view', 'products:margin',
  ]) {
    assert.equal(can('viewer', cap), false, `viewer must NOT hold ${cap}`);
  }
  // Edit/delete scope is 'none' everywhere → row-level writes are refused too.
  const viewer = { role: 'viewer', id: 'v', team: null };
  assert.equal(editScope('viewer'), 'none');
  assert.equal(deleteScope('viewer', 'orders'), 'none');
  assert.equal(canEditRecord(viewer, 'orders', { team: 'KA', ownerId: 'x' }), false);
  assert.equal(canDeleteRecord(viewer, 'orders', { team: 'KA', ownerId: 'x' }), false);
  // SAHAMIT is team-gated (KA) for sales roles, but the whole-system observer
  // sees it despite having no team (writes still blocked by lack of sahamit:edit).
  assert.equal(canAccessSahamit('viewer', null), true);
  // PM: viewer never edits a project task — not even one assigned to it, and not
  // the plan (pmEditScope 'none'). Guards the 'workflow' tier that pm:view opens.
  assert.equal(pmEditScope('viewer'), 'none');
  assert.equal(pmTaskEditTier({ role: 'viewer', id: 'v' }, { assigneeId: 'v' }, { ownerId: 'x' }), 'none');
});

test('viewer: cost/margin stays a per-user grant (ติ๊กเปิดสิทธิ like LG)', () => {
  const plain = { role: 'viewer' };
  const granted = { role: 'viewer', extraCaps: ['products:margin'] };
  // off by default...
  assert.equal(canUser(plain, 'products:margin'), false);
  // ...but an admin may tick the grant (products:margin is whitelisted)...
  assert.ok(GRANTABLE_CAPS.includes('products:margin'));
  assert.deepEqual(sanitizeExtraCaps(['products:margin']), ['products:margin']);
  // ...and then the viewer sees cost/margin, LG-style — without gaining any write cap.
  assert.equal(canUser(granted, 'products:margin'), true);
  assert.equal(canUser(granted, 'products:edit'), false);
  assert.equal(canUser(granted, 'legal:approve'), false);
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
