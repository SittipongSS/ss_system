import { viewScope, editScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

const SAVE_RETENTION_DAYS = 3; // เซฟใหญ่ (working save) เก็บย้อนหลังกี่วัน (Rev เก็บถาวร)

// GET /api/pm/projects/[id]/revisions — ไทม์ไลน์ประวัติทั้งหมด (เซฟใหญ่ + Rev, ไม่ส่ง snapshot ก้อนใหญ่)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const { data, error } = await supabase
    .from('project_doc_revisions')
    .select('id, revNo, kind, note, createdBy, createdByName, createdAt')
    .eq('projectId', project.id)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);

  return ok({ revisions: data || [], currentRev: project.currentRev ?? null });
});

// POST /api/pm/projects/[id]/revisions — ถ่าย snapshot งานทั้งชุด ณ ตอนนี้.
//   body.kind='save' = เซฟใหญ่ (จุดย้อนระหว่างทำ, ไม่เด้งเลข Rev, prune > 7 วัน)
//   body.kind='rev'  = ออกเวอร์ชันทางการ (เด้งเลข Rev, เก็บถาวร) — ค่า default
// snapshot อ่านจาก DB ให้ authoritative (ไม่เชื่อค่าจาก client).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  // ถ่าย snapshot = การกระทำระดับเอกสาร → ใช้สิทธิ์แก้โปรเจกต์ (team-scope) เหมือน PATCH
  if (!inScope(editScope(user?.role), user, project)) {
    return forbidden();
  }

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === 'save' ? 'save' : 'rev';
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);

  // Rev = เด้งเลข (เริ่มที่ 0); เซฟใหญ่ = ไม่มีเลข
  const revNo = kind === 'rev' ? (project.currentRev == null ? 0 : project.currentRev + 1) : null;
  const snapshot = { project, tasks: tasks || [], projectProducts: links || [] };

  const { data: rev, error } = await supabase
    .from('project_doc_revisions')
    .insert({
      projectId: project.id, revNo, kind, snapshot, note,
      createdBy: user.id, createdByName: user.name,
    })
    .select('id, revNo, kind, note, createdBy, createdByName, createdAt')
    .single();
  if (error) return fail(error.message, 500);

  if (kind === 'rev') {
    const { error: upErr } = await supabase
      .from('projects').update({ currentRev: revNo }).eq('id', project.id);
    if (upErr) return fail(upErr.message, 500);
    return ok({ ...rev, currentRev: revNo });
  }

  // เซฟใหญ่: ลบจุดเซฟใหญ่เก่ากว่า N วันทิ้ง (Rev ไม่แตะ) — กันประวัติบวมระหว่างทำงาน
  const cutoff = new Date(Date.now() - SAVE_RETENTION_DAYS * 86400000).toISOString();
  await supabase
    .from('project_doc_revisions')
    .delete()
    .eq('projectId', project.id)
    .eq('kind', 'save')
    .lt('createdAt', cutoff);

  return ok({ ...rev, currentRev: project.currentRev ?? null });
});
