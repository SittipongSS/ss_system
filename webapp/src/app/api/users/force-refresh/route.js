// ── ปุ่มแอดมิน "บังคับรีเฟรชทุกคน" (มติเจ้าของ 25/09/2026 · กติกาใน lib/ui/forceRefresh.js) ─────────
//
// GET  → { at } เวลาที่แอดมินสั่งรีเฟรชครั้งล่าสุด (null = ยังไม่เคย) — ทุกคนที่ล็อกอินอ่านได้
//        (`/api/users` อยู่ใน OPEN_READ_APIS ของ proxy) · ตัวเฝ้าในทุกแท็บถามทุก 1 นาที
// POST → แอดมิน (`users:manage`) สั่งรีเฟรช → { at } · proxy ตัดคนอื่นทิ้งแล้ว (apiWriteAllowed: /api/users =
//        users:manage) แต่ handler ตรวจซ้ำ — เส้นนี้ทำให้ทุกหน้าจอในบริษัทใช้งานต่อไม่ได้จนกว่าจะรีเฟรช
// ⚠️ สัญญาณคือแถว audit_logs — **เขียนตรง ไม่ผ่าน recordAudit** เพราะ recordAudit กลืน error ทิ้ง
//    (ออกแบบมาไม่ให้งานของผู้ใช้พัง) แต่ที่นี่แถวนี้ "คือ" คำสั่ง: เขียนไม่สำเร็จต้องบอกแอดมิน ไม่ใช่บอกว่าสำเร็จ
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { FORCE_REFRESH_SIGNAL } from '@/lib/ui/forceRefresh';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('createdAt')
    .eq('entityType', FORCE_REFRESH_SIGNAL.entityType)
    .eq('entityId', FORCE_REFRESH_SIGNAL.entityId)
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  return ok({ at: data?.createdAt || null });
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'users:manage')) return forbidden('เฉพาะผู้ดูแลระบบสั่งรีเฟรชทุกคนได้');
  const forwarded = req.headers.get('x-forwarded-for');
  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      actorId: user.id ? String(user.id) : null,
      actorName: user.name || null,
      actorRole: user.role || null,
      actorTeam: user.team || null,
      action: FORCE_REFRESH_SIGNAL.action,
      entityType: FORCE_REFRESH_SIGNAL.entityType,
      entityId: FORCE_REFRESH_SIGNAL.entityId,
      summary: 'บังคับรีเฟรชทุกคน — ทุกหน้าจอที่เปิดระบบอยู่ต้องรีเฟรชก่อนใช้งานต่อ',
      ipAddress: forwarded ? forwarded.split(',')[0].trim() : (req.headers.get('x-real-ip') || null),
    })
    .select('createdAt')
    .single();
  if (error) return fail(`สั่งรีเฟรชไม่สำเร็จ — ${error.message}`, 500);
  return ok({ at: data.createdAt }, 201);
});
