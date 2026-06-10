import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';
import { resolveCustomer } from '@/lib/master/customers';
import { buildProjectTasks } from '@/lib/pm/schedule';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects — team-scoped list (supervisor sees all).
export async function GET() {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  let query = supabase.from('projects').select('*').order('createdAt', { ascending: false });
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach a lightweight task summary so the list UI can render progress bars,
  // overdue counts and the current step (ss-cj Board/Portfolio look) without a
  // round-trip per project. We only pull the columns those views need.
  const ids = (data || []).map((p) => p.id);
  if (ids.length) {
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('id, projectId, name, status, finishDate, stepOrder')
      .in('projectId', ids)
      .order('stepOrder', { ascending: true });
    const byProject = {};
    for (const t of tasks || []) (byProject[t.projectId] ??= []).push(t);
    for (const p of data) p.tasks = byProject[p.id] || [];
  }

  return Response.json(data);
}

// POST /api/pm/projects — create a project + auto-generate its template tasks.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  if (!body.code || !body.name) {
    return Response.json({ error: 'ต้องระบุรหัสและชื่อโปรเจกต์' }, { status: 400 });
  }

  // Link to customer master (FK) + take the name snapshot from the master row.
  const customer = await resolveCustomer({
    id: body.customerId,
    taxId: body.customerTaxId,
    name: body.customerName,
  });

  const id = 'PRJ-' + Date.now().toString().slice(-6);
  const startDate = body.startDate || new Date().toISOString().slice(0, 10);

  const insertRow = {
    id,
    code: body.code,
    name: body.name,
    // Empty-string from an unselected dropdown must become null, else it
    // violates the customers FK (no customer has id '').
    customerId: customer?.id || body.customerId || null,
    customerName: customer?.name || body.customerName || null,
    type: body.type === 'RE-ORDER' ? 'RE-ORDER' : 'NPD',
    urgency: body.urgency || 'Do Now',
    aeOwner: body.aeOwner || '',
    acOwner: body.acOwner || '',
    status: 'New',
    startDate,
    dueDate: body.dueDate || null,
    productMainCategory: body.productMainCategory || '',
    productSubCategory: body.productSubCategory || '',
    docNumber: body.docNumber || '',
    productName: body.productName || '',
    productCode: body.productCode || '',
    orderQty: body.orderQty || '',
    productionQty: body.productionQty || '',
    aeSupervisor: body.aeSupervisor || '',
    keyAccountExec: body.keyAccountExec || '',
    customerEmail: body.customerEmail || customer?.email || '',
    preparedBy: body.preparedBy || '',
    reviewedBy: body.reviewedBy || '',
    metadata: body.metadata || {},
    // ownership/scope from server identity
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
  };

  const { data: project, error } = await supabase
    .from('projects')
    .insert(insertRow)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Generate template tasks (camelCase rows) + insert.
  const taskRows = buildProjectTasks(
    { type: insertRow.type, productMainCategory: insertRow.productMainCategory, startDate, aeOwner: insertRow.aeOwner },
    project.id
  );
  let tasks = [];
  if (taskRows.length) {
    const { data: inserted, error: taskErr } = await supabase
      .from('project_tasks')
      .insert(taskRows)
      .select();
    if (taskErr) return Response.json({ error: 'สร้างขั้นตอนไม่สำเร็จ: ' + taskErr.message }, { status: 500 });
    tasks = inserted || [];
  }

  // Link selected products (FGs) with quantities if provided
  if (Array.isArray(body.projectProducts) && body.projectProducts.length > 0) {
    const ppRows = body.projectProducts.map((p, idx) => ({
      id: 'PP-' + Date.now().toString().slice(-6) + idx,
      projectId: project.id,
      productId: p.productId,
      orderQty: p.orderQty || null,
      productionQty: p.productionQty || null,
    }));
    const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
    if (ppErr) console.error('Failed to link products:', ppErr.message);
  }

  return Response.json({ ...project, tasks }, { status: 201 });
}
