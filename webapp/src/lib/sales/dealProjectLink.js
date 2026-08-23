import { genId } from '@/lib/id';
import { resolveProbability } from '@/lib/sales/dealProbability';
import { recordAudit } from '@/lib/audit';
import { businessLineLabel } from '@/lib/master/businessLines';
import { inPmProjectScope } from '@/lib/permissions';
import { buildAppendedTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { loadProject } from '@/lib/pm/projectsRepo';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { dealLinkedUpdate, dealUnlinkedUpdate } from '@/lib/pm/projectUpdates';
import { appendUpdate } from '@/lib/master/updates';
import { advanceStage, dealAuditLabel, dealTypeOf } from '@/lib/salesPlanning';
import { hasCompatibleProjectCustomer } from '@/lib/sales/projectLink';
import {
  mirrorCounts, moveDealMirrors, moveSegmentTasks,
  nextStepOrder, planSegmentMove, rollbackSegmentTasks,
} from '@/lib/sales/dealProjectMove';
import { categoryFlagsOf } from '@/lib/master/productTypes';
import { loadWorkflowTemplateForDeal, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

/**
 * ผูกดีลเข้าโครงการ (หรือย้ายข้ามโครงการเมื่อ `move`) — เนื้อในของ
 * POST /api/sales-planning/deals/[id]/link-project
 *
 * ⭐ **ยกออกมาเป็นฟังก์ชันเพราะมีผู้เรียกสองทาง** — นอกจาก route ของมันเอง
 * โมดัลปิด Won ก็ผูกโครงการให้ในคำขอเดียวกับที่ปิดการขาย (ดีลลอยปิด Won ไม่ได้
 * ตั้งแต่ #1385 ด่านโครงการเหลือที่เดียวคือตอนรับใบ) · ถ้าปล่อยให้หน้าจอยิงสอง
 * คำขอเรียงกัน คำขอที่สองล้ม = ดีลผูกโครงการไปแล้วแต่ยังไม่ Won โดยไม่มีใครสั่ง
 *
 * คืน `{ error, status }` เมื่อไม่ผ่าน และ `{ data, status }` เมื่อสำเร็จ —
 * ผู้เรียกแปลงเป็น Response เอง (lib ไม่รู้จัก HTTP)
 *
 * ⚠️ **ไม่ตรวจสิทธิ์ระดับดีล** — ผู้เรียกต้องโหลดดีลด้วยขอบเขตของผู้ใช้มาแล้ว
 * (`loadScoped` / `inSalesEditScope`) · ที่ตรวจในนี้คือฝั่งโครงการเท่านั้น
 */
export async function linkDealToProject(supabase, {
  deal, projectId, move = false, startDate: startDateInput = null, user, req = null,
}) {
  if (!deal) return { error: 'ไม่พบดีล', status: 404 };
  if (deal.stage === 'lost') return { error: 'ดีล Lost แล้ว ผูกโครงการไม่ได้', status: 400 };
  if (!projectId) return { error: 'ต้องระบุโครงการ (projectId)', status: 400 };

  const movingFrom = deal.projectId ? String(deal.projectId) : '';
  if (movingFrom && !move) {
    return { error: 'ดีลนี้ผูกโครงการแล้ว — ส่ง move: true ถ้าต้องการย้ายข้ามโครงการ', status: 409 };
  }

  const project = await loadProject(supabase, projectId);
  if (!project) return { error: 'ไม่พบโครงการ', status: 404 };
  // โครงการที่ปิดแล้ว (RE-ORDER ต้องขออนุมัติเปิดใหม่) ห้ามรับ segment/task เพิ่ม —
  // ด่านเดียวกับ route แก้ไขโครงการ ไม่งั้นผูกดีลใหม่ = มุดด่านปิดได้
  const closedMsg = projectWriteBlockedError(project);
  if (closedMsg) return { error: closedMsg, status: 409 };
  // โครงการปลายทางต้องอยู่ใน edit-scope ของผู้ผูกด้วย (ทีมเดียวกัน/เจ้าของ) —
  // เดิมเช็คแค่ลูกค้าตรงกัน ทำให้ผูกเข้าโครงการทีมอื่นแล้วดูดข้อมูลภายในโครงการได้
  if (!inPmProjectScope(user, project)) return { error: 'โครงการนี้อยู่นอกขอบเขตทีมของคุณ', status: 403 };
  // ดีลที่ยังไม่มีลูกค้ารับลูกค้าจากโครงการได้ แต่ห้ามย้ายดีลข้ามลูกค้า
  // เพื่อป้องกันการเปลี่ยนเจ้าของข้อมูลเดิมโดยไม่ตั้งใจ
  if (!hasCompatibleProjectCustomer(deal, project)) {
    return { error: 'ดีลกับโครงการต้องเป็นลูกค้าเดียวกัน', status: 400 };
  }
  /* ⭐ สายธุรกิจต้องตรงกัน (มติผู้ใช้ 2026-08-20) — ดีลถือสายของตัวเองตั้งแต่ mig 0274
     และไทม์ไลน์ลอยของมันถูก gen ด้วยแม่แบบสายนั้นไปแล้ว · ผูกข้ามสาย = โครงการ
     สายบริการมี segment ของสายสินค้าปนอยู่ โดยไม่มีที่ไหนบอกว่าปนมาจากไหน
     ⚠️ ดีลเก่าที่ยังไม่ระบุสาย (ก่อน mig 0274) **สืบสายจากโครงการ** ตอนผูก —
     กติกาเดียวกับ backfill ของ 0274 (ผูกโครงการอยู่ = ตามโครงการ) ไม่ใช่การเดา */
  if (deal.line && project.line && deal.line !== project.line) {
    return {
      error: `ดีลเป็น${businessLineLabel(deal.line)} แต่โครงการเป็น${businessLineLabel(project.line)} — ผูกข้ามสายไม่ได้`,
      status: 400,
    };
  }
  const adoptedLine = !deal.line && project.line ? project.line : null;
  // โครงการต้นทางของการย้าย: ต้องอยู่ในขอบเขตของผู้ย้ายและยังไม่ปิดเหมือนกัน —
  // ดีลหลุดออกไปคือโครงการต้นทาง "เปลี่ยนองค์ประกอบ" ไม่ต่างจากปลายทางที่รับเข้า
  let fromProject = null;
  if (movingFrom) {
    if (movingFrom === project.id) return { error: 'ดีลอยู่ในโครงการนี้อยู่แล้ว', status: 400 };
    fromProject = await loadProject(supabase, movingFrom);
    if (!fromProject) return { error: 'ไม่พบโครงการต้นทางของดีล', status: 404 };
    if (!inPmProjectScope(user, fromProject)) return { error: 'โครงการต้นทางอยู่นอกขอบเขตทีมของคุณ', status: 403 };
    const fromClosedMsg = projectWriteBlockedError(fromProject);
    if (fromClosedMsg) return { error: `โครงการต้นทาง ${fromProject.code || fromProject.id}: ${fromClosedMsg}`, status: 409 };
  }

  const now = new Date().toISOString();
  // วันเริ่มของ segment เป็นของดีล — ลำดับเดียวกับ create-project: ที่ส่งมา > วันเริ่มของดีล > วันนี้
  // 🐞 เดิมข้าม deal.startDate ไปเลย ดีลที่ระบุวันเริ่มไว้แล้วแต่ไทม์ไลน์ถูกลบ พอผูกเข้าโครงการ
  //    จะได้ segment ที่เริ่มนับจากวันนี้ ไม่ใช่วันของดีล (ทางที่มีไทม์ไลน์ลอยอยู่แล้วไม่โดน
  //    เพราะ "รับเลี้ยง" ชุดเดิมที่คำนวณจากวันของดีลมาแล้ว)
  const startDate = startDateInput || deal.startDate || todayStr();

  // ต่อ segment: task ชุดตาม template ของประเภทดีล ต่อท้าย stepOrder เดิม
  setHolidays([...(await holidaySet())]);
  const { data: existing, error: existingError } = await supabase
    .from('project_tasks').select('id, stepOrder').eq('projectId', project.id);
  if (existingError) return { error: existingError.message, status: 500 };
  // DL1: ดีลมีไทม์ไลน์ลอยของตัวเองแล้ว → โครงการ "รับเลี้ยง" ชุดเดิม (เติม projectId
  // + ต่อ stepOrder ท้าย + pin ราก segment กันโดนดูดไป anchor โครงการ) — ไม่ gen ซ้ำ
  const { data: floating } = await supabase
    .from('project_tasks').select('*').eq('dealId', deal.id).is('projectId', null)
    .order('stepOrder', { ascending: true });
  let insertedTasks = [];
  let adopted = 0;
  let movedSegment = [];   // ย้ายข้ามโครงการ: แถวที่ย้ายแล้ว (ไว้ถอนคืน)
  if (fromProject) {
    // ย้าย segment เดิมทั้งชุด — ไม่ gen ใหม่ ไม่เลื่อนวัน: สถานะ/วันจริง/ผู้รับผิดชอบ
    // ที่ทำมาแล้วต้องติดไปกับดีล ไม่ใช่เริ่มนับหนึ่งที่โครงการปลายทาง
    const { data: segment, error: segmentError } = await supabase
      .from('project_tasks').select('*').eq('dealId', deal.id).eq('projectId', fromProject.id)
      .order('stepOrder', { ascending: true });
    if (segmentError) return { error: segmentError.message, status: 500 };
    try {
      movedSegment = await moveSegmentTasks(
        supabase,
        planSegmentMove(segment || [], nextStepOrder(existing || []), project.id),
      );
    } catch (moveError) {
      return { error: moveError.message, status: 500 };
    }
  } else if ((floating || []).length) {
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
        return { error: `ย้ายไทม์ไลน์ของดีลเข้าโครงการไม่สำเร็จ: ${adoptErr.message}`, status: 500 };
      }
    }
    adopted = floating.length;
  } else {
    let templateOptions;
    try {
      // แม่แบบ = คู่ (สาย, ประเภทดีล) · สายของดีลกับของโครงการตรงกันแน่แล้วจากด่านข้างบน
      templateOptions = await loadWorkflowTemplateForDeal(supabase, { line: deal.line || project.line, dealType: dealTypeOf(deal) });
    } catch (templateError) {
      return {
        error: templateError.message || 'โหลด Workflow Template ไม่สำเร็จ',
        status: templateError instanceof WorkflowTemplateError ? templateError.status : 500,
      };
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
      return {
        error: `Workflow Template ${dealTypeOf(deal)} ที่เผยแพร่อยู่ไม่มีขั้นตอนที่ตรงกับหมวดสินค้า — ตรวจการตั้งค่าที่ /settings/workflow-templates`,
        status: 400,
      };
    }
    const { data: taskRows, error: taskErr } = await supabase.from('project_tasks').insert(segTasks).select();
    if (taskErr) return { error: `ต่อไทม์ไลน์ของดีลไม่สำเร็จ: ${taskErr.message}`, status: 500 };
    insertedTasks = taskRows || [];
  }

  // ผูกดีล (guard projectId เดิม — กันยิงซ้ำ/แข่งกัน; แพ้ = ถอน task ที่เพิ่งต่อ/ย้าย)
  const nextStage = advanceStage(deal.stage, 'timeline_proposed');
  const adoptedCustomer = !deal.customerId;
  // เพิ่งมีโครงการ = เพิ่งรู้ว่ามีพี่น้องใบไหนบ้าง — กติกา FC ของ NPD อ่านจากตรงนี้
  // (NPD ที่ออกใบเสนอราคาแล้ว + โครงการมี SCENT ที่ Won → 80%)
  const nextProbability = await resolveProbability(supabase, {
    ...deal, stage: nextStage, projectId: project.id,
  });
  const dealUpdate = supabase
    .from('sales_deals')
    .update({
      projectId: project.id,
      customerId: project.customerId,
      // ดีลเก่าที่ยังไม่มีสาย: สืบจากโครงการที่ผูกเข้าไป (ดูด่านข้างบน)
      ...(adoptedLine ? { line: adoptedLine } : {}),
      customerName: project.customerName || deal.customerName || null,
      stage: nextStage,
      probability: nextProbability,
      updatedAt: now,
      metadata: {
        ...(deal.metadata || {}),
        linkedProjectCode: project.code,
        linkedProjectAt: now,
        // ร่องรอยการย้าย — ดีลที่เคยอยู่โครงการอื่นต้องตอบได้ว่า "เคยอยู่ที่ไหน เมื่อไหร่"
        ...(fromProject ? { movedFromProjectId: fromProject.id, movedFromProjectCode: fromProject.code || null, movedProjectAt: now } : {}),
      },
    })
    .eq('id', deal.id);
  // ย้าย = ต้องยังอยู่โครงการเดิม · ผูกครั้งแรก = ต้องยังไม่มีโครงการ
  const { data: updatedDeal, error: linkErr } = await (fromProject
    ? dealUpdate.eq('projectId', fromProject.id)
    : dealUpdate.is('projectId', null)
  ).select().single();
  if (linkErr) {
    if (insertedTasks.length) await supabase.from('project_tasks').delete().in('id', insertedTasks.map((t) => t.id));
    if (adopted) {
      await supabase.from('project_tasks').update({ projectId: null })
        .in('id', (floating || []).map((x) => x.id));
    }
    if (movedSegment.length) await rollbackSegmentTasks(supabase, movedSegment);
    if (linkErr.code === 'PGRST116') {
      return {
        error: fromProject ? 'ดีลถูกย้ายไปโครงการอื่นแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง' : 'ดีลนี้ผูกโครงการแล้ว',
        status: 409,
      };
    }
    return { error: linkErr.message, status: 500 };
  }

  /* ของที่ mirror โครงการจากดีล (งาน/คำร้อง/ใบสั่งขาย/งานผลิต) ต้องเดินตามดีล
     ⭐ **ทำทั้งเส้นผูกครั้งแรกและเส้นย้าย** — เดิมทำเฉพาะตอนย้าย ของที่เปิดไว้ตอนดีล
     ยังลอย (คำร้อง/งานที่ผูกแค่ดีล) จึงค้าง `projectId = null` ถาวร แล้วหายไปจาก
     ทุกที่ที่กรองด้วยโครงการ · `moveDealMirrors` ข้ามแถวที่ชี้ปลายทางถูกอยู่แล้ว
     จึงเรียกซ้ำได้ไม่มีผลข้างเคียง

     ⚠️ ท่าจัดการความล้มเหลว **ต่างกันตามเส้น โดยตั้งใจ**:
       ย้าย  — ค่าเดิมชี้โครงการที่ไม่ใช่เจ้าของดีลแล้ว = ผิดจริง ⇒ ถอนคืนทั้งชุด
       ผูกแรก — ค่าเดิมเป็น null = ยังไม่ผิด แค่ยังไม่ครบ ⇒ เตือน ไม่ถอนการผูก
                (ถอนแปลว่าคนผูกโครงการไม่ได้เลยเพราะแถวเก่าแถวเดียว) */
  let movedMirrors = [];
  let mirrorWarning = null;
  try {
    movedMirrors = await moveDealMirrors(supabase, { dealId: deal.id, toProjectId: project.id });
  } catch (mirrorError) {
    if (fromProject) {
      await supabase.from('sales_deals')
        .update({ projectId: deal.projectId, metadata: deal.metadata || null, updatedAt: now })
        .eq('id', deal.id);
      await rollbackSegmentTasks(supabase, movedSegment);
      return { error: mirrorError.message, status: 500 };
    }
    mirrorWarning = `ผูกโครงการแล้ว แต่ย้ายของที่เปิดไว้ก่อนหน้าเข้าโครงการไม่สำเร็จ: ${mirrorError.message}`;
  }

  if (deal.stage !== nextStage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: deal.id,
      fromStage: deal.stage,
      toStage: nextStage,
      changedBy: user?.id || null,
      changedByName: user?.name || null,
    });
  }

  // เส้นเรื่องของโครงการต้องรู้ว่ามีดีลใบใหม่เข้ามาร่วม — ความเคลื่อนไหวของดีลใบนี้
  // จะเริ่มไหลเข้าหน้าโครงการทันที ถ้าไม่มีบรรทัดบอกจะอ่านเหมือนโผล่มาเฉย ๆ
  await appendUpdate(supabase, {
    entityType: 'project', entityId: project.id,
    ...dealLinkedUpdate(updatedDeal || deal, { how: fromProject ? 'move' : 'link' }), user,
  });
  // ...และโครงการต้นทางต้องรู้ว่าทำไมดีลใบนั้นหายไปทั้งชุด (ไทม์ไลน์ ใบสั่งขาย งาน
  // หายพร้อมกันหมด) — เธรดที่ไม่บันทึกการย้ายคือเส้นเรื่องที่มีรู
  if (fromProject) {
    await appendUpdate(supabase, {
      entityType: 'project', entityId: fromProject.id,
      ...dealUnlinkedUpdate(updatedDeal || deal, { reason: `ย้ายไปโครงการ ${project.code || project.id}` }), user,
    });
  }

  const movedCounts = mirrorCounts(movedMirrors);
  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: deal.id,
    before: deal,
    after: updatedDeal,
    summary: fromProject
      ? `ย้ายดีล ${dealAuditLabel(deal)} จากโครงการ ${fromProject.code || fromProject.id} ไป ${project.code || project.id} (ไทม์ไลน์ ${movedSegment.length} ขั้นตอน${Object.entries(movedCounts).map(([table, count]) => `, ${table} ${count}`).join('')} · รายการ FG ไม่ย้ายตาม)`
      : `ผูกดีล ${dealAuditLabel(deal)} เข้าโครงการเดิม ${project.code || project.id}${adoptedCustomer ? ` และตั้งลูกค้าเป็น ${project.customerName || project.customerId}` : ''} (${adopted ? `รับเลี้ยงไทม์ไลน์เดิม ${adopted}` : `+${insertedTasks.length}`} ขั้นตอน segment ${dealTypeOf(deal)}${Object.entries(movedCounts).map(([table, count]) => ` · ${table} ${count}`).join('')})`,
    request: req,
  });

  return {
    data: {
      deal: updatedDeal,
      project: { id: project.id, code: project.code, name: project.name },
      appendedTasks: insertedTasks.length + adopted,
      adoptedTasks: adopted,
      ...(mirrorWarning ? { warning: mirrorWarning } : {}),
      ...(!fromProject ? { linkedMirrors: mirrorCounts(movedMirrors) } : {}),
      ...(fromProject ? {
        movedFrom: { id: fromProject.id, code: fromProject.code, name: fromProject.name },
        movedTasks: movedSegment.length,
        movedMirrors: movedCounts,
      } : {}),
    },
    status: fromProject ? 200 : 201,
  };
}
