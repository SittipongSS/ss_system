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
//   ae_supervisor — Sales dept head. Controls ALL teams' sales/PM work (data
//                   scope 'all', like admin) and can VIEW tax status, but is NOT
//                   a system admin (no users:manage / master:manage / audit:view)
//                   and cannot approve tax (legal:approve is the legal role's).
//                   During the phased rollout sees only the PM hub card.
//   senior_ae     — team lead (team = ODM | KA | SV). Edits whole team.
//   ac            — Account Coordinate (back-office). Edits whole team, no delete.
//   ae            — Account Executive (front-office). Edits only own records.
//   legal         — Legal dept. Views all teams; approves / files tax. No edits.
//   rd            — ฝ่ายวิจัยและพัฒนา (RD). Sales' primary technical counterpart:
//                   READS every team's deals/projects/quotations (salesplan:view at
//                   'all' scope — full context to answer Sales' inquiries) and works
//                   its own queue in My Work (personal tasks + the 'workflow' edit
//                   tier on project steps assigned to the RD department, same as
//                   staff). Never edits deals or project plans; no cost margin.
//   viewer        — Read-only observer of the WHOLE system. Holds every :view
//                   capability across all modules (all teams' data, via viewScope
//                   'all') but cannot add / edit / delete anywhere. Confidential
//                   factory cost/margin is OFF by default; an admin may tick the
//                   per-user grant (products:margin) to give one viewer LG-level
//                   cost sight. Own department.
//   executive     — ผู้บริหาร (ฝ่าย EX). Read-only observer like `viewer`, plus the
//                   ONE authority that is exclusively theirs: approving the
//                   production price on a costing request (costing:approve).
//                   Sees the full cost breakdown INSIDE a costing request
//                   (costing:view) — that is what they price from — but does NOT
//                   hold products:margin: the factory margin split is a separate
//                   system used only for excise-tax registration (มติ 2026-07-22).
//                   Every other surface stays read-only; the proxy write-gate
//                   blocks writes for lack of :edit/:act.
//
// Teams: ODM (New ODM) | KA (Key Account) | SV (Services).
//
// Capability strings: "<resource>:<action>"
//   customers:view | customers:edit | customers:delete
//   products:view  | products:edit  | products:delete | products:margin
//     (products:margin = see the factory cost BREAKDOWN + profit. costPrice
//      itself stays visible to anyone with products:view; only the derived
//      material/labor/shipping split and factoryProfit are gated — LG + admin.)
//   legal:view     | legal:approve
//   sales:view     | sales:act      | sales:delete   (sales = the order/PO workflow)
//   history:view   | audit:view
//   master:manage  (edit shared master taxonomy, e.g. product_types categories)
//   pm:view        | pm:edit        (project management — SALES only)
//   salesplan:view | salesplan:edit | salesplan:review | salesplan:target
//     (Sales Planning commercial spine: pipeline / forecast / target / review)
//   costing:view   | costing:edit   | costing:quote  | costing:approve
//     (ระบบขอราคาต้นทุน — SA ประกอบใบ (edit), RD/PC เติมราคาฝ่ายตน (quote),
//      ผู้บริหารอนุมัติราคาผลิต (approve). costing:view เปิดให้เห็นต้นทุนเต็มใบ
//      ซึ่งแยกขาดจาก products:margin — คนละระบบ ดู canViewCosting.)
//   sahamit:view   | sahamit:edit   (SAHAMIT Planning & Sales — FC/PO/Reconcile.
//     Capability is held by every sales role, but ACCESS is further narrowed to
//     team === 'KA' (+ admin / sales head oversight) via canAccessSahamit(). The
//     module also scopes to a single customer (สหมิตร AR-109) inside its handlers.)

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
//   AD = ผู้ดูแลระบบ · SEC = ฝ่ายเลขานุการ · SA = ฝ่ายขาย · LG = ฝ่ายกฎหมาย · Viewer = ผู้ดูข้อมูล
//   EX = ฝ่ายบริหาร · PC = ฝ่ายจัดซื้อ · PD = ฝ่ายผลิต · WH = ฝ่ายคลัง · RD = ฝ่ายวิจัยและพัฒนา · QC = ฝ่ายควบคุมคุณภาพ
export const DEPARTMENTS = ['AD', 'SEC', 'SA', 'MK', 'LG', 'EX', 'Viewer', 'PC', 'PD', 'WH', 'RD', 'QC'];
// Display label is the code itself (พนักงานคุ้นกับโค้ดบน timeline อยู่แล้ว).
export const DEPARTMENT_LABELS = {
  AD: 'Admin', SEC: 'SEC', SA: 'SA', MK: 'MK', LG: 'LG', EX: 'EX', Viewer: 'Viewer',
  PC: 'PC', PD: 'PD', WH: 'WH', RD: 'RD', QC: 'QC',
};
// Thai names — used only for tooltips/help text, not the primary display.
export const DEPARTMENT_NAMES_TH = {
  AD: 'ผู้ดูแลระบบ', SEC: 'ฝ่ายเลขานุการ', SA: 'ฝ่ายขาย', MK: 'ฝ่ายการตลาด', LG: 'ฝ่ายกฎหมาย',
  EX: 'ฝ่ายบริหาร', Viewer: 'ผู้ดูข้อมูล',
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
  SEC: ['secretary'],
  SA: ['ae_supervisor', 'senior_ae', 'ac', 'ae'],
  // MK = ฝ่ายการตลาด (เฟส C มติ #2): กรอกลีดรายวัน — เห็นเฉพาะเมนูลีด
  MK: ['marketing'],
  LG: ['legal'],
  // EX = ฝ่ายบริหาร — ผู้อนุมัติราคาผลิตในระบบขอราคาต้นทุน (ไม่มี operation อื่น)
  EX: ['executive'],
  Viewer: ['viewer'],
  // RD ได้ role เฉพาะ (rd) — คู่คิดหลักของฝ่ายขาย เห็นดีล/โครงการทุกทีมเพื่อตอบ
  // ข้อสอบถาม; ยังอนุญาต staff ไว้สำหรับข้อมูลเก่า/คนที่ไม่ต้องเข้าระบบขาย.
  PC: ['staff'], PD: ['staff'], WH: ['staff'], RD: ['rd', 'staff'], QC: ['staff'],
};

