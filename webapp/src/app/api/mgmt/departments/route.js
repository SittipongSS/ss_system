import { can } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { listDepartments } from '@/lib/mgmt/repo';

export const dynamic = 'force-dynamic';

// GET /api/mgmt/departments?all=1 — taxonomy แผนกของโมดูล.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:view')) return forbidden();
  const includeInactive = new URL(req.url).searchParams.get('all') === '1';
  try {
    return ok(await listDepartments(supabase, { includeInactive }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/mgmt/departments — เพิ่มแผนก ("เพิ่มแผนก").
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!can(user?.role, 'mgmt:edit')) return forbidden();
  const body = await req.json().catch(() => ({}));
  const code = (body.code || '').trim();
  const label = (body.label || '').trim() || code;
  if (!code) return badRequest('กรุณาระบุรหัสแผนก');

  const row = {
    code,
    label,
    color: body.color || null,
    sortOrder: Number.isFinite(body.sortOrder) ? body.sortOrder : 0,
    active: body.active !== false,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('mgmt_departments').insert(row).select().single();
  if (error) {
    if (error.code === '23505') return fail('รหัสแผนกนี้มีอยู่แล้ว', 409);
    return fail(error.message, 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'mgmt_department', entityId: data.code, after: data, request: req });
  return ok(data, 201);
});
