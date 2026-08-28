// ── Role-based access control ─────────────────────────────────────────
// Access has TWO independent dimensions:
//   1. capability — WHAT action a role may do          (capsFor / can)
//   2. scope      — WHOSE records it may do it to       (viewScope / editScope / deleteScope)
//
// Identity comes from Supabase app_metadata (service-role-only, not
// self-editable): app_metadata.role + app_metadata.team + app_metadata.teams
// + app_metadata.department.
// department (ฝ่าย) sits above team; it is stored explicitly and is NOT 1:1
// with role (see DEPARTMENT_ROLES). team (ODM/KA/SV) only exists under SA.
// คนหนึ่งคนอยู่ได้หลายทีม — `teams` คือขอบเขต (scope) · `team` คือทีมหลักที่ใช้
// ตอนบันทึกเจ้าของงานใหม่ (attribution) ดู userTeams() / primaryTeam()
//
// Roles (org structure):
//   admin         — System administrator (ฝ่าย AD). Superuser: every capability,
//                   all teams, plus account/master/audit management. Sits above
//                   ae_supervisor and carries no sales org position.
//   ae_supervisor — Sales dept head. Controls ALL teams' sales/PM work (data
//                   scope 'all', like admin) and can VIEW tax status, but is NOT
//                   a system admin (no users:manage / master:manage / audit:view)
//                   and cannot approve tax (ra:approve is the RA role's).
//                   During the phased rollout sees only the PM hub card.
//   senior_ae     — team lead (team = ODM | KA | SV). Edits whole team.
//   ac            — Account Coordinate (back-office). Edits whole team, no delete.
//   ae            — Account Executive (front-office). Edits only own records.
//   RA         — Legal dept. Views all teams; approves / files tax. No edits.
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
//                   per-user grant (products:margin) to give one viewer RA-level
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
//                  | products:cost
//     (products:margin = see the factory cost BREAKDOWN + profit — RA + admin.
//      products:cost = see the factory costPrice ALONE, without the breakdown.
//      ⚠️ products:view is NOT enough to see costPrice — ดู canSeeProductCost:
//      ต้องถือ products:edit (SA) หรือ products:margin (RA/admin) หรือ
//      products:cost (FN — มติผู้ใช้ 2026-08-28: บัญชีต้องเห็นราคาผลิต แต่ไม่เห็น
//      โครงสร้างต้นทุน/กำไรโรงงาน).)
//   ra:view     | ra:approve
//   sales:view     | sales:act      | sales:delete   (sales = the order/PO workflow)
//   history:view   | audit:view
//   master:manage  (edit shared master taxonomy, e.g. product_types categories)
//   pm:view        | pm:edit        (project management — SALES only)
//   salesplan:view | salesplan:edit | salesplan:review | salesplan:target
//     (Sales Planning commercial spine: pipeline / forecast / target / review)
//   costing:view   | costing:edit   | costing:quote  | costing:approve
//     (ระบบขอราคาผลิต — SA ประกอบใบ (edit), RD/PC เติมราคาฝ่ายตน (quote),
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
// home department (SA/RA/Viewer), but the org also has departments that carry
// NO tax permissions — PC/PD/WH/RD/QC. People in those departments exist so PM
// tasks can pull a "ผู้รับผิดชอบ" by ฝ่าย; they share one baseline role (`staff`)
// that only grants read access to Project Management. Codes are kept short
// (matching the PM step-role codes SA/RD/PC/PD/QC/RA/WH) and shown as-is.
//   AD = ผู้ดูแลระบบ · SEC = ฝ่ายเลขานุการ · SA = ฝ่ายขาย · RA = ฝ่ายกฎระเบียบและขึ้นทะเบียนผลิตภัณฑ์ · Viewer = ผู้ดูข้อมูล
//   EX = ฝ่ายบริหาร · PC = ฝ่ายจัดซื้อ · PD = ฝ่ายผลิต · WH = ฝ่ายคลัง · RD = ฝ่ายวิจัยและพัฒนา · QC = ฝ่ายควบคุมคุณภาพ
//   TS = ฝ่ายเทคนิคบริการ (Technic Service) — ช่างที่เข้าไซต์ลูกค้าดูแลระบบกระจายกลิ่น
export const DEPARTMENTS = ['AD', 'SEC', 'SA', 'MK', 'RA', 'EX', 'Viewer', 'PC', 'PD', 'WH', 'RD', 'QC', 'TS', 'FN'];
// Display label is the code itself (พนักงานคุ้นกับโค้ดบน timeline อยู่แล้ว).
export const DEPARTMENT_LABELS = {
  AD: 'Admin', SEC: 'SEC', SA: 'SA', MK: 'MK', RA: 'RA', EX: 'EX', Viewer: 'Viewer',
  PC: 'PC', PD: 'PD', WH: 'WH', RD: 'RD', QC: 'QC', TS: 'TS', FN: 'FN',
};
// Thai names — used only for tooltips/help text, not the primary display.
export const DEPARTMENT_NAMES_TH = {
  AD: 'ผู้ดูแลระบบ', SEC: 'ฝ่ายเลขานุการ', SA: 'ฝ่ายขาย', MK: 'ฝ่ายการตลาด', RA: 'ฝ่ายกฎระเบียบและขึ้นทะเบียนผลิตภัณฑ์',
  EX: 'ฝ่ายบริหาร', Viewer: 'ผู้ดูข้อมูล',
  PC: 'ฝ่ายจัดซื้อ', PD: 'ฝ่ายผลิต', WH: 'ฝ่ายคลัง',
  RD: 'ฝ่ายวิจัยและพัฒนา', QC: 'ฝ่ายควบคุมคุณภาพ', FN: 'ฝ่ายบัญชีและการเงิน',
  TS: 'ฝ่ายเทคนิคบริการ',
};

// Legacy app_metadata.department values written before the codes were shortened.
/* ⚠️ **LG → RA (2026-08-28)**: ฝ่ายกฎหมายเปลี่ยนชื่อเป็นฝ่ายกฎระเบียบและขึ้นทะเบียน
   ผลิตภัณฑ์ (Regulatory Affairs) · ค่าที่เก็บไว้แล้วใน `app_metadata.department`
   ยังเป็น `LG` อยู่ ⇒ แปลงตอนอ่านเหมือนที่ `SALES`/`LEGAL` เคยทำ **ไม่ต้องย้ายข้อมูล** */
const LEGACY_DEPARTMENT = { SALES: 'SA', LEGAL: 'RA', LG: 'RA', VIEWER: 'Viewer' };
// Normalise a stored/incoming department to a current code (migrates on read).
/* ── ตะเข็บ "แปลง role ตอนอ่าน" ─────────────────────────────────────────────
 * ⭐ ที่มา: `legal` → `ra` (2026-08-28) · `app_metadata.role` อยู่ใน Supabase Auth
 * **ไม่ใช่ตารางในฐาน** ⇒ ไม่มี migration SQL ให้รันพร้อม deploy · โค้ดขึ้นก่อนย้าย
 * บัญชี = คนนั้นถือ role ที่ไม่มีในทะเบียน เข้าหน้าไหนไม่ได้เลย · ย้ายก่อนโค้ดขึ้น
 * ก็พังทางกลับกัน ⇒ แปลงตอนอ่าน แล้วลำดับ deploy กับลำดับย้ายข้อมูลไม่สำคัญอีก
 * (ท่าเดียวกับ `normalizeDepartment` ซึ่งยังมี `SALES` ค้างอยู่จริง 2 บัญชี)
 *
 * ✅ **ย้าย `legal` → `ra` ครบแล้ว 2026-08-28** — ตรวจ Admin API แล้วไม่เหลือสักบัญชี
 * (รวมบัญชีที่ปิดแล้ว) ⇒ ทะเบียนว่าง ฟังก์ชันจึงคืนค่าเดิมทุกกรณี ณ ตอนนี้
 *
 * ⚠️ **เก็บตะเข็บไว้โดยตั้งใจ ไม่ได้ลืมลบ** — จุดเรียกทั้ง 12 จุดถูก
 * `roleReadPoints.test.mjs` ตรึงไว้ ⇒ การเปลี่ยนชื่อ role ครั้งหน้าเหลือแค่เติม
 * หนึ่งบรรทัดในทะเบียนข้างล่าง ไม่ต้องไล่หาจุดอ่าน `app_metadata.role` ใหม่ทั้งระบบ
 * และไม่ต้องเรียนบทเรียน "ไม่มี migration ให้ role" ซ้ำอีกรอบ
 *
 * วิธีใช้ครั้งหน้า: เติม `{ ชื่อเก่า: 'ชื่อใหม่' }` แล้วลบออกเมื่อย้ายบัญชีครบ */
const LEGACY_ROLE = {};

/* ⭐ **`staff` แปลงด้วย "ฝ่าย" ไม่ใช่ตารางชื่อ** (มติผู้ใช้ 2026-08-28 · ยกเลิก role
   `staff` ทุกฝ่าย) — role เดียวเคยครอบห้าฝ่าย ⇒ ปลายทางขึ้นกับ `department` ของคนนั้น
   ⚠️ ไม่มีฝ่ายให้เทียบ = **คืน `staff` ตามเดิม** ไม่เดาเป็น role ไหน · role ที่ระบบ
   ไม่รู้จักตกไป `DEFAULT_CAPS` (อ่านทะเบียนอย่างเดียว) ซึ่งเป็นฝั่งที่ปลอดภัย
   🐞 เคยเขียน fallback เป็น `viewer` ⇒ **เปิดกว้างขึ้น** เพราะ viewer คือผู้สังเกตการณ์
   ทั้งระบบ (เห็นงานบริหารด้วย) — ตรงข้ามกับที่ตั้งใจ
   🗑️ ลบทิ้งได้เมื่อบัญชีที่เคยเป็น staff login ใหม่ครบ (2 บัญชี: PC · PD) */
const LEGACY_STAFF_ROLE_BY_DEPARTMENT = {
  PC: 'pc', PD: 'pd', WH: 'wh', QC: 'qc', TS: 'ts', RD: 'rd', FN: 'finance',
};

/** แปลง role ที่เก็บไว้/รับเข้ามา ให้เป็นชื่อปัจจุบัน (แปลงตอนอ่าน)
 *
 * ⚠️ `department` จำเป็นเฉพาะกับ `staff` เก่า — จุดอ่านที่มีฝ่ายในมือควรส่งมาด้วยเสมอ */
export function normalizeRole(role, department) {
  if (!role) return role;
  if (role === 'staff') {
    return LEGACY_STAFF_ROLE_BY_DEPARTMENT[normalizeDepartment(department)] || role;
  }
  return LEGACY_ROLE[role] || role;
}

/** role ที่ใช้จริงของผู้ใช้คนนี้ (จาก object ที่มีทั้ง role และ department) */
export function roleOf(user) {
  return normalizeRole(user?.role, user?.department);
}

