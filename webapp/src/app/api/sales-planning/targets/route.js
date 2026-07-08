import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { isSuperuser } from '@/lib/permissions';
import { canEditSalesTarget, canViewSalesPlanning, normalizeTargetPeriod, salesPlanningViewScope, toMoney, yearKey } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const periodTypeParam = params.get('periodType');
  const periodType = periodTypeParam === 'year' || periodTypeParam === 'month' ? periodTypeParam : null;
  // Accept `period` (new) and fall back to legacy `month`.
  const normalized = normalizeTargetPeriod(params.get('period') || params.get('month'), periodType || 'month');
  // `year` loads a whole year in one shot (12 monthly rows + the yearly anchor)
  // for the grid — both keys start with the 4-digit year ('2026', '2026-07').
  const year = yearKey(params.get('year'));

  let query = supabase.from('sales_targets').select('*').order('period', { ascending: false });
  // Scope เหมือน deals: team-lead เห็นทีมตัวเอง + SA รวม (team null) เป็น context อ่านอย่างเดียว
  // (แก้ได้เฉพาะ superuser — บังคับตอน write); AE เห็นเฉพาะเป้ารายบุคคลของตัวเอง;
  // นอกนั้นไม่เห็น — กันเป้าคนอื่น/ทีมอื่นรั่วเมื่อยิง API ตรง.
  const scope = salesPlanningViewScope(user.role);
  if (scope === 'team') query = query.or(`team.eq.${user.team ?? ''},team.is.null`);
  else if (scope === 'own') query = query.eq('ownerId', user.id ?? '');
  else if (scope !== 'all') query = query.eq('id', '__no_scope__');
  if (year) {
    query = query.like('period', `${year}%`);
  } else {
    if (periodType) query = query.eq('periodType', periodType);
    if (normalized) query = query.eq('period', normalized.period);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const body = await req.json();
  const normalized = normalizeTargetPeriod(body.period || body.targetMonth, body.periodType || 'month');
  if (!normalized) return badRequest('ต้องระบุช่วงเวลาเป้าหมาย');
  const { period, periodType } = normalized;

  const isSuper = isSuperuser(user.role);
  // SA-wide targets (team null) are superuser-only; other roles are locked to
  // their own team and cannot set a company-wide or cross-team target.
  const team = isSuper ? (body.team || null) : (user.team || null);
  if (!team && !isSuper) return badRequest('ต้องระบุทีม');
  if (body.ownerId && !team) return badRequest('เป้ารายบุคคลต้องมีทีม');

  const row = {
    id: genId('TGT'),
    period,
    periodType,
    targetMonth: periodType === 'month' ? period : null,
    team,
    ownerId: body.ownerId || null,
    ownerName: body.ownerId ? (body.ownerName || null) : null,
    targetAmount: toMoney(body.targetAmount),
    notes: body.notes || null,
    createdBy: user.id || null,
  };

  const { data, error } = await supabase.from('sales_targets').insert(row).select().single();
  if (error) return fail(error.code === '23505' ? 'มี target ช่วงเวลา/ทีม/เจ้าของนี้แล้ว' : error.message, error.code === '23505' ? 409 : 500);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_target',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales target ${data.period} ${data.team || 'SA รวม'}`.trim(),
    request: req,
  });
  return ok(data, 201);
});
