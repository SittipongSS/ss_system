import { isSuperuser, canAssignTask } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { pickFields } from '@/lib/validate';
import { recordAudit } from '@/lib/audit';
import { normalizeDifficulty } from '@/lib/pm/tasks';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'title', 'note', 'startDate', 'dueDate', 'status', 'category',
  'important', 'urgent', 'difficulty', 'projectId', 'dealId', 'assigneeId',
];

const today = () => new Date().toISOString().slice(0, 10);

// ทีมของ user คนหนึ่ง (จาก app_metadata) — ใช้ให้หัวหน้าทีมจัดการงานของลูกทีม.
async function userTeam(supabase, id) {
  if (!id) return null;
  const { data } = await supabase.auth.admin.getUserById(id);
  return data?.user?.app_metadata?.team ?? null;
}

// ใครจัดการงานนี้ได้:
//   - เจ้าของ (ownerId) / ผู้รับมอบ (assigneeId) / superuser
//   - หัวหน้าทีม (senior_ae) ที่อยู่ทีมเดียวกับ "ผู้รับมอบ" (ถ้ามอบหมายแล้ว) หรือ
//     เจ้าของงาน — เพื่อให้ Senior ติดตาม/ปรับงานของลูกทีมได้.
async function canManage(supabase, task, user) {
  if (!user) return false;
  if (task.ownerId === user.id) return true;
  if (task.assigneeId === user.id) return true;
  if (isSuperuser(user.role)) return true;
  if (user.role === 'senior_ae' && user.team) {
    const targetId = task.assigneeId || task.ownerId;
    const targetTeam = await userTeam(supabase, targetId);
    if (targetTeam && targetTeam === user.team) return true;
  }
  return false;
}

async function loadTask(supabase, id) {
  const { data } = await supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// PATCH /api/pm/personal-tasks/[id] — เจ้าของ/ผู้รับมอบ/หัวหน้าทีม/แอดมิน.
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canManage(supabase, task, user))) return forbidden();

  const body = await req.json();
  const updates = pickFields(body, EDITABLE, {
    nullable: ['startDate', 'dueDate', 'projectId', 'dealId', 'assigneeId', 'category'],
  });

  if ('difficulty' in updates) updates.difficulty = normalizeDifficulty(updates.difficulty);
  if ('important' in updates) updates.important = !!updates.important;
  if ('urgent' in updates) updates.urgent = !!updates.urgent;

  // เปลี่ยนผู้รับมอบ → ตรวจสิทธิ์มอบหมายตามลำดับชั้น (canAssignTask) + เซ็ต assignedBy.
  if ('assigneeId' in updates) {
    const next = updates.assigneeId || null;
    if (next && next !== user.id) {
      const { data: au } = await supabase.auth.admin.getUserById(next);
      if (!au?.user) return badRequest('ไม่พบผู้รับมอบหมาย');
      const assignee = { id: next, team: au.user.app_metadata?.team ?? null };
      if (!canAssignTask(user, assignee)) return forbidden('ไม่มีสิทธิ์มอบหมายงานให้ผู้ใช้นี้');
      updates.assignedBy = user.id;
    } else {
      updates.assignedBy = null; // ถอนการมอบหมาย / มอบให้ตัวเอง
    }
  }

  // อ้างอิงโปรเจกต์/ดีลต้องมีจริง
  if (updates.projectId) {
    const { data: proj } = await supabase.from('projects').select('id').eq('id', updates.projectId).maybeSingle();
    if (!proj) return badRequest('ไม่พบโปรเจกต์');
  }
  if (updates.dealId) {
    const { data: deal } = await supabase.from('sales_deals').select('id').eq('id', updates.dealId).maybeSingle();
    if (!deal) return badRequest('ไม่พบดีล');
  }

  // completedAt อัตโนมัติตามการเปลี่ยนสถานะ (เข้า Completed = วันนี้, ออก = ล้าง).
  if ('status' in updates && updates.status !== task.status) {
    updates.completedAt = updates.status === 'Completed' ? today() : null;
  }

  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('personal_tasks').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'task', entityId: id, before: task, after: data, request: req });
  return ok(data);
});

// DELETE /api/pm/personal-tasks/[id] — เจ้าของ/ผู้รับมอบ/หัวหน้าทีม/แอดมิน.
export const DELETE = withUser(async ({ user, supabase, ctx, req }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canManage(supabase, task, user))) return forbidden();

  const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'task', entityId: id, before: task, request: req });
  return ok({ success: true });
});
