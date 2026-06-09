// ── Role-based capabilities ──────────────────────────────────────────
// Role comes from Supabase user_metadata.role. Business rule: SA and Sales
// are the same operational team → both manage products/customers + sales
// clearance. Legal only views registries and approves. admin = everything.
//
// Capability strings: "<resource>:<action>"
//   customers:view | customers:edit
//   products:view  | products:edit
//   legal:view     | legal:approve
//   sales:view     | sales:act
//   history:view

const OPERATIONS = [
  'customers:view', 'customers:edit',
  'products:view', 'products:edit',
  'sales:view', 'sales:act',
  'history:view',
];

const ROLE_CAPS = {
  admin: [
    'customers:view', 'customers:edit',
    'products:view', 'products:edit',
    'legal:view', 'legal:approve',
    'sales:view', 'sales:act',
    'history:view',
  ],
  // SA + Sales = same team
  sa: OPERATIONS,
  sales: OPERATIONS,
  legal: ['customers:view', 'products:view', 'legal:view', 'legal:approve', 'history:view'],
};

// Unknown role: read-only viewer (can see registries + history, no actions)
const DEFAULT_CAPS = ['customers:view', 'products:view', 'history:view'];

export function capsFor(role) {
  return ROLE_CAPS[role] || DEFAULT_CAPS;
}

export function can(role, cap) {
  return capsFor(role).includes(cap);
}

// Default landing route per role (first menu they can act on).
export function landingFor(role) {
  if (role === 'legal') return '/legal';
  if (role === 'sa' || role === 'sales') return '/products';
  return '/customers'; // admin / viewer
}
