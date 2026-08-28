// ── ผู้ดูแลโครงการ (AE) = คนที่ "ขอบเขต" ของโครงการเดินตาม ──────────────────
//
// ที่มา (ตรวจ 2026-08-14): ลิสต์โครงการกรองด้วย `team` + `ownerId` เท่านั้น
// (`app/api/pm/projects/route.js` — `.or(team.in.(ทีมของฉัน),ownerId.eq.ฉัน)`)
// **ไม่ได้กรองด้วย `aeOwnerId`** แต่ตอนสร้าง โครงการเขียนสองช่องนั้นจาก *คนกดสร้าง*
// ⇒ Admin สร้างโครงการแล้วเลือก AE ผู้ดูแลให้ ได้แถวที่:
//     team = null   (TEAM_ROLES มีแค่ senior_ae/ac/ae — admin ไม่มีทีมเลย)
//     ownerId = admin
//   แล้ว AE เจ้าของงาน **ไม่เห็นโครงการในลิสต์ตัวเอง** · เปิดลิงก์ตรงก็ 403
//   (inScope('team') ตัดทีมของคนกับทีมของแถว ซึ่ง team=null ได้ชุดว่างเสมอ)
//   · และแก้ไม่ได้ (inPmProjectScope) — งานที่ Admin เปิดให้จึงตกหายเงียบ ๆ
//
// กติกาเดียวกับดีล (`lib/sales/dealOwner.js`) และลีด (`lib/sales/leadAssignee.js`):
// **ทีม/เจ้าของของงานเดินตามคนที่ถืองาน ไม่ใช่คนที่กดปุ่ม**
//
// ⚠️ ห้ามเรียก `validateDealOwner` มาใช้ซ้ำตรง ๆ ทั้งที่รายชื่อ role เหมือนกัน —
// ด่านทีมของมันวัดคนสั่งด้วย `salesPlanningEditScope` ซึ่ง AE = 'own' (ด่านไม่ทำงาน)
// ส่วนงาน PM วัดด้วย `pmEditScope` ซึ่ง AE = 'team' (PM เป็นงานร่วมทั้งทีม) ⇒ ใช้ตัวของ
// ดีลจะปล่อยให้ AE ยกโครงการข้ามทีมได้เงียบ ๆ แล้วตัวเองมองไม่เห็นอีกเลย
import { attributionTeam, normalizeRole, pmEditScope, userTeams } from '@/lib/permissions';
import { DEAL_HOLDER_ROLES } from '@/lib/sales/dealOwner';

/* ผู้ดูแลโครงการ = AE / Senior AE — ชุดเดียวกับ "คนถือดีล" (มติผู้ใช้ 2026-08-08)
   และตรงกับที่ `SalesProjectCreateModal` กรองดรอปดาวน์ไว้แล้ว ⇒ อ้างลิสต์เดียว
   ไม่พิมพ์รายชื่อซ้ำ (สองที่แล้วมันเพี้ยนหากันเสมอ) */
export const PROJECT_OWNER_ROLES = DEAL_HOLDER_ROLES;

/** ชื่อที่แสดง — กติกาเดียวกับ /api/pm/assignable-users (name → email) */
export const projectOwnerName = (u) =>
  (u?.user_metadata?.name || '').trim() || (u?.email || '').trim();

async function findAuthUser(supabase, id) {
  // getUserById ตรงกว่าการวน listUsers ทั้งระบบ — ด่านนี้อยู่บนเส้นทางที่ผู้ใช้กดรอ
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) {
    // "ไม่พบ" ไม่ใช่ความผิดพลาดของระบบ — ปล่อยให้ผู้เรียกตอบ 400 ตามปกติ
    if (/not.?found/i.test(error.message || '') || error.status === 404) return null;
    throw new Error(`อ่านข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`);
  }
  return data?.user || null;
}

