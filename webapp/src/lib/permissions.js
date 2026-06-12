// ── Role-based access control ─────────────────────────────────────────
// Access has TWO independent dimensions:
//   1. capability — WHAT action a role may do          (capsFor / can)
//   2. scope      — WHOSE records it may do it to       (viewScope / editScope / deleteScope)
//
// Identity comes from Supabase app_metadata (service-role-only, not
// self-editable): app_metadata.role + app_metadata.team + app_metadata.department.
// department (ฝ่าย) sits above team; it is stored explicitly and is NOT 1:1
// with role (see DEPARTMENT_ROLES). team (ODM/KA/SV) only exists under SA.
//
// Roles (org structure):
//   admin         — System administrator (ฝ่าย AD). Superuser: every capability,
//                   all teams, plus account/master/audit management. Sits above
//                   ae_supervisor and carries no sales org position.
//   ae_supervisor — Sales dept head. Superuser: every capability, all teams.
//   senior_ae     — team lead (team = ODM | KA | SV). Edits whole team.
//   ac            — Account Coordinate (back-office). Edits whole team, no delete.
//   ae            — Account Executive (front-office). Edits only own records.
//   legal         — Legal dept. Views all teams; approves / files tax. No edits.
//   viewer        — Read-only observer. Sees the Project Management system only
//                   (all teams' projects), no edits anywhere. Own department.
//
// Teams: ODM (New ODM) | KA (Key Account) | SV (Services).
//
// Capability strings: "<resource>:<action>"
//   customers:view | customers:edit | customers:delete
//   products:view  | products:edit  | products:delete
//   legal:view     | legal:approve
//   sales:view     | sales:act      | sales:delete   (sales = the order/PO workflow)
//   history:view   | audit:view
//   master:manage  (edit shared master taxonomy, e.g. product_types categories)
//   pm:view        | pm:edit        (project management — SALES only)

// ── Department (ฝ่าย) ─────────────────────────────────────────────────
// Top-level org division, one level above team. Stored explicitly in
// app_metadata.department.
//
// Department is NO LONGER 1:1 with role. The tax-system roles still imply a
// home department (SA/LG/Viewer), but the org also has departments that carry
// NO tax permissions — PC/PD/WH/RD/QC. People in those departments exist so PM
// tasks can pull a "ผู้รับผิดชอบ" by ฝ่าย; they share one baseline role (`staff`)
// that only grants read access to Project Management. Codes are kept short
// (matching the PM step-role codes SA/RD/PC/PD/QC/LG/WH) and shown as-is.
//   AD = ผู้ดูแลระบบ · SA = ฝ่ายขาย · LG = ฝ่ายกฎหมาย · Viewer = ผู้ดูข้อมูล
//   PC = ฝ่ายจัดซื้อ · PD = ฝ่ายผลิต · WH = ฝ่ายคลัง · RD = ฝ่ายวิจัยและพัฒนา · QC = ฝ่ายควบคุมคุณภาพ
export const DEPARTMENTS = ['AD', 'SA', 'LG', 'Viewer', 'PC', 'PD', 'WH', 'RD', 'QC'];
// Display label is the code itself (พนักงานคุ้นกับโค้ดบน timeline อยู่แล้ว).
export const DEPARTMENT_LABELS = {
  AD: 'Admin', SA: 'SA', LG: 'LG', Viewer: 'Viewer',
  PC: 'PC', PD: 'PD', WH: 'WH', RD: 'RD', QC: 'QC',
};
// Thai names — used only for tooltips/help text, not the primary display.
export const DEPARTMENT_NAMES_TH = {
  AD: 'ผู้ดูแลระบบ', SA: 'ฝ่ายขาย', LG: 'ฝ่ายกฎหมาย', Viewer: 'ผู้ดูข้อมูล',
  PC: 'ฝ่ายจัดซื้อ', PD: 'ฝ่ายผลิต', WH: 'ฝ่ายคลัง',
  RD: 'ฝ่ายวิจัยและพัฒนา', QC: 'ฝ่ายควบคุมคุณภาพ',
};

// Legacy app_metadata.department values written before the codes were shortened.
const LEGACY_DEPARTMENT = { SALES: 'SA', LEGAL: 'LG', VIEWER: 'Viewer' };
// Normalise a stored/incoming department to a current code (migrates on read).
export function normalizeDepartment(department) {
  if (!department) return null;
  return LEGACY_DEPARTMENT[department] || department;
}

// Roles allowed in each department (drives the dependent role dropdown). Teams
// (ODM/KA/SV) live only under SA; LG/Viewer/staff-departments have no teams.
const DEPARTMENT_ROLES = {
  AD: ['admin'],
  SA: ['ae_supervisor', 'senior_ae', 'ac', 'ae'],
  LG: ['legal'],
  Viewer: ['viewer'],
  PC: ['staff'], PD: ['staff'], WH: ['staff'], RD: ['staff'], QC: ['staff'],
};