// A role's home/default department — used to display legacy users whose
// department wasn't stored. `staff` spans 5 departments so it has no default;
// staff users always carry an explicit department.
const ROLE_DEFAULT_DEPARTMENT = {
  admin: 'AD',
  secretary: 'SEC',
  ae_supervisor: 'SA', senior_ae: 'SA', ac: 'SA', ae: 'SA',
  marketing: 'MK',
  legal: 'LG', executive: 'EX', viewer: 'Viewer',
  rd: 'RD',
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
export const ROLES = ['admin', 'secretary', 'ae_supervisor', 'senior_ae', 'ac', 'ae', 'marketing', 'legal', 'rd', 'executive', 'viewer', 'staff'];
export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ (Admin)',
  secretary: 'เลขานุการ (Secretary)',
  ae_supervisor: 'AE Supervisor',
  senior_ae: 'Senior AE',
  ac: 'Account Coordinate',
  ae: 'Account Executive',
  marketing: 'การตลาด (Marketing)',
  legal: 'ฝ่ายกฎหมาย',
  rd: 'วิจัยและพัฒนา (RD)',
  executive: 'ผู้บริหาร (Executive)',
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
  'salesplan:view', 'salesplan:edit',
  // ลีด (เฟส C): ทุก sales role ทำงานคิวลีดได้ (คัดกรอง/กระจาย/ติดต่อ — row-level
  // ตาม role บังคับใน handler); role marketing ถือ cap นี้ตัวเดียว (กรอกลีดอย่างเดียว)
  'salesplan:lead',
  // SAHAMIT module — granted to every sales role; team===KA narrows actual access.
  'sahamit:view', 'sahamit:edit',
  // ระบบขอราคาต้นทุน: ฝ่ายขายเป็นคนเปิดใบ + ประกอบต้นทุน. ไม่มี costing:approve
  // (ราคาผลิตอนุมัติโดยผู้บริหารเท่านั้น — มติ 2026-07-22) และไม่มี costing:quote
  // (ราคา RM/PM มาจาก RD/PC ฝ่ายขายกรอกแทนไม่ได้ ไม่งั้นที่มาของราคาหายไป).
  'costing:view', 'costing:edit',
  'history:view',
];

// Every capability in the system. Held in full only by `admin`.
const SUPERUSER_CAPS = [
  'customers:view', 'customers:edit', 'customers:delete',
  'products:view', 'products:edit', 'products:delete', 'products:margin',
  'sales:view', 'sales:act', 'sales:delete',
  'legal:view', 'legal:approve',
  'history:view', 'audit:view',
  'users:manage',
  'master:manage',  // edit category taxonomy (product_types) + master config
  'pm:view', 'pm:edit',
  'salesplan:view', 'salesplan:edit', 'salesplan:review', 'salesplan:target', 'salesplan:lead',
  'sahamit:view', 'sahamit:edit',
  'costing:view', 'costing:edit', 'costing:quote', 'costing:approve',
  'mgmt:view', 'mgmt:edit',   // งานบริหาร (Management/Executive Office) — admin + secretary only
];

// Admin-only system capabilities — account management, master taxonomy, and the
// audit log. These are what separate `admin` from `ae_supervisor`.
const ADMIN_SYSTEM_CAPS = ['users:manage', 'master:manage', 'audit:view'];

// Capabilities a sales head does NOT inherit from the full superuser set:
//   - the admin-system caps (account/master/audit management)
//   - legal:approve — tax approval is reserved for the `legal` role (admin keeps
//     it as a break-glass). ae_supervisor still has legal:view (sees tax status).
//   - products:margin — the factory cost breakdown + profit is restricted to
//     LG + admin; even the sales head sees only costPrice, not the margin split.
//   - the งานบริหาร module caps (mgmt:*) — that module is admin + secretary only,
//     the sales head has no role in it.
//   - costing:approve — ราคาผลิตอนุมัติโดยผู้บริหาร (executive) เท่านั้น มติ 2026-07-22
//     (admin คงไว้ break-glass เหมือน legal:approve)
//   - costing:quote — ราคา RM/PM เป็นคำตอบของ RD/PC หัวหน้าฝ่ายขายตอบแทนไม่ได้
const SALES_HEAD_EXCLUDED = [
  ...ADMIN_SYSTEM_CAPS, 'legal:approve', 'products:margin', 'mgmt:view', 'mgmt:edit',
  'costing:approve', 'costing:quote',
];

// Sales head (ae_supervisor): every remaining sales/legal-view/PM capability
// across ALL teams. Data scope stays 'all' via isSuperuser().
const SALES_HEAD_CAPS = SUPERUSER_CAPS.filter((c) => !SALES_HEAD_EXCLUDED.includes(c));

// Whole-system read-only observation: every :view cap, no writes anywhere.
// Shared by `viewer` and `executive` so the two never drift apart — executive is
// this set PLUS its costing authority (see ROLE_CAPS.executive).
const OBSERVER_CAPS = [
  'customers:view', 'products:view',
  'sales:view', 'legal:view', 'history:view',
  'pm:view', 'salesplan:view', 'sahamit:view', 'mgmt:view',
];

