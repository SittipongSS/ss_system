import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { isSuperuser } from '@/lib/permissions';

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
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const task = await loadTask(supabase, id);
  if (!task) return Response.json({ error: 'ไม่พบงาน' }, { status: 404 });
  if (!(await canManage(supabase, task, user))) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  const updates = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) updates[k] = (k === 'dueDate' && body[k] === '') ? null : body[k];
  }
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('personal_tasks').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/pm/personal-tasks/[id] — เจ้าของ/ผู้รับมอบ/หัวหน้าทีม/แอดมิน.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const task = await loadTask(supabase, id);
  if (!task) return Response.json({ error: 'ไม่พบงาน' }, { status: 404 });
  if (!(await canManage(supabase, task, user))) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
