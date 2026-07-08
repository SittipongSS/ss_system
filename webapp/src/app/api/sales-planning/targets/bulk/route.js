import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { isSuperuser } from '@/lib/permissions';
import { canEditSalesTarget, normalizeTargetPeriod, toMoney } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/targets/bulk — upsert a batch of targets for one org
// node (used by the "เฉลี่ยลง 12 เดือน" action: distribute a yearly figure into
// its twelve monthly rows). Each item is matched on (period, periodType, team,
// ownerId); existing rows are updated in place, new ones inserted.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return badRequest('ไม่มีรายการเป้าหมาย');
  if (items.length > 24) return badRequest('รายการมากเกินไป');

  const isSuper = isSuperuser(user.role);
  const results = [];

  for (const item of items) {
    const normalized = normalizeTargetPeriod(item.period || item.targetMonth, item.periodType || 'month');
    if (!normalized) return badRequest('ต้องระบุช่วงเวลาเป้าหมาย');
    const { period, periodType } = normalized;

    const team = isSuper ? (item.team || null) : (user.team || null);
    if (!team && !isSuper) return badRequest('ต้องระบุทีม');
    if (item.ownerId && !team) return badRequest('เป้ารายบุคคลต้องมีทีม');
    // Team-scoped editors cannot touch another team's rows.
    if (!isSuper && team !== (user.team || null)) return forbidden();

    const ownerId = item.ownerId || null;
    const targetAmount = toMoney(item.targetAmount);

    let find = supabase
      .from('sales_targets')
      .select('id')
      .eq('period', period)
      .eq('periodType', periodType);
    find = team == null ? find.is('team', null) : find.eq('team', team);
    find = ownerId == null ? find.is('ownerId', null) : find.eq('ownerId', ownerId);
    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) return fail(findErr.message, 500);

    if (existing) {
      const { data, error } = await supabase
        .from('sales_targets')
        .update({ targetAmount, updatedAt: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return fail(error.message, 500);
      results.push(data);
    } else {
      const row = {
        id: genId('TGT'),
        period,
        periodType,
        targetMonth: periodType === 'month' ? period : null,
        team,
        ownerId,
        ownerName: ownerId ? (item.ownerName || null) : null,
        targetAmount,
        notes: item.notes || null,
        createdBy: user.id || null,
      };
      const { data, error } = await supabase.from('sales_targets').insert(row).select().single();
      if (error) return fail(error.message, 500);
      results.push(data);
    }
  }

  const first = results[0];
  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_target',
    entityId: first?.id || 'bulk',
    after: { count: results.length, team: first?.team ?? null, ownerId: first?.ownerId ?? null },
    summary: `กระจายเป้า ${results.length} รายการ (${first?.team || 'SA รวม'}${first?.ownerName ? ` · ${first.ownerName}` : ''})`.trim(),
    request: req,
  });
  return ok(results, 201);
});