const ROLE_CAPS = {
  // admin: system administrator — full capabilities, all teams (see isSuperuser).
  admin: SUPERUSER_CAPS,
  // secretary: ฝ่ายเลขานุการ — โมดูล "งานบริหาร" (mgmt) เต็มสิทธิ์,
  // ไม่มีสิทธิ์ในระบบ tax/pm/sahamit. scope = ทั้งบริษัท (gate ที่ cap พอ).
  // + products:view อ่านอย่างเดียว (มติ 2026-07-20) — แคตตาล็อกสินค้าเป็นข้อมูลกลาง
  //   ที่ต้องใช้อ้างอิง; ไม่มี products:edit → proxy บล็อกการเขียนให้เอง
  //   และไม่มี products:margin → ไม่เห็นต้นทุน/มาร์จิ้น
  secretary: ['mgmt:view', 'mgmt:edit', 'products:view'],
  // ae_supervisor: sales head — all-team data scope, but not a system admin.
  ae_supervisor: SALES_HEAD_CAPS,
  // team lead: ops + may delete orders (scoped to own team via deleteScope).
  // Target planning is reserved for the sales head and admin.
  senior_ae: [...SALES_OPS, 'sales:delete'],
  // back-office + front-office: same capabilities, differ only by edit SCOPE
  ac: SALES_OPS,
  ae: SALES_OPS,
  // marketing (ฝ่ายการตลาด MK — เฟส C): กรอก/แก้ลีดของตัวเองเท่านั้น
  // ไม่มีสิทธิ์ดู pipeline/ลูกค้า/โครงการ/ยอดขายใด ๆ
  // + products:view อ่านอย่างเดียว (มติ 2026-07-20) — ต้องรู้ว่าบริษัทขายอะไร
  //   ตอนคุยลีด; ไม่มี products:edit / products:margin (ดู secretary)
  marketing: ['salesplan:lead', 'products:view'],
  // legal views registries + does tax approval; no edit/delete of sales data.
  // legal is the cost-margin authority (sees the factory cost breakdown + profit).
  legal: ['customers:view', 'products:view', 'products:margin', 'legal:view', 'legal:approve', 'history:view'],
  // viewer: read-only observer of the WHOLE system — holds every :view capability
  // across all modules (database / tax / sales / PM / sahamit / mgmt) at 'all'-team
  // scope, but NO edit/act/delete/approve/manage. add/edit/delete is impossible
  // everywhere: the proxy's capability write-gate (apiWriteAllowed) blocks writes
  // for lack of the :edit/:act/:delete caps. Confidential factory cost/margin is
  // NOT here by default — it's grantable per-user (products:margin), same as LG.
  viewer: OBSERVER_CAPS,
  // executive: ผู้บริหาร — observer เต็มระบบเหมือน viewer + อำนาจเดียวที่เป็นของเขา
  // คนเดียว คืออนุมัติราคาผลิตในใบขอราคาต้นทุน. costing:view เปิดต้นทุนเต็มใบให้
  // (ข้อมูลที่ใช้ตั้งราคา) แต่ไม่มี products:margin — กำไรโรงงานเป็นระบบสรรพสามิต
  // คนละส่วนกัน (มติ 2026-07-22); ถ้าวันหน้าจำเป็นให้ grant รายคนได้ (GRANTABLE_CAPS).
  // ไม่มี :edit/:act ใด ๆ → proxy write-gate บล็อกทุกการเขียนนอกเส้นอนุมัติให้เอง.
  executive: [...OBSERVER_CAPS, 'costing:view', 'costing:approve'],
  // rd: ฝ่ายวิจัยและพัฒนา — คู่คิดหลักของฝ่ายขาย. อ่านดีล/โครงการ/ใบเสนอราคา
  // ทุกทีม (salesplan:view — scope 'all' ผ่าน salesPlanningViewScope) เพื่อเห็น
  // บริบทเต็มเวลาฝ่ายขายส่งข้อสอบถาม + ใช้ระบบงานของฉัน (workflow tier แบบ staff)
  // + ตอบข้อสอบถามของฝ่ายตน (inquiries:respond — ตาราง inquiries, mig 0104).
  // ไม่มีสิทธิ์แก้ดีล/แผนโครงการ (ไม่มี salesplan:edit / pm:edit / sales:act) และ
  // ไม่เห็นต้นทุน/มาร์จิ้น (ไม่มี products:margin — grant รายคนได้ถ้าจำเป็น).
  // + costing:quote — ตอบราคา RM (หัวน้ำหอม/เนื้อสาร) บนบรรทัดของฝ่ายตนในใบขอราคา
  //   ต้นทุน; เห็นใบผ่าน costing:view. บรรทัดของฝ่ายอื่นแก้ไม่ได้ (canQuoteCosting
  //   + การกรอง sourceDept ใน handler).
  rd: [
    'pm:view', 'products:view', 'customers:view', 'salesplan:view', 'inquiries:respond',
    'costing:view', 'costing:quote',
  ],
  // staff: a member of a non-sales department (PC/PD/WH/RD/QC). Logs in to see
  // PM + the tasks assigned to them, and may READ the shared master data
  // (products/customers) — but never the cost margin (no products:margin).
  // costing:* is held at role level because ฝ่ายจัดซื้อ (PC) — the source of PM
  // prices — has no role of its own; ACCESS is then narrowed to department
  // RD/PC by canViewCosting/canQuoteCosting, the same "cap broad, gate narrow"
  // shape as sahamit (cap on every sales role, team===KA narrows). PD/WH/QC hold
  // the cap but reach nothing: always gate through those two helpers, never
  // through can(role, 'costing:view') alone, or their cost data leaks.
  staff: ['pm:view', 'products:view', 'customers:view', 'costing:view', 'costing:quote'],
};

// Unknown role: read-only viewer (sees registries + history, no actions).
const DEFAULT_CAPS = ['customers:view', 'products:view', 'history:view'];

export function capsFor(role) {
  return ROLE_CAPS[role] || DEFAULT_CAPS;
}

export function can(role, cap) {
  return capsFor(role).includes(cap);
}

