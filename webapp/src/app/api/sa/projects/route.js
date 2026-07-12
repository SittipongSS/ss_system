import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, unauthorized, forbidden, badRequest, conflict } from '@/lib/http';
import { can } from '@/lib/permissions';
import { buildProjectTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { generateProjectCode } from '@/lib/pm/projectsRepo';
import { normalizeDealType } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:edit')) return forbidden();

  const body = await req.json().catch(() => ({}));
  if (!body.name) return badRequest('ต้องระบุชื่อโครงการ');

  const startDate = body.startDate || todayStr();
  const dueDate = body.dueDate || null;

  let customerEmail = body.customerEmail || '';
  const custId = body.customerId || null;
  if (!customerEmail && custId) {
    const { data: cust } = await supabase.from('customers').select('email').eq('id', custId).maybeSingle();
    customerEmail = cust?.email || '';
  }
  
  const autoCode = !body.code;
  let projectCode = body.code || (await generateProjectCode(supabase));
  
  const baseRow = {
    name: body.name,
    customerId: body.customerId || null,
    customerName: body.customerName || null,
    type: normalizeDealType(body.type || 'NPD'),
    formulaName: body.formulaName || null,
    urgency: body.urgency || 'Schedule',
    aeOwner: body.aeOwner || user.name || '',
    acOwner: body.acOwner || '',
    status: 'New',
    startDate,
    dueDate,
    productMainCategory: body.productMainCategory || '',
    productSubCategory: body.productSubCategory || '',
    docNumber: '',
    productName: body.name || '',
    productCode: '',
    orderQty: '',
    productionQty: '',
    aeSupervisor: body.aeSupervisor || '',
    keyAccountExec: '',
    customerEmail,
    preparedBy: body.preparedBy || user.name || '',
    reviewedBy: '',
    team: user.team || null,
    ownerId: user.id || null,
    metadata: {
      ...(body.metadata || {}),
      brand: body.brand || '',
      source: 'sales-projects',
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
  const tasks = applyAutoStatuses(buildProjectTasks(project, project.id, null));
  let insertedTasks = [];
  if (tasks.length) {
    const { data: taskRows, error: taskError } = await supabase
      .from('project_tasks')
      .insert(tasks)
      .select();
    if (taskError) return fail(`สร้างขั้นตอน PM ไม่สำเร็จ: ${taskError.message}`, 500);
    insertedTasks = taskRows || [];
  }

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

  await recordAudit({
    user,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    after: project,
    summary: `สร้างโครงการ ${project.code} จากหน้ารวมโครงการขาย`,
    request: req,
  });

  return ok({ project: { ...project, tasks: insertedTasks }, productWarning }, 201);
});
