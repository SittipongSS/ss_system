import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  applyDealScope,
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { loadForecastDriftMap } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

const selectDeal = `
  *,
  customer:customers(id, name, arCode)
`;

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const stage = params.get('stage');
  const month = monthKey(params.get('month'));

  let query = supabase
    .from('sales_deals')
    .select(selectDeal)
    .order('updatedAt', { ascending: false });
  query = applyDealScope(query, user);
  if (stage && stage !== 'all') query = query.eq('stage', normalizeStage(stage));
  if (month) query = query.eq('forecastMonth', month);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Per-row edit flag so the UI hides actions that would 403 (AE sees the whole
  // team's pipeline but may only act on its own deals).
  const editor = canEditSalesPlanning(user);
  const driftMap = await loadForecastDriftMap(supabase, data || []).catch(() => new Map());
  const rows = (data || []).filter((d) => inSalesViewScope(user, d)).map((d) => ({
    ...d,
    canEdit: editor && inSalesEditScope(user, d),
    forecastDrift: driftMap.get(d.id) || null,
  }));
  return ok(rows);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  if (!body.title?.trim()) return badRequest('ต้องระบุชื่อโครงการ');

  let customerName = body.customerName || null;
  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', body.customerId)
      .maybeSingle();
    customerName = customer?.name || customerName;
  }

  const stage = normalizeStage(body.stage);
  if (stage === 'won' && !body.depositPaid) return badRequest('Won ต้องยืนยันว่าได้รับมัดจำแล้ว');
  const row = {
    id: genId('DEAL'),
    customerId: body.customerId || null,
    customerName,
    title: body.title.trim(),
    stage,
    projectValue: toMoney(body.projectValue),
    probability: toProbability(body.probability, stage),
    forecastMonth: monthKey(body.forecastMonth || body.expectedCloseDate),
    expectedCloseDate: body.expectedCloseDate || null,
    depositPaid: !!body.depositPaid,
    confirmedAt: stage === 'won' ? (body.confirmedAt || new Date().toISOString()) : null,
    lostReason: stage === 'lost' ? (body.lostReason || null) : null,
    notes: body.notes || null,
    ownerId: body.ownerId || user.id || null,
    ownerName: body.ownerName || user.name || null,
    team: body.team || user.team || null,
    metadata: body.metadata || {},
  };

  // The creator may only mint deals within its own edit scope: an AE cannot
  // hand ownership to another user, and team-scoped roles cannot create for
  // another team. Superusers (scope 'all') are unrestricted.
  if (!inSalesEditScope(user, row)) return forbidden();

  const { data, error } = await supabase.from('sales_deals').insert(row).select(selectDeal).single();
  if (error) return fail(error.message, 500);

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: data.id,
    fromStage: null,
    toStage: data.stage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });
  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'),
    dealId: data.id,
    forecastMonth: data.forecastMonth || monthKey(new Date().toISOString()),
    forecastAmount: forecastAmount(data),
    probability: data.probability,
    source: 'sales',
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  return ok(data, 201);
});