// ── Per-user capability grants (app_metadata.extraCaps) ───────────────
// A user keeps their base role but an admin may GRANT a small, whitelisted set
// of extra capabilities on top — e.g. a Sales lead who must also do the ฝ่าย
// กฎหมาย (LG) work while LG is short-staffed, or a Viewer/auditor who needs the
// admin-only READ surfaces (audit log, user list). Grants are additive only;
// they never remove a role's caps.
//
// SECURITY: only READ / act caps are grantable. The admin WRITE caps
// (users:manage, master:manage) are deliberately NOT grantable — a grant can
// never let someone create/edit/delete users or master taxonomy. audit:view and
// users:view are read-only windows (audit has no writes; users:view is distinct
// from users:manage, and every /api/users write is gated on users:manage — the
// role cap — in the proxy, so a users:view grant can never mutate an account).
//
// Only these caps may be granted per-user. Anything else is ignored (defense
// against a stale/tampered app_metadata array escalating privilege).
export const GRANTABLE_CAPS = ['legal:view', 'legal:approve', 'products:margin', 'mgmt:view', 'mgmt:edit', 'audit:view', 'users:view'];
export const GRANTABLE_CAP_LABELS = {
  'legal:view': 'ดูสถานะภาษีทุกทีม (LG)',
  'legal:approve': 'อนุมัติ/ยื่นภาษี แทนฝ่ายกฎหมาย (LG)',
  'products:margin': 'เห็นต้นทุน/กำไรโรงงาน (ทำรายงานผู้บริหาร)',
  'mgmt:view': 'เข้าดูระบบงานบริหาร (mgmt)',
  'mgmt:edit': 'เพิ่ม/แก้ไขข้อมูลในระบบงานบริหาร (mgmt)',
  'audit:view': 'ดูบันทึกการใช้งาน (audit log) — อ่านอย่างเดียว',
  'users:view': 'ดูรายชื่อผู้ใช้ (/users) — อ่านอย่างเดียว ไม่เพิ่ม/แก้/ลบ',
};

// Keep only whitelisted, de-duplicated grants. Accepts anything, returns [].
export function sanitizeExtraCaps(extraCaps) {
  if (!Array.isArray(extraCaps)) return [];
  return [...new Set(extraCaps.filter((c) => GRANTABLE_CAPS.includes(c)))];
}

// A user's EFFECTIVE capabilities = role caps ∪ sanitized per-user grants.
// Prefer this over can(role, …) wherever a `user` object is in hand.
export function capsForUser(user) {
  const base = capsFor(user?.role);
  const extra = sanitizeExtraCaps(user?.extraCaps);
  return extra.length ? [...new Set([...base, ...extra])] : base;
}

export function canUser(user, cap) {
  return capsForUser(user).includes(cap);
}

// Superuser roles: 'all'-team data scope on every resource (view/edit/delete).
// This is about SCOPE, not capabilities — `admin` and `ae_supervisor` both see
// and edit every team's records, but only `admin` holds the admin-system caps
// (users:manage / master:manage / audit:view). Use `can(role, …)` to gate those.
export function isSuperuser(role) {
  return role === 'admin' || role === 'ae_supervisor';
}

// Whole-system READ-ONLY observers: `viewer` and `executive`. They see every
// team's data (viewScope 'all') but own no operational workflow — no tasks of
// their own, nothing to pull or be assigned. Every place that used to test
// `role === 'viewer'` must use this instead, or executive silently gains an
// operational surface it should not have.
export function isReadOnlyObserver(role) {
  return role === 'viewer' || role === 'executive';
}

// ── ระบบขอราคาต้นทุน (Costing Request) ────────────────────────────────
// ฝ่ายที่เป็น "แหล่งราคา" ของบรรทัดในใบ — ตรงกับ costing_item_components.sourceDept
export const COSTING_SOURCE_DEPARTMENTS = ['RD', 'PC'];

// เห็นใบขอราคาต้นทุน (รวมต้นทุนเต็มใบ). staff ถือ cap ระดับ role เพราะฝ่ายจัดซื้อ
// (PC) ไม่มี role ของตัวเอง จึงต้องแคบด้วยฝ่ายตรงนี้ ไม่งั้น PD/WH/QC เห็นต้นทุนไปด้วย
export function canViewCosting(user) {
  if (!canUser(user, 'costing:view')) return false;
  if (user?.role !== 'staff') return true;
  return COSTING_SOURCE_DEPARTMENTS.includes(departmentOf(user));
}

// ตอบราคาบนบรรทัดของฝ่ายตน (RD = RM, PC = PM). ตัว cap อย่างเดียวไม่พอ —
// ต้องอยู่ฝ่าย RD/PC จริง; handler ยังต้องกรอง sourceDept รายบรรทัดซ้ำอีกชั้น
export function canQuoteCosting(user) {
  if (!canUser(user, 'costing:quote')) return false;
  if (isSuperuser(user?.role)) return true; // admin break-glass
  return COSTING_SOURCE_DEPARTMENTS.includes(departmentOf(user));
}

// อนุมัติราคาผลิต — ผู้บริหาร (executive) เท่านั้น + admin break-glass.
// คนเดียวจบ ไม่มีอนุมัติซ้อน (มติ 2026-07-22)
export function canApproveCosting(user) {
  return canUser(user, 'costing:approve');
}

// ── Master-data approval authority ────────────────────────────────────
// Org rule: AE / AC / Senior AE สร้างลูกค้า/สินค้าได้ แต่ของใหม่ค้างเป็น 'pending'
// จนกว่า AE Supervisor จะอนุมัติ. ผู้อนุมัติ auto-approve ของที่ตัวเองสร้าง
// (เป็นผู้มีอำนาจอนุมัติอยู่แล้ว).
//   ae_supervisor  — อนุมัติได้ทุกทีม (sales head) = ผู้อนุมัติตัวจริงเพียงคนเดียว
//   admin          — บัญชี sysadmin แยก เก็บไว้ break-glass (ดู [[admin-account-separation]])
//
// เดิม senior_ae อนุมัติของทีมตัวเองได้ — ตัดออกตามมติผู้ใช้ 2026-07-17: การอนุมัติ
// ข้อมูลหลักรวมศูนย์ที่ AE Supervisor คนเดียว. ผลพลอยได้คือ Senior AE ที่สร้าง
// ลูกค้า/สินค้าเองจะไม่ auto-approve อีก ต้องรอ Supervisor เหมือน AE/AC
// (isSuperuser = admin || ae_supervisor — ครอบทั้งสอง role ที่เหลือพอดี)
export function canApproveMasterData(role) {
  return isSuperuser(role);
}

