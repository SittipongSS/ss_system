import { viewScope, inScope, inPmProjectScope, canDeleteRecord, can } from '@/lib/permissions';
import { mergeTemplateTasks, recalculateGraph, resolveSchedule } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { withUser, ok, fail, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadProject, deleteProjectDeep } from '@/lib/pm/projectsRepo';
import { genId } from '@/lib/id';
import { pickFields } from '@/lib/validate';
import { recordAudit } from '@/lib/audit';
import { rollupDeals } from '@/lib/sales/projectRollup';
import { sortDealsByOrder } from '@/lib/pm/dealOrder';

export const dynamic = 'force-dynamic';

// Fields a client may PATCH on a project (commercial/ISO header — not scope/owner).
const EDITABLE = [
  'code', 'name', 'customerId', 'customerName', 'type', 'urgency',
  'aeOwner', 'acOwner', 'status', 'startDate', 'dueDate',
  'productMainCategory', 'productSubCategory',
  'docNumber', 'productName', 'productCode', 'orderQty', 'productionQty',
  'aeSupervisor', 'keyAccountExec', 'customerEmail', 'preparedBy', 'reviewedBy',
  'metadata',
];

// GET /api/pm/projects/[id] — project + its tasks + linked products (FG).
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;

  // PM is sales-only: gate on pm:view. legal/unknown roles have viewScope 'all'
  // (or none) but no pm:view — without this they'd read any project's full
  // snapshot (tasks + products + personal tasks) by id.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const project = await loadProject(supabase, id).catch((e) => { throw e; });
  if (!project) return notFound('ไม่พบโครงการ');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);

  const projectProducts = (links || []).map((l) => ({
    ...l,
    product: l.product
  }));

  // ดีลที่ผูกโครงการนี้ — เฟส B: หลายดีลต่อโครงการ (SCENT→NPD→RE-ORDER…) อ่านเป็น list.
  // ดีลก่อตั้ง = ตัวแรกสุด (createdAt เก่าสุด) — คง dealId/dealStage ชี้ดีลก่อตั้งไว้
  // 1 เฟส เพื่อ backward compat กับ UI ที่ยังไม่ย้ายไปใช้ deals[] (ตัดในเฟสถัดไป).
  const { data: linkedDeals } = await supabase
    .from('sales_deals')
    .select('id, title, stage, dealType, projectValue, wonValue, forecastMonth, formulaName, ownerName, team, probability, expectedCloseDate, depositPaid, metadata, createdAt')
    .eq('projectId', project.id)
    .order('createdAt', { ascending: true });
  const deals = sortDealsByOrder(linkedDeals || [], project.metadata?.dealOrder || []);
  const foundingDeal = deals[0] || null;
  const dealsRollup = rollupDeals(deals);

  // งานในโครงการมาจาก /sa/tasks ที่ผูกกับดีล ไม่สร้างความสัมพันธ์กับโครงการโดยตรง
  // อีกต่อไป แต่ยังรวม projectId เดิมไว้เพื่อรองรับข้อมูลเก่าและงานที่สร้างก่อนย้ายกฎ.
  const dealIds = deals.map((deal) => deal.id);
  let personalTasksQuery = supabase.from('personal_tasks').select('*');
  personalTasksQuery = dealIds.length
    ? personalTasksQuery.or(`projectId.eq.${project.id},dealId.in.(${dealIds.join(',')})`)
    : personalTasksQuery.eq('projectId', project.id);
  const { data: personalTasks } = await personalTasksQuery.order('createdAt', { ascending: false });

  // ศูนย์รวมโครงการ: โครงการ = จิ๊กซอว์ครอบดีล — ดึงของ "ใต้ดีล" (ใบเสนอราคา /
  // ความเคลื่อนไหว / ประวัติสถานะ) ของทุกดีลมารวมระดับโครงการ (อ่านอย่างเดียว —
  // เพิ่ม/แก้ทำที่หน้าดีลตามเดิม)
  let quotations = [];
  let dealActivities = [];
  let dealStageHistory = [];
  if (deals.length) {
    const dealIds = deals.map((d) => d.id);
    const [{ data: quotes }, { data: acts }, { data: hist }] = await Promise.all([
      supabase.from('quotations')
        .select('id, dealId, quoteNumber, status, approvalStatus, totalAmount, revisionNo, quoteDate, createdAt')
        .in('dealId', dealIds).order('createdAt', { ascending: false }),
      supabase.from('sales_deal_activities')
        .select('id, dealId, kind, body, dueDate, activityAt, meetingMode, createdByName, createdAt')
        .in('dealId', dealIds).order('createdAt', { ascending: false }).limit(60),
      supabase.from('sales_deal_stage_history')
        .select('id, dealId, fromStage, toStage, changedByName, changedAt')
        .in('dealId', dealIds).order('changedAt', { ascending: false }).limit(40),
    ]);
    quotations = quotes || [];
    dealActivities = acts || [];
    dealStageHistory = hist || [];
  }

  // Tell the client whether THIS user may edit THIS record (cap + row scope),
  // so the UI gates edit controls by ownership — not just the pm:edit cap.
  const canEdit = inPmProjectScope(user, project);
  // me: ใช้ฝั่ง client gate ปุ่มจัดการ "งานเพิ่มเติม" (owner/assignee/lead) + กรอง
  // ผู้รับมอบใน dropdown ตามทีมโครงการ.
  const me = user ? { id: user.id, name: user.name, role: user.role, team: user.team ?? null } : null;
  // วันที่ของ Rev ที่ "อยู่ตอนนี้" (currentRev เป็นตัวชี้ — อาจถูกย้อนถอยหลังได้) — โชว์ในหัวพิมพ์
  // และ maxRev = เลข Rev สูงสุดที่เคยออก → ใช้คำนวณเลข Rev ถัดไป (ออก Rev ใหม่ = max+1 ไม่ชนเลข)
  let revisedAt = null;
  let maxRev = null;
  {
    const { data: maxRow } = await supabase
      .from('project_doc_revisions')
      .select('revNo')
      .eq('projectId', project.id)
      .eq('kind', 'rev')
      .order('revNo', { ascending: false })
      .limit(1)
      .maybeSingle();
    maxRev = maxRow?.revNo ?? null;
  }
  if (project.currentRev != null) {
    const { data: rev } = await supabase
      .from('project_doc_revisions')
      .select('createdAt')
      .eq('projectId', project.id)
      .eq('kind', 'rev')
      .eq('revNo', project.currentRev)
      .maybeSingle();
    revisedAt = rev?.createdAt ?? null;
  }
  return ok({ ...project, tasks: tasks || [], projectProducts, personalTasks: personalTasks || [], canEdit, me, revisedAt, maxRev, deals, dealsRollup, quotations, dealActivities, dealStageHistory, dealId: foundingDeal?.id ?? null, dealStage: foundingDeal?.stage ?? null });
});

