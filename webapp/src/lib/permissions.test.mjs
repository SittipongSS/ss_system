// Tests for the PM permission predicates consolidated into permissions.js.
// Pure functions → fully testable without a DB. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { pmTaskScopes, pmTaskEditTier, inPmProjectScope, deleteScope, canAccessMgmt, canAccessSahamit, canSeeTaskKpi, canSeeRdKpi, can, canUser, capsFor, editScope, viewScope, pmEditScope, sanitizeExtraCaps, canAssignTask, assignableUsersFor, canEditRecord, canDeleteRecord, taskCreditId, canPullTask, canReleaseTask, canChangeTaskStatus, canChangeTaskAssignee, GRANTABLE_CAPS, canApproveMasterData, canManageProductCategories, canManageDocumentStandards, canManageCommercialPresets } from './permissions';

test('canManageProductCategories: AE Supervisor และ Admin เท่านั้น', () => {
  assert.equal(canManageProductCategories('admin'), true);
  assert.equal(canManageProductCategories('ae_supervisor'), true);
  for (const role of ['senior_ae', 'ac', 'ae', 'secretary', 'legal', 'rd', 'viewer', 'staff']) {
    assert.equal(canManageProductCategories(role), false, role);
  }
});

test('canManageDocumentStandards: AE Supervisor และ Admin เท่านั้น', () => {
  assert.equal(canManageDocumentStandards('admin'), true);
  assert.equal(canManageDocumentStandards('ae_supervisor'), true);
  for (const role of ['senior_ae', 'ae', 'ac', 'secretary', 'legal', 'viewer', 'staff']) {
    assert.equal(canManageDocumentStandards(role), false, role);
  }
});

test('canManageCommercialPresets: AE Supervisor และ Admin เท่านั้น', () => {
  assert.equal(canManageCommercialPresets('admin'), true);
  assert.equal(canManageCommercialPresets('ae_supervisor'), true);
  for (const role of ['senior_ae', 'ae', 'ac', 'legal', 'viewer', 'staff']) {
    assert.equal(canManageCommercialPresets(role), false, role);
  }
});

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

  // AE Supervisor → ทั้งฝ่าย SA (ข้ามทีมได้ เพราะยังเป็นฝ่ายเดียวกัน)
  assert.equal(canAssignTask({ id: 's', role: 'ae_supervisor', team: null }, otherTeam), true);
  assert.equal(canAssignTask({ id: 'a', role: 'admin', team: null }, otherTeam), true);

  // read-only / non-sales roles cannot assign to others (even same team)
  assert.equal(canAssignTask({ id: 'v', role: 'viewer', team: 'KA' }, acMate), false);
  assert.equal(canAssignTask({ id: 'w', role: 'staff', team: 'KA' }, acMate), false);

  // missing ids → false
  assert.equal(canAssignTask(null, acMate), false);
  assert.equal(canAssignTask(ae, null), false);
});

test('canAssignTask: มอบหมายข้ามฝ่ายไม่ได้ — ฝ่ายขายต้องส่งงานให้ RD ผ่านสอบถาม RD เท่านั้น', () => {
  const supervisor = { id: 's', role: 'ae_supervisor', team: null };
  const ae = { id: 'u1', role: 'ae', team: 'KA' };
  const rd = { id: 'r1', role: 'rd' };
  const rdMate = { id: 'r2', role: 'rd' };
  const qcStaff = { id: 'q1', role: 'staff', department: 'QC' };

  // แม้แต่หัวหน้าฝ่ายขายก็มอบงานตรงให้ RD/QC ไม่ได้ (มติผู้ใช้ 2026-07-17)
  assert.equal(canAssignTask(supervisor, rd), false);
  assert.equal(canAssignTask(supervisor, qcStaff), false);
  assert.equal(canAssignTask(ae, rd), false);

  // RD มอบกันเองในฝ่ายได้ แต่มอบย้อนกลับให้ฝ่ายขายไม่ได้
  assert.equal(canAssignTask(rd, rdMate), true);
  assert.equal(canAssignTask(rd, ae), false);

  // admin = บัญชีดูแลระบบ ยกเว้นให้ข้ามฝ่ายได้ (ทางออกฉุกเฉิน)
  assert.equal(canAssignTask({ id: 'a', role: 'admin' }, rd), true);
});

