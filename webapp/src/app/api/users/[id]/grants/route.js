// GET  /api/users/[id]/grants — ทะเบียนสิทธิ์เสริมของผู้ใช้หนึ่งคน (ที่ถืออยู่ + ประวัติ)
// POST /api/users/[id]/grants — ให้สิทธิ์เสริม { caps: [...], reason, expiry: { kind: 'none' } | { kind: 'date', date } }
//
// ⭐ รื้อระบบสิทธิ์งวด 2 (mig 0440 · docs/permissions-rework.md) — ทางเดียวที่ให้สิทธิ์เสริมได้
//    (API แก้ผู้ใช้ปฏิเสธการเขียน extraCaps ตรงแล้ว) · ตัวตรวจทั้งหมดอยู่ใน lib/capabilityGrants.js
// สิทธิ์: อ่าน = users:manage หรือ users:view (มติข้อ 5 — อ่านอย่างเดียว) · ให้ = users:manage
//   ⚠️ `canUser` ไม่ใช่ `can(role)` — users:view เป็นสิทธิ์ที่แจกรายคนได้ (grantableCapsHonored.test.mjs)
//   ⚠️ proxy ปล่อย GET ใต้ `/api/users` ทั้ง prefix (OPEN_READ_APIS) ⇒ ด่านอ่านอยู่ที่นี่ · เขียนติด users:manage ที่ proxy อีกชั้น
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized, badRequest } from '@/lib/http';
import { canUser } from '@/lib/permissions';
import { grantCaps, listGrants } from '@/lib/capabilityGrants';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canUser(user, 'users:manage') && !canUser(user, 'users:view')) return forbidden();
  const { id } = await ctx.params;
  try {
    return ok({ grants: await listGrants(supabase, id) });
  } catch (e) {
    // ข้อความดิบของฐาน (อังกฤษ) ไม่ขึ้นจอ — log ไว้ฝั่ง server แทน
    console.error('[api/users/grants] list failed', id, e?.message || e);
    return fail('โหลดสิทธิ์เสริมไม่สำเร็จ ลองใหม่อีกครั้ง', 500);
  }
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canUser(user, 'users:manage')) return forbidden();
  const { id } = await ctx.params;
  let body;
  try { body = await req.json(); } catch { return badRequest('รูปแบบข้อมูลไม่ถูกต้อง'); }
  const res = await grantCaps(supabase, {
    targetId: id, actor: user, caps: body?.caps, reason: body?.reason, expiry: body?.expiry,
  }, { audit: (entry) => recordAudit({ ...entry, request: req }) });
  if (res.errors) return fail(res.errors.join(' · '), res.status || 400);
  return ok({ grants: res.rows, extraCaps: res.extraCaps }, 201);
});
