import { isSuperuser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { pickFields } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const EDITABLE = ['title', 'note', 'dueDate', 'status', 'projectId', 'assigneeId'];

// ใครจัดการงานนี้ได้:
//   - งานส่วนตัว (ไม่ผูกโปรเจกต์): เจ้าของเท่านั้น
//   - งานเพิ่มเติม (ผูกโปรเจกต์): เจ้าของ / ผู้รับมอบ / superuser /
//     หัวหน้าทีม (senior_ae) ที่อยู่ทีมเดียวกับโปรเจกต์
async function canManage(supabase, task, user) {
  if (!user) return false;
  if (task.ownerId === user.id) return true;
  if (!task.projectId) return false; // งานส่วนตัว → เจ้าของเท่านั้น
  if (task.assigneeId === user.id) return true;
  if (isSuperuser(user.role)) return true;
  if (user.role === 'senior_ae') {
    const { data: proj } = await supabase.from('projects').select('team').eq('id', task.projectId).maybeSingle();
    if (proj && proj.team === user.team) return true;
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
  const updates = pickFields(body, EDITABLE, { nullable: ['dueDate', 'projectId', 'assigneeId'] });

  // เปลี่ยน projectId/assigneeId ต้องผ่านกฎเดียวกับตอนสร้าง (POST) — ไม่งั้น PATCH
  // จะข้ามการตรวจ: ย้ายงานไปโปรเจกต์ทีมอื่น หรือมอบหมายให้คนนอกทีมได้.
  //   - งานส่วนตัว (ไม่ผูกโปรเจกต์) → ตั้งผู้รับมอบไม่ได้
  //   - ผู้รับมอบต้องอยู่ทีมเดียวกับโปรเจกต์ ; โปรเจกต์ต้องมีจริง
  if ('projectId' in updates || 'assigneeId' in updates) {
    const projectId = ('projectId' in updates ? updates.projectId : task.projectId) || null;
    const assigneeId = ('assigneeId' in updates ? updates.assigneeId : task.assigneeId) || null;
    if (assigneeId) {
      if (!projectId) return badRequest('งานส่วนตัว (ไม่ผูกโปรเจกต์) ตั้งผู้รับมอบไม่ได้');
      const { data: proj } = await supabase.from('projects').select('team').eq('id', projectId).maybeSingle();
      if (!proj) return badRequest('ไม่พบโปรเจกต์');
      const { data: au } = await supabase.auth.admin.getUserById(assigneeId);
      const assigneeTeam = au?.user?.app_metadata?.team ?? null;
      if (!au?.user || assigneeTeam !== proj.team) {
        return badRequest('ผู้รับมอบต้องอยู่ทีมเดียวกับโปรเจกต์');
      }
    } else if (projectId && 'projectId' in updates) {
      // ย้าย/ผูกโปรเจกต์ใหม่ (ยังไม่มอบหมาย) — โปรเจกต์ต้องมีจริง
      const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
      if (!proj) return badRequest('ไม่พบโปรเจกต์');
    }
  }

  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('personal_tasks').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  return ok(data);
});

// DELETE /api/pm/personal-tasks/[id] — เจ้าของ/ผู้รับมอบ/หัวหน้าทีม/แอดมิน.
export const DELETE = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canManage(supabase, task, user))) return forbidden();

  const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  return ok({ success: true });
});
