import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { buildAppendedTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { loadProject } from '@/lib/pm/projectsRepo';
import { canEditSalesPlanning, dealAuditLabel, DEAL_STAGES, dealTypeOf, inSalesEditScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/deals/[id]/link-project { projectId, startDate? }
// เฟส B: ผูกดีลเข้า "โครงการเดิม" (หลายดีลต่อโครงการ) — คู่กับ create-project (สร้างใหม่).
// ต่อ task ชุดตาม template ของประเภทดีลเป็น segment ใหม่ท้ายไทม์ไลน์ (anchor = วันเริ่ม
// ของ segment, pin ด้วย startLocked). กติกา: ลูกค้าต้องตรงกัน (มติ #5 — ห้ามข้ามลูกค้า).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user) || !can(user.role, 'pm:edit')) return forbidden();

  const { id } = await ctx.params;
  const { data: deal, error: dealErr } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (dealErr) return fail(dealErr.message, 500);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ดีล Lost แล้ว ผูกโครงการไม่ได้');
  if (deal.projectId) return conflict('ดีลนี้ผูกโครงการแล้ว');

  const body = await req.json().catch(() => ({}));
  if (!body.projectId) return badRequest('ต้องระบุโครงการ (projectId)');

  const project = await loadProject(supabase, body.projectId);
  if (!project) return notFound('ไม่พบโครงการ');
  // มติ #5: ดีลกับโครงการต้องลูกค้าเดียวกัน — ไม่มี override
  if (!deal.customerId || !project.customerId || deal.customerId !== project.customerId) {
    return badRequest('ดีลกับโครงการต้องเป็นลูกค้าเดียวกัน');
  }

  const now = new Date().toISOString();
  const startDate = body.startDate || todayStr();

  // ต่อ segment: task ชุดตาม template ของประเภทดีล ต่อท้าย stepOrder เดิม
  setHolidays([...(await holidaySet())]);
  const { data: existing } = await supabase
    .from('project_tasks').select('id, stepOrder').eq('projectId', project.id);
  const segTasks = applyAutoStatuses(buildAppendedTasks(project, {
    dealType: dealTypeOf(deal),
    dealId: deal.id,
    startDate,
    existingTasks: existing || [],
  }));
  let insertedTasks = [];
  if (segTasks.length) {
    const { data: taskRows, error: taskErr } = await supabase.from('project_tasks').insert(segTasks).select();
    if (taskErr) return fail(`ต่อไทม์ไลน์ของดีลไม่สำเร็จ: ${taskErr.message}`, 500);
    insertedTasks = taskRows || [];
  }

  // ผูกดีล (guard .is projectId null — กันยิงซ้ำ/แข่งกัน; แพ้ = ถอน task ที่เพิ่งต่อ)
  const stageIdx = (s) => DEAL_STAGES.indexOf(s);
  const nextStage = stageIdx(deal.stage) < stageIdx('timeline_proposed') ? 'timeline_proposed' : deal.stage;
  const { data: updatedDeal, error: linkErr } = await supabase
    .from('sales_deals')
    .update({
      projectId: project.id,
      stage: nextStage,
      updatedAt: now,
      metadata: { ...(deal.metadata || {}), linkedProjectCode: project.code, linkedProjectAt: now },
    })
    .eq('id', deal.id)
    .is('projectId', null)
    .select()
    .single();
  if (linkErr) {
    if (insertedTasks.length) await supabase.from('project_tasks').delete().in('id', insertedTasks.map((t) => t.id));
    if (linkErr.code === 'PGRST116') return conflict('ดีลนี้ผูกโครงการแล้ว');
    return fail(linkErr.message, 500);
  }

  if (deal.stage !== nextStage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: deal.id,
      fromStage: deal.stage,
      toStage: nextStage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: deal.id,
    before: deal,
    after: updatedDeal,
    summary: `ผูกดีล ${dealAuditLabel(deal)} เข้าโครงการเดิม ${project.code || project.id} (+${insertedTasks.length} ขั้นตอน segment ${dealTypeOf(deal)})`,
    request: req,
  });

  return ok({ deal: updatedDeal, project: { id: project.id, code: project.code, name: project.name }, appendedTasks: insertedTasks.length }, 201);
});
