import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canAccessSahamit } from '@/lib/permissions';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { buildSahamitReverseRiskRows } from '@/lib/salesPlanningReverse';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  if (!canAccessSahamit(user.role, user.team)) {
    return ok({ enabled: false, rows: [], summary: { total: 0, risk: 0, dueThisMonth: 0 } });
  }

  const url = new URL(req.url);
  const leadTimeDays = Math.max(1, Number(url.searchParams.get('leadTimeDays')) || 90);
  const month = url.searchParams.get('month');

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, name')
    .eq('arCode', SAHAMIT_AR_CODE)
    .maybeSingle();
  if (customerError) return fail(customerError.message, 500);
  if (!customer) return ok({ enabled: true, customer: null, rows: [], summary: { total: 0, risk: 0, dueThisMonth: 0 } });

  const { data: rounds, error: roundError } = await supabase
    .from('sahamit_forecast_rounds')
    .select('*')
    .eq('customerId', customer.id);
  if (roundError) return fail(roundError.message, 500);

  const roundIds = (rounds || []).map((round) => round.id);
  let lines = [];
  if (roundIds.length) {
    const { data, error } = await supabase
      .from('sahamit_forecast_lines')
      .select('*')
      .in('roundId', roundIds);
    if (error) return fail(error.message, 500);
    lines = data || [];
  }

  const { data: hol } = await supabase.from('holidays').select('date');
  const holidays = new Set((hol || []).map((h) => h.date));
  const roundsWithLines = (rounds || []).map((round) => ({
    ...round,
    lines: lines.filter((line) => line.roundId === round.id),
  }));

  const allRows = buildSahamitReverseRiskRows(roundsWithLines, holidays, leadTimeDays);
  const rows = month ? allRows.filter((row) => row.requiredConfirmMonth === month || row.warehouseNeedMonth === month) : allRows;
  const summary = {
    total: rows.length,
    risk: rows.filter((row) => row.risk).length,
    dueThisMonth: rows.filter((row) => row.requiredConfirmMonth === month).length,
  };

  return ok({ enabled: true, customer, leadTimeDays, month: month || null, rows, summary });
});
