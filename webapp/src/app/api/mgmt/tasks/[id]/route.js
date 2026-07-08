import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { loadTask, appendUpdate } from '@/lib/mgmt/repo';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_STATUS_LABELS } from '@/lib/mgmt/constants';

export const dynamic = 'force-dynamic';

const EDITABLE = ['title', 'deptCode', 'assigneeId', 'assigneeName', 'startDate', 'dueDate', 'notes', 'status', 'priority'];

async function paramId(ctx) {
  const p = await ctx.params;
  return p.id;
}

// GET /api/mgmt/tasks/[id]
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!can(user?.role, 'mgmt:view')) return forbidden();
  const id = await paramId(ctx);
  const task = await loadTask(supabase, id);
  if (!task || task.deletedAt) return notFound('ไม่พบงาน');
  return ok(task);
});

// PATCH /api/mgmt/tasks/[id] — แก้ไข (ยืนยันแล้วส่งมา). status ที่เปลี่ยนลง feed.
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await loadTask(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบงาน');

  const body = await req.json().catch(() => ({}));
  const patch = {};
  for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
  if (patch.title !== undefined) {
    patch.title = (patch.title || '').trim();
    if (!patch.title) return badRequest('ชื่อรายการงานห้ามว่าง');
  }
  if (patch.status !== undefined && !TASK_STATUSES.includes(patch.status)) return badRequest('สถานะไม่ถูกต้อง');
  if (patch.priority !== undefined && !TASK_PRIORITIES.includes(patch.priority)) return badRequest('ลำดับความสำคัญไม่ถูกต้อง');
  if (patch.assigneeName !== undefined) patch.assigneeName = (patch.assigneeName || '').trim() || null;
  if (!Object.keys(patch).length) return ok(before); // ไม่มีอะไรเปลี่ยน

  patch.updatedAt = new Date().toISOString();
  const { data, error } = await supabase.from('mgmt_tasks').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'update', entityType: 'mgmt_task', entityId: id, before, after: data, request: req });
  if (patch.status && patch.status !== before.status) {
    await appendUpdate(supabase, {
      entityType: 'task', entityId: id, kind: 'status',
      body: `เปลี่ยนสถานะ: ${TASK_STATUS_LABELS[before.status] || before.status} → ${TASK_STATUS_LABELS[patch.status] || patch.status}`,
      meta: { field: 'status', from: before.status, to: patch.status }, user,
    });
  }
  return ok(data);
});

// DELETE /api/mgmt/tasks/[id] — soft-delete (ย้ายลงถังขยะ).
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const id = await paramId(ctx);
  const before = await loadTask(supabase, id);
  if (!before || before.deletedAt) return notFound('ไม่พบงาน');

  const { data, error } = await supabase
    .from('mgmt_tasks')
    .update({ deletedAt: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'delete', entityType: 'mgmt_task', entityId: id, before, request: req });
  return ok(data);
});
