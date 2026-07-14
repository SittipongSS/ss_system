import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  canReviewSalesForecast,
  canViewSalesPlanning,
  applyDealScope,
  forecastAmount,
  inSalesViewScope,
  monthKey,
  salesPlanningViewScope,
} from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const REVIEW_STATUSES = new Set(['draft', 'approved', 'rejected']);

function scopedTeam(user, requestedTeam) {
  if (salesPlanningViewScope(user.role) === 'team') return user.team || null;
  return requestedTeam || user.team || null;
}

function applyTeamFilter(query, team) {
  return team ? query.eq('team', team) : query.is('team', null);
}

async function monthSummary(supabase, user, reviewMonth, team) {
  let query = supabase
    .from('sales_deals')
    .select('id, projectValue, probability, stage, team, ownerId, ownerName, metadata')
    .eq('forecastMonth', reviewMonth)
    .neq('stage', 'lost');
  query = applyTeamFilter(query, team);
  query = applyDealScope(query, user);

  const { data, error } = await query;
  if (error) throw error;
  const deals = (data || []).filter((deal) => inSalesViewScope(user, deal));
  return {
    dealCount: deals.length,
    summaryAmount: deals.reduce((sum, deal) => sum + forecastAmount(deal), 0),
  };
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const reviewMonth = monthKey(params.get('month'));
  if (!reviewMonth) return badRequest('month is required');

  const team = scopedTeam(user, params.get('team'));
  const reviewQuery = applyTeamFilter(
    supabase
    .from('sales_forecast_reviews')
    .select('*')
      .eq('reviewMonth', reviewMonth),
    team,
  );
  const { data, error } = await reviewQuery.maybeSingle();
  if (error) return fail(error.message, 500);

  try {
    const summary = await monthSummary(supabase, user, reviewMonth, team);
    return ok(data || {
      id: null,
      reviewMonth,
      team,
      status: 'draft',
      notes: '',
      reviewedByName: null,
      reviewedAt: null,
      ...summary,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canReviewSalesForecast(user)) return forbidden();

  const body = await req.json();
  const reviewMonth = monthKey(body.reviewMonth || body.month);
  if (!reviewMonth) return badRequest('reviewMonth is required');

  const status = REVIEW_STATUSES.has(body.status) ? body.status : 'draft';
  const team = scopedTeam(user, body.team);
  const now = new Date().toISOString();

  let summary;
  try {
    summary = await monthSummary(supabase, user, reviewMonth, team);
  } catch (e) {
    return fail(e.message, 500);
  }

  const beforeQuery = applyTeamFilter(
    supabase
    .from('sales_forecast_reviews')
    .select('*')
      .eq('reviewMonth', reviewMonth),
    team,
  );
  const { data: before } = await beforeQuery.maybeSingle();

  const row = {
    reviewMonth,
    team,
    status,
    summaryAmount: summary.summaryAmount,
    dealCount: summary.dealCount,
    notes: body.notes || null,
    reviewedBy: status === 'draft' ? null : user.id || null,
    reviewedByName: status === 'draft' ? null : user.name || null,
    reviewedAt: status === 'draft' ? null : now,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    updatedAt: now,
  };

  const result = before
    ? await supabase.from('sales_forecast_reviews').update(row).eq('id', before.id).select().single()
    : await supabase.from('sales_forecast_reviews').insert({ ...row, id: genId('FCR'), createdBy: user.id || null }).select().single();
  if (result.error) return fail(result.error.message, 500);

  await recordAudit({
    user,
    action: before ? 'update' : 'create',
    entityType: 'sales_forecast_review',
    entityId: result.data.id,
    before: before || undefined,
    after: result.data,
    summary: `${status} sales forecast review ${reviewMonth}${team ? ` ${team}` : ''}`.trim(),
    request: req,
  });

  // ไม่แจ้ง Chat สำหรับ forecast review — ผู้ใช้ตัดออก (2026-07-15) ดูในระบบพอ

  return ok(result.data, before ? 200 : 201);
});
