import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { buildProjectTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { generateProjectCode } from '@/lib/pm/projectsRepo';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user) || !can(user.role, 'pm:edit')) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้าง project จาก deal ที่ lost แล้ว');
  if (deal.projectId) return conflict('deal นี้ผูก project แล้ว');

  const body = await req.json().catch(() => ({}));
  const startDate = body.startDate || todayStr();
  const dueDate = body.dueDate || deal.expectedCloseDate || null;
  const autoCode = !body.code;
  let projectCode = body.code || (await generateProjectCode(supabase));
  const now = new Date().toISOString();

  const baseRow = {
    name: body.name || deal.title,
    customerId: deal.customerId || null,
    customerName: deal.customerName || null,
    type: body.type === 'RE-ORDER' ? 'RE-ORDER' : 'NPD',
    urgency: body.urgency || 'Schedule',
    aeOwner: deal.ownerName || user.name || '',
    acOwner: '',
    status: 'New',
    startDate,
    dueDate,
    productMainCategory: '',
    productSubCategory: '',
    docNumber: '',
    productName: deal.title || '',
    productCode: '',
    orderQty: '',
    productionQty: '',
    aeSupervisor: '',
    keyAccountExec: '',
    customerEmail: '',
    preparedBy: user.name || '',
    reviewedBy: '',
    team: deal.team || user.team || null,
    ownerId: deal.ownerId || user.id || null,
    metadata: {
      ...(body.metadata || {}),
      salesDealId: deal.id,
      salesDealTitle: deal.title,
      salesStage: deal.stage,
      salesForecastMonth: deal.forecastMonth,
      salesProjectValue: deal.projectValue,
      source: 'sales-planning',
    },
  };

  let project = null;
  let error = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const projectId = genId('PRJ');
    ({ data: project, error } = await supabase
      .from('projects')
      .insert({ ...baseRow, id: projectId, code: projectCode })
      .select()
      .single());
    if (!error) break;
    if (error.code === '23505') {
      if (!autoCode) return conflict(`รหัสโปรเจกต์ซ้ำ: ${projectCode}`);
      projectCode = await generateProjectCode(supabase);
      continue;
    }
    break;
  }
  if (error) return fail(error.message, 500);

  setHolidays([...(await holidaySet())]);
  const tasks = applyAutoStatuses(buildProjectTasks(project, project.id));
  let insertedTasks = [];
  if (tasks.length) {
    const { data: taskRows, error: taskError } = await supabase
      .from('project_tasks')
      .insert(tasks)
      .select();
    if (taskError) return fail(`สร้างขั้นตอน PM ไม่สำเร็จ: ${taskError.message}`, 500);
    insertedTasks = taskRows || [];
  }

  const nextStage = deal.stage === 'won' || deal.depositPaid ? 'in_project' : 'timeline_proposed';
  const { data: updatedDeal, error: linkError } = await supabase
    .from('sales_deals')
    .update({
      projectId: project.id,
      stage: nextStage,
      updatedAt: now,
      metadata: {
        ...(deal.metadata || {}),
        linkedProjectCode: project.code,
        linkedProjectAt: now,
      },
    })
    .eq('id', deal.id)
    .is('projectId', null)
    .select()
    .single();
  if (linkError) {
    await supabase.from('projects').delete().eq('id', project.id);
    if (linkError.code === 'PGRST116') return conflict('deal นี้ผูก project แล้ว');
    return fail(linkError.message, 500);
  }

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: deal.id,
    fromStage: deal.stage,
    toStage: nextStage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });

  await recordAudit({
    user,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    after: project,
    summary: `สร้าง PM project ${project.code} จาก sales deal ${dealAuditLabel(deal)}`,
    request: req,
  });
  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: deal.id,
    before: deal,
    after: updatedDeal,
    summary: `ผูก sales deal ${dealAuditLabel(deal)} กับ PM project ${project.code}`,
    request: req,
  });

  return ok({ project: { ...project, tasks: insertedTasks }, deal: updatedDeal }, 201);
});
