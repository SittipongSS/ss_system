import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope, editScope, inScope } from '@/lib/permissions';
import { mergeTemplateTasks, recalculateSchedule } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';

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

// Resolve the URL segment to a project. Internal ids ('PRJ-######') and human
// project codes ('PJ-YYMMNNN') never collide, so we accept either: try id first,
// then fall back to code. Callers must use the returned row's real `id` for any
// project_tasks/project_products subqueries (those FK the internal id).
async function loadProject(supabase, idOrCode) {
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', idOrCode).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: byCode, error: codeErr } = await supabase
    .from('projects').select('*').eq('code', idOrCode).maybeSingle();
  if (codeErr) throw codeErr;
  return byCode;
}

// GET /api/pm/projects/[id] — project + its tasks + linked products (FG).
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, id).catch((e) => { throw e; });
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (viewScope(user?.role) === 'team' && !inScope('team', user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);

  const projectProducts = (links || []).map((l) => ({
    ...l,
    product: l.product
  }));
  
  // Tell the client whether THIS user may edit THIS record (cap + row scope),
  // so the UI gates edit controls by ownership — not just the pm:edit cap.
  const canEdit = inScope(editScope(user?.role), user, project);
  return Response.json({ ...project, tasks: tasks || [], projectProducts, canEdit });
}

// PATCH /api/pm/projects/[id]
export async function PATCH(request, { params }) {
  const { id: idOrCode } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, idOrCode);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  // From here on use the resolved internal id for all DB keys/FK subqueries.
  const id = project.id;

  const body = await request.json();
  const updates = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) {
      if ((k === 'startDate' || k === 'dueDate') && body[k] === "") updates[k] = null;
      else updates[k] = body[k];
    }
  }
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ข้อ 2: หมวดสินค้าพลิกสถานะสรรพสามิต (01-002) → ปรับชุดขั้นตอนแบบ incremental
  // (เพิ่ม/ลบเฉพาะขั้นตอนสรรพสามิต, คงความคืบหน้าเดิม + ขั้นตอนที่เพิ่มเอง).
  const oldCat = project.productMainCategory || '';
  const newCat = updates.productMainCategory !== undefined ? (updates.productMainCategory || '') : oldCat;
  // วันเริ่ม/วันจบเปลี่ยน → ต้องคำนวณ timeline ใหม่ (forward/backward ตาม resolveSchedule)
  const dateChanged =
    ('startDate' in updates && (updates.startDate || null) !== (project.startDate || null)) ||
    ('dueDate' in updates && (updates.dueDate || null) !== (project.dueDate || null));
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
      // custom rows: ปรับเฉพาะลำดับให้อยู่ท้าย
      ...customRows.map((r) => supabase.from('project_tasks').update({ stepOrder: r.stepOrder }).eq('id', r.id)),
    ]);
  } else if (dateChanged) {
    // หมวดไม่เปลี่ยน แต่วันเริ่ม/วันจบเปลี่ยน → คำนวณ start/finish ทุก task ใหม่
    setHolidays([...(await holidaySet())]);
    const { data: existing } = await supabase
      .from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true });
    if (existing && existing.length) {
      const recalced = recalculateSchedule(existing, data, existing);
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
  if (body.projectProducts && Array.isArray(body.projectProducts)) {
    // Delete existing
    await supabase.from('project_products').delete().eq('projectId', id);
    // Insert new
    if (body.projectProducts.length > 0) {
      const ppRows = body.projectProducts.map((p, idx) => ({
        id: 'PP-' + Date.now().toString().slice(-6) + idx,
        projectId: id,
        productId: p.productId,
        orderQty: p.orderQty || null,
        productionQty: p.productionQty || null,
      }));
      const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
      if (ppErr) console.error('Failed to link products during PATCH:', ppErr.message);
    }
  }

  return Response.json(data);
}

// DELETE /api/pm/projects/[id] — supervisor (all) or team lead (own team).
export async function DELETE(request, { params }) {
  const { id: idOrCode } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, idOrCode);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  const id = project.id;
  // delete scope: supervisor=all; senior_ae=own team; others none
  const scope = user?.role === 'ae_supervisor' ? 'all'
    : user?.role === 'senior_ae' ? 'team' : 'none';
  if (!inScope(scope, user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