test('canAssignTask: ฝ่ายอนุมานจาก role ได้เมื่อไม่ได้ตั้ง department ไว้ตรง ๆ', () => {
  // บัญชีส่วนใหญ่ไม่มี app_metadata.department — ถ้าเทียบค่าดิบจะเป็น null ทั้งคู่
  // แล้วบล็อกการมอบหมายทั้งระบบเงียบ ๆ
  assert.equal(canAssignTask({ id: 'r1', role: 'rd' }, { id: 'r2', role: 'rd' }), true);
  // department ที่ตั้งไว้ตรง ๆ ต้องชนะค่าที่อนุมานจาก role
  assert.equal(canAssignTask({ id: 'r1', role: 'rd' }, { id: 'x', role: 'staff', department: 'RD' }), true);
  // ค่าเก่า (SALES) ต้อง normalize เป็น SA ก่อนเทียบ
  assert.equal(canAssignTask({ id: 's', role: 'ae_supervisor', department: 'SALES' }, { id: 'u1', role: 'ae', team: 'KA' }), true);
  // ไม่รู้ฝ่ายทั้งคู่ = มอบไม่ได้ (ไม่ใช่ "ผ่านเพราะ null เท่ากัน")
  assert.equal(canAssignTask({ id: 'z1', role: 'nope' }, { id: 'z2', role: 'nope' }), false);
});

test('assignableUsersFor: กรองด้วยกติกาเดียวกับ canAssignTask', () => {
  const ae = { id: 'u1', role: 'ae', team: 'KA' };
  const users = [
    { id: 'u1', role: 'ae', team: 'KA' },      // ตัวเอง
    { id: 'u2', role: 'ac', team: 'KA' },      // ทีมเดียวกัน
    { id: 'u9', role: 'ae', team: 'ODM' },     // คนละทีม
    { id: 'r1', role: 'rd' },                  // คนละฝ่าย
  ];
  assert.deepEqual(assignableUsersFor(ae, users).map((u) => u.id), ['u1', 'u2']);
  // ยังไม่รู้ว่าเราเป็นใคร = ยังไม่ต้องโชว์ใคร (กันเผลอโชว์ทั้งบริษัทตอนโหลด)
  assert.deepEqual(assignableUsersFor(null, users), []);
});

test('taskCreditId: proxy worker → assignee → owner', () => {
  assert.equal(taskCreditId({ ownerId: 'o' }), 'o');
  assert.equal(taskCreditId({ ownerId: 'o', assigneeId: 'a' }), 'a');
  assert.equal(taskCreditId({ ownerId: 'o', assigneeId: 'a', proxyBy: 'p' }), 'p');
  assert.equal(taskCreditId({}), null);
});

test('completed task freezes its responsible person and KPI credit', () => {
  const completed = { status: 'Completed', ownerId: 'o', assigneeId: 'a' };
  assert.equal(canChangeTaskAssignee(completed, 'a'), true);
  assert.equal(canChangeTaskAssignee(completed, 'b'), false);
  assert.equal(canChangeTaskAssignee(completed, null), false);
  assert.equal(canChangeTaskAssignee({ ...completed, status: 'In Progress' }, 'b'), true);
});

