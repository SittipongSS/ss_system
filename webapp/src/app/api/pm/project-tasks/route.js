import { viewScope, editScope, inScope } from '@/lib/permissions';
import { recalculateForward, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { propagateAndPersist } from '@/lib/pm/status';
import { teamProjectIds } from '@/lib/pm/projectsRepo';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/pm/project-tasks?projectId=...  — team-scoped (via parent project).
// Without projectId: all tasks the user may see (own team / all).
export const GET = withUser(async ({ user, supabase, req }) => {
  const projectId = new URL(req.url).searchParams.get('projectId');

  if (projectId) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('projectId', projectId)
      .order('stepOrder', { ascending: true });
    if (error) return fail(error.message, 500);
    return ok(data);
  }

  // Cross-project list — limit to the team's projects when team-scoped.
  if (viewScope(user?.role) === 'team') {
    const ids = await teamProjectIds(supabase, user?.team);
    if (!ids.length) return ok([]);
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .in('projectId', ids)
      .order('stepOrder', { ascending: true });
    if (error) return fail(error.message, 500);
    return ok(data);
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .order('stepOrder', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
});

// POST — add a task to a project (manual). stepOrder = max+1.
export const POST = withUser(async ({ user, supabase, req }) => {
  const body = await req.json();
  if (!body.projectId) return badRequest('ต้องระบุ projectId');

  // Row-level scope: a task may only be added to a project the user may edit
  // (own team / own record). Mirrors the checks on the other PM write routes.
  const { data: project } = await supabase.from('projects').select('*').eq('id', body.projectId).maybeSingle();
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(editScope(user?.role), user, project)) {
    return forbidden();
  }

  const { data: allTasks } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('projectId', body.projectId)
    .order('stepOrder', { ascending: true });

  // บั๊ก C: แทรกตรงตำแหน่ง — ถ้าระบุ afterTaskId ให้ stepOrder = ของตัวนั้น+1 แล้ว
  // ดัน stepOrder ของแถวที่อยู่หลังให้เลื่อนลง 1 (กันชน + คงลำดับเฟสติดกัน);
  // ไม่ระบุ → ต่อท้ายสุดเหมือนเดิม.
  const lastOrder = (allTasks || []).reduce((m, t) => Math.max(m, t.stepOrder ?? 0), -1);
  let stepOrder = lastOrder + 1;
  const after = body.afterTaskId ? (allTasks || []).find((t) => t.id === body.afterTaskId) : null;
  // แทรก "ก่อน" task ที่ระบุ (เช่นปุ่ม + ก่อนหัวแถวแรกของเฟส) — stepOrder = ของตัวนั้น
  // แล้วดันตัวนั้น + ตัวที่อยู่หลังลง 1; ไม่งั้นถ้าระบุ afterTaskId ก็แทรกต่อท้ายตัวนั้น.
  const before = body.beforeTaskId ? (allTasks || []).find((t) => t.id === body.beforeTaskId) : null;
  if (before) {
    stepOrder = before.stepOrder ?? 0;
    const toShift = (allTasks || []).filter((t) => (t.stepOrder ?? 0) >= stepOrder);
    if (toShift.length) {
      await Promise.all(toShift.map((t) =>
        supabase.from('project_tasks').update({ stepOrder: (t.stepOrder ?? 0) + 1 }).eq('id', t.id)
      ));
    }
  } else if (after) {
    stepOrder = (after.stepOrder ?? 0) + 1;
    const toShift = (allTasks || []).filter((t) => (t.stepOrder ?? 0) >= stepOrder);
    if (toShift.length) {
      await Promise.all(toShift.map((t) =>
        supabase.from('project_tasks').update({ stepOrder: (t.stepOrder ?? 0) + 1 }).eq('id', t.id)
      ));
    }
  }

  const row = {
    id: 'PT-' + Date.now().toString().slice(-6),
    projectId: body.projectId,
    stepOrder,
    name: body.name || '',
    role: body.role || 'SA',
    assignee: body.assignee || null,
    // assigneeId ไม่ใส่ตอนสร้าง (assign ผ่าน PATCH) — กัน insert พังก่อนรัน migration 0019
    phase: body.phase || null,
    isMilestone: !!body.isMilestone,
    durationDays: body.durationDays ?? 1,
    startDate: body.startDate || null,
    finishDate: body.finishDate || null,
    dueDate: body.dueDate || null,
    status: body.status || 'Pending',
    predecessors: body.predecessors || [],
    cellsOverride: body.cellsOverride ?? null,
    note: body.note || '',
    showNoteInPrint: !!body.showNoteInPrint,
    origin: 'custom', // ผู้ใช้เพิ่มเอง (template ใช้ DB default 'template') — migration 0022
  };

  setHolidays([...(await holidaySet())]);
  const tasksWithNew = [...(allTasks || []), row];
  const anchor = project.startDate || todayStr();
  const recalced = recalculateForward(tasksWithNew, anchor);
  const finalRow = recalced.find(t => t.id === row.id);

  const { data, error } = await supabase.from('project_tasks').insert(finalRow).select().single();
  if (error) return fail(error.message, 500);

  // ขั้นใหม่อาจทำให้กราฟเปลี่ยน (เช่นแทรกขั้นที่ไม่มี predecessor = พร้อมทำทันที,
  // หรือไปคั่นกลางทำให้ขั้นถัดไม่พร้อม) → คำนวณสถานะทั้งโปรเจกต์ใหม่. client เรียก load() ต่อ.
  await propagateAndPersist(supabase, body.projectId);

  return ok(data, 201);
});