export function normalizeDepartment(department) {
  if (!department) return null;
  return LEGACY_DEPARTMENT[department] || department;
}

// Roles allowed in each department (drives the dependent role dropdown). Teams
// (ODM/KA/SV) live only under SA; every other department has no teams.
const DEPARTMENT_ROLES = {
  AD: ['admin'],
  SEC: ['secretary'],
  SA: ['ae_supervisor', 'senior_ae', 'ac', 'ae'],
  // MK = ฝ่ายการตลาด (เฟส C มติ #2): กรอกลีดรายวัน — เห็นเฉพาะเมนูลีด
  MK: ['marketing'],
  RA: ['ra'],
  // EX = ฝ่ายบริหาร — ผู้อนุมัติราคาผลิตในระบบขอราคาผลิต (ไม่มี operation อื่น)
  EX: ['executive'],
  Viewer: ['viewer'],
  /* ⭐ **ทุกฝ่ายมี role ของตัวเอง** (มติผู้ใช้ 2026-08-28: *"จะไม่มีตำแหน่ง staff แล้วทุกฝ่าย"*)
     — เดิม PC/PD/WH/QC/TS ใช้ role `staff` ร่วมกันตัวเดียว ⇒ cap ต้องถือกว้างระดับ role
     แล้วไปแคบด้วย **ฝ่าย** ที่ helper ทุกตัว (`canViewCosting` · `canViewProduction` ·
     `canViewService`) · พลาดที่ไหนที่หนึ่ง = คลัง/QC เห็นต้นทุน หรือช่างแก้ตารางผลิตได้
     ⇒ แยกเป็น role รายฝ่าย แล้ว **ให้ cap ตรงกับงานจริงของฝ่ายนั้นตั้งแต่แรก**
     ⚠️ RD ได้ role เฉพาะ (rd) มาก่อนแล้ว — คู่คิดหลักของฝ่ายขาย เห็นดีล/โครงการทุกทีม
     เพื่อตอบข้อสอบถาม จึงมี cap มากกว่าฝ่ายโรงงานอื่น */
  PC: ['pc'], PD: ['pd'], WH: ['wh'], RD: ['rd'], QC: ['qc'],
  // TS = ฝ่ายเทคนิคบริการ — ช่างที่เข้าไซต์ลูกค้า (แผน service-production-scheduling §6).
  // ⚠️ เป็น **ฝ่าย** ไม่ใช่ทีมใต้ SA โดยเจตนา: ทีมมีได้เฉพาะ role ฝ่ายขาย (TEAM_ROLES)
  // ดังนั้นถ้าจับช่างไปเป็นทีม ช่างต้องถือ role `ae` แล้วจะได้ cap ขายมาทั้งชุด
  // (เห็นดีล/ใบเสนอราคา/มูลค่าทั้งทีม) ซึ่งไม่ใช่สิ่งที่ตั้งใจ.
  // ทีม SV (Services) ยังเป็นทีม**ขาย**ธุรกิจบริการเหมือนเดิม — TS คือฝ่ายที่รับงานต่อ.
  TS: ['ts'],
  // FN = ฝ่ายบัญชีและการเงิน — รับคำร้องขอเอกสารการเงิน (P7) + คอนเฟิร์มงวดชำระของ SO (mig 0245)
  // ⚠️ **ไม่ได้อยู่ใน COSTING_SOURCE_DEPARTMENTS โดยตั้งใจ** — บัญชีไม่ใช่แหล่งราคา
  // ⭐ `finance` เป็น role ของฝ่ายนี้เอง (มติผู้ใช้ 2026-08-13: *"ไม่อยากใช้คำว่า Staff"*)
  // — ฝ่ายแรกที่แยกออกจาก `staff` · ที่เหลือตามมาทั้งหมดเมื่อ 2026-08-28
  FN: ['finance'],
};

// A role's home/default department — used to display legacy users whose
// department wasn't stored. ⭐ ตั้งแต่ยกเลิก `staff` (2026-08-28) **ทุก role มีฝ่าย
// ของตัวเองครบ** ⇒ ผู้ใช้ที่ไม่มี department เก็บไว้ก็ยังรู้ฝ่ายจาก role ได้
const ROLE_DEFAULT_DEPARTMENT = {
  admin: 'AD',
  secretary: 'SEC',
  ae_supervisor: 'SA', senior_ae: 'SA', ac: 'SA', ae: 'SA',
  marketing: 'MK',
  ra: 'RA', executive: 'EX', viewer: 'Viewer',
  rd: 'RD',
  finance: 'FN',
  pc: 'PC', pd: 'PD', wh: 'WH', qc: 'QC', ts: 'TS',
};

export function departmentFor(role) {
  return ROLE_DEFAULT_DEPARTMENT[role] || null;
}

// Roles belonging to a department (for dependent dropdowns).
export function rolesForDepartment(department) {
  return DEPARTMENT_ROLES[normalizeDepartment(department)] || [];
}

/* ⭐ **ลำดับเดียวของทั้งระบบ: KA → ODM → SV** (งวด T-5 · 2026-08-28)
   🐞 ของเดิมมีสามชุดที่เรียงไม่ตรงกัน — `TEAMS` เรียง ODM→KA→SV ส่วน `SALES_TEAMS`
   (salesPlanning/ui.js) กับ `TEAM_ORDER` (salesPlanning.js) เรียง KA→ODM→SV ซึ่ง
   คอมเมนต์ของมันเองเขียนว่าเป็น "ลำดับทีมมาตรฐานทั้งระบบ" ⇒ หน้าวางเป้ากับหน้าผู้ใช้
   เรียงทีมคนละแบบมาตลอดโดยไม่มีใครสังเกต · ยุบเหลือชุดนี้ชุดเดียว
   ⚠️ ลำดับนี้ต้องตรงกับ `sortOrder` ในทะเบียน `teams` (mig 0311) — มีด่าน CI คุม */
export const TEAMS = ['KA', 'ODM', 'SV'];
export const TEAM_LABELS = { ODM: 'New ODM', KA: 'Key Account', SV: 'Services' };

// Assignable roles (for the user-management UI), with Thai labels.
export const ROLES = ['admin', 'secretary', 'ae_supervisor', 'senior_ae', 'ac', 'ae', 'marketing', 'ra', 'rd', 'finance', 'pc', 'pd', 'wh', 'qc', 'ts', 'executive', 'viewer'];

/* ── role ของฝ่ายปฏิบัติการ (ไม่ใช่ฝ่ายขาย ไม่ใช่ผู้สังเกตการณ์) ──────────────
   ⭐ แทน role `staff` ตัวเดียวที่ห้าฝ่ายเคยใช้ร่วมกัน (มติผู้ใช้ 2026-08-28)
   ⚠️ ที่เดียวที่ประกาศ — helper ที่เคยถาม `role === 'staff'` ต้องถามลิสต์นี้แทน
   ไม่ใช่ไล่เขียนชื่อ role ห้าตัวซ้ำทุกจุด (จุดที่ตกหล่นจะเงียบ ไม่ error) */
export const OPS_ROLES = ['pc', 'pd', 'wh', 'qc', 'ts'];
export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ (Admin)',
  secretary: 'เลขานุการ (Secretary)',
  ae_supervisor: 'AE Supervisor',
  senior_ae: 'Senior AE',
  ac: 'Account Coordinate',
  ae: 'Account Executive',
  marketing: 'การตลาด (Marketing)',
  ra: 'เจ้าหน้าที่ฝ่ายกฎระเบียบและขึ้นทะเบียนผลิตภัณฑ์ (RA)',
  rd: 'วิจัยและพัฒนา (RD)',
  finance: 'บัญชีและการเงิน (Finance)',
  executive: 'ผู้บริหาร (Executive)',
  viewer: 'ผู้ดูข้อมูล (Viewer)',
  pc: 'จัดซื้อ (PC)',
  pd: 'ผลิต (PD)',
  wh: 'คลังสินค้า (WH)',
  qc: 'ควบคุมคุณภาพ (QC)',
  ts: 'เทคนิคบริการ (TS)',
};

// Roles that operate inside a team (at least one team is required for them).
export const TEAM_ROLES = ['senior_ae', 'ac', 'ae'];

// ── ผู้ใช้อยู่ได้หลายทีม ───────────────────────────────────────────────
// มติผู้ใช้ 2026-08-11: "ฝ่ายขาย Account Executive อยู่ ODM กับ Service" — คนขาย
// คนเดียวดูแลงานสองสายพร้อมกันเป็นเรื่องปกติ ของเดิมผูก 1 คน = 1 ทีมตายตัว
// คนแบบนี้จึงต้องเปิดบัญชีซ้ำหรือถูกตัดไม่ให้เห็นงานอีกทีมไปเลย
//
// รูปเดียวกับฝั่งเรคคอร์ด (customers.teams[] — migration 0037):
//   app_metadata.team   = **ทีมหลัก** — ใช้ตอน stamp เจ้าของงานที่สร้างใหม่
//                         (ยอดเข้าทีมไหน / KPI / เป้า) — ค่าเดี่ยวเสมอ
//   app_metadata.teams  = **ทุกทีมที่สังกัด** — ใช้เป็นขอบเขตการเห็น/แก้ (scope)
//                         รวมทีมหลักอยู่ในนี้ด้วย
//
// ⚠️ อย่าเอา userTeams() ไปใช้ตอน "เขียนทีมลงเรคคอร์ดใหม่" — ตรงนั้นต้องเป็น
//    ทีมเดียว (user.team) ไม่งั้นยอดจะเข้าสองทีมพร้อมกันแล้วเป้ารวมบวกเกินจริง
//
// รับได้ทั้ง user object และค่าทีมดิบ (string | array) เพราะบางด่านเก่ารับ
// `team` มาเป็นพารามิเตอร์ตรง ๆ (เช่น canAccessSahamit)
export function userTeams(userOrTeams) {
  const source = userOrTeams && typeof userOrTeams === 'object' && !Array.isArray(userOrTeams)
    ? (Array.isArray(userOrTeams.teams) && userOrTeams.teams.length ? userOrTeams.teams : userOrTeams.team)
    : userOrTeams;
  if (Array.isArray(source)) return [...new Set(source.filter(Boolean))];
  return source ? [source] : [];
}

// ทีมหลัก (attribution) — ทีมที่ยอด/เจ้าของงานที่สร้างใหม่จะถูกบันทึกเข้า
export function primaryTeam(user) {
  return user?.team || userTeams(user)[0] || null;
}

// ผู้ใช้คนนี้อยู่ในทีมนั้นไหม — `team` รับได้ทั้งทีมเดียวและอาร์เรย์
// (ปลายทางบางที่ก็เป็นคนที่อยู่หลายทีมเหมือนกัน เช่น "ทีมของคนที่รับผิดชอบงาน")
export function hasTeam(user, team) {
  return shareTeam(user, userTeams(team));
}

