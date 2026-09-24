// ── ผังตำแหน่งฝ่ายขาย (มติผู้ใช้ 2026-09-24) ─────────────────────────────────────────
//   Commercial Director (CD) → Commercial Manager (CM) → AE Supervisor / AC Supervisor → Senior AE / Senior AC → AE / AC
//   (ร่างแรกเรียกชั้นบนสุดว่า CCO · เปลี่ยนเป็น Commercial Director ก่อนขึ้นระบบ — role `commercial_director`)
//
// มติที่เทสต์นี้ตรึง (ผู้ใช้ตอบ "ตามที่แนะนำ" ทุกข้อ):
//   1. AC Supervisor เห็น/ทำงานทุกทีม แต่ **ไม่อนุมัติ** ขั้น AE Sup
//   2. Senior AC = สิทธิ์ AC + สิทธิ์หัวหน้าทีม · ไม่ถือดีล
//   3. CD กับ CM สิทธิ์เท่ากัน (= AE Sup + MKT + TS manager) ต่างแค่ป้าย
//   4. ลำดับชั้นมีผลแค่ลำดับบนจอ ไม่เพิ่มขั้นอนุมัติต่อชั้น
//   5. กระดาษพิมพ์ตำแหน่งคนเซ็นจริง (positionTitle ของ role)
//   6. กระดิ่งขั้น AE Sup ไม่ส่งถึง CD/CM
//
// 🐞 กับดักหลักที่เทสต์นี้กัน: ตำแหน่งใหม่ที่ตกหล่นจาก helper ตัวใดตัวหนึ่ง **เสียสิทธิ์เงียบ ๆ** ไม่ใช่ error
//    (ขอบเขตตกจาก 'all' เหลือ 'team' แล้วทุกตารางว่าง) — บทเรียนเดียวกับฝ่าย RD
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_TRACK_ROLES, DEAL_HOLDER_ROLES, MARKETING_OVERSEER_ROLES, ROLES, ROLE_LABELS, SALES_BELL_ROLES,
  SALES_MANAGER_ROLES, SALES_ROLES, SALES_SUPERVISOR_ROLES, SERVICE_OVERSEER_ROLES, TEAM_LEAD_ROLES, TEAM_ROLES,
  canApproveMasterData, canBeServiceAssignee, canCreateServiceSite, canOverrideServiceGate, canEditService, canManageCommercialPresets,
  canManageDocumentStandards, canManageProductCategories, canManageTeams, canSeeDealKpi, canSeeTaskKpi,
  canSendSurveyResult, canViewService, canWorkOwnVisit, capsFor, defaultRoleForDepartment, deleteScope,
  departmentFor, editScope, homeSystemForUser, isSalesManager, isSuperuser, leadScopes, pmEditScope, pmTaskScopes,
  rolesForDepartment, salesDealScopes, validateIdentity, viewScope,
} from './permissions.js';
import { POSITION_TITLES, positionTitle } from './documents/positionTitles.js';
import { canApproveQuotation, canCreateDeal, salesPlanningEditScope, salesPlanningViewScope } from './salesPlanning.js';
import { canSubmitSalesOrder, isSalesOrderReviewer } from './sales/salesOrderWorkflow.js';
import {
  canIssueProductSpecDocument, canReviseProductSpecDocument, canSupApproveProductSpecDocument, canVoidProductSpecDocument,
} from './sales/productSpecDocWorkflow.js';
import { canApproveExternalContract } from './sales/contracts.js';
import { canApproveProjectClose } from './pm/projectClose.js';
import { canKeyHistoricalSalesOrder, canMoveHistoricalDealOwner } from './sales/historicalOrders.js';
import { canExportForecastReport } from './sales/forecastBreakdown.js';
import { canCreateDealFromLead, canCreateLead, canEditLead, canWorkLead, inLeadScope } from './sales/leads.js';
import { LEAD_ASSIGNEE_ROLES } from './sales/leadAssignee.js';
import { canExportLeadReport } from './sales/leadReport.js';
import { canEditProductSpec } from './sales/productSpecWorkflow.js';
import { PROJECT_PEOPLE_ROLES } from './pm/projectPeople.js';