test('canPullTask: a teammate may pull a task nobody else holds', () => {
  const me = { id: 'u2', role: 'ae', team: 'KA' };
  const task = { ownerId: 'u1', assigneeId: 'u1', proxyBy: null };
  assert.equal(canPullTask(me, task, 'KA'), true);            // teammate, free task
  assert.equal(canPullTask(me, task, 'ODM'), false);          // responsible in another team
  assert.equal(canPullTask(me, { ...task, ownerId: 'u2', assigneeId: 'u2' }, 'KA'), false); // already mine
  assert.equal(canPullTask(me, { ...task, proxyBy: 'u9' }, 'KA'), false);  // held by someone else
  assert.equal(canPullTask(me, { ...task, proxyBy: 'u2' }, 'KA'), true);   // already mine → idempotent
  assert.equal(canPullTask(me, { ...task, status: 'Completed' }, 'KA'), false); // KPI history is frozen
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

test('secretary holds the mgmt caps + read-only products (no tax/pm/master leak)', () => {
  assert.deepEqual(capsFor('secretary'), ['mgmt:view', 'mgmt:edit', 'products:view']);
  assert.equal(can('secretary', 'pm:view'), false);
  assert.equal(can('secretary', 'customers:view'), false);
  assert.equal(can('secretary', 'users:manage'), false);
  assert.equal(can('secretary', 'mgmt:edit'), true);
  // มติ 2026-07-20: อ่านแคตตาล็อกสินค้าได้ แต่แก้ไม่ได้ และไม่เห็นต้นทุน/มาร์จิ้น
  assert.equal(can('secretary', 'products:view'), true);
  assert.equal(can('secretary', 'products:edit'), false);
  assert.equal(can('secretary', 'products:margin'), false);
});

test('marketing holds the lead cap + read-only products, nothing else', () => {
  assert.deepEqual(capsFor('marketing'), ['salesplan:lead', 'products:view']);
  assert.equal(can('marketing', 'salesplan:view'), false);
  assert.equal(can('marketing', 'customers:view'), false);
  assert.equal(can('marketing', 'sales:view'), false);
  assert.equal(can('marketing', 'products:view'), true);
  assert.equal(can('marketing', 'products:edit'), false);
  assert.equal(can('marketing', 'products:margin'), false);
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
  // Sales Task KPI dashboard is read-only oversight → the monitor sees it too.
  assert.equal(canSeeTaskKpi('viewer'), true);
});

test('canSeeTaskKpi: oversight roles + read-only monitor, not the rank-and-file', () => {
  assert.equal(canSeeTaskKpi('admin'), true);
  assert.equal(canSeeTaskKpi('ae_supervisor'), true);
  assert.equal(canSeeTaskKpi('senior_ae'), true);
  assert.equal(canSeeTaskKpi('viewer'), true);
  assert.equal(canSeeTaskKpi('ae'), false);
  assert.equal(canSeeTaskKpi('ac'), false);
  assert.equal(canSeeTaskKpi('staff'), false);
  assert.equal(canSeeTaskKpi('legal'), false);
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

test('admin read surfaces (audit/users) are grantable per-user — read only, no write escalation', () => {
  // both are whitelisted grants now...
  assert.ok(GRANTABLE_CAPS.includes('audit:view'));
  assert.ok(GRANTABLE_CAPS.includes('users:view'));
  assert.deepEqual(sanitizeExtraCaps(['audit:view', 'users:view']), ['audit:view', 'users:view']);
  // ...but the admin WRITE caps stay ungrantable (defense against escalation).
  assert.deepEqual(sanitizeExtraCaps(['users:manage', 'master:manage']), []);

  // A viewer with the ticks gains the read windows...
  const viewer = { role: 'viewer', extraCaps: ['audit:view', 'users:view'] };
  assert.equal(canUser(viewer, 'audit:view'), true);
  assert.equal(canUser(viewer, 'users:view'), true);
  // ...but NEVER the account-management write cap — users:view ≠ users:manage.
  assert.equal(canUser(viewer, 'users:manage'), false);
  assert.equal(canUser(viewer, 'master:manage'), false);
  // a plain viewer (no grant) sees neither
  assert.equal(canUser({ role: 'viewer' }, 'audit:view'), false);
  assert.equal(canUser({ role: 'viewer' }, 'users:view'), false);
});

test('rd: reads deals/projects everywhere, works its own queue, never edits sales data', () => {
  // Reads the sales spine + master data + PM...
  for (const cap of ['salesplan:view', 'pm:view', 'customers:view', 'products:view']) {
    assert.equal(can('rd', cap), true, `rd should hold ${cap}`);
  }
  // ...at 'all'-team view scope (full context to answer Sales' inquiries)...
  assert.equal(viewScope('rd'), 'all');
  // ...but never writes deals/plans and never sees cost margin or tax/sahamit/mgmt.
  for (const cap of [
    'salesplan:edit', 'salesplan:lead', 'salesplan:target', 'pm:edit',
    'customers:edit', 'products:edit', 'products:margin', 'sales:view', 'sales:act',
    'legal:view', 'legal:approve', 'history:view', 'sahamit:view', 'mgmt:view',
    'users:manage', 'master:manage', 'audit:view',
  ]) {
    assert.equal(can('rd', cap), false, `rd must NOT hold ${cap}`);
  }
  assert.equal(editScope('rd'), 'none');
  assert.equal(pmEditScope('rd'), 'none');
  assert.equal(deleteScope('rd', 'orders'), 'none');

  // RD can switch between its own queue and the whole RD department queue.
  assert.deepEqual(pmTaskScopes('rd'), ['mine', 'team']);
  const rd = { id: 'r1', role: 'rd', team: null, department: 'RD' };
  assert.equal(canAssignTask(rd, { id: 'r1', team: null }), true);
  assert.equal(canAssignTask(rd, { id: 'x2', team: 'KA' }), false);
  assert.equal(canPullTask(rd, { assigneeId: 'x2', status: 'Pending' }, 'KA'), false);

  // Workflow tier: a project step assigned to the RD department (or to them
  // personally) is theirs to update — same rule as staff.
  assert.equal(pmTaskEditTier(rd, { assigneeId: null, role: 'RD' }, { ownerId: 'u2' }), 'workflow');
  assert.equal(pmTaskEditTier(rd, { assigneeId: 'r1', role: 'SA' }, { ownerId: 'u2' }), 'workflow');
  assert.equal(pmTaskEditTier(rd, { assigneeId: null, role: 'PC' }, { ownerId: 'u2' }), 'none');

  // Sales KPI dashboards stay Sales' own (RD is measured separately).
  assert.equal(canSeeTaskKpi('rd'), false);
  // ...and the RD dashboard/KPI is its own surface: rd + oversight only.
  assert.equal(canSeeRdKpi('rd'), true);
  assert.equal(canSeeRdKpi('admin'), true);
  assert.equal(canSeeRdKpi('ae_supervisor'), true);
  assert.equal(canSeeRdKpi('viewer'), true);
  assert.equal(canSeeRdKpi('ae'), false);
  assert.equal(canSeeRdKpi('senior_ae'), false);
  assert.equal(canSeeRdKpi('staff'), false);
});

test('rd: assigns and pulls tasks within its own department only', () => {
  const rd = { id: 'r1', role: 'rd', team: null, department: 'RD' };
  // มอบหมายให้เพื่อนร่วมฝ่าย RD ได้ (2 คนสลับ/แบ่งงานกันเอง)
  assert.equal(canAssignTask(rd, { id: 'r2', team: null, department: 'RD' }), true);
  // ข้ามฝ่าย/ไปหาฝ่ายขายไม่ได้ — ฝ่ายขายก็มอบตรงให้ RD ไม่ได้ (ต้องผ่าน inquiry)
  assert.equal(canAssignTask(rd, { id: 'p1', team: null, department: 'PC' }), false);
  assert.equal(canAssignTask({ id: 'a1', role: 'ae', team: 'KA' }, { id: 'r1', team: null, department: 'RD' }), false);
  // ดึงงาน: เฉพาะงานของคนฝ่ายเดียวกัน
  const openTask = { assigneeId: 'r2', status: 'Pending' };
  assert.equal(canPullTask(rd, openTask, null, 'RD'), true);
  assert.equal(canPullTask(rd, openTask, null, 'PC'), false);
  assert.equal(canPullTask(rd, openTask, 'KA', null), false);
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

// ── สิทธิ์อนุมัติข้อมูลหลัก (มติผู้ใช้ 2026-07-17: รวมศูนย์ที่ AE Supervisor) ──
test('canApproveMasterData: เฉพาะ AE Supervisor (+ admin break-glass)', () => {
  assert.equal(canApproveMasterData('ae_supervisor'), true);
  assert.equal(canApproveMasterData('admin'), true);
  // senior_ae เคยอนุมัติของทีมตัวเองได้ — ตัดออกแล้ว
  assert.equal(canApproveMasterData('senior_ae'), false);
  for (const role of ['ae', 'ac', 'marketing', 'legal', 'rd', 'viewer', 'staff', 'secretary']) {
    assert.equal(canApproveMasterData(role), false, `${role} ต้องอนุมัติไม่ได้`);
  }
});