// ทีมของผู้ใช้ตัดกับทีมชุดนี้ไหม (ว่าง = ไม่ตัดกัน)
function shareTeam(user, teams) {
  if (!teams.length) return false;
  return userTeams(user).some((t) => teams.includes(t));
}

// ── ทีมที่จะ stamp ลงแถวใหม่ (attribution) ────────────────────────────
// คนอยู่หลายทีมเปิดงานให้ทีมไหนก็ได้ที่ตัวเองสังกัด (มติผู้ใช้ 2026-08-11 รอบสอง) —
// ก่อนหน้านี้บังคับเป็นทีมหลักเสมอ ⇒ ดีลที่ AE เปิดให้งานฝั่ง Services ไปโผล่ในยอด
// ODM ทั้งใบ ตัวเลขทีมกับงานจริงจึงเล่าคนละเรื่อง
//
// ⚠️ ตัวเดียวที่ทุก route ใช้ — **ห้าม** route ไหนอ่าน `body.team` ไปใช้ตรง ๆ
// เพราะนั่นคือช่องให้ยิง API ตรงแล้วโยนงานเข้าทีมที่ตัวเองไม่ได้อยู่
//   • ไม่ส่งมา / ส่งทีมที่ไม่ได้สังกัด → ถอยเป็นทีมหลัก (ไม่ใช่ปฏิเสธทั้งคำขอ —
//     ผู้เรียกสายเก่าที่ไม่รู้จักช่องนี้ต้องยังทำงานได้เหมือนเดิม)
//   • `who` = คนที่งานจะถูกยกให้ ซึ่ง**ไม่จำเป็นต้องเป็นคนกด** (ดีล: เจ้าของคือ AE
//     ที่ถูกเลือก ไม่ใช่ AC ที่กดสร้าง)
export function attributionTeam(who, requested) {
  return hasTeam(who, requested) ? requested : primaryTeam(who);
}

// สังกัดทีมที่จะเขียนลง app_metadata — ตัวเดียวที่ทั้ง API สร้าง/แก้ และฟอร์มใช้
// (กันฝั่งใดฝั่งหนึ่งคิดกติกาเอง แล้ว "ทีมหลัก" ของสองฝั่งไม่ตรงกัน)
//   • ตำแหน่งที่ไม่ผูกทีม → ไม่มีทีมเลย
//   • เรียงตาม TEAMS เสมอ ให้ลำดับบนหน้าจอคงที่ไม่ว่าติ๊กเรียงยังไง
//   • ทีมหลักต้องเป็นหนึ่งในทีมที่สังกัด ถ้าไม่ใช่ก็ถอยไปตัวแรก — ค่าที่ค้างจาก
//     ตอนติ๊กทีมออกจะได้ไม่กลายเป็นทีมหลักที่ตัวเองไม่ได้อยู่
export function resolveTeamAssignment(role, { team, teams } = {}) {
  if (!TEAM_ROLES.includes(role)) return { team: null, teams: [] };
  const picked = userTeams(teams).length ? userTeams(teams) : userTeams(team);
  const valid = TEAMS.filter((t) => picked.includes(t));
  return { team: valid.includes(team) ? team : (valid[0] || null), teams: valid };
}

// Sales operational base (no delete, no RA). Shared by ae / ac.
// PM (project management) is a SALES-only tool — every sales role views+edits it
// (row-level team scope still applies via editScope); RA has no PM access.
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
  // ระบบขอราคาผลิต: ฝ่ายขายเป็นคนเปิดใบ + ประกอบต้นทุน. ไม่มี costing:approve
  // (ราคาผลิตอนุมัติโดยผู้บริหารเท่านั้น — มติ 2026-07-22) และไม่มี costing:quote
  // (ราคา RM/PM มาจาก RD/PC ฝ่ายขายกรอกแทนไม่ได้ ไม่งั้นที่มาของราคาหายไป).
  'costing:view', 'costing:edit',
  // ตารางผลิต / ตาราง service (แผน service-production-scheduling §6):
  // ฝ่ายขายต้องตอบลูกค้าได้ว่า "ผลิตวันไหน / ช่างเข้าเมื่อไหร่" จึงอ่านได้ทุกคน
  // แต่ **แก้ตารางผลิตไม่ได้** (ไม่มี production:edit) — คนวางคิวคือ PC/PD
  'production:view',
  // service:edit ถือกว้างระดับ role แล้วแคบด้วย **ทีม SV** ใน canEditService
  // (รูปเดียวกับ sahamit ที่ทุก sales role ถือ cap แล้ว team===KA เป็นตัวกั้นจริง)
  'service:view', 'service:edit',
  'history:view',
];

// Every capability in the system. Held in full only by `admin`.
const SUPERUSER_CAPS = [
  'customers:view', 'customers:edit', 'customers:delete',
  'products:view', 'products:edit', 'products:delete', 'products:margin', 'products:cost',
  'sales:view', 'sales:act', 'sales:delete',
  'ra:view', 'ra:approve',
  'history:view', 'audit:view',
  'users:manage',
  'master:manage',  // edit category taxonomy (product_types) + master config
  'pm:view', 'pm:edit',
  'salesplan:view', 'salesplan:edit', 'salesplan:review', 'salesplan:target', 'salesplan:lead',
  'sahamit:view', 'sahamit:edit',
  'costing:view', 'costing:edit', 'costing:quote', 'costing:approve',
  'production:view', 'production:edit',   // ตารางผลิต — วางคิวจริงคือ PC/PD (แคบด้วยฝ่าย)
  'service:view', 'service:edit',         // ตารางเข้า service — ช่างฝ่าย TS + ทีมขาย SV
  'payments:confirm',                     // คอนเฟิร์มงวดชำระ SO — ของจริงคือฝ่าย FN (แคบด้วยฝ่าย)
  'mgmt:view', 'mgmt:edit',   // งานบริหาร (Management/Executive Office) — admin + secretary only
  // จัดทีมของฝ่าย — หัวหน้าฝ่ายขายได้ตาม role · ฝ่ายอื่นได้ด้วย grant รายคน
  'team:manage',
];

// Admin-only system capabilities — account management, master taxonomy, and the
// audit log. These are what separate `admin` from `ae_supervisor`.
const ADMIN_SYSTEM_CAPS = ['users:manage', 'master:manage', 'audit:view'];

// Capabilities a sales head does NOT inherit from the full superuser set:
//   - the admin-system caps (account/master/audit management)
//   - ra:approve — tax approval is reserved for the `RA` role (admin keeps
//     it as a break-glass). ae_supervisor still has ra:view (sees tax status).
//   - products:margin — the factory cost breakdown + profit is restricted to
//     RA + admin; even the sales head sees only costPrice, not the margin split.
//   - the งานบริหาร module caps (mgmt:*) — that module is admin + secretary only,
//     the sales head has no role in it.
//   - costing:approve — ราคาผลิตอนุมัติโดยผู้บริหาร (executive) เท่านั้น มติ 2026-07-22
//     (admin คงไว้ break-glass เหมือน ra:approve)
//   - costing:quote — ราคา RM/PM เป็นคำตอบของ RD/PC หัวหน้าฝ่ายขายตอบแทนไม่ได้
const SALES_HEAD_EXCLUDED = [
  ...ADMIN_SYSTEM_CAPS, 'ra:approve', 'products:margin', 'mgmt:view', 'mgmt:edit',
  'costing:approve', 'costing:quote',
];

// Sales head (ae_supervisor): every remaining sales/RA-view/PM capability
// across ALL teams. Data scope stays 'all' via isSuperuser().
const SALES_HEAD_CAPS = SUPERUSER_CAPS.filter((c) => !SALES_HEAD_EXCLUDED.includes(c));