/**
 * ตรวจผู้ดูแล (AE) ที่ฟอร์มเลือก แล้วแปลงเป็น "ขอบเขต" ที่จะเขียนลงแถวโครงการ
 * @param actor คนที่กดบันทึก — ใช้เทียบทีม (ผู้กำกับดูแลที่ scope ไม่ใช่ 'team' ข้ามด่าน)
 * @param requestedTeam ทีมที่ฟอร์มเลือกมา — ใช้ได้เฉพาะเมื่อ **ผู้ดูแล** สังกัดทีมนั้น
 * @returns {Promise<{ ok: true, aeOwnerId, aeOwner, ownerId, team } | { ok: false, error }>}
 */
export async function resolveProjectAeOwner(supabase, aeOwnerId, actor = null, requestedTeam = null) {
  const id = String(aeOwnerId || '').trim();
  if (!id) return { ok: false, error: 'ต้องเลือกผู้ดูแลโครงการ (AE)' };

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้ดูแลโครงการ' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้ดูแลคนอื่น' };

  const role = normalizeRole(user.app_metadata?.role) || null;
  if (!PROJECT_OWNER_ROLES.includes(role)) {
    return { ok: false, error: 'ผู้ดูแลโครงการต้องเป็น AE / Senior AE — โครงการที่ตกไปอยู่กับผู้ประสาน/ผู้กำกับ ไม่มี AE คนไหนเห็นในลิสต์ตัวเอง' };
  }

  /* ── ทีม ────────────────────────────────────────────────────────────────
     คนสั่งที่เห็นแค่ทีมตัวเอง (pmEditScope 'team' = ae/ac/senior_ae) มอบข้ามทีมไม่ได้:
     โครงการจะถูกตั้ง `team` ตามผู้ดูแล ⇒ มอบข้ามทีมแล้วคนสั่งเองมองไม่เห็นอีกเลย
     ผู้ที่ไม่มีทีม (admin/หัวหน้าฝ่ายขาย) ผ่านได้ทั้งสองทาง — กำกับดูแลข้ามทีม
     ⚠️ ทั้งสองฝั่งอยู่ได้หลายทีม ⇒ เทียบ **ชุดทีม** ไม่ใช่ทีมหลักต่อทีมหลัก */
  const ownerTeams = userTeams(user.app_metadata);
  const actorTeams = userTeams(actor);
  if (pmEditScope(actor?.role) === 'team' && actorTeams.length && ownerTeams.length
      && !ownerTeams.some((t) => actorTeams.includes(t))) {
    return { ok: false, error: `ผู้ดูแลที่เลือกอยู่ทีม ${ownerTeams.join('/')} แต่คุณดูแลทีม ${actorTeams.join('/')} — เลือกได้เฉพาะคนในทีมตัวเอง` };
  }

  const name = projectOwnerName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return {
    ok: true,
    aeOwnerId: id,
    aeOwner: name,
    // เจ้าของแถว = ผู้ดูแล ไม่ใช่คนกดสร้าง — สาขา `ownerId.eq.ฉัน` ของลิสต์คือ
    // ตาข่ายรองสุดท้าย: ผู้ดูแลที่บัญชียังไม่ถูกจัดทีม (team=null ข้างล่าง) ยังเห็นงานตัวเอง
    ownerId: id,
    // ทีมของโครงการ = ทีมที่ฟอร์มเลือกถ้าผู้ดูแลสังกัดจริง ไม่งั้นทีมหลักของผู้ดูแล
    // (บัญชีที่ยังไม่มีทีมเลยได้ null — ผู้เรียกถอยไปใช้ทีมของคนกดต่อ)
    team: attributionTeam(user.app_metadata, requestedTeam),
  };
}

/**
 * ตรวจ "ผู้ตรวจสอบ (AE Supervisor)" ที่ฟอร์มเลือก — ช่องไม่บังคับ ว่าง = ถอดคนออก
 *
 * ⚠️ **ไม่มีด่านทีม** ต่างจาก AE/AC โดยเจตนา — หัวหน้าฝ่ายขายมี viewScope 'all'
 * (permissions.js) คุมงานทุกทีมอยู่แล้ว การบังคับให้ทีมตรงกับงานจึงเป็นการกันคนที่
 * มีสิทธิ์อยู่แล้วเปล่า ๆ · ที่ต้องกันจริงคือ "ไม่ใช่ตำแหน่งผู้ตรวจสอบ"
 *
 * @returns {Promise<{ ok: true, aeSupervisorId: string|null, aeSupervisor: string } | { ok: false, error }>}
 */
