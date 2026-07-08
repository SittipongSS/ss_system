// Data-access helpers for PM projects — mirrors the lib/master/* repo pattern.
// Routes should load projects / team scope / next code through here instead of
// re-querying Supabase inline (which had drifted into 3 divergent copies).

// Resolve a URL segment to a project. Internal ids ('PRJ-######') and human
// project codes ('PJ-YYMMNNN') never collide, so accept either: try id first,
// then fall back to code. Callers must use the returned row's real `id` for any
// project_tasks / project_products subqueries (those FK the internal id).
// (Canonical version — replaces the id-only copies that 404'd on a human code.)
export async function loadProject(supabase, idOrCode) {
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', idOrCode).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: byCode, error: codeErr } = await supabase
    .from('projects').select('*').eq('code', idOrCode).maybeSingle();
  if (codeErr) throw codeErr;
  return byCode;
}

// Internal project ids for a team (used to scope project_tasks / personal_tasks).
export async function teamProjectIds(supabase, team) {
  const { data } = await supabase.from('projects').select('id').eq('team', team ?? null);
  return (data || []).map((p) => p.id);
}

// Whether a project has excise registrations pointing at it. excise_registrations
// .projectId is a *logical* link (no FK, migration 0066) so deleting the project
// would silently orphan tax records — callers block deletion when this is true.
export async function projectHasExciseRegistrations(supabase, projectId) {
  const { count, error } = await supabase
    .from('excise_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('projectId', projectId);
  if (error) throw error;
  return (count || 0) > 0;
}

// Delete a project and every child row it owns. FK ON DELETE CASCADE already
// removes project_tasks / project_products / shipment_prep(+lines); sahamit_pos
// .projectId is SET NULL. But personal_tasks & project_doc_revisions link by a
// *logical* projectId (no FK, migrations 0019/0040) so we clear them by hand
// first — otherwise they dangle. Caller is responsible for permission + blocker
// checks (see projectHasExciseRegistrations). Returns the removed child counts.
export async function deleteProjectDeep(supabase, projectId) {
  const [{ count: taskCount }, { count: revCount }] = await Promise.all([
    supabase.from('personal_tasks').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
    supabase.from('project_doc_revisions').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
  ]);
  // Logical-link children: remove before the project row disappears.
  await supabase.from('personal_tasks').delete().eq('projectId', projectId);
  await supabase.from('project_doc_revisions').delete().eq('projectId', projectId);
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
  return { personalTasks: taskCount || 0, docRevisions: revCount || 0 };
}

// Next sequential project code PJ-YYMMNNN (per-month running number).
// NOT atomic (read-max + 1) — callers that insert should retry on unique(code)
// collision and call this again. `now` is injectable for testing/determinism.
export async function generateProjectCode(supabase, now = new Date()) {
  const prefix = `PJ-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const { data: latest } = await supabase
    .from('projects').select('code').ilike('code', `${prefix}%`)
    .order('code', { ascending: false }).limit(1);
  let nextNum = 1;
  if (latest?.[0]?.code) {
    const lastNum = parseInt(latest[0].code.slice(prefix.length), 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}${nextNum.toString().padStart(3, '0')}`;
}
