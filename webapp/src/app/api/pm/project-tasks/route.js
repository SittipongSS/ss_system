import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope, editScope, inScope } from '@/lib/permissions';
import { recalculateForward, todayStr } from '@/lib/pm/schedule';

export const dynamic = 'force-dynamic';

// GET /api/pm/project-tasks?projectId=...  — team-scoped (via parent project).
// Without projectId: all tasks the user may see (own team / all).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const projectId = new URL(request.url).searchParams.get('projectId');

  if (projectId) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('projectId', projectId)
      .order('stepOrder', { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  // Cross-project list — limit to the team's projects when team-scoped.
  if (viewScope(user?.role) === 'team') {
    const { data: projs } = await supabase.from('projects').select('id').eq('team', user?.team ?? null);
    const ids = (projs || []).map((p) => p.id);
    if (!ids.length) return Response.json([]);
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .in('projectId', ids)
      .order('stepOrder', { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .order('stepOrder', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST — add a task to a project (manual). stepOrder = max+1.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();
  if (!body.projectId) return Response.json({ error: 'ต้องระบุ projectId' }, { status: 400 });

  // Row-level scope: a task may only be added to a project the user may edit
  // (own team / own record). Mirrors the checks on the other PM write routes.
  const { data: project } = await supabase.from('projects').select('*').eq('id', body.projectId).maybeSingle();
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: last } = await supabase
    .from('project_tasks')
    .select('stepOrder')
    .eq('projectId', body.projectId)
    .order('stepOrder', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: allTasks } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('projectId', body.projectId)
    .order('stepOrder', { ascending: true });

  const row = {
    id: 'PT-' + Date.now().toString().slice(-6),
    projectId: body.projectId,
    stepOrder: (last?.stepOrder ?? -1) + 1,
    name: body.name || '',
    role: body.role || 'SA',
    assignee: body.assignee || null,
    phase: body.phase || null,
    isMilestone: !!body.isMilestone,
    durationDays: body.durationDays ?? 1,
    startDate: body.startDate || null,
    finishDate: body.finishDate || null,
    status: body.status || 'Pending',
    predecessors: body.predecessors || [],
    cellsOverride: body.cellsOverride ?? null,
  };

  const tasksWithNew = [...(allTasks || []), row];
  const anchor = project.startDate || todayStr();
  const recalced = recalculateForward(tasksWithNew, anchor);
  const finalRow = recalced.find(t => t.id === row.id);

  const { data, error } = await supabase.from('project_tasks').insert(finalRow).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