// Whole-system read-only observation: every :view cap, no writes anywhere.
// Shared by `viewer` and `executive` so the two never drift apart — executive is
// this set PLUS its costing authority (see ROLE_CAPS.executive).
const OBSERVER_CAPS = [
  'customers:view', 'products:view',
  'sales:view', 'ra:view', 'history:view',
  'pm:view', 'salesplan:view', 'sahamit:view', 'mgmt:view',
  'production:view', 'service:view',
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
  // RA views registries + does tax approval; no edit/delete of sales data.
  // RA is the cost-margin authority (sees the factory cost breakdown + profit).
  ra: ['customers:view', 'products:view', 'products:margin', 'ra:view', 'ra:approve', 'history:view'],
  // viewer: read-only observer of the WHOLE system — holds every :view capability
  // across all modules (database / tax / sales / PM / sahamit / mgmt) at 'all'-team
  // scope, but NO edit/act/delete/approve/manage. add/edit/delete is impossible
  // everywhere: the proxy's capability write-gate (apiWriteAllowed) blocks writes
  // for lack of the :edit/:act/:delete caps. Confidential factory cost/margin is
  // NOT here by default — it's grantable per-user (products:margin), same as RA.
  viewer: OBSERVER_CAPS,
  // executive: ผู้บริหาร — observer เต็มระบบเหมือน viewer + อำนาจเดียวที่เป็นของเขา
  // คนเดียว คืออนุมัติราคาผลิตในใบขอราคาผลิต. costing:view เปิดต้นทุนเต็มใบให้
  // (ข้อมูลที่ใช้ตั้งราคา) แต่ไม่มี products:margin — กำไรโรงงานเป็นระบบสรรพสามิต
  // คนละส่วนกัน (มติ 2026-07-22); ถ้าวันหน้าจำเป็นให้ grant รายคนได้ (GRANTABLE_CAPS).
  // ไม่มี :edit/:act ใด ๆ → proxy write-gate บล็อกทุกการเขียนนอกเส้นอนุมัติให้เอง.
  executive: [...OBSERVER_CAPS, 'costing:view', 'costing:approve'],
  // rd: ฝ่ายวิจัยและพัฒนา — คู่คิดหลักของฝ่ายขาย. อ่านดีล/โครงการ/ใบเสนอราคา
  // ทุกทีม (salesplan:view — scope 'all' ผ่าน salesPlanningViewScope) เพื่อเห็น
  // บริบทเต็มเวลาฝ่ายขายส่งคำร้อง + ใช้ระบบงานของฉัน (workflow tier แบบ staff)
  // ไม่มีสิทธิ์แก้ดีล/แผนโครงการ (ไม่มี salesplan:edit / pm:edit / sales:act) และ
  // ไม่เห็นต้นทุน/มาร์จิ้น (ไม่มี products:margin — grant รายคนได้ถ้าจำเป็น).
  // + costing:quote — รับเรื่อง/ตอบ **คำร้องข้ามฝ่าย** ของฝ่ายตน (mig 0173) รวมถึง
  //   ตอบราคา RM บนบรรทัดในใบขอราคาผลิต; เห็นใบผ่าน costing:view. ของฝ่ายอื่น
  //   แตะไม่ได้ (canQuoteMaterial/canQuoteCosting + การกรอง dept ใน handler).
  //
  // ⚠️ cap 'inquiries:respond' ถูกถอดออกใน mig 0174 พร้อมระบบสอบถาม — งานย้ายมา
  // อยู่ใต้ costing:quote ทั้งหมด (ฝ่ายจัดซื้อ PC ก็ใช้ cap เดียวกัน จึงได้คิวของ
  // ตัวเองในหน้า "งานของฉัน" ด้วย ซึ่งของเดิมไม่เคยให้เพราะผูกกับ role rd อย่างเดียว)
  // finance: ฝ่ายบัญชีและการเงิน (FN) — งานเดียวที่เป็นของเขาคนเดียวคือ **คอนเฟิร์มงวดชำระ**
  // ของใบสั่งขาย (mig 0245) · `salesplan:view` เพราะต้องเปิดใบมาดูก่อนคอนเฟิร์ม
  // ⚠️ **ไม่มี `salesplan:edit` และไม่มี `sales:act`** — บัญชีไม่แก้เอกสารขาย ไม่ออกใบยื่น
  // ⚠️ **ไม่มี costing:* ต่างจาก `staff`** — บัญชีไม่ใช่แหล่งราคา (เหตุผลเดียวกับที่ FN
  //    ไม่อยู่ใน COSTING_SOURCE_DEPARTMENTS) · ย้ายคน FN จาก staff มา finance แล้ว
  //    เขาจะ **เสีย** costing:view/quote ที่ไม่เคยใช้ได้จริงอยู่แล้ว (ด่านบล็อกมาตลอด)
  // `payments:confirm` ถือกว้างระดับ role แล้ว **แคบด้วยฝ่าย** ที่ canConfirmPayment เสมอ
  // ⚠️ **ไม่มี `history:view`** (มติผู้ใช้ 2026-08-13) — cap นั้นเป็นตัวเปิดโมดูล
  // "ภาษีสรรพสามิต" ทั้งโมดูล ซึ่งไม่ใช่งานของฝ่ายบัญชี · ผู้ใช้สั่งไว้ว่าบัญชีเห็นแค่
  // **ฐานข้อมูล** กับ **บริหารงานขาย** (บวกบ้านของตัวเอง และ "แจ้งปัญหาระบบ"
  // ซึ่งทุกคนที่ล็อกอินเห็นเสมอโดยกฎของระบบ)
  // ผลข้างเคียงที่ยอมรับแล้ว: ไม่เห็นสถานะทะเบียนสรรพสามิตบนหน้าสินค้า/ลูกค้า
  // (`registrationStatus` แนบมาเฉพาะคนที่ถือ history:view) — งานนั้นเป็นของฝ่าย RA
  finance: [
    'products:view', 'customers:view', 'salesplan:view',
    'requests:answer', 'payments:confirm',
    // ⭐ products:cost (มติผู้ใช้ 2026-08-28) — บัญชีเห็น **ราคาผลิตเปล่า ๆ** บนทะเบียน
    // สินค้าเท่ากับฝ่ายขาย · ตั้งใจ **ไม่ให้** products:margin: โครงสร้างต้นทุน
    // (วัตถุดิบ/ค่าแรง/ค่าส่ง) + กำไรโรงงาน ยังเป็นของ RA + admin เท่านั้น
    'products:cost',
  ],
  rd: [
    'pm:view', 'products:view', 'customers:view', 'salesplan:view',
    'costing:view', 'costing:quote',
    // ตอบคำร้องของฝ่ายตน — แยกจาก costing:quote แล้ว (R-1) แต่ให้ชุดเดิมเป๊ะ
    // เพื่อไม่ให้ใครเสียสิทธิ์ตอนแยก · ฝ่ายที่ใช้จริงถูกแคบด้วย department อีกชั้น
    'requests:answer',
  ],
  /* ── ฝ่ายปฏิบัติการ: หนึ่งฝ่าย หนึ่ง role (มติผู้ใช้ 2026-08-28) ──────────────
     เดิมห้าฝ่ายใช้ role `staff` ตัวเดียว ⇒ ต้องถือ cap กว้าง (costing:* · production:* ·
     service:* · payments:confirm) แล้วไปแคบด้วยฝ่ายที่ helper ปลายทาง · แปลว่า **ทุก
     endpoint ใหม่ที่เผลอ gate ด้วย `can(role, cap)` ล้วน จะเปิดให้ห้าฝ่ายพร้อมกัน**
     ⇒ ตอนนี้ cap ตรงกับงานจริงของแต่ละฝ่ายตั้งแต่ชั้น role: คลังไม่มี costing:view
     ให้หลุด · QC ไม่มี production:edit ให้แก้ตาราง · ช่างไม่มี production:* เลย
     ⚠️ ด่านระดับฝ่าย (`canViewCosting` · `canEditProduction` · `canEditService`)
     **ยังอยู่ครบ** — มันกันฝ่ายขาย/admin ที่ถือ cap เดียวกันด้วยเหตุผลอื่น
     ⚠️ ทุก role ที่นี่ไม่มี `products:margin` ⇒ ไม่เห็นต้นทุน/กำไรของทะเบียนสินค้า */

  // PC = ฝ่ายจัดซื้อ — แหล่งราคา PM ของใบขอราคาผลิต + วางคิวของเข้า/ผลิต
  // (COSTING_SOURCE_DEPARTMENTS · REQUEST_ANSWER_DEPARTMENTS · PRODUCTION_PLANNER_DEPARTMENTS)
  pc: [
    'pm:view', 'products:view', 'customers:view',
    'costing:view', 'costing:quote', 'requests:answer',
    'production:view', 'production:edit',
  ],
  // PD = ฝ่ายผลิต — วางคิวไลน์ผลิตจริง · ไม่ใช่แหล่งราคา จึงไม่มี costing:*
  pd: [
    'pm:view', 'products:view', 'customers:view',
    'production:view', 'production:edit',
  ],
  // WH = ฝ่ายคลัง · QC = ฝ่ายควบคุมคุณภาพ — อยู่ในสายงานโรงงาน ต้อง **อ่าน** ตารางผลิต
  // เพื่อวางแผนงานตัวเอง (มติผู้ใช้ 2026-07-31) แต่ไม่ใช่คนวางคิว ⇒ ไม่มี production:edit
  wh: ['pm:view', 'products:view', 'customers:view', 'production:view'],
  qc: ['pm:view', 'products:view', 'customers:view', 'production:view'],
  // TS = ฝ่ายเทคนิคบริการ — ช่างที่เข้าไซต์ · **ไม่อยู่ในสายโรงงาน** จึงไม่เห็นตารางผลิต
  // (มติผู้ใช้ 2026-07-31 · เดิมต้องเขียนด่านแคบ TS ทิ้งไว้ใน canViewProduction)
  ts: [
    'pm:view', 'products:view', 'customers:view',
    'service:view', 'service:edit',
  ],
};

// Unknown role: read-only viewer (sees registries + history, no actions).
const DEFAULT_CAPS = ['customers:view', 'products:view', 'history:view'];

// ── cap ที่ทุกคนที่ล็อกอินถือเสมอ ไม่ผูกกับ role ─────────────────────────
// ⭐ `issues:report` = แจ้งปัญหาระบบ (mig 0223) · **ทุก role รวม viewer/executive**
// เพราะคนที่เจอบั๊กบ่อยที่สุดคือคนที่สิทธิ์น้อยที่สุด — กันไว้แล้วปัญหาจะไม่ถูก
// รายงานเลย (มติ Q2)
//
// ⚠️ ประกาศที่นี่ที่เดียว **ห้ามไล่เติมลงทุกอาร์เรย์ของ ROLE_CAPS** — 12 role
// ที่ต้องเติมให้ครบด้วยมือคือที่ที่จะตกหล่นหนึ่งตัวโดยไม่มีใครรู้ (บทเรียนเดียวกับ
// ที่ทำให้ทะเบียนไฟล์แนบต้องรวมด่านไว้ที่เดียว)
//
// ⚠️ ใส่ได้เฉพาะ cap ที่ **ไม่เปิดข้อมูลของคนอื่น** — `issues:report` ผ่านเกณฑ์
// เพราะด่านจริง (canReadIssueRow) ยังคัดว่าเห็นได้เฉพาะเรื่องของตัวเอง
const UNIVERSAL_CAPS = ['issues:report'];

export function capsFor(role) {
  return [...(ROLE_CAPS[role] || DEFAULT_CAPS), ...UNIVERSAL_CAPS];
}

export function can(role, cap) {
  return capsFor(role).includes(cap);
}

// ── Per-user capability grants (app_metadata.extraCaps) ───────────────
// A user keeps their base role but an admin may GRANT a small, whitelisted set
// of extra capabilities on top — e.g. a Sales lead who must also do the ฝ่าย
// RA work while RA is short-staffed, or a Viewer/auditor who needs the
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
/* ⭐ `team:manage` (มติผู้ใช้ 2026-08-28 · docs/team-management-plan.md) — จัดทีม
   **ของฝ่ายตัวเอง** ได้โดยไม่ต้องรอแอดมิน · grant ได้เพราะมันแคบกว่า users:manage
   คนละชั้น: ตั้งชื่อทีม/หัวหน้า/ย้ายคนเข้าออกทีม แต่ **สร้าง/ลบบัญชี · เปลี่ยน role ·
   เปลี่ยนฝ่าย · รีเซ็ตรหัส · แก้ extraCaps ยังทำไม่ได้** (ยังเป็น users:manage เท่านั้น)
   ⚠️ ตัวจำกัดขอบเขตอยู่ที่ `canManageTeams(user, department)` ไม่ได้อยู่ที่ cap —
   ถือ cap แล้วยังจัดได้เฉพาะฝ่ายตัวเอง */
export const GRANTABLE_CAPS = ['ra:view', 'ra:approve', 'products:margin', 'mgmt:view', 'mgmt:edit', 'audit:view', 'users:view', 'team:manage'];
export const GRANTABLE_CAP_LABELS = {
  'ra:view': 'ดูสถานะภาษีทุกทีม (RA)',
  'ra:approve': 'อนุมัติ/ยื่นภาษี แทนฝ่าย RA',
  'products:margin': 'เห็นต้นทุน/กำไรโรงงาน (ทำรายงานผู้บริหาร)',
  'mgmt:view': 'เข้าดูระบบงานบริหาร (mgmt)',
  'mgmt:edit': 'เพิ่ม/แก้ไขข้อมูลในระบบงานบริหาร (mgmt)',
  'audit:view': 'ดูบันทึกการใช้งาน (audit log) — อ่านอย่างเดียว',
  'users:view': 'ดูรายชื่อผู้ใช้ (/users) — อ่านอย่างเดียว ไม่เพิ่ม/แก้/ลบ',
  'team:manage': 'จัดทีมของฝ่ายตัวเอง (สร้าง/ปิดทีม · ย้ายคน · ตั้งหัวหน้าทีม)',
};

