// Tests for the PM permission predicates consolidated into permissions.js.
// Pure functions → fully testable without a DB. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { pmTaskScopes, pmTaskEditTier, inPmProjectScope, deleteScope, canAccessMgmt, can, capsFor, sanitizeExtraCaps, canAssignTask, taskCreditId, canPullTask, canReleaseTask, canChangeTaskStatus, GRANTABLE_CAPS } from './permissions';

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

test('taskCreditId: proxy worker → assignee → owner', () => {
  assert.equal(taskCreditId({ ownerId: 'o' }), 'o');
  assert.equal(taskCreditId({ ownerId: 'o', assigneeId: 'a' }), 'a');
  assert.equal(taskCreditId({ ownerId: 'o', assigneeId: 'a', proxyBy: 'p' }), 'p');
  assert.equal(taskCreditId({}), null);
});

test('canPullTask: a teammate may pull a task nobody else holds', () => {
  const me = { id: 'u2', role: 'ae', team: 'KA' };
  const task = { ownerId: 'u1', assigneeId: 'u1', proxyBy: null };
  assert.equal(canPullTask(me, task, 'KA'), true);            // teammate, free task
  assert.equal(canPullTask(me, task, 'ODM'), false);          // responsible in another team
  assert.equal(canPullTask(me, { ...task, ownerId: 'u2', assigneeId: 'u2' }, 'KA'), false); // already mine
  assert.equal(canPullTask(me, { ...task, proxyBy: 'u9' }, 'KA'), false);  // held by someone else
  assert.equal(canPullTask(me, { ...task, proxyBy: 'u2' }, 'KA'), true);   // already mine → idempotent
  // superuser may pull across teams
  assert.equal(canPullTask({ id: 's', role: 'admin', team: null }, task, 'ODM'), true);
  // read-only / non-sales roles cannot pull even in the same team
  assert.equal(canPullTask({ id: 'x', role: 'viewer', team: 'KA' }, task, 'KA'), false);
  assert.equal(canPullTask({ id: 'y', role: 'staff', team: 'KA' }, task, 'KA'), false);
});

test('canReleaseTask: proxy, responsible, or manager may release', () => {
  const task = { ownerId: 'u1', assigneeId: 'u1', proxyBy: 'u2' };
  assert.equal(canReleaseTask({ id: 'u2', role: 'ae' }, task, false), true);   // the proxy
  assert.equal(canReleaseTask({ id: 'u1', role: 'ae' }, task, false), true);   // the responsible
  assert.equal(canReleaseTask({ id: 'u9', role: 'ae' }, task, true), true);    // a manager
  assert.equal(canReleaseTask({ id: 'u9', role: 'ae' }, task, false), false);  // unrelated peer
  assert.equal(canReleaseTask({ id: 'u2' }, { ...task, proxyBy: null }, false), false); // nothing to release
});

test('canChangeTaskStatus: responsible/proxy/manager only — peers must pull first', () => {
  const task = { ownerId: 'u1', assigneeId: 'u1', proxyBy: 'u2' };
  assert.equal(canChangeTaskStatus({ id: 'u2', role: 'ae' }, task, false), true);   // the proxy who pulled it
  assert.equal(canChangeTaskStatus({ id: 'u9', role: 'ae' }, task, true), true);    // a manager
  assert.equal(canChangeTaskStatus({ id: 'u9', role: 'ae' }, task, false), false);  // random teammate → must pull
  assert.equal(canChangeTaskStatus({ id: 'u9', role: 'ae' }, { ownerId: 'u1', assigneeId: 'u1', proxyBy: null }, false), false);
});

test('pmTaskScopes by role', () => {
  assert.deepEqual(pmTaskScopes('admin'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('ae_supervisor'), ['mine', 'team', 'all']);
  assert.deepEqual(pmTaskScopes('senior_ae'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ac'), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes('ae'), ['mine', 'team']);
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
