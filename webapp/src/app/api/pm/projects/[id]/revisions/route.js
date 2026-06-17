import { viewScope, editScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects/[id]/revisions — รายการเวอร์ชันเอกสารที่เคยออก (ไม่ส่ง snapshot ก้อนใหญ่)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const { data, error } = await supabase
    .from('project_doc_revisions')
    .select('id, revNo, note, createdBy, createdByName, createdAt')
    .eq('projectId', project.id)
    .order('revNo', { ascending: false });
  if (error) return fail(error.message, 500);

  return ok({ revisions: data || [], currentRev: project.currentRev ?? null });
});

// POST /api/pm/projects/[id]/revisions — freeze เอกสารทั้งชุดเป็น Rev ใหม่.
// Rev เริ่มที่ 0 (ออกครั้งแรก = Rev 0) แล้วนับขึ้นทีละ 1.
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  // ออกเวอร์ชัน = การกระทำระดับเอกสาร → ใช้สิทธิ์แก้โปรเจกต์ (team-scope) เหมือน PATCH
  if (!inScope(editScope(user?.role), user, project)) {
    return forbidden();
  }

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  // snapshot ทั้งเอกสาร ณ ตอนนี้ — อ่านจาก DB ให้ authoritative (ไม่เชื่อค่าจาก client)
  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);

  const revNo = project.currentRev == null ? 0 : project.currentRev + 1;
  const snapshot = { project, tasks: tasks || [], projectProducts: links || [] };

  const { data: rev, error } = await supabase
    .from('project_doc_revisions')
    .insert({
      projectId: project.id, revNo, snapshot, note,
      createdBy: user.id, createdByName: user.name,
    })
    .select('id, revNo, note, createdBy, createdByName, createdAt')
    .single();
  if (error) return fail(error.message, 500);

  const { error: upErr } = await supabase
    .from('projects').update({ currentRev: revNo }).eq('id', project.id);
  if (upErr) return fail(upErr.message, 500);

  return ok({ ...rev, currentRev: revNo });
});
