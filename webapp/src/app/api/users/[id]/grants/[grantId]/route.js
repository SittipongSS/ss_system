// DELETE /api/users/[id]/grants/[grantId] — ถอนสิทธิ์เสริมหนึ่งแถว { note? }
//
// ⭐ ไม่ลบแถว — ติดตรา `revokedAt` + คนถอน (ประวัติการให้สิทธิ์ต้องย้อนอ่านได้ · มติข้อ 1 แท็บประวัติ)
// สิทธิ์: users:manage (proxy ตัดคนอื่นก่อนถึงที่นี่อีกชั้น)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canUser } from '@/lib/permissions';
import { revokeGrant } from '@/lib/capabilityGrants';

export const dynamic = 'force-dynamic';

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canUser(user, 'users:manage')) return forbidden();
  const { id, grantId } = await ctx.params;
  let note = '';
  try { note = (await req.json())?.note || ''; } catch { /* ไม่ส่ง body ก็ถอนได้ */ }
  const res = await revokeGrant(supabase, { targetId: id, grantId, actor: user, note },
    { audit: (entry) => recordAudit({ ...entry, request: req }) });
  if (res.errors) return fail(res.errors.join(' · '), res.status || 400);
  return ok({ grant: res.row, extraCaps: res.extraCaps });
});
