import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

export const dynamic = 'force-dynamic';

// Which scopes a role may request for PROJECT tasks:
//   mine = งานที่ assign ให้ฉัน (ทุก role)
//   team = งานของทีมตัวเอง (senior_ae, ac, ae_supervisor)
//   all  = ทุกทีม (ae_supervisor)
function allowedScopes(role) {
  if (role === 'ae_supervisor') return ['mine', 'team', 'all'];
  if (role === 'senior_ae' || role === 'ac') return ['mine', 'team'];
  return ['mine'];
}

// GET /api/pm/my-work?scope=mine|team|all
// คืน { scope, projectTasks, personalTasks, projects } — scope ถูกบังคับตาม role
// ฝั่ง server. งานส่วนตัว = ของฉันเสมอ (ไม่ปนของคนอื่นแม้ scope ทีม/ทั้งหมด).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const allowed = allowedScopes(user.role);
  let scope = new URL(request.url).searchParams.get('scope') || 'mine';
  if (!allowed.includes(scope)) scope = 'mine';

  // ── project tasks ตาม scope ──
  let projectTasks = [];
  if (scope === 'mine') {
    const { data } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('assigneeId', user.id)
      .order('stepOrder', { ascending: true });
    projectTasks = data || [];
  } else if (scope === 'team') {
    const { data: projs } = await supabase.from('projects').select('id').eq('team', user.team ?? null);
    const ids = (projs || []).map((p) => p.id);
    if (ids.length) {
      const { data } = await supabase
        .from('project_tasks').select('*').in('projectId', ids)
        .order('stepOrder', { ascending: true });
      projectTasks = data || [];
    }
  } else { // all
    const { data } = await supabase
      .from('project_tasks').select('*').order('stepOrder', { ascending: true });
    projectTasks = data || [];
  }

  // ── projects map สำหรับแสดงรหัส/ชื่อ ──
  const projIds = [...new Set(projectTasks.map((t) => t.projectId).filter(Boolean))];
  let projects = {};
  if (projIds.length) {
    const { data: ps } = await supabase
      .from('projects').select('id, code, name, aeOwner, team, customerName').in('id', projIds);
    projects = Object.fromEntries((ps || []).map((p) => [p.id, p]));
  }

  // ── งานส่วนตัว = ของฉันเสมอ ──
  const { data: personalTasks } = await supabase
    .from('personal_tasks').select('*').eq('ownerId', user.id)
    .order('createdAt', { ascending: false });

  return Response.json({
    scope,
    allowedScopes: allowed,
    me: { id: user.id, name: user.name, role: user.role },
    projectTasks,
    personalTasks: personalTasks || [],
    projects,
  });
}