// PATCH /api/pm/projects/[id]
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');
  if (!inPmProjectScope(user, project)) {
    return forbidden();
  }
  // From here on use the resolved internal id for all DB keys/FK subqueries.
  const id = project.id;

  const body = await req.json();
  const updates = pickFields(body, EDITABLE, { nullable: ['startDate', 'dueDate'] });
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single();
  if (error) {
    // code ซ้ำ (unique constraint) → 409 ให้ตรงกับ POST แทน 500 ที่กำกวม
    if (error.code === '23505') return fail('รหัสโครงการซ้ำ: ' + (updates.code ?? ''), 409);
    return fail(error.message, 500);
  }

  // ข้อ 2: หมวดสินค้าพลิกสถานะสรรพสามิต (01-002) → ปรับชุดขั้นตอนแบบ incremental
  // (เพิ่ม/ลบเฉพาะขั้นตอนสรรพสามิต, คงความคืบหน้าเดิม + ขั้นตอนที่เพิ่มเอง).
  const oldCat = project.productMainCategory || '';
  const newCat = updates.productMainCategory !== undefined ? (updates.productMainCategory || '') : oldCat;
  // วันเริ่มเปลี่ยน → คำนวณ timeline ใหม่ (forward จากวันเริ่ม). dueDate เป็นแค่เป้าหมาย
  // (โชว์เป็นหมุดบน Gantt) ไม่ขับการคำนวณแล้ว — เปลี่ยน dueDate จึงไม่ต้องเลื่อนขั้นตอน.
  const dateChanged =
    ('startDate' in updates && (updates.startDate || null) !== (project.startDate || null));
  if ((oldCat === '01-002') !== (newCat === '01-002')) {
    setHolidays([...(await holidaySet())]);
    const { data: existing } = await supabase
      .from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true });
    // เฟส B: โครงการหลาย segment (หลายดีล) — merge/resync ทั้งชุดจะจับคู่ชื่อข้าม segment
    // แล้วลบงานผิดตัว → ข้าม resync อัตโนมัติ (จัดการขั้นสรรพสามิตของ segment ใหม่
    // ตั้งแต่ตอน gen ด้วย categoryOnly อยู่แล้ว; ปรับย้อนหลังทำมือ/เฟสถัดไป)
    const segIds = new Set((existing || []).map((t) => t.dealId).filter(Boolean));
    if (segIds.size > 1) {
      await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary: `เปลี่ยนหมวดสินค้า ${data.code || id} (หลาย segment — ข้าม resync ขั้นตอนอัตโนมัติ)`, request: req });
      return ok(data);
    }
    const { templateRows, customRows, toDeleteIds, existingIds } = mergeTemplateTasks(data, existing || []);

    if (toDeleteIds.length) await supabase.from('project_tasks').delete().in('id', toDeleteIds);

    await Promise.all([
      // template rows: insert ตัวใหม่, update ตัวที่ reuse id เดิม
      ...templateRows.map((r) => {
        if (existingIds.has(r.id)) {
          const { id: _i, projectId: _p, ...upd } = r;
          return supabase.from('project_tasks').update(upd).eq('id', r.id);
        }
        return supabase.from('project_tasks').insert(r);
      }),
      // custom rows: ปรับลำดับให้อยู่ท้าย + ตัด dangling predecessors (ถ้ามี — mergeTemplateTasks
      // ใส่ field predecessors มาเฉพาะแถวที่ต้องล้าง reference ไปขั้นที่ถูกลบ)
      ...customRows.map((r) => {
        const upd = { stepOrder: r.stepOrder };
        if (r.predecessors !== undefined) upd.predecessors = r.predecessors;
        return supabase.from('project_tasks').update(upd).eq('id', r.id);
      }),
    ]);
  } else if (dateChanged) {
    // หมวดไม่เปลี่ยน แต่วันเริ่ม/วันจบเปลี่ยน → คำนวณ start/finish ทุก task ใหม่
    setHolidays([...(await holidaySet())]);
    const { data: existing } = await supabase
      .from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true });
    if (existing && existing.length) {
      const recalced = recalculateGraph(existing, resolveSchedule(data).anchor);
      await Promise.all(
        recalced
          .filter((r, i) => r.startDate !== existing[i].startDate || r.finishDate !== existing[i].finishDate)
          .map((r) => supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
          }).eq('id', r.id)),
      );
    }
  }

  // Update project_products if provided
  let productWarning = null;
  if (body.projectProducts && Array.isArray(body.projectProducts)) {
    // Delete existing
    await supabase.from('project_products').delete().eq('projectId', id);
    // Insert new
    if (body.projectProducts.length > 0) {
      const ppRows = body.projectProducts.map((p) => ({
        id: genId('PP'),
        projectId: id,
        productId: p.productId,
        orderQty: p.orderQty || null,
        productionQty: p.productionQty || null,
      }));
      const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
      // ลบของเดิมไปแล้ว แต่ insert ใหม่ fail → แจ้ง warning (อย่าตอบเหมือนสำเร็จ)
      if (ppErr) { console.error('Failed to link products during PATCH:', ppErr.message); productWarning = 'อัปเดตรายการสินค้า (FG) ไม่สำเร็จ — โปรดตรวจ/ผูกใหม่ที่หน้าโครงการ'; }
    }
  }

  // เฟส B: เลิก sync ชื่อโครงการ→ชื่อดีล — โครงการมีได้หลายดีล (ชื่อดีล ≠ ชื่อโครงการ
  // อีกต่อไป) การ sync จะทับชื่อทุกดีลด้วยชื่อเดียว. ฝั่งดีล→โครงการก็ตัดคู่กัน.

  const summary = data.status !== project.status
    ? `เปลี่ยนสถานะโครงการ ${data.code || id}: ${project.status} → ${data.status}` : null;
  await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary, request: req });
  return ok({ ...data, ...(productWarning ? { productWarning } : {}) });
});

