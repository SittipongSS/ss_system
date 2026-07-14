import { can, isSuperuser } from '@/lib/permissions';

async function userTeam(supabase, id) {
  if (!id) return null;
  const { data } = await supabase.auth.admin.getUserById(id);
  return data?.user?.app_metadata?.team ?? null;
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
  return userTeam(supabase, task?.assigneeId || task?.ownerId);
}

export async function canManagePersonalTask(supabase, task, user) {
  if (!task || !user || !can(user.role, 'pm:edit')) return false;
  if (task.ownerId === user.id || task.assigneeId === user.id) return true;
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
