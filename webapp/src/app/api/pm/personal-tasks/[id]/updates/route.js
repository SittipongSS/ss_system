// เธรดอัปเดตของงาน — **alias ของ /api/updates** (mig 0163)
//
// ตัวเธรดย้ายไปตารางกลาง `entity_updates` แล้ว และหน้าจอใช้ `UpdateThread` ซึ่งยิง
// /api/updates ตรง ๆ; เส้นนี้เก็บไว้เพราะเคยเป็น API สาธารณะของงาน (อาจมีที่อื่น/
// สคริปต์เรียกอยู่) — ลบทิ้งตอนไล่เก็บของเก่ารอบสุดท้าย (PR 6 ของแผน)
import { withUser, ok, fail, badRequest, forbidden, notFound } from '@/lib/http';
import { canPostUpdate, canViewUpdates, loadUpdateParent } from '@/lib/master/updateAccess';
import { appendUpdate, listUpdates } from '@/lib/master/updates';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadUpdateParent(supabase, 'personal_task', id);
  if (!task) return notFound('ไม่พบงานนี้');
  if (!(await canViewUpdates(supabase, 'personal_task', task, user))) return notFound('ไม่พบงานนี้');
  return ok(await listUpdates(supabase, 'personal_task', id));
});

// POST { body } — พิมพ์อัปเดตความคืบหน้าเอง
// (มติผู้ใช้: "งานเลยกำหนด หัวหน้าจะมาถามว่าทำไมยังไม่เสร็จ อยากอัปเดตได้ว่าติดอะไร")
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const task = await loadUpdateParent(supabase, 'personal_task', id);
  if (!task) return notFound('ไม่พบงานนี้');
  if (!(await canViewUpdates(supabase, 'personal_task', task, user))) return notFound('ไม่พบงานนี้');
  if (!(await canPostUpdate(supabase, 'personal_task', task, user))) {
    return forbidden('อัปเดตงานได้เฉพาะผู้ดูแลงานหรือผู้รับผิดชอบ');
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body?.body || '').trim();
  if (!text) return badRequest('ต้องพิมพ์ข้อความอัปเดต');

  // คนกดปุ่มส่ง = ต้องรู้ว่าไม่สำเร็จ ห้ามกลืน error แล้วตอบ 201 (เวอร์ชันแรกของ 0113
  // ทำแบบนั้น: ตารางยังไม่มี → insert พัง → ตอบ 201 + เธรดว่าง → ผู้ใช้นึกว่าส่งแล้ว)
  const { error } = await appendUpdate(supabase, {
    entityType: 'personal_task', entityId: id, kind: 'comment', body: text, user,
  });
  if (error) return fail(`บันทึกอัปเดตไม่สำเร็จ: ${error}`, 500);
  return ok(await listUpdates(supabase, 'personal_task', id), 201);
});
