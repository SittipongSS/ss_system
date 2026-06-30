import { viewScope, can } from '@/lib/permissions';
import { resolveCustomer } from '@/lib/master/customers';
import { buildProjectTasks } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { generateProjectCode } from '@/lib/pm/projectsRepo';
import { genId } from '@/lib/id';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects — team-scoped list (supervisor sees all).
export const GET = withUser(async ({ user, supabase }) => {
  // PM is a sales-only tool: gate on the pm:view capability (not just scope).
  // legal has viewScope 'all' but no pm:view — without this it would read every
  // team's projects. viewer/staff hold pm:view and pass.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  let query = supabase.from('projects').select('*').order('createdAt', { ascending: false });
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

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

  return ok(data);
});

// POST /api/pm/projects — create a project + auto-generate its template tasks.
export const POST = withUser(async ({ user, supabase, req }) => {
  // ต้องมีตัวตน + สิทธิ์แก้ PM — กัน null user สร้างโปรเจกต์ไร้เจ้าของ/ไร้ทีม
  // และกัน viewer/staff/legal (ไม่มี pm:edit) สร้างโปรเจกต์.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:edit')) return forbidden();

  const body = await req.json();

  if (!body.name) {
    return fail('ต้องระบุชื่อโปรเจกต์', 400);
  }
  // วันเริ่มเป็น anchor ของ timeline (forward-only) — บังคับใส่ ไม่งั้น anchor ตกไปใช้ createdAt
  // (วันนี้) → โปรเจกต์ย้อนหลังลากงานย้อนอดีตไม่ได้
  if (!body.startDate) {
    return fail('ต้องระบุวันเริ่มโปรเจกต์', 400);
  }

  // รหัสโปรเจกต์ PJ-YYMMNNN (ลำดับรันต่อเดือน). การอ่าน max แล้ว +1 ไม่ atomic →
  // ถ้าสร้างพร้อมกันอาจได้รหัสซ้ำ จึงพึ่ง unique(code) + retry ตอน insert (loop ด้านล่าง).
  const autoCode = !body.code;
  let projectCode = body.code || (await generateProjectCode(supabase));

  // Link to customer master (FK) + take the name snapshot from the master row.
  const customer = await resolveCustomer({
    id: body.customerId,
    taxId: body.customerTaxId,
    name: body.customerName,
  });

  // วันเริ่มปล่อยว่างได้ — ถ้าไม่มีวันเริ่ม/วันจบ timeline จะนับจากวันสร้าง (createdAt)
  const startDate = body.startDate || null;

  const baseRow = {
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

  // Insert พร้อม retry ถ้าชน unique(code) — race จากการสร้างพร้อมกัน: คำนวณรหัสใหม่
  // แล้วลองใหม่ (เฉพาะรหัสที่ระบบ gen เอง). ถ้าผู้ใช้ส่ง code มาเองแล้วซ้ำ → 409.
  let project = null, error = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = genId('PRJ');
    ({ data: project, error } = await supabase
      .from('projects')
      .insert({ ...baseRow, id, code: projectCode })
      .select()
      .single());
    if (!error) break;
    if (error.code === '23505') {
      if (!autoCode) return fail('รหัสโปรเจกต์ซ้ำ: ' + projectCode, 409);
      projectCode = await generateProjectCode(supabase); // ชน → ขยับเลขแล้วลองใหม่
      continue;
    }
    break; // error อื่น → ออกไปคืน 500 ด้านล่าง
  }
  if (error) return fail(error.message, 500);

  // Load the editable holiday calendar so the timeline counts business days
  // against the real calendar (falls back to hardcoded THAI_HOLIDAYS).
  setHolidays([...(await holidaySet())]);

  // Generate template tasks (camelCase rows) + insert.
  // ส่ง project เต็ม (มี startDate/dueDate/createdAt) เพื่อให้ resolveSchedule เลือก
  // โหมด forward/backward ได้ถูกต้องตามวันที่ที่มี.
  // template สร้าง chain ให้ idx0 เป็น In Progress อยู่แล้ว — apply กฎกราฟอีกชั้น
  // เพื่อรองรับ "งานแรกแบบขนาน" (หลายขั้นที่ไม่มี predecessor → In Progress ทุกตัว).
  const taskRows = applyAutoStatuses(buildProjectTasks(project, project.id));
  let tasks = [];
  if (taskRows.length) {
    const { data: inserted, error: taskErr } = await supabase
      .from('project_tasks')
      .insert(taskRows)
      .select();
    if (taskErr) return fail('สร้างขั้นตอนไม่สำเร็จ: ' + taskErr.message, 500);
    tasks = inserted || [];
  }

  // Link selected products (FGs) with quantities if provided
  let productWarning = null;
  if (Array.isArray(body.projectProducts) && body.projectProducts.length > 0) {
    const ppRows = body.projectProducts.map((p) => ({
      id: genId('PP'),
      projectId: project.id,
      productId: p.productId,
      orderQty: p.orderQty || null,
      productionQty: p.productionQty || null,
    }));
    const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
    // โปรเจกต์+ขั้นตอนถูกสร้างแล้ว — ไม่ rollback แต่ "อย่าตอบเหมือนผูกสำเร็จ":
    // แจ้ง warning กลับไปให้ UI เตือนผู้ใช้ว่าต้องผูก FG ใหม่
    if (ppErr) { console.error('Failed to link products:', ppErr.message); productWarning = 'เชื่อมสินค้า (FG) เข้าโปรเจกต์ไม่สำเร็จ — โปรดผูกใหม่ที่หน้าโปรเจกต์'; }
  }

  await recordAudit({
    user, action: 'create', entityType: 'project', entityId: project.id, after: project,
    summary: `สร้างโปรเจกต์ ${project.code || ''} ${project.name || ''}`.trim(), request: req,
  });
  return ok({ ...project, tasks, ...(productWarning ? { productWarning } : {}) }, 201);
});