const NEW_ROLES = ['commercial_director', 'commercial_manager', 'ac_supervisor', 'senior_ac'];
const sorted = (xs) => [...xs].sort();

/* ── ทะเบียน ────────────────────────────────────────────────────────────── */

test('ทะเบียนครบทุกชั้น — ROLES · ป้าย · ฝ่าย · ตำแหน่งบนกระดาษ', () => {
  for (const role of NEW_ROLES) {
    assert.ok(ROLES.includes(role), `${role} ไม่อยู่ใน ROLES`);
    assert.ok(ROLE_LABELS[role], `${role} ไม่มีป้าย (ดรอปดาวน์ /users จะเป็นช่องว่าง)`);
    assert.equal(departmentFor(role), 'SA', role);
    assert.ok(POSITION_TITLES[role], `${role} ไม่มีตำแหน่งบนกระดาษ`);
  }
  assert.equal(ROLE_LABELS.commercial_director, 'Commercial Director (CD)');
  assert.equal(ROLE_LABELS.commercial_manager, 'Commercial Manager (CM)');
  // มติข้อ 5: กระดาษพิมพ์ตำแหน่งเต็มของคนที่เซ็นจริง
  assert.equal(positionTitle('commercial_director'), 'Commercial Director');
  assert.equal(positionTitle('commercial_manager'), 'Commercial Manager');
  assert.equal(positionTitle('ac_supervisor'), 'Account Coordinator Supervisor');
  assert.equal(positionTitle('senior_ac'), 'Senior Account Coordinator');
});

test('ดรอปดาวน์ฝ่ายขายเรียงตามผัง แต่ค่าตั้งต้นเป็น AE (ไม่ใช่ CD ตัวแรกของลิสต์)', () => {
  assert.deepEqual(rolesForDepartment('SA'), [
    'commercial_director', 'commercial_manager', 'ae_supervisor', 'ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac',
  ]);
  assert.deepEqual(rolesForDepartment('SA'), [...SALES_ROLES]);
  assert.equal(defaultRoleForDepartment('SA'), 'ae');
  // ฝ่ายอื่นยังเป็นตัวแรกของลิสต์เหมือนเดิม
  assert.equal(defaultRoleForDepartment('TS'), 'ts');
  assert.equal(defaultRoleForDepartment('RD'), 'rd');
  assert.equal(defaultRoleForDepartment('FN'), 'finance');
  assert.equal(defaultRoleForDepartment('NOPE'), null);
});

test('ทีม: Senior AC ต้องผูกทีม · CD/CM/AC Sup ไม่มีทีม (เหมือน AE Sup)', () => {
  assert.deepEqual(sorted(TEAM_ROLES), ['ac', 'ae', 'senior_ac', 'senior_ae']);
  assert.equal(validateIdentity('senior_ac', ['ODM'], 'SA'), null);
  assert.equal(validateIdentity('senior_ac', [], 'SA'), null, 'ยังไม่จัดทีม = ผ่าน (จัดที่ /sa/teams)');
  for (const role of ['commercial_director', 'commercial_manager', 'ac_supervisor']) {
    assert.equal(validateIdentity(role, [], 'SA'), null, role);
    assert.equal(validateIdentity(role, ['ODM'], 'SA'), 'ตำแหน่งนี้ไม่ต้องระบุทีม', role);
    assert.equal(validateIdentity(role, [], 'TS'), 'ฝ่าย (department) ไม่ตรงกับตำแหน่ง', role);
  }
});

/* ── cap ────────────────────────────────────────────────────────────────── */

