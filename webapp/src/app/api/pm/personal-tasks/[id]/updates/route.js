import { withUser, ok, fail, badRequest, forbidden, notFound } from '@/lib/http';
import { canChangeTaskStatus } from '@/lib/permissions';
import { canManagePersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { appendTaskUpdate, listTaskUpdates } from '@/lib/pm/taskUpdates';

export const dynamic = 'force-dynamic';

async function loadTask(supabase, id) {
  const { data } = await supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// GET /api/pm/personal-tasks/[id]/updates — เธรดอัปเดตของงาน
// (หน้า detail ได้เธรดมากับ GET งานอยู่แล้ว — เส้นนี้ไว้ให้ที่อื่นดึงแยก)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงานนี้');
  if (!(await canViewPersonalTask(supabase, task, user))) return notFound('ไม่พบงานนี้');
  return ok(await listTaskUpdates(supabase, id));
});

// POST /api/pm/personal-tasks/[id]/updates { body } — พิมพ์อัปเดตความคืบหน้าเอง
// (มติผู้ใช้: "งานเลยกำหนด หัวหน้าจะมาถามว่าทำไมยังไม่เสร็จ อยากอัปเดตได้ว่าติดอะไร")
// เขียนได้เฉพาะคนที่เกี่ยวข้องกับงาน — คนนอกที่บังเอิญมองเห็นงาน (เช่นทีมเดียวกัน)
// อ่านได้แต่โพสต์ไม่ได้ กันเธรดกลายเป็นที่คุยของคนไม่เกี่ยว
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadTask(supabase, id);
  if (!task) return notFound('ไม่พบงานนี้');
  if (!(await canViewPersonalTask(supabase, task, user))) return notFound('ไม่พบงานนี้');

  const manage = await canManagePersonalTask(supabase, task, user);
  if (!manage && !canChangeTaskStatus(user, task, manage)) {
    return forbidden('อัปเดตงานได้เฉพาะผู้ดูแลงานหรือผู้รับผิดชอบ');
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body?.body || '').trim();
  if (!text) return badRequest('ต้องพิมพ์ข้อความอัปเดต');

  // คนกดปุ่มส่ง = ต้องรู้ว่าไม่สำเร็จ ห้ามกลืน error แล้วตอบ 201 (เวอร์ชันแรกทำแบบนั้น
  // ตารางยังไม่มี → insert พัง → ตอบ 201 + เธรดว่าง → ผู้ใช้นึกว่าส่งแล้วแต่ไม่มีอะไรขึ้น)
  const failed = await appendTaskUpdate(supabase, { taskId: id, kind: 'comment', body: text, user });
  if (failed) return fail(`บันทึกอัปเดตไม่สำเร็จ: ${failed}`, 500);
  return ok(await listTaskUpdates(supabase, id), 201);
});
