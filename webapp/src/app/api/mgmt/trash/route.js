import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest, notFound } from '@/lib/http';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const TABLE = { task: 'mgmt_tasks', meeting: 'mgmt_meetings', rock: 'mgmt_rock_improve' };

// GET /api/mgmt/trash — รายการที่ถูก soft-delete (task/meeting/rock), ล่าสุดก่อน.
export const GET = withUser(async ({ user, supabase }) => {
  if (!can(user?.role, 'mgmt:view')) return forbidden();
  try {
    const [tasks, meetings, rocks] = await Promise.all([
      supabase.from('mgmt_tasks').select('*').not('deletedAt', 'is', null).order('deletedAt', { ascending: false }),
      supabase.from('mgmt_meetings').select('*').not('deletedAt', 'is', null).order('deletedAt', { ascending: false }),
      supabase.from('mgmt_rock_improve').select('*').not('deletedAt', 'is', null).order('deletedAt', { ascending: false }),
    ]);
    return ok({ tasks: tasks.data || [], meetings: meetings.data || [], rocks: rocks.data || [] });
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/trash — กู้คืน (restore) รายการที่ลบ. body: { entity, id }
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const { entity, id } = await req.json().catch(() => ({}));
  const table = TABLE[entity];
  if (!table || !id) return badRequest('entity/id ไม่ถูกต้อง');

  const { data: before } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (!before) return notFound('ไม่พบรายการ');
  if (!before.deletedAt) return ok(before); // กู้แล้ว/ไม่ได้ถูกลบ

  const { data, error } = await supabase.from(table).update({ deletedAt: null }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: `mgmt_${entity}`, entityId: id, before, after: data, summary: 'กู้คืนจากถังขยะ', request: req });
  return ok(data);
});