test('cap: CD = CM = AE Sup · Senior AC = AC Sup = Senior AE — ไม่มีใครได้สิทธิ์ระบบ', () => {
  const head = sorted(capsFor('ae_supervisor'));
  assert.deepEqual(sorted(capsFor('commercial_director')), head);
  assert.deepEqual(sorted(capsFor('commercial_manager')), head);
  const lead = sorted(capsFor('senior_ae'));
  assert.deepEqual(sorted(capsFor('senior_ac')), lead);
  assert.deepEqual(sorted(capsFor('ac_supervisor')), lead);
  for (const role of NEW_ROLES) {
    for (const cap of ['users:manage', 'master:manage', 'audit:view', 'ra:approve', 'costing:approve', 'registry:delete']) {
      assert.equal(capsFor(role).includes(cap), false, `${role} ห้ามถือ ${cap}`);
    }
  }
  // AC Sup ไม่ตั้งเป้า/ไม่ลบลูกค้าสินค้า/ไม่จัดทีม — ของผู้มีอำนาจตัดสิน
  for (const cap of ['salesplan:target', 'salesplan:review', 'customers:delete', 'products:delete', 'team:manage', 'ra:view']) {
    assert.equal(capsFor('ac_supervisor').includes(cap), false, `ac_supervisor ห้ามถือ ${cap}`);
  }
});

/* ── ขอบเขตข้อมูล ────────────────────────────────────────────────────────── */

test('ขอบเขต: หัวหน้าทุกคน (CD · CM · AE Sup · AC Sup) เห็น/แก้ทุกทีม', () => {
  assert.deepEqual(sorted(SALES_SUPERVISOR_ROLES), ['ac_supervisor', 'ae_supervisor', 'commercial_director', 'commercial_manager']);
  for (const role of SALES_SUPERVISOR_ROLES) {
    assert.equal(isSuperuser(role), true, role);
    assert.equal(viewScope(role), 'all', role);
    assert.equal(editScope(role), 'all', role);
    assert.equal(pmEditScope(role), 'all', role);
    assert.equal(salesPlanningViewScope(role), 'all', role);
    assert.equal(salesPlanningEditScope(role), 'all', role);
    assert.ok(leadScopes(role).includes('all'), role);
    assert.ok(salesDealScopes(role).includes('all'), role);
    assert.ok(pmTaskScopes(role).includes('all'), role);
    assert.equal(canSeeDealKpi(role), true, role);
    assert.equal(canSeeTaskKpi(role), true, role);
    assert.equal(inLeadScope({ role, id: 'u' }, { team: 'KA' }), true, role);
    assert.equal(canCreateDeal({ role }), true, role);
  }
});

test('ขอบเขต: Senior AC = ระดับทีมเหมือน AC + สิทธิ์หัวหน้าทีม (มติข้อ 2)', () => {
  const role = 'senior_ac';
  const me = { role, id: 'u-sac', team: 'ODM', teams: ['ODM'] };
  assert.equal(isSuperuser(role), false);
  assert.equal(viewScope(role), 'team');
  assert.equal(editScope(role), 'team');
  assert.equal(pmEditScope(role), 'team');
  assert.equal(salesPlanningViewScope(role), 'team');
  assert.equal(salesPlanningEditScope(role), 'team');
  assert.deepEqual(leadScopes(role), ['mine', 'team']);
  assert.deepEqual(salesDealScopes(role), ['mine', 'team']);
  assert.deepEqual(pmTaskScopes(role), ['mine', 'team']);
  assert.equal(inLeadScope(me, { team: 'ODM' }), true);
  assert.equal(inLeadScope(me, { team: 'KA' }), false);
  assert.equal(canWorkLead(me, { team: 'ODM' }), true, 'ทำงานคิวลีดของทีมได้เหมือน AC');
  // สิทธิ์หัวหน้าทีม
  assert.deepEqual(sorted(TEAM_LEAD_ROLES), ['senior_ac', 'senior_ae']);
  assert.equal(deleteScope(role, 'orders'), 'team');
  assert.equal(deleteScope(role, 'projects'), 'team');
  assert.equal(deleteScope(role, 'registrations'), 'team');
  assert.equal(canSeeTaskKpi(role), true);
  assert.equal(canExportForecastReport(role), true);
  assert.equal(deleteScope('ac', 'orders'), 'none', 'AC ธรรมดายังลบไม่ได้');
  // ไม่ถือดีล/ลีด/เป้า — หลังบ้านของทีมเหมือน AC
  assert.equal(DEAL_HOLDER_ROLES.includes(role), false);
  assert.equal(LEAD_ASSIGNEE_ROLES.includes(role), false);
  assert.equal(canCreateDealFromLead(role), false);
  assert.equal(canEditLead(me, { team: 'ODM', status: 'assigned' }), false, 'แก้ข้อมูลลีดไม่ได้เหมือน AC');
  assert.equal(canCreateDeal(me), true, 'เปิดดีลให้ AE ได้เหมือน AC');
});

