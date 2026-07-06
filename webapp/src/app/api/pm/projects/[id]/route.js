import { viewScope, pmEditScope, inScope, canDeleteRecord, can } from '@/lib/permissions';
import { mergeTemplateTasks, recalculateGraph, resolveSchedule } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';
import { genId } from '@/lib/id';
import { pickFields } from '@/lib/validate';
import { recordAudit } from '@/lib/audit';

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
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return forbidden();
  }

  const [{ data: tasks }, { data: links }, { data: personalTasks }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
    // "งานเพิ่มเติม" ที่ผูกโปรเจกต์นี้ — เห็นร่วมกันทั้งโปรเจกต์ (ไม่กรองเจ้าของ). ไม่เข้า Gantt.
    supabase.from('personal_tasks').select('*').eq('projectId', project.id).order('createdAt', { ascending: false }),
  ]);

  const projectProducts = (links || []).map((l) => ({
    ...l,
    product: l.product
  }));

  // Linked sales deal (at most one — projectId is unique). Surfaced so the UI can
  // gate downstream actions (e.g. tax registration only once the deal is won).
  const { data: linkedDeal } = await supabase
    .from('sales_deals').select('id, stage').eq('projectId', project.id).maybeSingle();
  
  // Tell the client whether THIS user may edit THIS record (cap + row scope),
  // so the UI gates edit controls by ownership — not just the pm:edit cap.
  const canEdit = inScope(pmEditScope(user?.role), user, project);
  // me: ใช้ฝั่ง client gate ปุ่มจัดการ "งานเพิ่มเติม" (owner/assignee/lead) + กรอง
  // ผู้รับมอบใน dropdown ตามทีมโปรเจกต์.
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
  return ok({ ...project, tasks: tasks || [], projectProducts, personalTasks: personalTasks || [], canEdit, me, revisedAt, maxRev, dealId: linkedDeal?.id ?? null, dealStage: linkedDeal?.stage ?? null });
});

// PATCH /api/pm/projects/[id]
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(pmEditScope(user?.role), user, project)) {
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
    if (error.code === '23505') return fail('รหัสโปรเจกต์ซ้ำ: ' + (updates.code ?? ''), 409);
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
      if (ppErr) { console.error('Failed to link products during PATCH:', ppErr.message); productWarning = 'อัปเดตรายการสินค้า (FG) ไม่สำเร็จ — โปรดตรวจ/ผูกใหม่ที่หน้าโปรเจกต์'; }
    }
  }

  // Two-way name sync: keep the linked sales deal's title matching the project
  // name (the deal PATCH mirrors the reverse). Direct table write, no loop.
  if ('name' in updates && project.name !== data.name) {
    await supabase.from('sales_deals').update({ title: data.name, updatedAt: updates.updatedAt }).eq('projectId', id);
  }

  const summary = data.status !== project.status
    ? `เปลี่ยนสถานะโปรเจกต์ ${data.code || id}: ${project.status} → ${data.status}` : null;
  await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary, request: req });
  return ok({ ...data, ...(productWarning ? { productWarning } : {}) });
});

// DELETE /api/pm/projects/[id] — supervisor (all) or team lead (own team).
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  const id = project.id;
  // delete scope: superuser=all; senior_ae=own team; others none (deleteScope 'projects')
  if (!canDeleteRecord(user, 'projects', project)) {
    return forbidden();
  }

  // Find the linked sales deal BEFORE deleting (the FK is ON DELETE SET NULL, so
  // after the delete we could no longer locate it by projectId).
  const { data: linkedDeal } = await supabase
    .from('sales_deals').select('*').eq('projectId', id).maybeSingle();

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({
    user, action: 'delete', entityType: 'project', entityId: id, before: project,
    summary: `ลบโปรเจกต์ ${project.code || id} ${project.name || ''}`.trim(), request: req,
  });

  // Auto-return the deal to the pipeline: unlink, revert stage (won if deposit
  // paid, else back to the pre-project proposal stage), and drop stale link
  // metadata — otherwise the deal is orphaned at in_project with no project.
  if (linkedDeal) {
    const now = new Date().toISOString();
    const revertStage = linkedDeal.depositPaid ? 'won' : 'timeline_proposed';
    const { linkedProjectCode, linkedProjectAt, ...restMeta } = linkedDeal.metadata || {};
    const { data: revertedDeal } = await supabase
      .from('sales_deals')
      .update({ projectId: null, stage: revertStage, metadata: restMeta, updatedAt: now })
      .eq('id', linkedDeal.id)
      .select()
      .single();
    if (revertedDeal && linkedDeal.stage !== revertedDeal.stage) {
      await supabase.from('sales_deal_stage_history').insert({
        id: genId('DSH'),
        dealId: linkedDeal.id,
        fromStage: linkedDeal.stage,
        toStage: revertedDeal.stage,
        changedBy: user.id || null,
        changedByName: user.name || null,
      });
    }
    await recordAudit({
      user, action: 'update', entityType: 'sales_deal', entityId: linkedDeal.id,
      before: linkedDeal, after: revertedDeal || undefined,
      summary: `คืนดีลสู่ pipeline (ลบโปรเจกต์ ${project.code || id})`, request: req,
    });
  }

  return ok({ success: true });
});