export async function resolveProjectSupervisor(supabase, supervisorId, { required = false } = {}) {
  const id = String(supervisorId || '').trim();
  // ตอน **สร้าง** บังคับครบสามฝ่าย (มติผู้ใช้ 2026-08-14) — ตอนแก้ไม่บังคับ ใบเก่าที่
  // ช่องนี้ว่างต้องแก้ช่องอื่นได้ตามปกติ · ล้างทิ้งไม่ได้ (ดู PATCH)
  if (!id) {
    return required
      ? { ok: false, error: 'ต้องเลือกผู้ตรวจสอบ (AE Supervisor)' }
      : { ok: true, aeSupervisorId: null, aeSupervisor: '' };
  }

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้ตรวจสอบ' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้ตรวจสอบคนอื่น' };

  if ((user.app_metadata?.role || null) !== 'ae_supervisor') {
    return { ok: false, error: 'ผู้ตรวจสอบโครงการต้องเป็นตำแหน่งหัวหน้าฝ่ายขาย (AE Supervisor)' };
  }

  const name = projectOwnerName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return { ok: true, aeSupervisorId: id, aeSupervisor: name };
}

/**
 * ตรวจ "ผู้ประสานงาน (AC)" ที่ฟอร์มเลือก — ช่องไม่บังคับ ส่งค่าว่างมา = ถอดคนออก
 *
 * ⚠️ ต่างจากผู้ดูแล: AC **ไม่ใช่เจ้าของงาน** (มติเดิมทั้งระบบ — ดู dealOwner.js) จึงไม่
 * แตะ `team`/`ownerId` ของแถวเลย · ที่ต้องตรวจคือ "เป็นบัญชี AC จริงและอยู่ทีมเดียวกับงาน"
 * เพราะ `acOwnerId` คือปลายทางแจ้งเตือน (lib/master/updateAccess.js) — ยัด id มั่วได้
 * เมื่อไร ความเคลื่อนไหวของโครงการจะวิ่งไปหาคนที่ไม่เกี่ยวข้อง
 *
 * @param projectTeam ทีมของโครงการ (หลังตัดสินจากผู้ดูแลแล้ว) — ว่าง = ข้ามด่านทีม
 * @returns {Promise<{ ok: true, acOwnerId: string|null, acOwner: string } | { ok: false, error }>}
 */
export async function resolveProjectAcOwner(supabase, acOwnerId, projectTeam = null, { required = false } = {}) {
  const id = String(acOwnerId || '').trim();
  // บังคับเฉพาะตอนสร้าง — เหตุผลเดียวกับผู้ตรวจสอบ (ดู resolveProjectSupervisor)
  if (!id) {
    return required
      ? { ok: false, error: 'ต้องเลือกผู้ประสานงาน (AC)' }
      : { ok: true, acOwnerId: null, acOwner: '' };
  }

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้ประสานงาน' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้ประสานงานคนอื่น' };

  if ((user.app_metadata?.role || null) !== 'ac') {
    return { ok: false, error: 'ผู้ประสานงานโครงการต้องเป็นตำแหน่ง AC (Account Coordinate)' };
  }

  const acTeams = userTeams(user.app_metadata);
  const wanted = userTeams(projectTeam);
  if (wanted.length && acTeams.length && !acTeams.some((t) => wanted.includes(t))) {
    return { ok: false, error: `ผู้ประสานงานที่เลือกอยู่ทีม ${acTeams.join('/')} แต่โครงการนี้เป็นของทีม ${wanted.join('/')}` };
  }

  const name = projectOwnerName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return { ok: true, acOwnerId: id, acOwner: name };
}
