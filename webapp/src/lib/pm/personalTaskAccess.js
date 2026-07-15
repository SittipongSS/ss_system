import { can, isSuperuser, normalizeDepartment } from '@/lib/permissions';

async function userIdentity(supabase, id) {
  if (!id) return { team: null, department: null };
  const { data } = await supabase.auth.admin.getUserById(id);
  const meta = data?.user?.app_metadata || {};
  return { team: meta.team ?? null, department: normalizeDepartment(meta.department) || null };
}

async function taskProjectTeam(supabase, task) {
  if (!task?.projectId) return null;
  const { data } = await supabase
    .from('projects')
    .select('team')
    .eq('id', task.projectId)
    .maybeSingle();
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
  if (!can(user.role, 'pm:view') || user.role === 'viewer') return false;
  if (task.ownerId === user.id || task.assigneeId === user.id) return true;
  // จัดการงานของ "คนอื่น" ยังสงวนให้สายบังคับบัญชาฝ่ายขาย (pm:edit) เหมือนเดิม
  if (!can(user.role, 'pm:edit')) return false;
  if (isSuperuser(user.role)) return true;
  if (user.role !== 'senior_ae' || !user.team) return false;

  const responsibleTeam = await personalTaskResponsibleTeam(supabase, task);
  if (responsibleTeam && responsibleTeam === user.team) return true;
  return (await taskProjectTeam(supabase, task)) === user.team;
}

export async function canViewPersonalTask(supabase, task, user) {
  if (!task || !user || !can(user.role, 'pm:view')) return false;
  if (isSuperuser(user.role) || user.role === 'viewer') return true;
  if (task.ownerId === user.id || task.assigneeId === user.id || task.proxyBy === user.id) return true;
  if (user.role !== 'senior_ae' || !user.team) return false;

  const responsibleTeam = await personalTaskResponsibleTeam(supabase, task);
  if (responsibleTeam && responsibleTeam === user.team) return true;
  return (await taskProjectTeam(supabase, task)) === user.team;
}

export async function canAttachToPersonalTask(supabase, task, user) {
  if (task?.proxyBy === user?.id && can(user?.role, 'pm:edit')) return true;
  return canManagePersonalTask(supabase, task, user);
}
