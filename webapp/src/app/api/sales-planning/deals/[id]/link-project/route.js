import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, inPmProjectScope } from '@/lib/permissions';
import { buildAppendedTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { loadProject } from '@/lib/pm/projectsRepo';
import { canEditSalesPlanning, dealAuditLabel, DEAL_STAGES, dealTypeOf, inSalesEditScope } from '@/lib/salesPlanning';
import { hasCompatibleProjectCustomer } from '@/lib/sales/projectLink';
import { categoryFlagsOf } from '@/lib/master/productTypes';
import { loadWorkflowTemplateForGeneration, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

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
  // โครงการปลายทางต้องอยู่ใน edit-scope ของผู้ผูกด้วย (ทีมเดียวกัน/เจ้าของ) —
  // เดิมเช็คแค่ลูกค้าตรงกัน ทำให้ผูกเข้าโครงการทีมอื่นแล้วดูดข้อมูลภายในโครงการได้
  if (!inPmProjectScope(user, project)) return forbidden('โครงการนี้อยู่นอกขอบเขตทีมของคุณ');
  // ดีลที่ยังไม่มีลูกค้ารับลูกค้าจากโครงการได้ แต่ห้ามย้ายดีลข้ามลูกค้า
  // เพื่อป้องกันการเปลี่ยนเจ้าของข้อมูลเดิมโดยไม่ตั้งใจ
  if (!hasCompatibleProjectCustomer(deal, project)) {
    return badRequest('ดีลกับโครงการต้องเป็นลูกค้าเดียวกัน');
  }

  const now = new Date().toISOString();
  const startDate = body.startDate || todayStr();

  // ต่อ segment: task ชุดตาม template ของประเภทดีล ต่อท้าย stepOrder เดิม
  setHolidays([...(await holidaySet())]);
  const { data: existing } = await supabase
    .from('project_tasks').select('id, stepOrder').eq('projectId', project.id);
  // DL1: ดีลมีไทม์ไลน์ลอยของตัวเองแล้ว → โครงการ "รับเลี้ยง" ชุดเดิม (เติม projectId
  // + ต่อ stepOrder ท้าย + pin ราก segment กันโดนดูดไป anchor โครงการ) — ไม่ gen ซ้ำ
  const { data: floating } = await supabase
    .from('project_tasks').select('*').eq('dealId', deal.id).is('projectId', null)
    .order('stepOrder', { ascending: true });
  let insertedTasks = [];
  let adopted = 0;
  if ((floating || []).length) {
    const baseOrder = (existing || []).reduce((m, t) => Math.max(m, Number(t.stepOrder ?? 0)), -1) + 1;
    for (let i = 0; i < floating.length; i++) {
      const t = floating[i];
      const { error: adoptErr } = await supabase.from('project_tasks').update({
        projectId: project.id,
        stepOrder: baseOrder + i,
        startLocked: (t.predecessors || []).length === 0 ? true : (t.startLocked ?? false),
      }).eq('id', t.id);
      if (adoptErr) {
        // ถอนคืน: ปล่อยชุดที่ย้ายแล้วกลับเป็น task ลอยของดีลตามเดิม
        await supabase.from('project_tasks').update({ projectId: null })
          .in('id', floating.slice(0, i).map((x) => x.id));
        return fail(`ย้ายไทม์ไลน์ของดีลเข้าโครงการไม่สำเร็จ: ${adoptErr.message}`, 500);
      }
    }
    adopted = floating.length;
  } else {
    let templateOptions;
    try {
      templateOptions = await loadWorkflowTemplateForGeneration(supabase, dealTypeOf(deal));
    } catch (templateError) {
      return fail(templateError.message || 'โหลด Workflow Template ไม่สำเร็จ', templateError instanceof WorkflowTemplateError ? templateError.status : 500);
    }
    // ขั้นสรรพสามิตใน template ผูก token flag:excise (mig 0131) → ส่งธงของหมวดโครงการ
    templateOptions.categoryFlags = await categoryFlagsOf(project.productMainCategory);
    const segTasks = applyAutoStatuses(buildAppendedTasks(project, {
      dealType: dealTypeOf(deal),
      dealId: deal.id,
      startDate,
      existingTasks: existing || [],
      ...templateOptions,
    }));
    // 0 แถว = template หลังกรองหมวดไม่เหลือขั้นตอน → กันผูกดีลเข้าโครงการแบบไม่มี
    // segment เลย (ยังไม่ได้ผูกดีล ณ จุดนี้ จึงแค่แจ้งสาเหตุแล้วหยุด)
    if (!segTasks.length) {
      return badRequest(`Workflow Template ${dealTypeOf(deal)} ที่เผยแพร่อยู่ไม่มีขั้นตอนที่ตรงกับหมวดสินค้า — ตรวจการตั้งค่าที่ /settings/workflow-templates`);
    }
    const { data: taskRows, error: taskErr } = await supabase.from('project_tasks').insert(segTasks).select();
    if (taskErr) return fail(`ต่อไทม์ไลน์ของดีลไม่สำเร็จ: ${taskErr.message}`, 500);
    insertedTasks = taskRows || [];
  }

  // ผูกดีล (guard .is projectId null — กันยิงซ้ำ/แข่งกัน; แพ้ = ถอน task ที่เพิ่งต่อ)
  const stageIdx = (s) => DEAL_STAGES.indexOf(s);
  const nextStage = stageIdx(deal.stage) < stageIdx('timeline_proposed') ? 'timeline_proposed' : deal.stage;
  const adoptedCustomer = !deal.customerId;
  const { data: updatedDeal, error: linkErr } = await supabase
    .from('sales_deals')
    .update({
      projectId: project.id,
      customerId: project.customerId,
      customerName: project.customerName || deal.customerName || null,
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
    if (adopted) {
      await supabase.from('project_tasks').update({ projectId: null })
        .in('id', (floating || []).map((x) => x.id));
    }
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
    summary: `ผูกดีล ${dealAuditLabel(deal)} เข้าโครงการเดิม ${project.code || project.id}${adoptedCustomer ? ` และตั้งลูกค้าเป็น ${project.customerName || project.customerId}` : ''} (${adopted ? `รับเลี้ยงไทม์ไลน์เดิม ${adopted}` : `+${insertedTasks.length}`} ขั้นตอน segment ${dealTypeOf(deal)})`,
    request: req,
  });

  return ok({ deal: updatedDeal, project: { id: project.id, code: project.code, name: project.name }, appendedTasks: insertedTasks.length + adopted, adoptedTasks: adopted }, 201);
});
