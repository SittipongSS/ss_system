import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { buildProjectTasks, recalculateGraph, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { generateProjectCode } from '@/lib/pm/projectsRepo';
import { canEditSalesPlanning, dealAuditLabel, DEAL_STAGES, inSalesEditScope, normalizeDealType } from '@/lib/salesPlanning';

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
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้างโครงการจากดีลที่ Lost แล้ว');
  if (deal.projectId) return conflict('ดีลนี้ผูกโครงการแล้ว');

  const body = await req.json().catch(() => ({}));
  // วันที่ต้องซิงค์กับดีล: โมดัลไม่ระบุ → ใช้วันเริ่ม/สิ้นสุดของดีล (mig 0095) ก่อนตกไปวันนี้
  const startDate = body.startDate || deal.startDate || todayStr();
  const dueDate = body.dueDate || deal.endDate || deal.expectedCloseDate || null;

  // อีเมลลูกค้าดึงจากทะเบียนลูกค้าอัตโนมัติ (ไม่ให้กรอกในโมดัลแล้ว — R1) เพื่อไม่ให้
  // ข้อมูลแตกจากแหล่งเดียว; body.customerEmail คงรับไว้เผื่อ caller เก่า.
  let customerEmail = body.customerEmail || '';
  const custId = body.customerId || deal.customerId || null;
  if (!customerEmail && custId) {
    const { data: cust } = await supabase.from('customers').select('email').eq('id', custId).maybeSingle();
    customerEmail = cust?.email || '';
  }
  const autoCode = !body.code;
  let projectCode = body.code || (await generateProjectCode(supabase));
  const now = new Date().toISOString();

  // ฟิลด์จากโมดัลสร้างโครงการ (เหมือนหน้า PM) — ปรับแก้ได้ ใช้ค่าจากดีลเป็น default
  const baseRow = {
    name: body.name || deal.title,
    customerId: body.customerId || deal.customerId || null,
    customerName: body.customerName || deal.customerName || null,
    // ประเภทมาจาก body (โมดัลไทม์ไลน์) → ตกไปที่ประเภทดีล (dealType คอลัมน์จริง →
    // fallback metadata เก่า) — SCENT/NPD/RE-ORDER ตรงกับ template ของ PM 1:1
    type: normalizeDealType(body.type ?? deal.dealType ?? deal.metadata?.projectType),
    // ชื่อสูตรกลิ่น: โครงการรับสูตรจากดีล (SCENT เขียนสูตร; กลิ่นเดิมอ้างสูตรผ่านโครงการ)
    formulaName: body.formulaName ?? deal.formulaName ?? null,
    urgency: body.urgency || 'Schedule',
    aeOwner: body.aeOwner || deal.ownerName || user.name || '',
    acOwner: body.acOwner || '',
    status: 'New',
    startDate,
    dueDate,
    productMainCategory: body.productMainCategory || '',
    productSubCategory: body.productSubCategory || '',
    docNumber: '',
    productName: body.name || deal.title || '',
    productCode: '',
    orderQty: '',
    productionQty: '',
    aeSupervisor: body.aeSupervisor || '',
    keyAccountExec: '',
    customerEmail,
    preparedBy: body.preparedBy || user.name || '',
    reviewedBy: '',
    team: deal.team || user.team || null,
    ownerId: deal.ownerId || user.id || null,
    metadata: {
      ...(body.metadata || {}),
      // แบรนด์: ใช้ที่โมดัลไทม์ไลน์ส่งมา ตกไปที่แบรนด์ที่เลือกไว้บนโครงการขาย
      brand: body.metadata?.brand ?? deal.metadata?.brand ?? '',
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
      if (!autoCode) return conflict(`รหัสโครงการซ้ำ: ${projectCode}`);
      projectCode = await generateProjectCode(supabase);
      continue;
    }
    break;
  }
  if (error) return fail(error.message, 500);

  setHolidays([...(await holidaySet())]);
  // DL1: ดีลมีไทม์ไลน์ลอยของตัวเองอยู่แล้ว → โครงการใหม่ "รับเลี้ยง" ชุดเดิม
  // (เติม projectId — คงขั้นตอน/จำนวนวัน/สถานะ/ความคืบหน้า) แทนการ gen ใหม่ทับ
  const { data: floating } = await supabase
    .from('project_tasks').select('*').eq('dealId', deal.id).is('projectId', null)
    .order('stepOrder', { ascending: true });
  let insertedTasks = [];
  let adopted = 0;
  if ((floating || []).length) {
    const { error: adoptErr } = await supabase.from('project_tasks')
      .update({ projectId: project.id })
      .in('id', floating.map((t) => t.id));
    if (adoptErr) return fail(`ย้ายไทม์ไลน์ของดีลเข้าโครงการไม่สำเร็จ: ${adoptErr.message}`, 500);
    adopted = floating.length;
    // ซิงค์วันที่: เลื่อนขั้นตอนที่รับเลี้ยงมาให้เกาะวันเริ่มของโครงการ (anchor เดียว
    // กับหัวโครงการ/Gantt) — recalculateGraph คงจำนวนวัน+ลำดับ+predecessors ไว้
    // ถ้าวันเริ่มโครงการตรงกับ anchor เดิมอยู่แล้ว ผลลัพธ์ไม่ต่าง = ไม่มีการ update
    const recalced = recalculateGraph(floating, startDate);
    await Promise.all(
      recalced
        .filter((r, i) => r.startDate !== floating[i].startDate || r.finishDate !== floating[i].finishDate)
        .map((r) => supabase.from('project_tasks').update({
          startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
        }).eq('id', r.id)),
    );
  } else {
    // เฟส B: task ชุดก่อตั้งติดป้ายดีลเจ้าของ (timeline segment ต่อดีล — mig 0090)
    const tasks = applyAutoStatuses(buildProjectTasks(project, project.id, deal.id));
    if (tasks.length) {
      const { data: taskRows, error: taskError } = await supabase
        .from('project_tasks')
        .insert(tasks)
        .select();
      if (taskError) return fail(`สร้างขั้นตอน PM ไม่สำเร็จ: ${taskError.message}`, 500);
      insertedTasks = taskRows || [];
    }
  }

  // ผูก FG ที่เลือกในโมดัล (ถ้ามี) — non-fatal เหมือนหน้า PM
  let productWarning = null;
  if (Array.isArray(body.projectProducts) && body.projectProducts.length > 0) {
    const ppRows = body.projectProducts
      .filter((p) => p.productId)
      .map((p) => ({ id: genId('PP'), projectId: project.id, productId: p.productId, orderQty: p.orderQty || null, productionQty: p.productionQty || null }));
    if (ppRows.length) {
      const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
      if (ppErr) productWarning = 'เชื่อมสินค้า (FG) เข้าโครงการไม่สำเร็จ — โปรดผูกใหม่ที่หน้าโครงการ';
    }
  }

  // เดินหน้าเท่านั้น: ก่อนขั้น "เสนอไทม์ไลน์" → เลื่อนเป็น timeline_proposed; ขั้นสูงกว่านั้น
  // (รวม won) คงสถานะเดิม. การสร้าง PM ไม่ผลักดีลเป็น won/สถานะปิด — won ปิดแยกต่างหาก.
  const stageIdx = (s) => DEAL_STAGES.indexOf(s);
  const nextStage = stageIdx(deal.stage) < stageIdx('timeline_proposed') ? 'timeline_proposed' : deal.stage;
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
    // คืน task ที่รับเลี้ยงมาเป็นไทม์ไลน์ลอยของดีลก่อนลบโครงการ — ไม่งั้น FK cascade
    // ของ projects จะพาไทม์ไลน์เดิมของดีลหายไปด้วย
    if (adopted) {
      await supabase.from('project_tasks').update({ projectId: null })
        .in('id', (floating || []).map((t) => t.id));
    }
    await supabase.from('projects').delete().eq('id', project.id);
    if (linkError.code === 'PGRST116') return conflict('ดีลนี้ผูกโครงการแล้ว');
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

  return ok({ project: { ...project, tasks: insertedTasks }, deal: updatedDeal, productWarning }, 201);
});