// Keep only whitelisted, de-duplicated grants. Accepts anything, returns [].
export function sanitizeExtraCaps(extraCaps) {
  if (!Array.isArray(extraCaps)) return [];
  return [...new Set(extraCaps.filter((c) => GRANTABLE_CAPS.includes(c)))];
}

// A user's EFFECTIVE capabilities = role caps ∪ sanitized per-user grants.
// Prefer this over can(role, …) wherever a `user` object is in hand.
export function capsForUser(user) {
  const base = capsFor(roleOf(user));
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

// ── ระบบขอราคาผลิต (Costing Request) ────────────────────────────────
// ฝ่ายที่เป็น "แหล่งราคา" ของบรรทัดในใบ — ตรงกับ costing_item_components.sourceDept
export const COSTING_SOURCE_DEPARTMENTS = ['RD', 'PC'];

// ── ระบบคำร้องข้ามฝ่าย (R-1: แยกด่านคำร้องออกจากด่านราคา) ──────────────
//
// ⭐ **คนละลิสต์กับ COSTING_SOURCE_DEPARTMENTS โดยตั้งใจ** — "ฝ่ายที่รับคำร้อง"
// กับ "ฝ่ายที่เป็นแหล่งราคา" บังเอิญเป็นชุดเดียวกันวันนี้เท่านั้น · ฝ่ายบัญชี (FN)
// ที่กำลังจะเข้ามารับคำร้องเอกสารการเงิน **ไม่ใช่แหล่งราคา** ⇒ ยัดเข้าลิสต์ข้างบน
// เพื่อให้ตอบคำร้องได้ = เปิดข้อมูลต้นทุนและราคาผลิตทั้งระบบให้ฝ่ายบัญชีไปด้วย
// ซึ่งเป็นกับดักข้อ 1 ของแผน ("ปลดด่านคือปิดที่เนื้อ ไม่ใช่เปิดที่เมนู") เป๊ะ ๆ
//
// ⚠️ ต้องตรงกับ `REQUEST_DEPTS` ใน lib/master/requestTypes.js เสมอ — มีเทสต์คุม
// (แยกลิสต์เพราะ permissions.js เป็นชั้นล่างสุด ห้าม import ทะเบียนหัวข้อกลับมา)
export const REQUEST_ANSWER_DEPARTMENTS = ['RD', 'PC', 'FN'];

// ── คอนเฟิร์ม/ตีกลับงวดชำระของใบสั่งขาย (mig 0245) ──────────────────────
//
// ⭐ **แยกหน้าที่: ฝ่ายขายแจ้ง ฝ่ายบัญชีตัดสิน** (มติผู้ใช้ 2026-08-13 · สืบทอดมติ 2026-08-01
// *"SA ต้องกดว่าลูกค้าจ่ายแล้ว บัญชีต้องคอนเฟิร์ม"*) ⇒ คนที่แจ้งกับคนที่คอนเฟิร์มต้องคนละฝ่าย
//
// 🔴 **ห้ามใช้ `isSuperuser` ที่นี่** — `isSuperuser` รวม `ae_supervisor` ซึ่งเป็นหัวหน้า
// ฝ่ายขาย ถ้าเขาคอนเฟิร์มเงินเข้าได้เอง ด่านนี้ก็ไม่มีความหมาย (เหตุผลเดียวกับที่
// `isSalesOrderSelfApproval` ห้ามผู้สร้างอนุมัติใบตัวเอง) · admin เท่านั้นที่ break-glass ได้
//
// ⚠️ ด่านฝ่ายยังอยู่ แม้วันนี้จะมีแค่ role `finance` ที่ถือ cap นี้ — ฝ่ายอื่นที่ได้ cap
// มาวันหน้า (หรือ grant รายคน) ต้องยังติดด่าน FN ตรงนี้
export function canConfirmPayment(user) {
  if (user?.role === 'admin') return true;
  if (!canUser(user, 'payments:confirm')) return false;
  return departmentOf(user) === 'FN';
}

// รับคำร้องของฝ่ายนี้ได้ไหม — ใช้ทั้งตอนกรองคิวและตอนกดรับเรื่อง/ตอบ
export function canAnswerRequestsFor(user, dept) {
  if (!dept || !REQUEST_ANSWER_DEPARTMENTS.includes(dept)) return false;
  if (isSuperuser(user?.role)) return true; // admin break-glass
  if (!canUser(user, 'requests:answer')) return false;
  return departmentOf(user) === dept;
}

// เห็นระบบคำร้องไหม — **ด่านชั้นนอกของทุก endpoint ใต้ /api/sa/requests**
//
// ⭐ ของเดิมคือ `canViewCosting` ล้วน ซึ่งผูกคำร้องไว้กับระบบขอราคาผลิตทั้งที่เป็น
// คนละเรื่อง · เก็บ `canViewCosting` ไว้เป็นสาขาแรกเพื่อ **ไม่ให้ใครเสียสิทธิ์ที่เคยมี**
// (ฝ่ายขายถือ costing:view อยู่แล้ว จึงเปิดคำร้องได้เหมือนเดิมทุกคน)
//
// ⚠️ คำตอบของ endpoint พวกนี้ **ไม่มีค่าราคาอยู่ในนั้น** — `loadRequests` ดึงแค่
// dept_requests + items + tiers ซึ่งเก็บ "ขอราคาที่จำนวนเท่าไร" ไม่ใช่ตัวราคา
// (ราคาอยู่ใน material_price_revisions ที่อ้างผ่าน answeredRevisionId เฉย ๆ)
// ⇒ คนที่เข้ามาทางสาขาที่สองจึงไม่ได้เห็นต้นทุนอะไรเพิ่ม · เปลี่ยนตรงนี้เมื่อไร
// (เช่นเผลอ join ราคาเข้ามาใน response) ต้องกลับมาตัดที่ API ก่อน
export function canViewRequests(user) {
  if (canViewCosting(user)) return true;
  return canAnswerRequestsFor(user, departmentOf(user));
}

/* เห็นใบขอราคาผลิต (รวมต้นทุนเต็มใบ)
   ⭐ ตั้งแต่แยก role รายฝ่าย (2026-08-28) **cap คือด่านจริง** — มีเฉพาะฝ่ายขาย · RD · PC
   (เดิมต้องเขียน `if (role !== 'staff')` ทิ้งไว้ตรงนี้เพราะ PD/WH/QC/TS ถือ cap
   เดียวกันมาจาก role `staff` แล้วจะเห็นต้นทุนไปด้วย)
   ⚠️ ยังคงเป็นฟังก์ชัน ไม่ใช่ให้เรียก `canUser(user,'costing:view')` ตรง ๆ ที่ปลายทาง —
   ที่นี่คือจุดเดียวที่จะเพิ่มด่านฝ่ายกลับมาได้ ถ้าวันหน้ามี role อื่นได้ cap นี้ */
export function canViewCosting(user) {
  return canUser(user, 'costing:view');
}

// ตอบราคาบนบรรทัดของฝ่ายตน (RD = RM, PC = PM). ตัว cap อย่างเดียวไม่พอ —
// ต้องอยู่ฝ่าย RD/PC จริง; handler ยังต้องกรอง sourceDept รายบรรทัดซ้ำอีกชั้น
export function canQuoteCosting(user) {
  if (!canUser(user, 'costing:quote')) return false;
  if (isSuperuser(user?.role)) return true; // admin break-glass
  return COSTING_SOURCE_DEPARTMENTS.includes(departmentOf(user));
}

// ── ตารางผลิต (Production Schedule) ─────────────────────────────────
// ฝ่ายที่ "วางคิวผลิตจริง" — จัดซื้อวางแผนของเข้า/ผลิตวางแผนไลน์
export const PRODUCTION_PLANNER_DEPARTMENTS = ['PC', 'PD'];

// ฝ่ายที่อยู่ใน **สายงานโรงงาน** จึงต้องอ่านตารางผลิตเพื่อวางแผนงานตัวเอง
// (มติผู้ใช้ 2026-07-31) — QC ตรวจของขาเข้าก่อนเข้าไลน์ · คลังรับของเข้าคลังแล้วจัดส่ง
// ทั้งคู่เป็นขั้นตอนในแม่แบบไทม์ไลน์เดียวกับ "ผลิตสินค้า" อยู่แล้ว
//
// ⚠️ **ไม่รวม TS** — ธุรกิจบริการเป็นคนละทีมปฏิบัติงาน ไม่ได้อยู่ในสายโรงงาน
export const PRODUCTION_VIEWER_DEPARTMENTS = ['PC', 'PD', 'WH', 'QC'];

// อ่านตารางผลิตได้กว้างโดยเจตนา: ฝ่ายขายต้องตอบลูกค้าได้ว่าผลิตวันไหน
// โดยไม่ต้องเดินไปถามโรงงาน (ข้อมูลกำหนดการ ไม่ใช่ต้นทุน — ต่างจาก costing)
//
// ⭐ ตั้งแต่แยก role รายฝ่าย (2026-08-28) ฝ่ายโรงงานถือ cap นี้เฉพาะ PC/PD/WH/QC —
// `ts` ไม่มี `production:view` ตั้งแต่ชั้น role ⇒ ไม่ต้องมีด่านแคบ TS ตรงนี้อีก
//
// ⭐ **แผนการผลิต กับ ธุรกิจบริการ (TS) เป็นคนละทีมปฏิบัติงาน** (มติผู้ใช้ 2026-07-31)
// — ของเดิมไม่แคบตรงนี้ ช่าง TS จึงอ่านตารางผลิตได้ทั้งระบบ · วันนี้ยังไม่มีใครเห็น
// เพราะการ์ดระบบกั้นด้วย canEditProduction แต่ P-3 วางแผนจะเปิดบอร์ดด้วย
// canViewProduction — ถ้าไม่แคบตอนนี้ ระบบโรงงานจะโผล่ให้ TS ตอนนั้นเงียบ ๆ
//
// ⚠️ แคบ **เฉพาะ TS** ไม่ใช่กวาดทุกฝ่ายที่ไม่ได้วางแผน — WH/QC อยู่ในสายงานโรงงาน
// เดียวกันและต้องอ่านตารางเพื่อวางแผนงานตัวเอง (มติผู้ใช้ 2026-07-31)
export function canViewProduction(user) {
  return canUser(user, 'production:view');
}

// แก้ไลน์/กำลังผลิต/คิวผลิต — ฝ่ายที่วางคิวจริงคือ PC/PD
// ⚠️ **ด่านฝ่ายยังจำเป็น** แม้ cap จะแคบแล้ว (wh/qc ไม่มี production:edit) เพราะ
// `isSuperuser` ข้างล่างเปิดให้ admin/หัวหน้าฝ่ายขาย และวันหน้าถ้ามี role อื่นได้ cap นี้
//
// ⚠️⚠️ บทเรียนตรงที่ห้ามกลับไปทำซ้ำ: ห้ามกั้นด้วย pmEditScope() แทน — PC/PD มี
// pmEditScope = 'none' แปลว่า **คนที่วางคิวผลิตจริงจะเป็นกลุ่มเดียวที่แก้ไม่ได้**
// (เกิดมาแล้วกับ /api/pm/my-work ที่กั้นด้วย inquiries:respond จน PC ไม่เคยเห็นคิว
// ตัวเอง — แก้ไปใน #790)
export function canEditProduction(user) {
  if (!canUser(user, 'production:edit')) return false;
  if (isSuperuser(user?.role)) return true; // admin / หัวหน้าฝ่ายขาย
  return PRODUCTION_PLANNER_DEPARTMENTS.includes(departmentOf(user));
}

// ── ตารางเข้า service (Technic Service) ─────────────────────────────
// ฝ่ายช่างที่เข้าไซต์ + ทีมขายธุรกิจบริการที่เป็นเจ้าของสัญญา
/* ── จัดทีม (มติผู้ใช้ 2026-08-28 · docs/team-management-plan.md) ──────────
   ⭐ *"อยากย้ายการจัดทีมออกมาเป็นของแต่ละระบบ ให้ Supervisor/หัวหน้า/ผู้ช่วยตั้งเองได้
   ไม่ต้องรอแอดมิน และแยกเฉพาะฝ่ายได้ด้วย"* + *"TS ก็มีแยกทีม"*

   ⚠️ **ไม่ใช่ users:manage** — cap นั้นเปิดสร้าง/ลบบัญชี รีเซ็ตรหัส เปลี่ยน role มาด้วย
   ทั้งชุด และถูกกันไม่ให้ grant ไว้ด้วยเหตุผล SECURITY ที่เขียนกำกับข้างบน
   ⇒ ของใหม่เป็น cap แคบที่ grant รายคนได้ ("ผู้ช่วย" ที่ผู้ใช้พูดถึง)

   ⚠️ **ขอบเขตคือฝ่ายของตัวเอง** — หัวหน้าฝ่ายขายจัดทีมช่างไม่ได้ และกลับกัน
   (admin ข้ามได้ตามปกติ) · ฝ่ายที่ส่งเข้ามาต้องไม่ว่าง ไม่งั้น null เทียบ null
   จะ "ตรงกัน" แล้วคนไร้ฝ่ายจัดได้ทุกฝ่าย — บั๊กรูปเดิมที่เคยเกิดกับการเทียบทีม */
export function canManageTeams(user, department = null) {
  if (!canUser(user, 'team:manage')) return false;
  /* ⚠️ **admin เท่านั้นที่ข้ามฝ่ายได้ ไม่ใช่ isSuperuser** — `isSuperuser` นับ
     `ae_supervisor` รวมอยู่ด้วย ซึ่งเป็น *หัวหน้าฝ่ายขาย ไม่ใช่คนดูแลระบบ*
     (มติเดียวกับที่ระบบแจ้งปัญหาเขียนไว้ว่าห้ามใช้ isSuperuser เป็นด่านของโมดูล)
     ⇒ หัวหน้าฝ่ายขายจัดได้เฉพาะทีมของฝ่ายขาย ไม่ใช่ทีมช่าง */
  if (user?.role === 'admin') return true;
  const mine = departmentOf(user);
  const target = String(department ?? '').trim();
  if (!mine || !target) return false;
  return mine === target;
}

export const SERVICE_DEPARTMENT = 'TS';
export const SERVICE_SALES_TEAM = 'SV';

// อ่านธุรกิจบริการ: ฝ่ายขายทุกตำแหน่งอ่านได้ (ต้องตอบลูกค้าได้ว่าช่างเข้าเมื่อไหร่)
// ⭐ ฝ่ายโรงงานไม่มี `service:view` ตั้งแต่ชั้น role แล้ว (มีแค่ `ts`) — เดิมต้องกั้น
// ตรงนี้เพราะ PC/PD/WH/QC/TS ใช้ role `staff` ร่วมกัน ⇒ คลัง/QC/จัดซื้อจะได้ระบบ
// ธุรกิจบริการติดมาทั้งระบบโดยไม่มีใครสังเกต
export function canViewService(user) {
  return canUser(user, 'service:view');
}

// แก้ไซต์/เครื่อง/รอบ/นัด — ช่างฝ่าย TS หรือคนขายทีม SV
// มติผู้ใช้ 2026-07-30: ช่างเห็น/แก้งานของ **ทีม SV ทั้งหมด** ไม่ใช่แค่นัดที่ตัวเอง
// ถูกมอบหมาย — ช่างสลับกันไปแทนกันเป็นเรื่องปกติ ถ้าล็อกรายคนงานจะค้างทันทีที่คนลา
export function canEditService(user) {
  if (!canUser(user, 'service:edit')) return false;
  if (isSuperuser(user?.role)) return true;
  if (departmentOf(user) === SERVICE_DEPARTMENT) return true;
  return TEAM_ROLES.includes(user?.role) && hasTeam(user, SERVICE_SALES_TEAM);
}

// คนที่ "ถูกมอบหมายให้เข้าไซต์" ได้ — ฝ่ายช่าง TS **หรือ** ทีมขาย SV
//
// 🐞 บั๊กจริงบน prod (2026-07-31): ของเดิมกรองเฉพาะฝ่าย TS แต่ **ยังไม่มีบัญชี
// ฝ่าย TS สักคน** (23 ผู้ใช้ ไม่มี TS เลย) → dropdown "ช่างผู้รับผิดชอบ" ว่างเปล่า
// → ทุกนัดถูกบันทึกด้วย assigneeId = null → "นัดของฉัน" ว่างตลอดกาลสำหรับทุกคน
// และเมนูก็ถูกซ่อนจากทุกคนไปด้วย = ฟีเจอร์ที่ไม่มีทางถูกใช้
//
// ทีม SV (3 คนบน prod) คือคนที่ทำงานบริการอยู่จริงวันนี้ และถือ service:edit
// อยู่แล้วตาม canEditService — ให้รับงานได้เลยจึงตรงกับของจริงมากกว่ารอสร้างฝ่าย TS
// 👉 พอเปิดบัญชีฝ่าย TS จริงแล้ว ทั้งสองกลุ่มยังใช้ได้ ไม่ต้องแก้โค้ดอีก
export function canBeServiceAssignee(user) {
  if (departmentOf(user) === SERVICE_DEPARTMENT) return true;
  return TEAM_ROLES.includes(user?.role) && hasTeam(user, SERVICE_SALES_TEAM);
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

// ── แก้รหัสลูกค้าที่ระบบออกให้ (AR-AAAA) ──────────────────────────────────
// ⭐ มติผู้ใช้ 2026-08-24: **admin แก้เลข AR ได้ทุกใบ** ไม่ว่ารหัสนั้นจะเป็นรูปแบบที่
// ระบบออกให้เอง (AR-AAAA, สวิตช์ "ระบบใหม่") หรือรูปแบบเดิมที่กรอกมือ (AR-AAA) —
// ของจริงคือทะเบียนที่ยกมาจากระบบเก่ามีเลขผิดอยู่จริง และเดิมซ่อมได้เฉพาะรหัสกรอกมือ
// (ดู `docs/master-code-scheme.md` §4) ⇒ ใบที่ระบบออกเลขให้ผิด ไม่มีทางแก้เลย
// นอกจากลบทิ้งสร้างใหม่ ซึ่งทำให้ทั้งเส้นดีล/ใบเสนอราคาที่ผูก `customerId` ไว้หลุดตาม
//
// 🔴 **ห้ามใช้ `isSuperuser` ที่นี่** — ตัวนั้นรวม `ae_supervisor` ซึ่งเป็นหัวหน้าฝ่ายขาย
// ที่ทำงานกับทะเบียนนี้ทุกวัน · นี่คือ break-glass ซ่อมข้อมูล ไม่ใช่ปุ่มของงานประจำวัน
// (รหัสที่แก้ไปแล้วเรียกคืนไม่ได้: เลขเดิมไม่กลับเข้ากองเลขคืน และเอกสารที่พิมพ์รหัส
// เดิมไปแล้วก็ไม่ตามมาแก้ให้ — เหตุผลเต็ม ๆ อยู่ที่ PATCH /api/customers/[id])
export function canEditIssuedMasterCode(role) {
  return role === 'admin';
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
// `team` รับได้ทั้งทีมเดียวและอาร์เรย์ (ผู้ใช้อยู่หลายทีม) — อยู่ KA ทีมใดทีมหนึ่งก็เข้าได้
export function canAccessSahamit(role, team) {
  if (isSuperuser(role)) return true;           // admin + sales head: cross-team oversight
  if (isReadOnlyObserver(role)) return true;    // viewer/executive see every module (writes still blocked by cap)
  return can(role, 'sahamit:view') && userTeams(team).includes('KA');
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

// โมดูล "วิจัยและพัฒนา" (/rd) — บ้านของฝ่าย RD (ม-29)
//
// ⚠️ **ขึ้นกับฝ่าย ไม่ใช่ role** (ม-48) — จงใจไม่ใช้ `canAnswerRequestsFor` ตรง ๆ
// เพราะตัวนั้นให้ `isSuperuser` ผ่านหมด ซึ่งรวม **AE Supervisor** (break-glass ที่มี
// ไว้ให้ตอบแทนได้ตอนฉุกเฉิน) ⇒ หัวหน้าฝ่ายขายจะได้โมดูล R&D ทั้งที่ไม่ใช่บ้านของเขา
// สิทธิ์ไม่ได้แคบลง — เขายังกดรับเรื่องแทนได้เหมือนเดิม แค่ไม่มีเมนู
//
// ⚠️ **admin ไม่มี `requests:answer`** (ตรวจ 2026-08-08) จึงต้องแยกสาขาให้ชัด —
// เช็คแต่ cap อย่างเดียวแล้ว admin จะเห็นการ์ดระบบแต่เมนูถูกกรองทิ้งจนเหลือศูนย์
// ซึ่ง AppLayout ตีความว่า "ไม่มีกลุ่ม" แล้วแถบเมนูว่างเปล่า
//
// ⭐ **ตัวเดียวคุมทั้งการ์ดระบบและแถบเมนู** — แยกกันเมื่อไรก็เพี้ยนหากัน
export function canAccessRd(user) {
  if (user?.role === 'admin') return true;
  return departmentOf(user) === 'RD' && canUser(user, 'requests:answer');
}

// โมดูล "บัญชีและการเงิน" (/finance) — บ้านของฝ่าย FN (มติผู้ใช้ 2026-08-13)
//
// > *"อยากสร้าง Module ของบัญชีและการเงินออกมาแบบวิจัยและพัฒนา"*
//
// ⚠️ **ขึ้นกับฝ่าย ไม่ใช่ role** ด้วยเหตุผลเดียวกับ [canAccessRd] เป๊ะ ๆ — ใช้
// `isSuperuser` เมื่อไร AE Supervisor จะได้โมดูลบัญชีไปด้วย ทั้งที่ทั้งระบบวางไว้ว่า
// เขาคือ "อีกฝั่ง" ของด่านบัญชี (ดู `canConfirmPayment` ที่จงใจไม่ใช้ isSuperuser
// ด้วยเหตุผลเดียวกัน) · ให้เขาเห็นทะเบียนการชำระทั้งบริษัทเท่ากับด่านแยกหน้าที่หายไป
//
// ⚠️ `staff` ที่อยู่ฝ่าย FN ผ่านด้วย — คนฝ่ายบัญชีเดิมยังถือ role `staff` อยู่จนกว่าจะ
// ย้ายเป็น `finance` (เหตุผลเดียวกับที่ `DEPARTMENT_ROLES.FN` มีสองค่า) · ด่านที่แคบ
// กว่าคือ **คำสั่ง** ไม่ใช่การเห็นโมดูล — คอนเฟิร์มงวดยังคุมด้วย `canConfirmPayment`
//
// 🛑 ตอนเปิดใช้ **ยังไม่มีผู้ใช้คนไหนอยู่ฝ่าย FN เลยสักคน** (ตรวจ 2026-08-13 · 25 คน)
// ⇒ ระหว่างนี้มีแต่ admin ที่เห็นโมดูล ซึ่งถูกต้องแล้ว ไม่ใช่บั๊ก
export function canAccessFinance(user) {
  if (user?.role === 'admin') return true;
  return departmentOf(user) === 'FN';
}

// ── เมนูของสายงานขาย: "งานที่ฝ่ายนี้ทำ" ไม่ใช่ "ทุกอย่างที่เขาอ่านได้" ─────────
//
// มติผู้ใช้ 2026-08-13 (กฎสามชั้น · `docs/module-ownership-rules.md`) — ฝ่ายบัญชี
// **เข้ามาตรวจเอกสาร ไม่ได้ทำงานในสายขาย** ⇒ เมนูใต้ "บริหารงานขาย" ของเขาควรเหลือ
// เฉพาะเอกสารที่เขาต้องเปิดจริง (ใบเสนอราคา · ใบสั่งขาย) ไม่ใช่แดชบอร์ดยอดขาย
// ดีล โครงการ และงานของฉัน ซึ่งเป็นงานของฝ่ายขายล้วน ๆ
//
// ⚠️ **ตัดแค่เมนู ไม่ได้ตัดสิทธิ์อ่าน** — กดลิงก์จากใบไปดีล/โครงการยังเข้าได้เหมือนเดิม
// และ view scope ยังเป็น 'all' ตามที่ต้องใช้ตรวจใบ (ดู `salesPlanningViewScope`)
//
// ⚠️ **ไม่แตะ RD ซึ่งกว้างเท่ากัน** เพราะของ RD เป็น **มติที่ตัดสินไว้แล้ว**
// (`salesPlanningViewScope`: *"rd ต้องเห็นดีล/โครงการทุกทีมเพื่อมีบริบทเต็มตอนตอบ
// ข้อสอบถามจากฝ่ายขาย"*) ส่วนของ FN เป็น **ผลพลอยได้** จากการถือ `salesplan:view`
// ที่ไม่เคยมีใครตัดสิน ⇒ สองอย่างนี้ไม่เหมือนกัน อย่ายุบเป็นกฎเดียว
export function worksInSalesPipeline(user) {
  return departmentOf(user) !== 'FN';
}

// ── บ้านของผู้ใช้: ฝ่ายไหนทำงานอยู่ในเปลือกระบบไหน ────────────────────────
//
// ⭐ **เอกสารร่วมมีเจ้าของที่เก็บคนเดียว แต่มีคนทำงานกับมันหลายฝ่าย** — ใบสั่งขาย
// เก็บที่ `/sa` (กฎสามชั้น ชั้น 2 · `docs/module-ownership-rule.md`) แต่คนที่เปิดมัน
// มีทั้ง SA, FN และ RD · เดิม `systemForPathname` รู้จักแต่ URL ⇒ ทุกคนที่กดเข้าไป
// ถูกสวมเปลือก "บริหารงานขาย" เหมือนกันหมด แล้วเมนูบ้านตัวเองหายจากจอ
// (มติผู้ใช้ 2026-08-22: *"อยากให้แต่ละฝ่ายทำงานเฉพาะของโมดูลตัวเอง โดยให้ส่วน
// ข้อมูลกลางเดียวกัน"*)
//
// ⇒ เอกสารไม่ย้ายบ้าน (route เดิม · API เดิม · ด่านสิทธิ์เดิม) แต่ **เปลือกเดินตามคนดู**
//
// ⚠️ **ต้องคืนเฉพาะระบบที่คนคนนั้นเข้าได้จริง** — คืนคีย์ที่เขาไม่มีกลุ่มเมนู
// เมื่อไร `AppLayout` จะหา `currentGroup` ไม่เจอแล้วแถบเมนูว่างเปล่า ซึ่งเป็นบั๊ก
// ที่โมดูล `/rd` กับ `/finance` เคยเป็นมาแล้วทั้งคู่ ⇒ เช็คฝ่าย **คู่กับด่านของโมดูล**
// ⚠️ **admin คืน `null` โดยตั้งใจ** — ฝ่ายของ admin คือ 'AD' ไม่ใช่ RD/FN · เขาไม่ได้
// ทำงานในโมดูลใดโมดูลหนึ่ง ให้เปลือกเดินตาม URL เหมือนเดิม
export function homeSystemForUser(user) {
  const dept = departmentOf(user);
  if (dept === 'RD' && canAccessRd(user)) return 'rd';
  if (dept === 'FN' && canAccessFinance(user)) return 'finance';
  return null;
}

// ── Data scope ────────────────────────────────────────────────────────
// 'all'  = every team's records
// 'team' = only records belonging to the user's own team
// 'own'  = only records the user owns (ownerId === user id)
// 'none' = may not write at all

export function viewScope(role) {
  if (isSuperuser(role) || role === 'ra' || isReadOnlyObserver(role) || OPS_ROLES.includes(role) || role === 'rd') return 'all';
  return 'team'; // senior_ae, ac, ae, and unknown viewer
}

// User-aware view scope: a per-user grant of ra:view (an SA acting as RA)
// widens visibility to ALL teams, exactly like the built-in `RA` role — so a
// grantee sees every team's tax records they now have to approve. Falls back to
// the role-only viewScope for everyone else. Use this (not viewScope(role)) in
// handlers that have the full user object and cover RA-touchable resources.
export function viewScopeUser(user) {
  if (canUser(user, 'ra:view')) return 'all';
  return viewScope(roleOf(user));
}

export function editScope(role) {
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none'; // RA (acts via approval only) + viewer
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
  return 'none'; // RA / viewer; staff edits assigned tasks via the
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
//     NOTE: ยังห้าม fallback ไป canEditRecord — RA (ra:approve bypass) ต้อง
//     ไม่หลุดเข้ามาในเส้นทางลบ หน้าที่ RA คือตรวจอนุมัติ/ตีกลับ ไม่ใช่ลบงานฝ่ายขาย.
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
      if (!userTeams(user).length) return false;
      // ทั้งสองฝั่งเป็นได้หลายทีม — ในขอบเขตเมื่อ **ทีมของคน ∩ ทีมของเรคคอร์ด**
      // ไม่ว่าง · ฝั่งเรคคอร์ด: teams[] (customers, migration 0037) ถ้าไม่มีก็ถอย
      // ไปทีมเดี่ยว (products / orders / projects) · ฝั่งคน: app_metadata.teams
      if (Array.isArray(record?.teams) && record.teams.length) return shareTeam(user, record.teams);
      return hasTeam(user, record?.team);
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

// เอกสารภาษี (ใบยื่น orders / ทะเบียน registrations) ที่ **ไม่มีทีมเลย** = "ของกลาง"
// ทุกทีมทั้งเห็นและจัดการได้ — กฎเดียวกับตัวกรองของลิสต์ (`or(teamInClause(user),team.is.null)`)
// และกับ master data ที่ caretakerTeamsOf ถือว่า `[]` = ของกลาง
//
// **ทำไมต้องมี** — ลิสต์โชว์แถวไร้ทีมให้ทุกทีมแล้ว แต่ inScope('team') ตัดทีมของคน
// กับทีมของแถว ซึ่งได้ชุดว่างเสมอเมื่อ `record.team` เป็น null →
// แถวเดียวกันที่เห็นในลิสต์ กด GET/PATCH/DELETE รายตัวแล้วได้ 404/403 · ถ้าปล่อยไว้
// เอกสารที่ถูกตีกลับจะไม่มีใครในฝ่ายขายแก้ได้เลย (ของจริง: ทะเบียนที่ Admin สร้าง
// ค้าง "รออนุมัติ" 6 วันโดยไม่มีใครในทีมเห็น)
//
// ⚠️ เฉพาะ scope 'team' — 'own' วัดด้วย ownerId การที่แถวไม่มีทีมไม่ได้ทำให้ใครเป็นเจ้าของ
// ⚠️ ห้ามยกไปแก้ที่ inScope() เอง: ที่นั่นถูกใช้กับโครงการ/PM/แผนการขายด้วย ซึ่งยังไม่มี
//    มติว่าแถวไร้ทีมของโมดูลนั้นเป็นของกลาง
const TEAMLESS_SHARED_RESOURCES = new Set(['orders', 'registrations']);

function sharedTeamlessRow(resource, scope, record) {
  return scope === 'team'
    && TEAMLESS_SHARED_RESOURCES.has(resource)
    && caretakerTeamsOf(record).length === 0;
}

export function canViewRecord(user, resource, record) {
  // Customers AND products are the shared central catalog — any signed-in user
  // may VIEW the record (มติ 2026-07-20: แคตตาล็อกสินค้าเห็นทุกทีม, เหมือนลูกค้า).
  // The confidential factory cost/margin is redacted separately
  // (redactProductMargin); EDIT stays caretaker-team scoped (canEditRecord).
  // Was product-team scoped, which 404'd a cross-team product's detail page even
  // though the LIST (GET /api/products) already showed the row to every team —
  // so the caretaker team could never reach the edit form on it.
  if (resource === 'customers' || resource === 'products') return true;
  const scope = viewScopeUser(user);
  if (sharedTeamlessRow(resource, scope, record)) return true;
  // คนที่ scope 'team' แต่ตัวเองไม่มีทีม scope ไม่ได้ → เห็นทั้งหมด (ลิสต์ข้ามตัวกรองทิ้ง
  // ในกรณีนี้เหมือนกัน) · ปิดไว้แค่ชั้น "เห็น" — แก้/ลบยัง fail closed เพราะบัญชีที่
  // role เป็นสายทีมแต่ไม่มีทีมคือบัญชีที่ตั้งค่าไม่ครบ ไม่ใช่สิทธิ์ที่ตั้งใจให้
  if (scope === 'team' && TEAMLESS_SHARED_RESOURCES.has(resource) && !userTeams(user).length) return true;
  return inScope(scope, user, record);
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
  // Legal tax approval spans all teams (RA processes tax for everyone),
  // but RA does not edit the customer registry. Honours a per-user
  // ra:approve grant (an SA acting as RA) the same as the built-in role.
  if (resource !== 'customers' && canUser(user, 'ra:approve')) return true;

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
    return shareTeam(user, teams);
  }

  // Orders / registrations / projects — creator/team/own scope. เอกสารภาษีที่ไม่มีทีม
  // = ของกลาง ทุกทีมแก้ได้ (ไม่งั้นใบที่ถูกตีกลับไม่มีใครในฝ่ายขายแก้ได้เลย)
  const scope = editScope(user?.role);
  if (sharedTeamlessRow(resource, scope, record)) return true;
  return inScope(scope, user, record);
}

export function canDeleteRecord(user, resource, record) {
  // ของกลางก็ลบได้ ไม่งั้นร่างไร้ทีมจะค้างระบบไปตลอดโดยมีแต่แอดมินที่เก็บกวาดได้ ·
  // ด่านที่กันของจริงคือด่านสถานะของ handler (ทะเบียน: ร่าง + ไม่มีใบยื่นอ้างถึง ·
  // ใบยื่น: ที่เข้าขั้นตอนภาษีแล้วต้องเป็นแอดมิน) ซึ่งยังทำงานเหมือนเดิมทุกกรณี
  const scope = deleteScope(user?.role, resource);
  if (sharedTeamlessRow(resource, scope, record)) return true;
  return inScope(scope, user, record);
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
  // คนอยู่หลายทีมได้ — "ทีมเดียวกัน" = มีทีมร่วมกันอย่างน้อยหนึ่งทีม
  if (TEAM_ROLES.includes(assigner.role)) {
    return shareTeam(assigner, userTeams(assignee));
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
  if (TEAM_ROLES.includes(user.role)) return hasTeam(user, respTeam);
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
  // ฝ่ายปฏิบัติการ + rd: ขั้นตอนที่มอบให้ "ฝ่าย" ของเขา (task.role === department)
  // นับเป็นงานของเขา — rd คือฝ่ายที่ได้สิทธิ์อ่านระบบขายเพิ่ม จึงได้ tier เดียวกัน
  const workflowRole = OPS_ROLES.includes(roleOf(user)) || roleOf(user) === 'rd';
  const sameDept = workflowRole && !!user?.department
    && normalizeDepartment(user.department) === task?.role;
  if (can(roleOf(user), 'pm:view') && (ownsTask || sameDept)) return 'workflow';
  return 'none';
}

// ── Field-level edit gating ───────────────────────────────────────────
// canEditRecord answers "may this user touch the row at all". But RA and
// sales touch DIFFERENT columns: sales own the commercial fields (price, cost,
// quotation…), RA owns the tax/approval fields. A RA user must NOT be
// able to rewrite costPrice just because they can approve. These lists are the
// columns each side may set; routes union the lists the user's caps unlock.

// Fields RA sets while approving / filing tax (not the commercial data).
export const LEGAL_PRODUCT_FIELDS = ['status', 'approvalNumber', 'taxableOverride', 'rejectionReason'];
// Excise registrations: RA owns the approval/tax columns; SA owns the link
// (which product + which customer it's submitted for).
export const LEGAL_REGISTRATION_FIELDS = ['status', 'approvalNumber', 'taxableOverride', 'rejectionReason'];
export const LEGAL_ORDER_FIELDS = [
  'status', 'taxDueDate', 'taxPaidDate', 'exciseReceiptNumber', 'exciseTaxPaidAmount',
  'taxFormRef', 'rejectionReason', 'taxInvoiceNumber',
];

// The capability a sales user needs to write a resource's commercial fields,
// and the RA-owned field list, per resource.
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
// RA cap). `salesEditable` is the route's existing commercial field list.
export function allowedEditFields(user, resource, salesEditable) {
  const allowed = new Set();
  const salesActCap = RESOURCE_SALES_CAP[resource] || `${resource}:edit`;
  if (canUser(user, salesActCap)) salesEditable.forEach((f) => allowed.add(f));
  if (canUser(user, 'ra:approve')) {
    (LEGAL_FIELDS_BY_RESOURCE[resource] || LEGAL_PRODUCT_FIELDS).forEach((f) => allowed.add(f));
  }
  return allowed;
}

// ── Cost redaction (two tiers) ────────────────────────────────────────
// Factory cost data is confidential to the EXCISE TAX system. Two tiers:
//   • costPrice  — the factory cost. Visible to SA + RA + admin (anyone who
//     works the tax/sales flow) และ FN ผ่าน cap `products:cost` (มติผู้ใช้
//     2026-08-28). Hidden from other departments (staff) and plain viewers,
//     even though they may browse the product catalog.
//   • MARGIN_FIELDS — the cost breakdown + resulting profit. Stricter still:
//     RA + admin only (products:margin). Even SA sees costPrice but not these.
// Redaction happens server-side so the data never leaves the API; hiding the
// UI card alone would still leak it via a direct fetch.
export const MARGIN_FIELDS = ['materialCost', 'laborCost', 'shippingCost', 'factoryProfit'];

// May this role see the factory costPrice? SA (products:edit) own it; RA/admin
// (products:margin) see it too; FN (products:cost) เห็นราคาผลิตอย่างเดียวโดยไม่เห็น
// โครงสร้างต้นทุน. Staff/viewers with read-only catalog access (products:view but
// none of the three) do NOT.
export function canSeeProductCost(role) {
  return can(role, 'products:margin') || can(role, 'products:edit') || can(role, 'products:cost');
}

// User-aware variant — honours a per-user products:margin grant (needed so a
// grantee sees costPrice both in the API redaction below and in the client UI).
export function canSeeProductCostUser(user) {
  return canUser(user, 'products:margin') || canUser(user, 'products:edit')
    || canUser(user, 'products:cost');
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

// ── Identity validation (role + teams + department) ───────────────────
// Used by the user-management API. Team-bound roles need at least one valid
// team; others must not carry any. Department, if supplied, must match the
// role's canonical department. Returns an error string, or null when valid.
//
// `team` รับได้ทั้งทีมเดียวและอาร์เรย์ (ผู้ใช้อยู่หลายทีม) — ตรวจทุกตัวในชุด
export function validateIdentity(role, team, department) {
  if (!ROLES.includes(role)) return 'role ไม่ถูกต้อง';
  const teams = userTeams(team);
  if (TEAM_ROLES.includes(role)) {
    if (!teams.length) return 'ตำแหน่งนี้ต้องระบุทีม (ODM/KA/SV)';
    if (teams.some((t) => !TEAMS.includes(t))) return `ทีมไม่ถูกต้อง (${TEAMS.join('/')})`;
  } else if (teams.length) {
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
  // (ae=own, senior_ae/ac=team, superuser/ผู้สังเกตการณ์=all) จึงไม่รั่วข้ามขอบเขต
  //
  // 🐞 เคยสะกด `role === 'viewer'` เอง ทั้งที่ isReadOnlyObserver เขียนเตือนไว้ชัดว่า
  // "ทุกที่ที่เคยเทียบ role === 'viewer' ต้องเปลี่ยนมาใช้ตัวนี้" → `executive`
  // (ผู้บริหาร) เห็น KPI ลีด / KPI งาน / KPI ฝ่าย RD ได้หมด **แต่ไม่เห็น KPI ดีล**
  // ซึ่งเป็นตัวที่ตำแหน่งนี้ต้องดูที่สุด — หลุดเงียบเพราะเป็นการ "ขาด" ไม่ใช่ "เกิน"
  return isSuperuser(role) || role === 'senior_ae' || role === 'ae' || role === 'ac'
    || isReadOnlyObserver(role);
}

/* ตัวสลับขอบเขตบนคิวลีด — "ของฉัน / ทีม / ทั้งหมด"
   ⚠️ ตัวเลือกต้องไม่กว้างเกินกว่าที่ `applyLeadScope` ยอมให้เห็นจริง ไม่งั้นจะได้ปุ่ม
   ที่กดแล้วผลลัพธ์เท่าเดิม (หรือแย่กว่า: ป้าย "ทั้งหมด" ที่ไม่ได้แปลว่าทั้งบริษัท):
     superuser / marketing → เห็นทุกใบจริง ⇒ ให้ "ทั้งหมด" ได้
     senior_ae / ac        → เห็นเฉพาะทีมตัวเอง ⇒ กว้างสุดคือ "ทีม"
     ae                    → เห็นเฉพาะใบของตัวเอง ⇒ เหลือตัวเลือกเดียว (หน้าซ่อนปุ่มให้)
     ผู้สังเกตการณ์         → ไม่มีลีดของตัวเองและไม่มีทีม ⇒ "ทั้งหมด" อย่างเดียว
                             (กติกาเดียวกับ pmTaskScopes/salesDealScopes)
   "ของฉัน" = ใบที่ถูกมอบให้เรา **หรือ** ใบที่เรากรอกเข้ามา — ตรงกับสาขา `ae` ของ
   applyLeadScope เป๊ะ และทำให้ทีม Marketing ใช้ปุ่มนี้ดูยอดที่ตัวเองกรอกได้ */
export function leadScopes(role) {
  if (isReadOnlyObserver(role)) return ['all'];
  if (isSuperuser(role) || role === 'marketing') return ['mine', 'all'];
  if (role === 'senior_ae' || role === 'ac') return ['mine', 'team'];
  if (role === 'ae') return ['mine'];
  return [];
}

export function salesDealScopes(role) {
  // ผู้สังเกตการณ์ (viewer/executive) ไม่มีดีลของตัวเองและไม่มีทีม → 'all' อย่างเดียว
  // คือ scope เดียวที่มีความหมาย (แท็บ "ของฉัน"/"ทีม" จะขึ้น 0 เสมอ) — กติกาเดียวกับ
  // pmTaskScopes ที่ตัดสินเรื่องนี้ไปแล้ว
  if (isSuperuser(role)) return ['mine', 'team', 'all'];
  if (isReadOnlyObserver(role)) return ['all'];
  // ac มี view scope ระดับทีมเหมือน senior_ae → ให้สลับดู KPI ระดับทีมได้
  if (role === 'senior_ae' || role === 'ac') return ['mine', 'team'];
  return ['mine'];
}
