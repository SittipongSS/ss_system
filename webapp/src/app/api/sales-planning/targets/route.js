import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { isSuperuser } from '@/lib/permissions';
import { canEditSalesTarget, canViewSalesPlanning, monthKey, salesPlanningViewScope, toMoney } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const month = monthKey(params.get('month'));

  let query = supabase.from('sales_targets').select('*').order('targetMonth', { ascending: false });
  if (salesPlanningViewScope(user.role) === 'team') query = query.eq('team', user.team ?? null);
  if (month) query = query.eq('targetMonth', month);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const body = await req.json();
  const targetMonth = monthKey(body.targetMonth);
  if (!targetMonth) return badRequest('ต้องระบุเดือนเป้าหมาย');

  // Non-superuser (senior_ae) may only set targets within their own team.
  const team = isSuperuser(user.role) ? (body.team || null) : (user.team || null);
  if (!team) return badRequest('ต้องระบุทีม');

  const row = {
    id: genId('TGT'),
    targetMonth,
    team,
    ownerId: body.ownerId || null,
    ownerName: body.ownerId ? (body.ownerName || null) : null,
    targetAmount: toMoney(body.targetAmount),
    notes: body.notes || null,
    createdBy: user.id || null,
  };

  const { data, error } = await supabase.from('sales_targets').insert(row).select().single();
  if (error) return fail(error.code === '23505' ? 'มี target เดือน/ทีม/เจ้าของนี้แล้ว' : error.message, error.code === '23505' ? 409 : 500);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_target',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales target ${data.targetMonth} ${data.team || ''}`.trim(),
    request: req,
  });
  return ok(data, 201);
});