// A role's home/default department — used to display legacy users whose
// department wasn't stored. `staff` spans 5 departments so it has no default;
// staff users always carry an explicit department.
const ROLE_DEFAULT_DEPARTMENT = {
  admin: 'AD',
  ae_supervisor: 'SA', senior_ae: 'SA', ac: 'SA', ae: 'SA',
  legal: 'LG', viewer: 'Viewer',
};

export function departmentFor(role) {
  return ROLE_DEFAULT_DEPARTMENT[role] || null;
}

// Roles belonging to a department (for dependent dropdowns).
export function rolesForDepartment(department) {
  return DEPARTMENT_ROLES[normalizeDepartment(department)] || [];
}

export const TEAMS = ['ODM', 'KA', 'SV'];
export const TEAM_LABELS = { ODM: 'New ODM', KA: 'Key Account', SV: 'Services' };

// Assignable roles (for the user-management UI), with Thai labels.
export const ROLES = ['admin', 'ae_supervisor', 'senior_ae', 'ac', 'ae', 'legal', 'viewer', 'staff'];
export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ (Admin)',
  ae_supervisor: 'AE Supervisor',
  senior_ae: 'Senior AE',
  ac: 'Account Coordinate',
  ae: 'Account Executive',
  legal: 'ฝ่ายกฎหมาย',
  viewer: 'ผู้ดูข้อมูล (Viewer)',
  staff: 'พนักงาน (Staff)',
};

// Roles that operate within a single team (team is required for them).
export const TEAM_ROLES = ['senior_ae', 'ac', 'ae'];

// Sales operational base (no delete, no legal). Shared by ae / ac.
// PM (project management) is a SALES-only tool — every sales role views+edits it
// (row-level team scope still applies via editScope); legal has no PM access.
const SALES_OPS = [
  'customers:view', 'customers:edit',
  'products:view', 'products:edit',
  'sales:view', 'sales:act',
  'pm:view', 'pm:edit',
  'history:view',
];

// Every capability in the system. Shared by the two superuser roles.
const SUPERUSER_CAPS = [
  'customers:view', 'customers:edit', 'customers:delete',
  'products:view', 'products:edit', 'products:delete',
  'sales:view', 'sales:act', 'sales:delete',
  'legal:view', 'legal:approve',
  'history:view', 'audit:view',
  'users:manage',
  'master:manage',  // edit category taxonomy (product_types) + master config
  'pm:view', 'pm:edit',
];

const ROLE_CAPS = {
  // admin: system administrator — full capabilities, all teams (see isSuperuser).
  admin: SUPERUSER_CAPS,
  ae_supervisor: SUPERUSER_CAPS,
  // team lead: ops + may delete orders (scoped to own team via deleteScope)
  senior_ae: [...SALES_OPS, 'sales:delete'],
  // back-office + front-office: same capabilities, differ only by edit SCOPE
  ac: SALES_OPS,
  ae: SALES_OPS,
  // legal views registries + does tax approval; no edit/delete of sales data
  legal: ['customers:view', 'products:view', 'legal:view', 'legal:approve', 'history:view'],
  // viewer: read-only observer of the Project Management system only (no writes)
  viewer: ['pm:view'],
  // staff: a member of a non-sales department (PC/PD/WH/RD/QC). Logs in to see
  // PM and the tasks assigned to them ("งานของฉัน"); no edit/tax access.
  staff: ['pm:view'],
};

// Unknown role: read-only viewer (sees registries + history, no actions).
const DEFAULT_CAPS = ['customers:view', 'products:view', 'history:view'];

export function capsFor(role) {
  return ROLE_CAPS[role] || DEFAULT_CAPS;
}

export function can(role, cap) {
  return capsFor(role).includes(cap);
}

// Superuser roles: full capabilities + 'all'-team scope on every resource.
// `admin` (system administrator) and `ae_supervisor` (sales head) are equivalent
// for access-control purposes; org-position-specific UI (e.g. signature blocks)
// may still single out ae_supervisor by name.
export function isSuperuser(role) {
  return role === 'admin' || role === 'ae_supervisor';
}

// ── Data scope ────────────────────────────────────────────────────────
// 'all'  = every team's records
// 'team' = only records belonging to the user's own team
// 'own'  = only records the user owns (ownerId === user id)
// 'none' = may not write at all

export function viewScope(role) {
  if (isSuperuser(role) || role === 'legal' || role === 'viewer' || role === 'staff') return 'all';
  return 'team'; // senior_ae, ac, ae, and unknown viewer
}

export function editScope(role) {
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none'; // legal (acts via approval only) + viewer
}

// Delete is stricter than edit:
//   customers / products — superuser only (org rule)
//   orders               — superuser (all teams) + senior_ae (own team)
export function deleteScope(role, resource) {
  if (isSuperuser(role)) return 'all';
  if (resource === 'orders' && role === 'senior_ae') return 'team';
  return 'none';
}

