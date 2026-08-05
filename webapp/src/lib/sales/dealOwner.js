// ── ผู้รับผิดชอบดีล (AE) ───────────────────────────────────────────────────
//
// มติผู้ใช้ 2026-08-05: **AC เปิดดีลได้แล้ว** (เดิมกันไว้ที่ `canCreateDeal`) แต่ AC เป็น
// ผู้ประสานงาน ไม่ใช่เจ้าของงาน — ฟอร์มสร้างดีลจึงต้องมีช่อง "ผู้รับผิดชอบ (AE)"
// และเลือกได้เฉพาะคนใน **ทีมตัวเอง**
//
// ทำไมต้องมีด่านฝั่ง server ด้วย (ไม่ใช่แค่กรองดรอปดาวน์):
//   `POST /deals` และ `PATCH /deals/[id]` เขียน `ownerId` / `ownerName` จาก body ดิบ ๆ
//   ⇒ ปลอมชื่อได้ (`ownerName` เป็นสตริงอิสระที่ถูกเก็บเป็น snapshot แล้วโชว์บนตาราง/
//      KPI) และยัด id ของคนที่ **แตะดีลของตัวเองไม่ได้** ก็ได้
//
// ⚠️ กติกา role ที่นี่ **ถอดมาจาก `salesPlanningEditScope` ตรง ๆ** ไม่ใช่ความชอบ:
// เจ้าของดีลต้องเป็นคนที่ `inSalesEditScope` ยอมให้แก้ดีลใบนั้นได้ ไม่งั้นดีลจะตกไปอยู่
// กับคนที่เปิดเข้ามาแล้วทำอะไรไม่ได้เลยสักอย่าง (แก้ไม่ได้ · ออกใบเสนอราคาไม่ได้ ·
// และ `canApproveQuotation` ให้ "เจ้าของดีล" เป็นคนอนุมัติใบ ⇒ ใบค้างถาวร)
//
// แพตเทิร์นเดียวกับ `validateLeadAssignee` — ตรวจด้วย id แล้ว **คืนชื่อจาก server**
// ให้ผู้เรียกเขียนลงแถว ไม่รับชื่อจาก client อีก
import { ROLES } from '@/lib/permissions';
import { salesPlanningEditScope } from '@/lib/salesPlanning';

/* role ที่เป็นเจ้าของดีลได้ = role ที่มี edit scope กับดีล (ไม่ใช่ 'none')
   คำนวณจากของจริง ไม่พิมพ์รายชื่อทิ้งไว้ — เพิ่ม/แก้ scope เมื่อไร ลิสต์นี้ขยับตามเอง */
export const DEAL_OWNER_ROLES = ROLES.filter((role) => salesPlanningEditScope(role) !== 'none');

/* role ที่ "มอบดีลให้คนอื่นได้" — ต้องมองเห็นทั้งทีมขึ้นไป
   AE มี scope 'own' ⇒ ยกดีลให้คนอื่นไม่ได้อยู่แล้ว (inSalesEditScope จะตีกลับ)
   ช่องเลือกจึงต้องไม่โผล่ให้ AE เห็น ไม่งั้นเป็นช่องที่กดแล้วเจอ 403 */
export function canAssignDealOwner(role) {
  return ['team', 'all'].includes(salesPlanningEditScope(role));
}

/* ตำแหน่งที่ "ถือดีลเองเป็นปกติ" — ใช้ตั้งค่าตั้งต้นของช่องผู้รับผิดชอบเท่านั้น
   AC เป็นผู้ประสานงาน ไม่ใช่เจ้าของงาน (เหตุผลทั้งหมดที่ต้องมีช่องนี้ตั้งแต่แรก) ⇒
   AC ต้องเลือกชื่อ AE เองทุกครั้ง ไม่มีค่าตั้งต้นเป็นตัวเอง ส่วน Senior AE / admin
   ที่เปิดดีลของตัวเองเป็นปกติยังได้ชื่อตัวเองมาให้เลย */
export function ownsDealsByDefault(role) {
  return role !== 'ac' && DEAL_OWNER_ROLES.includes(role);
}

/**
 * รายชื่อสำหรับดรอปดาวน์ "ผู้รับผิดชอบ (AE)"
 * @param viewerTeam ทีมของคนที่เปิดฟอร์ม — ว่าง (admin/ผู้กำกับดูแล) = เห็นทุกคน
 * ⚠️ กติกาเดียวกับ `assignableFor` ของลีด: คนที่ไม่มีทีม (admin) ติดมาด้วยเสมอ
 */
export function assignableOwners(users = [], viewerTeam = null) {
  return users.filter((user) => {
    if (!DEAL_OWNER_ROLES.includes(user?.role)) return false;
    if (user?.disabled) return false;
    if (!viewerTeam) return true;
    return !user?.team || user.team === viewerTeam;
  });
}

/** ชื่อที่แสดง — กติกาเดียวกับ /api/pm/assignable-users (name → email) */
export const dealOwnerName = (u) =>
  (u?.user_metadata?.name || '').trim() || (u?.email || '').trim();

async function findAuthUser(supabase, id) {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) {
    if (/not.?found/i.test(error.message || '') || error.status === 404) return null;
    throw new Error(`อ่านข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`);
  }
  return data?.user || null;
}

/**
 * ตรวจว่า `ownerId` เป็นเจ้าของดีลได้จริงไหม
 * @param actor  คนที่กดบันทึก — ใช้เทียบทีม (ผู้กำกับดูแลที่ไม่มีทีม = ข้ามด่านทีม)
 * @returns {Promise<{ ok: true, ownerId, ownerName, team } | { ok: false, error }>}
 */
export async function validateDealOwner(supabase, ownerId, actor = null) {
  const id = String(ownerId || '').trim();
  if (!id) return { ok: false, error: 'ต้องเลือกผู้รับผิดชอบ (AE)' };

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้รับผิดชอบ' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้รับผิดชอบคนอื่น' };

  const role = user.app_metadata?.role || null;
  if (!DEAL_OWNER_ROLES.includes(role)) {
    return { ok: false, error: 'ผู้รับผิดชอบดีลต้องเป็น AE / AC / Senior AE (ตำแหน่งอื่นแก้ดีลของตัวเองไม่ได้)' };
  }

  /* ── ทีม ────────────────────────────────────────────────────────────────
     AC/Senior AE มอบได้เฉพาะคนในทีมตัวเอง — ไม่ใช่แค่ความเป็นระเบียบ: ดีลจะถูกตั้ง
     `team` ตามเจ้าของ ถ้ามอบข้ามทีม คนสั่งเองจะมองไม่เห็นดีลนั้นอีกเลย (scope 'team')
     ผู้ที่ไม่มีทีม (admin) ผ่านได้ทั้งสองทาง — กำกับดูแลข้ามทีม */
  const ownerTeam = user.app_metadata?.team || null;
  const actorTeam = actor?.team || null;
  const actorScope = salesPlanningEditScope(actor?.role);
  if (actorScope === 'team' && actorTeam && ownerTeam && ownerTeam !== actorTeam) {
    return { ok: false, error: `ผู้รับผิดชอบอยู่ทีม ${ownerTeam} แต่คุณดูแลทีม ${actorTeam} — เลือกได้เฉพาะคนในทีมตัวเอง` };
  }

  const name = dealOwnerName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return { ok: true, ownerId: id, ownerName: name, team: ownerTeam };
}
