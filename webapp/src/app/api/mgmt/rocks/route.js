import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { listRockImprove, newRockId } from '@/lib/mgmt/repo';

export const dynamic = 'force-dynamic';

// goals = array ของข้อความ (v1) — coerce เป็น string, trim, ตัดว่าง.
function cleanGoals(goals) {
  if (!Array.isArray(goals)) return [];
  return goals.map((g) => (typeof g === 'string' ? g : (g?.text ?? ''))).map((s) => String(s).trim()).filter(Boolean);
}

// GET /api/mgmt/rocks?year=
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:view')) return forbidden();
  const year = new URL(req.url).searchParams.get('year') || undefined;
  try {
    return ok(await listRockImprove(supabase, { year }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/rocks — สร้างแถวของแผนก/ปี (1 แถว/แผนก/ปี, unique).
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();
  const body = await req.json().catch(() => ({}));
  const year = Number(body.year);
  const deptCode = (body.deptCode || '').trim();
  if (!Number.isFinite(year)) return badRequest('ปีไม่ถูกต้อง');
  if (!deptCode) return badRequest('กรุณาระบุแผนก');

  const now = new Date().toISOString();
  const row = {
    id: newRockId(),
    year,
    deptCode,
    improved: body.improved || null,
    goals: cleanGoals(body.goals),
    createdBy: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const { data, error } = await supabase.from('mgmt_rock_improve').insert(row).select().single();
  if (error) {
    if (error.code === '23505') return fail('แผนกนี้มีข้อมูลของปีนี้แล้ว', 409);
    return fail(error.message, 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'mgmt_rock', entityId: data.id, after: data, request: req });
  return ok(data, 201);
});