/* ── อำนาจตัดสิน (ขั้น AE Sup) ──────────────────────────────────────────── */

test('อนุมัติ/ตัดสิน: CD · CM · AE Sup (+ admin) เท่านั้น — AC Sup ไม่ได้ (มติข้อ 1)', () => {
  assert.deepEqual(sorted(SALES_MANAGER_ROLES), ['ae_supervisor', 'commercial_director', 'commercial_manager']);
  const deal = { ownerId: 'someone-else' };
  const gates = {
    isSalesManager: (role) => isSalesManager(role),
    canApproveQuotation: (role) => canApproveQuotation({ role, id: 'u' }, deal),
    isSalesOrderReviewer: (role) => isSalesOrderReviewer(role),
    canSubmitSalesOrder: (role) => canSubmitSalesOrder({ role, id: 'u' }, deal),
    canSupApproveProductSpecDocument: (role) => canSupApproveProductSpecDocument({ role, id: 'u' }),
    canApproveExternalContract: (role) => canApproveExternalContract({ role }),
    canApproveMasterData: (role) => canApproveMasterData(role),
    canApproveProjectClose: (role) => canApproveProjectClose({ role }),
    canMoveHistoricalDealOwner: (role) => canMoveHistoricalDealOwner({ role }),
    canManageProductCategories: (role) => canManageProductCategories(role),
    canManageDocumentStandards: (role) => canManageDocumentStandards(role),
    canManageCommercialPresets: (role) => canManageCommercialPresets(role),
  };
  for (const [name, gate] of Object.entries(gates)) {
    assert.deepEqual(ROLES.filter(gate), ['admin', 'commercial_director', 'commercial_manager', 'ae_supervisor'], name);
  }
});