// Product-category taxonomy is business master data owned by the Sales head.
// Keep this separate from `master:manage`: that capability also controls
// system-level configuration (for example holidays) and remains admin-only
// until the final permission-redesign phase.
export function canManageProductCategories(role) {
  return role === 'admin' || role === 'ae_supervisor';
}

// Controlled document identity is business-owned by the Sales head, while the
// admin account remains the break-glass authority. Keep this separate from
// `master:manage`: granting that capability would also expose system-only
// configuration such as Company Data and Workflow Template management.
export function canManageDocumentStandards(role) {
  return role === 'admin' || role === 'ae_supervisor';
}

// Commercial terms are business-owned by the Sales head. Keep this separate
// from system-wide `master:manage` until the permission redesign in Phase 8–9.
export function canManageCommercialPresets(role) {
  return role === 'admin' || role === 'ae_supervisor';
}

// ── SAHAMIT module access ─────────────────────────────────────────────
// The SAHAMIT (Planning & Sales) module is restricted to the SA · Key Account
// (KA) team, plus admin / sales-head oversight. Capability alone isn't enough —
// every sales role holds sahamit:view, so the team gate is what actually scopes
// it. Used by the /home card, the /sahamit page guard, and the API handlers
// (which additionally scope to customer สหมิตร AR-109).
//   user = { role, team }
export function canAccessSahamit(role, team) {
  if (isSuperuser(role)) return true;           // admin + sales head: cross-team oversight
  if (isReadOnlyObserver(role)) return true;    // viewer/executive see every module (writes still blocked by cap)
  return can(role, 'sahamit:view') && team === 'KA';
}

// ── งานบริหาร (Management / Executive Office) module access ────────────
// โมดูล mgmt เข้าได้เฉพาะผู้ถือ mgmt:view — admin + secretary โดย role, บวกกับ
// ผู้ใช้รายคนที่ได้รับ "สิทธิ์เสริม" mgmt:view (app_metadata.extraCaps) เช่นให้ SA
// ช่วยงานเลขาชั่วคราว. scope = ทั้งบริษัท (ไม่ผูก team) — capability อย่างเดียวคุมพอ.
// ae_supervisor ไม่ได้ mgmt caps โดย role (ถูกตัดใน SALES_HEAD_EXCLUDED) แต่ได้ถ้า
// ถูก grant. รับ user object ({ role, extraCaps }) เพื่อให้ grant มีผล.
// ใช้ที่ /home card, page guard, และ API handlers.
export function canAccessMgmt(user) {
  return canUser(user, 'mgmt:view');
}

// ── Data scope ────────────────────────────────────────────────────────
// 'all'  = every team's records
// 'team' = only records belonging to the user's own team
// 'own'  = only records the user owns (ownerId === user id)
// 'none' = may not write at all

export function viewScope(role) {
  if (isSuperuser(role) || role === 'legal' || isReadOnlyObserver(role) || role === 'staff' || role === 'rd') return 'all';
  return 'team'; // senior_ae, ac, ae, and unknown viewer
}

// User-aware view scope: a per-user grant of legal:view (an SA acting as LG)
// widens visibility to ALL teams, exactly like the built-in `legal` role — so a
// grantee sees every team's tax records they now have to approve. Falls back to
// the role-only viewScope for everyone else. Use this (not viewScope(role)) in
// handlers that have the full user object and cover legal-touchable resources.
export function viewScopeUser(user) {
  if (canUser(user, 'legal:view')) return 'all';
  return viewScope(user?.role);
}

export function editScope(role) {
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none'; // legal (acts via approval only) + viewer
}

// PM (project management) edit scope. PM is a collaborative TEAM tool, so it is
// MORE permissive than the generic editScope: every sales role — AE included —
// edits its whole team's projects/plans/timeline. This is deliberately separate
// from editScope so an AE stays 'own'-scoped on the commercial resources
// (customers / products / orders) while gaining 'team' authority over PM only.
// Row-level team scope is still enforced via inScope().
export function pmEditScope(role) {
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac' || role === 'ae') return 'team';
  return 'none'; // legal / viewer; staff edits assigned tasks via the
                 // 'workflow' tier in pmTaskEditTier, not the project plan.
}

export function inPmProjectScope(user, project) {
  if (inScope(pmEditScope(user?.role), user, project)) return true;
  return can(user?.role, 'pm:edit') && !!user?.id && user.id === project?.ownerId;
}

// Delete is stricter than edit:
//   customers / products — superuser only (org rule)
//   orders / projects    — superuser (all teams) + senior_ae (own team)
//   registrations        — superuser (all) + ทุก role ฝ่ายขายในทีมตัวเอง
//     มติผู้ใช้ 2026-07-22: เกณฑ์คือ "ยังเป็นร่าง" ไม่ใช่ "ใครสร้าง" — ทะเบียนร่าง
//     คืองานที่ยังไม่เข้าระบบ (ยังไม่ส่งนิติกรรมตรวจ) ทีมจัดการกันเองได้ ไม่งั้น
//     สร้างผิดแล้วต้องรอเจ้าของ/หัวหน้ามาลบ. เหตุผลเดียวกับ pmEditScope ที่ยก AE
//     เป็นระดับทีมเพราะเป็นงานร่วม. เงื่อนไข "ลบได้เฉพาะร่าง + ไม่มีบรรทัดใบสั่ง
//     อ้างถึง" ไม่ได้อยู่ที่นี่ — บังคับที่ registrationDeleteBlock (lib/deletion).
//     NOTE: ยังห้าม fallback ไป canEditRecord — legal (legal:approve bypass) ต้อง
//     ไม่หลุดเข้ามาในเส้นทางลบ หน้าที่ LG คือตรวจอนุมัติ/ตีกลับ ไม่ใช่ลบงานฝ่ายขาย.
export function deleteScope(role, resource) {
  if (isSuperuser(role)) return 'all';
  if ((resource === 'orders' || resource === 'projects') && role === 'senior_ae') return 'team';
  if (resource === 'registrations' && ['senior_ae', 'ac', 'ae'].includes(role)) return 'team';
  return 'none';
}

