// ── Role-based access control ─────────────────────────────────────────
// Access has TWO independent dimensions:
//   1. capability — WHAT action a role may do          (capsFor / can)
//   2. scope      — WHOSE records it may do it to       (viewScope / editScope / deleteScope)
//
// Identity comes from Supabase app_metadata (service-role-only, not
// self-editable): app_metadata.role + app_metadata.team.
//
// Roles (org structure):
//   ae_supervisor — Sales dept head. Superuser: every capability, all teams.
//   senior_ae     — team lead (team = ODM | KA | SV). Edits whole team.
//   ac            — Account Coordinate (back-office). Edits whole team, no delete.
//   ae            — Account Executive (front-office). Edits only own records.
//   legal         — Legal dept. Views all teams; approves / files tax. No edits.
//
// Teams: ODM (New ODM) | KA (Key Account) | SV (Services).
//
// Capability strings: "<resource>:<action>"
//   customers:view | customers:edit | customers:delete
//   products:view  | products:edit  | products:delete
//   legal:view     | legal:approve
//   sales:view     | sales:act      | sales:delete   (sales = the order/PO workflow)
//   history:view   | audit:view

export const TEAMS = ['ODM', 'KA', 'SV'];
export const TEAM_LABELS = { ODM: 'New ODM', KA: 'Key Account', SV: 'Services' };

// Assignable roles (for the user-management UI), with Thai labels.
export const ROLES = ['ae_supervisor', 'senior_ae', 'ac', 'ae', 'legal'];
export const ROLE_LABELS = {
  ae_supervisor: 'AE Supervisor (ผู้ดูแลระบบ)',
  senior_ae: 'Senior AE (หัวหน้าทีม)',
  ac: 'Account Coordinate (หลังบ้าน)',
  ae: 'Account Executive (หน้าบ้าน)',
  legal: 'ฝ่ายกฎหมาย (Legal)',
};

// Roles that operate within a single team (team is required for them).
export const TEAM_ROLES = ['senior_ae', 'ac', 'ae'];

// Sales operational base (no delete, no legal). Shared by ae / ac.
const SALES_OPS = [
  'customers:view', 'customers:edit',
  'products:view', 'products:edit',
  'sales:view', 'sales:act',
  'history:view',
];

const ROLE_CAPS = {
  ae_supervisor: [
    'customers:view', 'customers:edit', 'customers:delete',
    'products:view', 'products:edit', 'products:delete',
    'sales:view', 'sales:act', 'sales:delete',
    'legal:view', 'legal:approve',
    'history:view', 'audit:view',
    'users:manage',
  ],
  // team lead: ops + may delete orders (scoped to own team via deleteScope)
  senior_ae: [...SALES_OPS, 'sales:delete'],
  // back-office + front-office: same capabilities, differ only by edit SCOPE
  ac: SALES_OPS,
  ae: SALES_OPS,
  // legal views registries + does tax approval; no edit/delete of sales data
  legal: ['customers:view', 'products:view', 'legal:view', 'legal:approve', 'history:view'],
};

// Unknown role: read-only viewer (sees registries + history, no actions).
const DEFAULT_CAPS = ['customers:view', 'products:view', 'history:view'];

export function capsFor(role) {
  return ROLE_CAPS[role] || DEFAULT_CAPS;
}

export function can(role, cap) {
  return capsFor(role).includes(cap);
}

// ── Data scope ────────────────────────────────────────────────────────
// 'all'  = every team's records
// 'team' = only records belonging to the user's own team
// 'own'  = only records the user owns (ownerId === user id)
// 'none' = may not write at all

export function viewScope(role) {
  if (role === 'ae_supervisor' || role === 'legal') return 'all';
  return 'team'; // senior_ae, ac, ae, and unknown viewer
}

export function editScope(role) {
  if (role === 'ae_supervisor') return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none'; // legal (acts via approval only) + viewer
}

// Delete is stricter than edit:
//   customers / products — supervisor only (org rule)
//   orders               — supervisor (all teams) + senior_ae (own team)
export function deleteScope(role, resource) {
  if (role === 'ae_supervisor') return 'all';
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

// Default landing route per role (first menu they can act on).
export function landingFor(role) {
  if (role === 'legal') return '/legal';
  if (role === 'ae_supervisor') return '/customers';
  if (role === 'senior_ae' || role === 'ac' || role === 'ae') return '/products';
  return '/customers'; // viewer
}