test('สาย AC ออกเอกสาร FM-SA-04 ได้ทุกระดับ · ฝ่ายขายทุกตำแหน่งแก้สเปค/คีย์ SO ย้อนหลังได้', () => {
  assert.deepEqual(ROLES.filter(canIssueProductSpecDocument), ['admin', 'ac_supervisor', 'senior_ac', 'ac']);
  /* ⭐ มติเจ้าของ 24/09/2569 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — แก้ไขเอกสาร (Rev+1) = สาย AC + ผู้อนุมัติ
     ขั้น AE Sup (CD/CM/AE Sup) + เจ้าของดีล (ตำแหน่งไหนก็ได้ที่ถือดีลนั้น) · ตำแหน่งใหม่ที่ตกหล่นจะเสียสิทธิ์เงียบ ๆ */
  const approvedDoc = { document: { status: 'active', currentRevNo: 0 }, latest: { revNo: 0, status: 'approved' } };
  const pendingDoc = { document: { status: 'active', currentRevNo: null }, latest: { revNo: 0, status: 'pending_ae' } };
  const reviseRoles = ROLES.filter((role) => canReviseProductSpecDocument({ id: 'x', role }, 'owner'));
  assert.deepEqual(reviseRoles, ['admin', 'commercial_director', 'commercial_manager', 'ae_supervisor', 'ac_supervisor', 'senior_ac', 'ac']);
  assert.deepEqual(ROLES.filter((role) => canVoidProductSpecDocument({ user: { id: 'x', role }, dealOwnerId: 'owner', ...approvedDoc })), reviseRoles);
  // ใบที่ไม่เคยอนุมัติ: ผู้อนุมัติใช้ตีกลับ — ยกเลิกยังเป็นของสาย AC + admin
  assert.deepEqual(ROLES.filter((role) => canVoidProductSpecDocument({ user: { id: 'x', role }, dealOwnerId: 'owner', ...pendingDoc })),
    ['admin', 'ac_supervisor', 'senior_ac', 'ac']);
  for (const role of DEAL_HOLDER_ROLES) {
    assert.equal(canReviseProductSpecDocument({ id: 'owner', role }, 'owner'), true, `${role} เจ้าของดีล`);
    assert.equal(canVoidProductSpecDocument({ user: { id: 'owner', role }, dealOwnerId: 'owner', ...approvedDoc }), true, `${role} เจ้าของดีล`);
  }
  for (const role of SALES_ROLES) {
    assert.equal(canEditProductSpec(role), true, role);
    assert.equal(canKeyHistoricalSalesOrder({ role }), true, role);
  }
  assert.deepEqual(PROJECT_PEOPLE_ROLES.preparedBy, [...AC_TRACK_ROLES]);
  assert.deepEqual(PROJECT_PEOPLE_ROLES.aeSupervisor, [...SALES_MANAGER_ROLES]);
  assert.deepEqual(PROJECT_PEOPLE_ROLES.aeOwner, [...DEAL_HOLDER_ROLES]);
});

/* ── MKT + TS manager ของ CD/CM ─────────────────────────────────────────── */

test('CD/CM ถือสิทธิ์ MKT: ดาวน์โหลด Excel รายงานลีด · กรอก/แก้/ลบลีดได้ผ่านสิทธิ์หัวหน้า', () => {
  assert.deepEqual(sorted(MARKETING_OVERSEER_ROLES), ['commercial_director', 'commercial_manager']);
  for (const role of ['commercial_director', 'commercial_manager']) {
    assert.equal(canExportLeadReport(role), true, role);
    assert.equal(canCreateLead(role), true, role);
    assert.equal(canEditLead({ role, id: 'u' }, { status: 'new', createdBy: 'mkt' }), true, role);
  }
  for (const role of ['ae_supervisor', 'ac_supervisor']) assert.equal(canExportLeadReport(role), false, role);
});

test('CD/CM ถือสิทธิ์หัวหน้าฝ่าย TS ในโมดูลบริการ ทั้งที่อยู่ฝ่าย SA · AE Sup/AC Sup ยังไม่ได้', () => {
  assert.deepEqual(sorted(SERVICE_OVERSEER_ROLES), ['commercial_director', 'commercial_manager']);
  for (const role of ['commercial_director', 'commercial_manager']) {
    const me = { role, id: `u-${role}`, department: 'SA' };
    assert.equal(canViewService(me), true, role);
    assert.equal(canEditService(me), true, role);
    assert.equal(canCreateServiceSite(me), true, role);
    assert.equal(canSendSurveyResult(me), true, role);
    assert.equal(canManageTeams(me, 'TS'), true, `${role} จัดทีมเจ้าหน้าที่บริการได้`);
    assert.equal(canManageTeams(me, 'SA'), true, `${role} จัดทีมขายได้เหมือน AE Sup`);
    assert.equal(canManageTeams(me, 'RD'), false, `${role} ข้ามไปฝ่ายอื่นไม่ได้`);
    // ไม่ใช่ช่างหน้างาน — ไม่ถูกมอบหมายเข้าไซต์ และปิดงานหน้างานแทนช่างไม่ได้
    assert.equal(canBeServiceAssignee(me), false, role);
    assert.equal(canWorkOwnVisit(me, { assigneeId: me.id }), false, role);
    // บ้านยังเป็นเปลือกงานขาย (ไม่ถูกย้ายไปเปลือกบริการ)
    assert.equal(homeSystemForUser(me), null, role);
    // ข้ามด่านลงคิวเข้าพื้นที่ = แอดมินคนเดียว (มติ 2026-09-23) — ได้สิทธิ์หัวหน้า TS ไม่ได้แปลว่าข้ามด่านได้
    assert.equal(canOverrideServiceGate(me), false, role);
  }
  for (const role of ['ae_supervisor', 'ac_supervisor']) {
    const me = { role, id: `u-${role}`, department: 'SA' };
    assert.equal(canViewService(me), false, role);
    assert.equal(canEditService(me), false, role);
    assert.equal(canSendSurveyResult(me), false, role);
    assert.equal(canManageTeams(me, 'TS'), false, role);
  }
});

