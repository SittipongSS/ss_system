import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { listTasks, newTaskId, appendUpdate } from '@/lib/mgmt/repo';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/mgmt/constants';

export const dynamic = 'force-dynamic';

// รับเฉพาะฟิลด์ที่อนุญาต + normalize enum. คืน { row } หรือ { error }.
function buildTask(body, { forCreate }) {
  const out = {};
  if (forCreate || body.title !== undefined) {
    const title = (body.title || '').trim();
    if (forCreate && !title) return { error: 'กรุณาระบุชื่อรายการงาน' };
    if (title) out.title = title;
  }
  if (body.deptCode !== undefined) out.deptCode = body.deptCode || null;
  if (body.assigneeId !== undefined) out.assigneeId = body.assigneeId || null;
  if (body.assigneeName !== undefined) out.assigneeName = (body.assigneeName || '').trim() || null;
  if (body.startDate !== undefined) out.startDate = body.startDate || null;
  if (body.dueDate !== undefined) out.dueDate = body.dueDate || null;
  if (body.notes !== undefined) out.notes = body.notes || null;
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) return { error: 'สถานะไม่ถูกต้อง' };
    out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(body.priority)) return { error: 'ลำดับความสำคัญไม่ถูกต้อง' };
    out.priority = body.priority;
  }
  return { row: out };
}

// GET /api/mgmt/tasks?year=&deptCode=&status=&priority=
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:view')) return forbidden();
  const sp = new URL(req.url).searchParams;
  try {
    const data = await listTasks(supabase, {
      year: sp.get('year') || undefined,
      deptCode: sp.get('deptCode') || undefined,
      status: sp.get('status') || undefined,
      priority: sp.get('priority') || undefined,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/tasks — สร้างงานใหม่.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();
  const body = await req.json().catch(() => ({}));
  const built = buildTask(body, { forCreate: true });
  if (built.error) return badRequest(built.error);

  const now = new Date().toISOString();
  const row = {
    id: newTaskId(),
    status: 'todo',
    priority: 'normal',
    ...built.row,
    createdBy: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const { data, error } = await supabase.from('mgmt_tasks').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'create', entityType: 'mgmt_task', entityId: data.id, after: data, request: req });
  await appendUpdate(supabase, { entityType: 'task', entityId: data.id, kind: 'edit', body: 'สร้างงาน', user });
  return ok(data, 201);
});
