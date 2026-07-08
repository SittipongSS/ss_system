import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest } from '@/lib/http';
import { listUpdates, appendUpdate } from '@/lib/mgmt/repo';

export const dynamic = 'force-dynamic';

const ENTITY_TYPES = ['task', 'meeting', 'rock'];

// GET /api/mgmt/updates?entityType=task&entityId=MT-... — สายอัพเดท/ประวัติ
// (ไม่ระบุ entity → feed รวมล่าสุดทั้งโมดูล สำหรับ Overview).
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:view')) return forbidden();
  const sp = new URL(req.url).searchParams;
  try {
    return ok(await listUpdates(supabase, {
      entityType: sp.get('entityType') || undefined,
      entityId: sp.get('entityId') || undefined,
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/updates — เพิ่มคอมเมนต์ลงสายอัพเดทของ entity.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const body = await req.json().catch(() => ({}));
  const { entityType, entityId } = body;
  const text = (body.body || '').trim();
  if (!ENTITY_TYPES.includes(entityType) || !entityId) return badRequest('entityType/entityId ไม่ถูกต้อง');
  if (!text) return badRequest('กรุณากรอกข้อความ');

  await appendUpdate(supabase, { entityType, entityId, kind: 'comment', body: text, user });
  return ok({ ok: true }, 201);
});
