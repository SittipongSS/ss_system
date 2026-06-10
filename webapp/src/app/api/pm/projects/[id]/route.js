import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope, editScope, inScope } from '@/lib/permissions';

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

async function loadProject(supabase, id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
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
    supabase.from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', id),
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
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, id);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

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
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, id);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
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