test('ข้ามด่านลงคิวเข้าพื้นที่ได้เฉพาะแอดมิน — ทั้ง route และโมดัลถามตัวเดียวกัน', async () => {
  assert.deepEqual(ROLES.filter((role) => canOverrideServiceGate({ role })), ['admin']);
  const { readFileSync } = await import('node:fs');
  const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
  assert.match(src('app/api/service/visits/[id]/route.js'), /if \(!canOverrideServiceGate\(user\)\)/);
  assert.match(src('components/service/ServiceVisitModal.js'), /const canOverride = canOverrideServiceGate\(\{ role \}\);/);
});

test('กระดิ่งขั้น AE Sup ยังไป AE Sup อย่างเดียว (มติข้อ 6)', () => {
  assert.deepEqual(SALES_BELL_ROLES, ['ae_supervisor']);
});

/* ── การกระทำที่ทำลาย/ถอยของที่ผูกยอดแล้ว = อำนาจของผู้มีอำนาจตัดสิน ไม่ใช่ "หัวหน้าที่เห็นทุกทีม" ──────
   เดิมกั้นด้วย `isSuperuser` ซึ่งตอนนั้นเท่ากับ admin + AE Sup พอดี · ผังใหม่ `isSuperuser` รวม AC Supervisor
   ⇒ ห้าจุดนี้ย้ายไป `isSalesManager` (route/หน้าจอ import ใต้ raw Node ไม่ได้ จึงตรวจจากซอร์ส) */
test('ลบใบเสนอราคาที่ไม่ใช่ร่าง · ลบใบยื่นภาษีที่ล็อก · ลบโครงการ Won · พัก/เปิดสินค้า · backfill = isSalesManager', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
  const cases = {
    'app/api/sales-planning/quotations/[id]/route.js': /const elevated = isSalesManager\(user\.role\);/,
    'app/sales-planning/quotations/page.js': /r\.status === "draft" \|\| isSalesManager\(role\)/,
    'app/sales-planning/quotations/[id]/page.js': /quote\.status === "draft" \|\| isSalesManager\(role\)/,
    'app/api/orders/[id]/route.js': /if \(locked && !isSalesManager\(user\?\.role\)\)/,
    'app/api/sales-planning/deals/[id]/route.js': /isWonStage\(before\.stage\) && !isSalesManager\(user\.role\)/,
    'app/database/products/[id]/page.js': /const canToggleActive = isSalesManager\(role\);/,
    'app/api/products/[id]/route.js': /body\.isActive !== undefined && !isSalesManager\(user\?\.role\)/,
    'app/api/sales-planning/backfill-projects/route.js': /if \(!isSalesManager\(user\.role\)\) return forbidden/,
  };
  for (const [rel, pattern] of Object.entries(cases)) assert.match(src(rel), pattern, rel);
});
