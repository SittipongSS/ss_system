import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { applyDealScope, canViewSalesPlanning, forecastAmount, monthKey, salesPlanningViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const month = monthKey(new URL(req.url).searchParams.get('month')) || monthKey(new Date().toISOString());

  let dealsQuery = supabase.from('sales_deals').select('*').eq('forecastMonth', month);
  dealsQuery = applyDealScope(dealsQuery, user);
  const { data: deals, error: dealsError } = await dealsQuery;
  if (dealsError) return fail(dealsError.message, 500);

  let targetsQuery = supabase.from('sales_targets').select('*').eq('targetMonth', month);
  if (salesPlanningViewScope(user.role) === 'team') targetsQuery = targetsQuery.eq('team', user.team ?? null);
  const { data: targets, error: targetsError } = await targetsQuery;
  if (targetsError) return fail(targetsError.message, 500);

  const openDeals = (deals || []).filter((d) => !['won', 'in_project', 'lost'].includes(d.stage));
  const wonDeals = (deals || []).filter((d) => ['won', 'in_project'].includes(d.stage));
  const targetAmount = (targets || []).reduce((sum, t) => sum + Number(t.targetAmount || 0), 0);
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);

  const byStage = {};
  for (const d of deals || []) {
    const bucket = byStage[d.stage] || { stage: d.stage, count: 0, value: 0, weighted: 0 };
    bucket.count += 1;
    bucket.value += Number(d.projectValue || 0);
    bucket.weighted += forecastAmount(d);
    byStage[d.stage] = bucket;
  }

  const isWon = (d) => ['won', 'in_project'].includes(d.stage);
  const isOpen = (d) => !['won', 'in_project', 'lost'].includes(d.stage);

  // Per-SA breakdown: target (person-level rows) vs won vs weighted forecast.
  // Team-level target rows (ownerId null) are aggregated in byTeam, not here.
  const ownerMap = {};
  const ownerBucket = (id, name, team) => {
    const key = id || 'unassigned';
    if (!ownerMap[key]) {
      ownerMap[key] = { ownerId: id || null, ownerName: name || 'ไม่ระบุ', team: team || null, target: 0, won: 0, weighted: 0, openCount: 0, wonCount: 0 };
    }
    return ownerMap[key];
  };
  for (const t of targets || []) {
    if (!t.ownerId) continue;
    ownerBucket(t.ownerId, t.ownerName, t.team).target += Number(t.targetAmount || 0);
  }
  for (const d of deals || []) {
    const b = ownerBucket(d.ownerId, d.ownerName, d.team);
    if (isWon(d)) { b.won += Number(d.projectValue || 0); b.wonCount += 1; }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; }
  }
  const byOwner = Object.values(ownerMap)
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => b.target - a.target || b.won - a.won);

  // Per-team breakdown: sums ALL target rows for the team (team-level + per-SA).
  // Assumes a team uses EITHER a team-level target OR per-SA targets, not both.
  const teamMap = {};
  const teamBucket = (team) => {
    const key = team || 'ไม่ระบุ';
    if (!teamMap[key]) teamMap[key] = { team: team || null, target: 0, won: 0, weighted: 0, openCount: 0, wonCount: 0 };
    return teamMap[key];
  };
  for (const t of targets || []) teamBucket(t.team).target += Number(t.targetAmount || 0);
  for (const d of deals || []) {
    const b = teamBucket(d.team);
    if (isWon(d)) { b.won += Number(d.projectValue || 0); b.wonCount += 1; }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; }
  }
  const byTeam = Object.values(teamMap)
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => b.target - a.target);

  return ok({
    month,
    totals: {
      deals: deals?.length || 0,
      openDeals: openDeals.length,
      targetAmount,
      pipelineValue,
      weightedForecast,
      wonValue,
      targetGap: targetAmount - wonValue,
    },
    byStage: Object.values(byStage),
    byOwner,
    byTeam,
    targets: targets || [],
  });
});
