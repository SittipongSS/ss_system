import { viewScope, pmEditScope, inScope, can } from '@/lib/permissions';
import { recalculateGraph, resolveSchedule } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { propagateAndPersist } from '@/lib/pm/status';
import { teamProjectIds } from '@/lib/pm/projectsRepo';
import { genId } from '@/lib/id';
import { withUser, ok, fail, forbidden, notFound, badRequest, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/pm/project-tasks?projectId=...  — team-scoped (via parent project).
// Without projectId: all tasks the user may see (own team / all).
export const GET = withUser(async ({ user, supabase, req }) => {
  // PM is sales-only: gate on pm:view (legal/unknown have scope but no cap).
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const projectId = new URL(req.url).searchParams.get('projectId');

  if (projectId) {
    // Row-level scope: only return tasks for a project the user may VIEW
    // (own team / all). Without this any user could read another team's tasks
    // just by passing its projectId. Mirrors the no-projectId branch below
    // and the inScope checks on the other PM routes.
    const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (!project) return notFound('ไม่พบโครงการ');
    if (!inScope(viewScope(user?.role), user, project)) return forbidden();

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
// DL: หรือเพิ่มเข้าไทม์ไลน์ลอยของดีล (ส่ง dealId แทน projectId — mig 0094)
export const POST = withUser(async ({ user, supabase, req }) => {
  const body = await req.json();
  if (!body.projectId && !body.dealId) return badRequest('ต้องระบุ projectId หรือ dealId');

  // Row-level scope: a task may only be added to a project the user may edit
  // (own team / own record). Mirrors the checks on the other PM write routes.
  let project = null;
  if (body.projectId) {
    ({ data: project } = await supabase.from('projects').select('*').eq('id', body.projectId).maybeSingle());
    if (!project) return notFound('ไม่พบโครงการ');
    if (!inScope(pmEditScope(user?.role), user, project)) {
      return forbidden();
    }
  } else {
    // ไทม์ไลน์ลอยของดีล — scope จากทีม/AE ของดีล (pseudo-project เหมือน PATCH task ลอย)
    const { data: deal } = await supabase.from('sales_deals')
      .select('id, team, ownerName, projectId').eq('id', body.dealId).maybeSingle();
    if (!deal) return notFound('ไม่พบดีล');
    if (deal.projectId) return badRequest('ดีลนี้ผูกโครงการแล้ว — เพิ่มขั้นตอนด้วย projectId');
    if (!inScope(pmEditScope(user?.role), user, { team: deal.team, aeOwner: deal.ownerName })) {
      return forbidden();
    }
  }

  let taskQuery = supabase.from('project_tasks').select('*');
  taskQuery = body.projectId
    ? taskQuery.eq('projectId', body.projectId)
    : taskQuery.is('projectId', null).eq('dealId', body.dealId);
  const { data: allTasks } = await taskQuery.order('stepOrder', { ascending: true });

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
    id: genId('PT'),
    projectId: body.projectId || null,
    dealId: body.dealId || null,
    stepOrder,
    name: body.name || '',
    role: body.role || 'SA',
    assignee: body.assignee || null,
    // ผู้รับผิดชอบที่เลือกตอนเพิ่มขั้นตอนต้องติดไปด้วย ไม่งั้นค่าที่กรอกหายเงียบ ๆ
    // (เคยเว้นไว้ตอน migration 0019 ยังไม่รัน — รันแล้ว และ PATCH เขียนคอลัมน์นี้อยู่)
    assigneeId: body.assigneeId || null,
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
    // ไม่ใส่ startLocked ตอนสร้าง — ปล่อย DB default false (กัน insert พังถ้า migration 0032
    // ยังไม่รัน); ปักหมุดทำผ่านการแก้วันเริ่มภายหลัง (PATCH)
  };

  setHolidays([...(await holidaySet())]);
  const tasksWithNew = [...(allTasks || []), row];
  // anchor: โครงการใช้วันเริ่มโครงการ; ชุดลอยของดีลใช้วันเริ่มเร็วสุดของชุด (fallback วันนี้)
  const anchor = project
    ? resolveSchedule(project).anchor
    : ((allTasks || []).map((t) => t.startDate).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10));
  const recalced = recalculateGraph(tasksWithNew, anchor);
  const finalRow = recalced.find(t => t.id === row.id);

  const { data, error } = await supabase.from('project_tasks').insert(finalRow).select().single();
  if (error) return fail(error.message, 500);

  // ขั้นใหม่อาจทำให้กราฟเปลี่ยน (เช่นแทรกขั้นที่ไม่มี predecessor = พร้อมทำทันที,
  // หรือไปคั่นกลางทำให้ขั้นถัดไม่พร้อม) → คำนวณสถานะทั้งโครงการใหม่. client เรียก load() ต่อ.
  await propagateAndPersist(supabase, body.projectId || null, { dealId: body.dealId || null });

  return ok(data, 201);
});
