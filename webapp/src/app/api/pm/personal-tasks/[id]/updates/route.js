import { withUser, ok, fail, forbidden, notFound, badRequest, unauthorized } from '@/lib/http';
import { canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { appendTaskUpdate, listTaskUpdates } from '@/lib/pm/taskUpdates';

export const dynamic = 'force-dynamic';

async function loadTask(supabase, id) {
  const { data } = await supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// GET /api/pm/personal-tasks/[id]/updates — สายอัปเดตความคืบหน้า (เก่า→ใหม่)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canViewPersonalTask(supabase, task, user))) return forbidden();
  try {
    return ok(await listTaskUpdates(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/pm/personal-tasks/[id]/updates — โพสต์อัปเดต (โน้ต) — ผู้ที่เห็นงานได้
// โพสต์ได้ (ยกเว้น viewer ที่เป็น observer อ่านอย่างเดียว).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงาน');
  if (!(await canViewPersonalTask(supabase, task, user)) || user.role === 'viewer') return forbidden();

  const body = await req.json().catch(() => ({}));
  const text = (body.body || '').trim();
  if (!text) return badRequest('กรุณากรอกข้อความอัปเดต');

  await appendTaskUpdate(supabase, { taskId: id, kind: 'note', body: text, user });
  return ok({ ok: true }, 201);
});