// DELETE /api/pm/projects/[id] — Sales เป็นแม่ (แผน merge M3): โครงการที่ผูกกับ
// งานขายต้องลบที่หน้า "บริหารงานขาย" ที่เดียว (ลบทั้งสายพร้อมกัน). ที่นี่รับเฉพาะ
// โครงการ "กำพร้า" (ยังไม่ผูกดีล — ข้อมูล PM เก่าก่อน backfill เฟส 5) เท่านั้น.
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');
  const id = project.id;
  // delete scope: superuser=all; senior_ae=own team; others none (deleteScope 'projects')
  if (!canDeleteRecord(user, 'projects', project)) {
    return forbidden();
  }

  // ผูกดีลอยู่ (กี่ใบก็ตาม — เฟส B หลายดีลต่อโครงการ) → ปฏิเสธ ให้ไปลบที่ฝั่งงานขาย
  // กันการลบ project ทิ้งไว้ให้ดีลกำพร้า. โครงการกำพร้า (0 ดีล) เท่านั้นที่ลบตรงนี้ได้.
  const { count: linkedCount } = await supabase
    .from('sales_deals').select('id', { count: 'exact', head: true }).eq('projectId', id);
  if ((linkedCount || 0) > 0) {
    return conflict('โครงการนี้ผูกกับดีลอยู่ — ลบดีลที่หน้า "บริหารงานขาย" ก่อน (ดีลสุดท้ายจะลบโครงการพ่วงไปด้วย)');
  }

  try {
    await deleteProjectDeep(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  await recordAudit({
    user, action: 'delete', entityType: 'project', entityId: id, before: project,
    summary: `ลบโครงการ (กำพร้า) ${project.code || id} ${project.name || ''}`.trim(), request: req,
  });

  return ok({ success: true });
});
