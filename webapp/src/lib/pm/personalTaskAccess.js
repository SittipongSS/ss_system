import { can, hasTeam, isReadOnlyObserver, isRdRole, isSuperuser, isTeamLead, normalizeDepartment, userTeams, TEAM_ROLES } from '@/lib/permissions';

// `team` = ทุกทีมของคนคนนั้น (อาร์เรย์) — คนที่รับผิดชอบงานก็อยู่หลายทีมได้ ผู้เรียก
// ทุกรายส่งค่านี้เข้า hasTeam ซึ่งรับทั้งค่าเดียวและอาร์เรย์
async function userIdentity(supabase, id) {
  if (!id) return { team: [], department: null };
  /* 🔴 ค่านี้ไปเป็น **ด่านสิทธิ์** — อ่านไม่ได้แล้วคืนทีมว่าง = ปฏิเสธการเข้าถึง
     โดยไม่มีใครรู้ว่าทำไม · โยนออกไปให้เห็นเป็น error ดีกว่าเงียบแล้วโทษสิทธิ์ */
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) throw error;
  const meta = data?.user?.app_metadata || {};
  return { team: userTeams(meta), department: normalizeDepartment(meta.department) || null };
}

/* งวด P3b-2 ยุบโครงการ: สาขา "ทีมของโครงการ" (`taskProjectTeam`) ของสองด่านข้างล่าง → **ทีมของดีลที่งานผูก**
   ตรวจ prod 17/11 (อ่านอย่างเดียว): งานที่ถือ `projectId` 557 แถว ผูกดีลครบ · ทีมดีล = ทีมโครงการทุกแถว ⇒ สิทธิ์เท่าเดิมเป๊ะ
   (17 แถวที่ทีมโครงการ ≠ ทีมผู้รับผิดชอบ ยังเปิดได้ — ถอดเฉย ๆ = 403 ทั้งที่รายการทีมโชว์) · งานของดีลที่ไม่เคยมีโครงการ
   ที่ทีมดีล ≠ ทีมผู้รับผิดชอบ = 0 แถว ⇒ ไม่มีใครได้สิทธิ์เพิ่ม · ตรงกับขอบเขตรายการ (`taskScope` — งานผูกดีลของทีม) */
async function taskDealTeam(supabase, task) {
  if (!task?.dealId) return null;
  /* 🔴 ค่านี้ไปเป็นด่านสิทธิ์ — อ่านไม่ได้ต้องรู้ ไม่ใช่คืนว่างแล้วปฏิเสธเงียบ (กติกาเดียวกับ userIdentity) */
  const { data, error } = await supabase.from('sales_deals').select('team').eq('id', task.dealId).maybeSingle();
  if (error) throw error;
  return data?.team ?? null;
}

export async function personalTaskResponsibleTeam(supabase, task) {
  return (await userIdentity(supabase, task?.assigneeId || task?.ownerId)).team;
}

// ทีม + ฝ่ายของผู้รับผิดชอบงาน — ใช้คู่กับ canPullTask (rd ดึงงานภายในฝ่ายตัวเอง)
export async function personalTaskResponsibleIdentity(supabase, task) {
  return userIdentity(supabase, task?.assigneeId || task?.ownerId);
}

export async function canManagePersonalTask(supabase, task, user) {
  if (!task || !user) return false;
  // เจ้าของ/ผู้รับมอบจัดการงานของตัวเองได้เสมอ — ต้องมีแค่ pm:view (staff/rd ใช้
  // "งานของฉัน" ได้จริง); viewer เป็น observer อ่านอย่างเดียว ไม่มีงานของตัวเอง.
  if (!can(user.role, 'pm:view') || isReadOnlyObserver(user.role)) return false;
  if (task.ownerId === user.id || task.assigneeId === user.id) return true;
  // จัดการงานของ "คนอื่น" ยังสงวนให้สายบังคับบัญชาฝ่ายขาย (pm:edit) เหมือนเดิม
  if (!can(user.role, 'pm:edit')) return false;
  if (isSuperuser(user.role)) return true;
  if (!isTeamLead(user.role) || !userTeams(user).length) return false;

  // อยู่หลายทีมได้ ⇒ "ทีมเดียวกัน" = มีทีมร่วมกันอย่างน้อยหนึ่งทีม
  if (hasTeam(user, await personalTaskResponsibleTeam(supabase, task))) return true;
  return hasTeam(user, await taskDealTeam(supabase, task));
}

export async function canViewPersonalTask(supabase, task, user) {
  if (!task || !user || !can(user.role, 'pm:view')) return false;
  if (isSuperuser(user.role) || isReadOnlyObserver(user.role)) return true;
  // เจ้าของ / ผู้รับมอบ / ผู้ทำแทน / ผู้มอบหมาย — ทุกคนที่ผูกกับงานนี้โดยตรงเห็นได้.
  // assignedBy สำคัญ: งานที่ฉัน "มอบให้คนอื่น" ก็โผล่ใน "งานของฉัน" (my-work byAssigner)
  // เดิมไม่มีเงื่อนไขนี้ → กดเปิด detail แล้ว 403.
  if (task.ownerId === user.id || task.assigneeId === user.id
    || task.proxyBy === user.id || task.assignedBy === user.id) return true;
  if (isRdRole(user.role)) {
    const responsible = await personalTaskResponsibleIdentity(supabase, task);
    return !!normalizeDepartment(user.department)
      && normalizeDepartment(user.department) === normalizeDepartment(responsible.department);
  }
  // ทีมขาย (senior_ae/ac/ae) เห็นงานของ "ทีมตัวเอง" ได้ — ให้ตรงกับขอบเขตที่ my-work
  // เปิดให้ (pmTaskScopes = ['mine','team'] ทั้งสามตำแหน่ง). เดิมจำกัดแค่ senior_ae →
  // ac/ae เห็นงานทีมในลิสต์แต่กดเปิด detail แล้ว 403 (list/detail ไม่ตรงกัน, มติ 2026-07-21).
  // นี่คือสิทธิ์ "ดู" อย่างเดียว; การจัดการงานของคนอื่นยังสงวนให้ senior_ae (canManagePersonalTask).
  if (!TEAM_ROLES.includes(user.role) || !userTeams(user).length) return false;

  if (hasTeam(user, await personalTaskResponsibleTeam(supabase, task))) return true;
  return hasTeam(user, await taskDealTeam(supabase, task));
}

export async function canAttachToPersonalTask(supabase, task, user) {
  if (task?.proxyBy === user?.id && can(user?.role, 'pm:edit')) return true;
  return canManagePersonalTask(supabase, task, user);
}
