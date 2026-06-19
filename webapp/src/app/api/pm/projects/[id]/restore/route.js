import { editScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

const SAVE_RETENTION_DAYS = 3;

// คอลัมน์ของ project_tasks ที่ restore ได้ (ตรงกับ schema migration 0009/0019/0021/0022/0024/0032)
const TASK_COLS = [
  'id', 'projectId', 'stepOrder', 'name', 'role', 'assignee', 'assigneeId',
  'phase', 'isMilestone', 'durationDays', 'startDate', 'finishDate', 'actualFinishDate',
  'status', 'predecessors', 'cellsOverride', 'note', 'showNoteInPrint',
  'origin', 'userEdited', 'dueDate', 'startLocked',
];
const pickTask = (t, projectId) => {
  const row = {};
  for (const k of TASK_COLS) if (k in t) row[k] = t[k];
  row.projectId = projectId; // กัน snapshot ข้ามโปรเจกต์
  return row;
};

// POST /api/pm/projects/[id]/restore  body: { snapshotId }
// ย้อนงาน "ทั้งชุด" กลับไปเท่ากับ snapshot ที่เลือก (เซฟใหญ่หรือ Rev ก็ได้):
//   • งานที่ถูกลบไปหลัง snapshot → สร้างกลับ (id เดิม)
//   • งานที่เพิ่มเข้ามาหลัง snapshot → ลบทิ้ง
//   • งานที่ยังอยู่ → เขียนทับด้วยค่าใน snapshot (วัน/สถานะ/ลำดับ/predecessors/ฯลฯ)
// แล้วถ่าย "เซฟใหญ่" จุดใหม่บันทึกสถานะหลังย้อน (ไม่ทำลายของเดิม — ย้อนของการย้อนได้อีก).
// หมายเหตุ: v1 ย้อนเฉพาะ "ขั้นตอนงาน" (timeline) — ไม่แตะหัวเอกสาร/ข้อมูลโปรเจกต์.
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(editScope(user?.role), user, project)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const snapshotId = body.snapshotId;
  if (!snapshotId) return fail('ต้องระบุ snapshotId', 400);

  const { data: snap, error: snapErr } = await supabase
    .from('project_doc_revisions')
    .select('id, revNo, kind, snapshot, createdAt')
    .eq('projectId', project.id)
    .eq('id', snapshotId)
    .maybeSingle();
  if (snapErr) return fail(snapErr.message, 500);
  if (!snap) return notFound('ไม่พบจุดที่จะย้อนกลับ');

  const snapTasks = Array.isArray(snap.snapshot?.tasks) ? snap.snapshot.tasks : [];

  const { data: current, error: curErr } = await supabase
    .from('project_tasks').select('id').eq('projectId', project.id);
  if (curErr) return fail(curErr.message, 500);

  const currentIds = new Set((current || []).map((t) => t.id));
  const snapIds = new Set(snapTasks.map((t) => t.id));

  // 1) ลบงานที่ไม่มีใน snapshot (เพิ่มเข้ามาหลังจุดนั้น)
  const toDelete = [...currentIds].filter((cid) => !snapIds.has(cid));
  if (toDelete.length) {
    const { error } = await supabase.from('project_tasks').delete().in('id', toDelete);
    if (error) return fail(error.message, 500);
  }

  // 2) งานใน snapshot → upsert ทับค่าเดิม / สร้างคืนถ้าถูกลบไป (id เดิม)
  const now = new Date().toISOString();
  const rows = snapTasks.map((t) => ({ ...pickTask(t, project.id), updatedAt: now }));
  if (rows.length) {
    const { error } = await supabase
      .from('project_tasks')
      .upsert(rows, { onConflict: 'id' });
    if (error) return fail(error.message, 500);
  }

  // 3) ถ่าย "เซฟใหญ่" จุดใหม่ = สถานะหลังย้อน (ย้อนได้อีก) + ลบเซฟใหญ่เก่าเกิน 7 วัน
  const label = snap.kind === 'rev'
    ? `Rev. ${snap.revNo}`
    : `เซฟเมื่อ ${new Date(snap.createdAt).toLocaleString('th-TH')}`;
  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);
  await supabase.from('project_doc_revisions').insert({
    projectId: project.id, revNo: null, kind: 'save',
    snapshot: { project, tasks: tasks || [], projectProducts: links || [] },
    note: `ย้อนกลับไป ${label}`,
    createdBy: user.id, createdByName: user.name,
  });
  const cutoff = new Date(Date.now() - SAVE_RETENTION_DAYS * 86400000).toISOString();
  await supabase
    .from('project_doc_revisions').delete()
    .eq('projectId', project.id).eq('kind', 'save').lt('createdAt', cutoff);

  return ok({ restored: true, deleted: toDelete.length, restoredTasks: rows.length });
});
