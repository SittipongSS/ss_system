// Data-access helpers for PM projects — mirrors the lib/master/* repo pattern.
// Routes should load projects / team scope / next code through here instead of
// re-querying Supabase inline (which had drifted into 3 divergent copies).
import { generateEntityCode } from '@/lib/entityCode';

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
// .projectId is SET NULL. But personal_tasks, project_doc_revisions AND inquiries
// link by a *logical* projectId (no FK, migrations 0019/0040/0104) so we clear
// them by hand first — otherwise they dangle. inquiries also own inquiry_messages
// + back-linked personal_tasks (both no-FK), removed transitively. Caller is
// responsible for permission + blocker checks (see projectHasExciseRegistrations).
// Returns the removed child counts.
export async function deleteProjectDeep(supabase, projectId) {
  const [{ count: taskCount }, { count: revCount }] = await Promise.all([
    supabase.from('personal_tasks').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
    supabase.from('project_doc_revisions').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
  ]);
  // Logical-link children: remove before the project row disappears.
  await supabase.from('personal_tasks').delete().eq('projectId', projectId);
  await supabase.from('project_doc_revisions').delete().eq('projectId', projectId);
  // inquiries.projectId is a no-FK logical link (mig 0104) — clean the thread +
  // its messages + any task created from it, else they orphan silently.
  const { data: inqs } = await supabase.from('inquiries').select('id').eq('projectId', projectId);
  const inquiryIds = (inqs || []).map((r) => r.id);
  if (inquiryIds.length) {
    await supabase.from('inquiry_messages').delete().in('inquiryId', inquiryIds);
    await supabase.from('personal_tasks').delete().in('inquiryId', inquiryIds);
    await supabase.from('inquiries').delete().in('id', inquiryIds);
  }
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
  return { personalTasks: taskCount || 0, docRevisions: revCount || 0, inquiries: inquiryIds.length };
}

// รหัสโครงการฐาน PJ-YYMMXXXX (เลขรัน 4 หลัก atomic ต่อเดือน — mig 0096).
// แสดงเป็น PJ-YYMMXXXX-R ที่ฝั่ง UI/เอกสาร (R = currentRev ผ่าน entityCodeDisplay).
// atomic แล้ว (RPC) จึงไม่ชนกัน แต่ callers เดิมยัง retry on unique(code) ได้ (ไม่เสียหาย).
export async function generateProjectCode(supabase, now = new Date()) {
  return generateEntityCode(supabase, 'PJ', now);
}