// role มีอำนาจลบทะเบียนสรรพสามิตในหลักการหรือไม่ (ยังไม่ดูตัวแถว) — ด่านหยาบของ
// proxy ต้องใช้ตัวนี้ ห้ามใช้ products:delete ของแคตตาล็อกสินค้า: cap นั้นมีแค่
// admin/หัวหน้าฝ่ายขาย ทำให้สาย senior_ae/ae ใน deleteScope กลายเป็นโค้ดตาย
// (ปุ่มลบโผล่แต่ยิงแล้ว 403 ทุกครั้ง). ด่านจริงราย record ยังเป็น canDeleteRecord.
export function canDeleteRegistrationRole(role) {
  return deleteScope(role, 'registrations') !== 'none';
}

// Decide if `user` (role + team + id) may act on a record with the given
// {team, ownerId}, at the required scope level. Used by API routes for
// row-level checks the proxy can't do (it doesn't see the record).
export function inScope(scope, user, record) {
  switch (scope) {
    case 'all':
      return true;
    case 'team':
      if (!user?.team) return false;
      // Multi-team records (customers.teams[], migration 0037): in scope if the
      // user's team is any of the caretaker teams. Falls back to the single
      // `team` for records without teams[] (products / orders / projects).
      if (Array.isArray(record?.teams) && record.teams.length) return record.teams.includes(user.team);
      return user.team === record?.team;
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
  // Customers AND products are the shared central catalog — any signed-in user
  // may VIEW the record (มติ 2026-07-20: แคตตาล็อกสินค้าเห็นทุกทีม, เหมือนลูกค้า).
  // The confidential factory cost/margin is redacted separately
  // (redactProductMargin); EDIT stays caretaker-team scoped (canEditRecord).
  // Was product-team scoped, which 404'd a cross-team product's detail page even
  // though the LIST (GET /api/products) already showed the row to every team —
  // so the caretaker team could never reach the edit form on it.
  if (resource === 'customers' || resource === 'products') return true;
  return inScope(viewScopeUser(user), user, record);
}

// Caretaker teams of a master record (a customer, or any {teams,team} shape).
// teams[] (migration 0037) is the source of truth; falls back to the legacy
// single `team`. Empty [] = teamless → shared master data (every team may edit,
// mirroring the GET catalog which shows teamless rows to all teams).
export function caretakerTeamsOf(record) {
  if (!record) return [];
  if (Array.isArray(record.teams) && record.teams.length) return record.teams.filter(Boolean);
  return record.team ? [record.team] : [];
}

export function canEditRecord(user, resource, record, caretakerTeams) {
  // Legal tax approval spans all teams (legal processes tax for everyone),
  // but legal does not edit the customer registry. Honours a per-user
  // legal:approve grant (an SA acting as LG) the same as the built-in role.
  if (resource !== 'customers' && canUser(user, 'legal:approve')) return true;

  // ── Master data (customers / products): CARETAKER-TEAM scoped ────────
  // Edit is gated by the team that CARES FOR the record, not who created it:
  //   • customer — its own teams[] (migration 0037)
  //   • product  — its OWNING CUSTOMER's teams[]. product.team only records the
  //     creator (มติ 2026-07-20: "the owner is the customer"), so the caller must
  //     resolve the owning customer's teams and pass them as `caretakerTeams`
  //     (see productCaretakerTeams). An UNRESOLVED value (undefined) fails closed.
  // EVERY sales role in that team may edit — AE included: a product/customer is
  // the team's asset, not one AE's own record (มติ 2026-07-21). Teamless ([]) =
  // shared master data: any holder of the edit cap may edit (mirrors GET).
  if (resource === 'customers' || resource === 'products') {
    if (isSuperuser(user?.role)) return true;
    if (!canUser(user, `${resource}:edit`)) return false; // defense-in-depth vs the proxy cap gate
    let teams;
    if (resource === 'products') {
      if (caretakerTeams == null) return false; // caller must resolve — fail closed
      teams = caretakerTeams.filter(Boolean);
    } else {
      teams = caretakerTeamsOf(record);
    }
    if (teams.length === 0) return true;                  // teamless = shared
    return !!user?.team && teams.includes(user.team);
  }

  // Orders / registrations / projects — creator/team/own scope (unchanged).
  return inScope(editScope(user?.role), user, record);
}

export function canDeleteRecord(user, resource, record) {
  return inScope(deleteScope(user?.role, resource), user, record);
}

// ── PM (project management) predicates ────────────────────────────────
// Which task scopes a role may request in My Work:
//   mine = tasks assigned to me · team = my team's projects · all = every team
// Who may see the Sales Task KPI dashboard (team leaderboard / scores) on the
// tasks page + /api/sales-planning/task-kpi. Read-only oversight:
//   superuser (admin / sales head) → all teams
//   senior_ae                      → own team (scoped in the handler)
//   viewer                         → all teams (whole-system read-only monitor)
// Single source of truth so the client toggle and the server guard never drift.
export function canSeeTaskKpi(role) {
  return isSuperuser(role) || role === 'senior_ae' || isReadOnlyObserver(role);
}

export function canSeeLeadKpi(role) {
  return isSuperuser(role) || role === 'marketing' || isReadOnlyObserver(role);
}

// แดชบอร์ด/KPI ของฝ่าย RD (SLA ตอบข้อสอบถาม + งานฝ่าย) — วัดแยกจาก KPI ฝ่ายขาย
// (มติผู้ใช้ 2026-07-15). rd เห็นของฝ่ายตัวเอง; ผู้บริหาร (superuser) + viewer
// เห็นเพื่อกำกับดูแล; ฝ่ายขายทั่วไปไม่เห็น (คนละเส้นวัด).
export function canSeeRdKpi(role) {
  return isSuperuser(role) || isReadOnlyObserver(role) || role === 'rd';
}

export function pmTaskScopes(role) {
  if (isSuperuser(role)) return ['mine', 'team', 'all'];
  // viewer = whole-system read-only observer → sees every team's tasks. It has no
  // tasks of its own and no team, so 'all' is the only meaningful scope (giving
  // just this also keeps the My Work scope tabs clean — no empty 'mine'/'team').
  if (isReadOnlyObserver(role)) return ['all'];
  if (role === 'rd') return ['mine', 'team'];
  // AE manages the whole team's projects in PM (see pmEditScope) → may also
  // browse the team's tasks in My Work, alongside Senior AE / AC.
  if (role === 'senior_ae' || role === 'ac' || role === 'ae') return ['mine', 'team'];
  return ['mine'];
}

// ฝ่ายของผู้ใช้ — app_metadata.department ถ้ามี ไม่งั้นอนุมานจาก role. ต้องมี fallback นี้เสมอ
// เพราะบัญชีส่วนใหญ่ไม่ได้ตั้ง department ไว้ตรง ๆ (มันมาจาก role) — เทียบฝ่ายด้วยค่าดิบ
// จะได้ null แล้วบล็อกการมอบหมายทั้งหมดเงียบ ๆ
export function departmentOf(user) {
  return normalizeDepartment(user?.department) || departmentFor(user?.role) || null;
}

// Authority to ASSIGN a task to someone (Sales Task Management / งานมอบหมาย).
// ── กติกาหลัก: มอบหมายได้เฉพาะ "คนในฝ่ายเดียวกัน" (มติผู้ใช้ 2026-07-17) ──
//   admin                          → ทุกคน (บัญชีดูแลระบบ — ทางออกฉุกเฉิน ไม่ใช่คนทำงานขาย)
//   ae_supervisor                  → ทั้งฝ่าย SA (ข้ามทีมได้ แต่ข้ามฝ่ายไม่ได้)
//   senior_ae / ac / ae            → เฉพาะ "ทีมเดียวกัน" (ODM/KA/SV) ซึ่งแคบกว่าฝ่าย
//                                     (มติผู้ใช้: คงไว้เท่าเดิม ไม่ขยายเป็นทั้งฝ่าย)
//   rd                             → เฉพาะฝ่าย RD (2 คนไม่มีหัวหน้าฝ่ายในระบบ — สลับงานกันเอง)
//   everyone else                  → ตัวเองเท่านั้น
// ฝ่ายขายมอบงานตรงให้ RD/QC/PC ไม่ได้ — ต้องผ่าน "สอบถาม RD" (inquiry) เท่านั้น
// `assigner`/`assignee` = { id, role, team, department }; มอบให้ตัวเองได้เสมอ
export function canAssignTask(assigner, assignee) {
  if (!assigner?.id || !assignee?.id) return false;
  if (assigner.id === assignee.id) return true;
  if (assigner.role === 'admin') return true;
  // ด่านฝ่าย มาก่อนทุกกติกา — รวม ae_supervisor
  const dept = departmentOf(assigner);
  if (!dept || dept !== departmentOf(assignee)) return false;
  if (isSuperuser(assigner.role)) return true; // ae_supervisor: ทั้งฝ่าย SA
  // Any team member (Senior AE / AE / AC) may hand work to any teammate —
  // peer-to-peer within the team, not just top-down. Uses the canonical
  // TEAM_ROLES list so server + client + this rule never drift apart.
  if (TEAM_ROLES.includes(assigner.role)) {
    return !!assigner.team && assigner.team === assignee.team;
  }
  if (assigner.role === 'rd') return true; // ผ่านด่านฝ่ายมาแล้ว = RD ด้วยกัน
  return false;
}

// รายชื่อที่ "ฉันมอบหมายงานให้ได้" — ตัวเดียวที่ทุกหน้าต้องใช้ กันหน้าใดหน้าหนึ่งลืมกรอง
// (เคยเกิด: หน้ารายการกรอง แต่หน้ารายละเอียดยิงรายชื่อดิบเข้า dropdown ทั้งก้อน)
export function assignableUsersFor(me, users = []) {
  if (!me?.id) return [];
  return users.filter((u) => canAssignTask(me, u));
}

// ── Task takeover ("ดึงงาน") ─────────────────────────────────────────
// A teammate may confirm taking responsibility for someone else's task. The API
// then moves assigneeId to that teammate. `proxyBy` remains supported only for
// legacy rows created by the previous temporary proxy-work flow. These are pure
// predicates; the caller resolves the current responsible person's team.

// The user a task's KPI credit belongs to: whoever is actually doing it (a proxy
// who pulled it) → else the assignee → else the owner.
export function taskCreditId(task) {
  return task?.proxyBy || task?.assigneeId || task?.ownerId || null;
}

// Completed work has already earned KPI credit, so its responsible person must
// stay frozen. Saving an unchanged assignee is still allowed (for editing other
// fields in the same form); changing responsibility requires reopening first.
export function canChangeTaskAssignee(task, nextAssigneeId) {
  if (!task) return false;
  const current = task.assigneeId || null;
  const next = nextAssigneeId || null;
  return current === next || task.status !== 'Completed';
}

// May `user` TAKE this task? A teammate (shares team with the responsible person,
// or a superuser) who isn't already responsible, when no legacy proxy holds it.
// `respDept` = department of the responsible person (for the rd same-department rule).
export function canPullTask(user, task, respTeam, respDept) {
  if (!user?.id || !task) return false;
  if (task.status === 'Completed') return false;
  const respId = task.assigneeId || task.ownerId;
  if (respId === user.id) return false;                        // already yours
  if (task.proxyBy && task.proxyBy !== user.id) return false;  // held by someone else
  if (isSuperuser(user.role)) return true;                     // sup/admin → any team
  // an actual team member (not a read-only viewer / non-sales staff) may pull
  // within their own team.
  if (TEAM_ROLES.includes(user.role)) return !!user.team && user.team === respTeam;
  // rd: ช่วยกันภายในฝ่ายเดียวกัน (mirror กติกามอบหมาย canAssignTask ของ rd)
  if (user.role === 'rd') {
    const dept = normalizeDepartment(user.department);
    return !!dept && dept === normalizeDepartment(respDept);
  }
  return false;
}

// May `user` RELEASE (คืนงาน) the proxy hold? The current proxy, the responsible
// person, or a manager (passed as `manage` — owner/assignee/senior/superuser).
export function canReleaseTask(user, task, manage) {
  if (!user?.id || !task?.proxyBy) return false;
  if (manage) return true;
  if (task.proxyBy === user.id) return true;
  const respId = task.assigneeId || task.ownerId;
  return respId === user.id;
}

// May `user` change this task's STATUS? Only the responsible person, the proxy
// who pulled it, or a manager — a random teammate must PULL it first. `manage`
// = the caller's full-authority result (owner/assignee/senior-team/superuser).
export function canChangeTaskStatus(user, task, manage) {
  if (!user?.id || !task) return false;
  if (manage) return true;
  return task.proxyBy === user.id;
}

// Authority to edit a single project task. Pure — caller passes the loaded
// task + parent project. Returns:
//   'full'     — may edit the whole plan (team-scoped sales/admin)
//   'workflow' — assignee, or same-department staff: status/progress/notes only
//   'none'     — may not edit
export function pmTaskEditTier(user, task, project) {
  if (inPmProjectScope(user, project || {})) return 'full';
  // viewer/executive are pure read-only observers — never edit, even a task
  // assigned to them.
  if (isReadOnlyObserver(user?.role)) return 'none';
  const ownsTask = !!user?.id && task?.assigneeId === user.id;
  // staff + rd: ขั้นตอนที่มอบให้ "ฝ่าย" ของเขา (task.role === department) นับเป็น
  // งานของเขา — rd คือ staff ฝ่าย RD ที่ได้สิทธิ์อ่านระบบขายเพิ่ม จึงได้ tier เดียวกัน
  const workflowRole = user?.role === 'staff' || user?.role === 'rd';
  const sameDept = workflowRole && !!user?.department
    && normalizeDepartment(user.department) === task?.role;
  if (can(user?.role, 'pm:view') && (ownsTask || sameDept)) return 'workflow';
  return 'none';
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
  'status', 'taxDueDate', 'taxPaidDate', 'exciseReceiptNumber', 'exciseTaxPaidAmount',
  'taxFormRef', 'rejectionReason', 'taxInvoiceNumber',
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
  if (canUser(user, salesActCap)) salesEditable.forEach((f) => allowed.add(f));
  if (canUser(user, 'legal:approve')) {
    (LEGAL_FIELDS_BY_RESOURCE[resource] || LEGAL_PRODUCT_FIELDS).forEach((f) => allowed.add(f));
  }
  return allowed;
}

// ── Cost redaction (two tiers) ────────────────────────────────────────
// Factory cost data is confidential to the EXCISE TAX system. Two tiers:
//   • costPrice  — the factory cost. Visible to SA + LG + admin (anyone who
//     works the tax/sales flow). Hidden from other departments (staff) and
//     plain viewers, even though they may browse the product catalog.
//   • MARGIN_FIELDS — the cost breakdown + resulting profit. Stricter still:
//     LG + admin only (products:margin). Even SA sees costPrice but not these.
// Redaction happens server-side so the data never leaves the API; hiding the
// UI card alone would still leak it via a direct fetch.
export const MARGIN_FIELDS = ['materialCost', 'laborCost', 'shippingCost', 'factoryProfit'];

// May this role see the factory costPrice? SA (products:edit) own it; LG/admin
// (products:margin) see it too. Staff/viewers with read-only catalog access
// (products:view but neither edit nor margin) do NOT.
export function canSeeProductCost(role) {
  return can(role, 'products:margin') || can(role, 'products:edit');
}

// User-aware variant — honours a per-user products:margin grant (needed so a
// grantee sees costPrice both in the API redaction below and in the client UI).
export function canSeeProductCostUser(user) {
  return canUser(user, 'products:margin') || canUser(user, 'products:edit');
}

// Return a copy of `product` redacted for `user`: strip MARGIN_FIELDS unless
// they hold products:margin, and strip costPrice too unless canSeeProductCost.
// Pass-through (same ref) for margin-holders / falsy input. Use
// `.map(p => redactProductMargin(user, p))` for list responses.
export function redactProductMargin(user, product) {
  if (!product || canUser(user, 'products:margin')) return product;
  const out = { ...product };
  for (const f of MARGIN_FIELDS) delete out[f];
  if (!canSeeProductCostUser(user)) delete out.costPrice;
  return out;
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

// Landing route for the EXCISE TAX system (the "ภาษีสรรพสามิต" home card).
// Every role lands on the role-aware command center at /tax, which surfaces the
// items that role must act on and links into the per-stage workspace pages.
export function landingFor(role) {
  return '/tax';
}

export function canSeeDealKpi(role) {
  // Sales ทุกตำแหน่งเห็น KPI ดีลได้ (มติผู้ใช้) — API scope per-role อยู่แล้ว
  // (ae=own, senior_ae/ac=team, superuser/viewer=all) จึงไม่รั่วข้ามขอบเขต
  return isSuperuser(role) || role === 'senior_ae' || role === 'ae' || role === 'ac' || role === 'viewer';
}

export function salesDealScopes(role) {
  if (isSuperuser(role) || role === 'viewer') return ['mine', 'team', 'all'];
  // ac มี view scope ระดับทีมเหมือน senior_ae → ให้สลับดู KPI ระดับทีมได้
  if (role === 'senior_ae' || role === 'ac') return ['mine', 'team'];
  return ['mine'];
}
