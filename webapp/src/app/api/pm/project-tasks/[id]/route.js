import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { editScope, inScope } from '@/lib/permissions';
import { recalculateForward, todayStr } from '@/lib/pm/schedule';

export const dynamic = 'force-dynamic';

// แก้ field เหล่านี้แล้วต้องคำนวณ timeline ใหม่ (วันเริ่ม/วันเสร็จ + เลื่อนขั้นถัดไป)
const SCHEDULE_FIELDS = ['startDate', 'durationDays', 'predecessors'];

const EDITABLE = [
  'name', 'role', 'assignee', 'phase', 'isMilestone', 'durationDays',
  'startDate', 'finishDate', 'actualFinishDate', 'status',
  'predecessors', 'cellsOverride', 'stepOrder',
];

// Load the task + its parent project (for team-scope checks).
async function loadTaskWithProject(supabase, id) {
  const { data: task } = await supabase.from('project_tasks').select('*').eq('id', id).maybeSingle();
  if (!task) return { task: null, project: null };
  const { data: project } = await supabase.from('projects').select('*').eq('id', task.projectId).maybeSingle();
  return { task, project };
}

// PATCH /api/pm/project-tasks/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { task, project } = await loadTaskWithProject(supabase, id);
  if (!task) return Response.json({ error: 'ไม่พบขั้นตอน' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project || {})) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) {
      if ((k === 'startDate' || k === 'finishDate' || k === 'actualFinishDate') && body[k] === "") updates[k] = null;
      else updates[k] = body[k];
    }
  }
  updates.updatedAt = new Date().toISOString();

  // ── #2 variance: ตั้ง/ล้าง actualFinishDate ตามการเปลี่ยนสถานะ ──
  // (ทำเฉพาะเมื่อ client ไม่ได้ส่ง actualFinishDate มาเอง)
  if (body.status !== undefined && body.status !== task.status && body.actualFinishDate === undefined) {
    if (body.status === 'Completed') updates.actualFinishDate = todayStr();
    else if (task.status === 'Completed') updates.actualFinishDate = null;
  }

  const { data, error } = await supabase.from('project_tasks').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ── #1 recalc: ถ้าแก้วันเริ่ม/จำนวนวัน/predecessors → คำนวณ timeline ใหม่
  // ตั้งแต่ task นี้เป็นต้นไป (anchor = วันเริ่มใหม่ของ task นี้) แล้ว persist
  // เฉพาะแถวที่ start/finish/cells เปลี่ยนจริง — mirror updateTaskDetails ของ ss-cj ──
  const schedulingChanged = SCHEDULE_FIELDS.some((k) => body[k] !== undefined);
  if (schedulingChanged && project) {
    const { data: all } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('projectId', project.id)
      .order('stepOrder', { ascending: true });

    if (all && all.length) {
      const applied = all.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const idx = applied.findIndex((t) => t.id === id);
      const fromHere = applied.slice(idx);
      const anchor = applied[idx].startDate || project.startDate || todayStr();
      const recalced = recalculateForward(fromHere, anchor, applied);

      const sameCells = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const changed = recalced.filter((r) => {
        const orig = all.find((o) => o.id === r.id);
        return orig.startDate !== r.startDate || orig.finishDate !== r.finishDate || !sameCells(orig.cellsOverride, r.cellsOverride);
      });

      if (changed.length) {
        await Promise.all(changed.map((r) =>
          supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
            updatedAt: new Date().toISOString(),
          }).eq('id', r.id)
        ));
      }

      // คืน task ที่แก้พร้อม start/finish ที่คำนวณใหม่ (เผื่อ client ไม่ได้ reload)
      const self = recalced.find((r) => r.id === id);
      if (self) return Response.json({ ...data, startDate: self.startDate, finishDate: self.finishDate, cellsOverride: self.cellsOverride ?? null });
    }
  }

  return Response.json(data);
}

// DELETE /api/pm/project-tasks/[id]
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { task, project } = await loadTaskWithProject(supabase, id);
  if (!task) return Response.json({ error: 'ไม่พบขั้นตอน' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project || {})) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