// Decide if `user` (role + team + id) may act on a record with the given
// {team, ownerId}, at the required scope level. Used by API routes for
// row-level checks the proxy can't do (it doesn't see the record).
export function inScope(scope, user, record) {
  switch (scope) {
    case 'all':
      return true;
    case 'team':
      return !!user?.team && user.team === record?.team;
    case 'own':
      return !!user?.id && user.id === record?.ownerId;
    case 'none':
    default:
      return false;
  }
}

// ── Resource-aware row checks ─────────────────────────────────────────
// Combine capability scope (role) with a record's {team, ownerId}. Used by
// API route handlers. `user` = { id, role, team }.

export function canViewRecord(user, resource, record) {
  // Customers are a central registry — any signed-in sales/legal user may view.
  if (resource === 'customers') return true;
  return inScope(viewScope(user?.role), user, record);
}

export function canEditRecord(user, resource, record) {
  // Legal tax approval spans all teams (legal processes tax for everyone),
  // but legal does not edit the customer registry.
  if (resource !== 'customers' && can(user?.role, 'legal:approve')) return true;
  return inScope(editScope(user?.role), user, record);
}

export function canDeleteRecord(user, resource, record) {
  return inScope(deleteScope(user?.role, resource), user, record);
}

// ── Field-level edit gating ───────────────────────────────────────────
// canEditRecord answers "may this user touch the row at all". But legal and
// sales touch DIFFERENT columns: sales own the commercial fields (price, cost,
// quotation…), legal owns the tax/approval fields. A legal user must NOT be
// able to rewrite costPrice just because they can approve. These lists are the
// columns each side may set; routes union the lists the user's caps unlock.

// Fields LG sets while approving / filing tax (not the commercial data).
export const LEGAL_PRODUCT_FIELDS = ['status', 'approvalNumber', 'taxableOverride', 'rejectionReason'];
// Excise registrations: LG owns the approval/tax columns; SA owns the link
// (which product + which customer it's submitted for).
export const LEGAL_REGISTRATION_FIELDS = ['status', 'approvalNumber', 'taxableOverride', 'rejectionReason'];
export const LEGAL_ORDER_FIELDS = [
  'status', 'taxDueDate', 'exciseReceiptNumber', 'exciseTaxPaidAmount',
  'exciseReceiptFileUrl', 'taxFormRef', 'rejectionReason',
];

// The capability a sales user needs to write a resource's commercial fields,
// and the LG-owned field list, per resource.
const RESOURCE_SALES_CAP = {
  orders: 'sales:act',
  registrations: 'products:edit', // SA submits/edits the registration link
};
const LEGAL_FIELDS_BY_RESOURCE = {
  orders: LEGAL_ORDER_FIELDS,
  registrations: LEGAL_REGISTRATION_FIELDS,
};

// Compute the set of body fields `user` may write to a record, given the
// resource's full sales-editable list. Supervisor gets both (full edit cap +
// legal cap). `salesEditable` is the route's existing commercial field list.
export function allowedEditFields(user, resource, salesEditable) {
  const allowed = new Set();
  const salesActCap = RESOURCE_SALES_CAP[resource] || `${resource}:edit`;
  if (can(user?.role, salesActCap)) salesEditable.forEach((f) => allowed.add(f));
  if (can(user?.role, 'legal:approve')) {
    (LEGAL_FIELDS_BY_RESOURCE[resource] || LEGAL_PRODUCT_FIELDS).forEach((f) => allowed.add(f));
  }
  return allowed;
}

// ── Identity validation (role + team + department) ────────────────────
// Used by the user-management API. Team-bound roles need a valid team;
// others must not carry one. Department, if supplied, must match the role's
// canonical department. Returns an error string, or null when valid.
export function validateIdentity(role, team, department) {
  if (!ROLES.includes(role)) return 'role ไม่ถูกต้อง';
  if (TEAM_ROLES.includes(role)) {
    if (!TEAMS.includes(team)) return 'ตำแหน่งนี้ต้องระบุทีม (ODM/KA/SV)';
  } else if (team) {
    return 'ตำแหน่งนี้ไม่ต้องระบุทีม';
  }
  const dep = normalizeDepartment(department);
  if (dep) {
    if (!DEPARTMENTS.includes(dep)) return 'ฝ่าย (department) ไม่ถูกต้อง';
    if (!rolesForDepartment(dep).includes(role)) return 'ฝ่าย (department) ไม่ตรงกับตำแหน่ง';
  } else if (!departmentFor(role)) {
    // staff has no default department, so one must be supplied explicitly.
    return 'ตำแหน่งนี้ต้องระบุฝ่าย';
  }
  return null;
}

// Landing route for the EXCISE TAX system (the "ระบบภาษีสรรพสามิต" home card).
// All excise pages live under /tax/*: LG lands on the registration-approval
// page, sales roles land on the registration-submission page.
export function landingFor(role) {
  if (role === 'legal') return '/tax/approve-register';
  return '/tax/register'; // sales roles (viewer has no tax access; its hub card is disabled)
}
