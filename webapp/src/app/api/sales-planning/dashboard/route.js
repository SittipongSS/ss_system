import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { applyDealScope, canViewSalesPlanning, forecastAmount, inSalesViewScope, monthKey, salesPlanningViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const month = monthKey(new URL(req.url).searchParams.get('month')) || monthKey(new Date().toISOString());

  let dealsQuery = supabase.from('sales_deals').select('*');
  dealsQuery = applyDealScope(dealsQuery, user);
  const { data: deals, error: dealsError } = await dealsQuery;
  if (dealsError) return fail(dealsError.message, 500);
  const visibleDeals = (deals || []).filter((d) => inSalesViewScope(user, d));

  let targetsQuery = supabase.from('sales_targets').select('*').eq('targetMonth', month);
  if (salesPlanningViewScope(user.role) === 'team') targetsQuery = targetsQuery.eq('team', user.team ?? null);
  const { data: targets, error: targetsError } = await targetsQuery;
  if (targetsError) return fail(targetsError.message, 500);

  const isWon = (d) => ['won', 'in_project'].includes(d.stage);
  const isOpen = (d) => !['won', 'in_project', 'lost'].includes(d.stage);
  // ยอดปิดจริง = wonValue (มูลค่าปิดจริงที่กรอกตอน Won); fallback projectValue สำหรับ
  // ดีลเก่าก่อน migration 0081. ค่าคาดการณ์ของดีล won = projectValue (ใช้คิด variance).
  const wonAmt = (d) => Number(d.wonValue ?? d.projectValue ?? 0);
  const forecastAmt = (d) => Number(d.projectValue ?? 0);
  const wonMonth = (d) => monthKey(d.confirmedAt) || monthKey(d.metadata?.poReceivedDate) || monthKey(d.forecastMonth);
  const openDeals = visibleDeals.filter((d) => isOpen(d) && monthKey(d.forecastMonth) === month);
  const wonDeals = visibleDeals.filter((d) => isWon(d) && wonMonth(d) === month);
  const lostDeals = visibleDeals.filter((d) => d.stage === 'lost' && monthKey(d.forecastMonth) === month);
  const monthDeals = [...openDeals, ...wonDeals, ...lostDeals];
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + wonAmt(d), 0);
  // variance = ผลต่างคาดการณ์ vs ปิดจริง ของดีลที่ Won (บวก = ปิดต่ำกว่าคาด)
  const wonForecastValue = wonDeals.reduce((sum, d) => sum + forecastAmt(d), 0);
  const wonVariance = wonForecastValue - wonValue;
  // "FC เต็ม" = ยอดรวมทั้งเดือน = ปิดจริง (Won) + ที่ยังเปิด (คาดการณ์) — ไม่รวมดีลที่แพ้.
  // "FC คงเหลือ" = ส่วนที่ยังต้องปิดต่อ = ดีลที่ยังเปิด (open pipeline) เท่านั้น.
  const fullForecast = pipelineValue + wonValue;
  const remainingForecast = pipelineValue;

  const byStage = {};
  for (const d of monthDeals) {
    const bucket = byStage[d.stage] || { stage: d.stage, count: 0, value: 0, weighted: 0 };
    bucket.count += 1;
    bucket.value += Number(d.projectValue || 0);
    bucket.weighted += forecastAmount(d);
    byStage[d.stage] = bucket;
  }

  // แถว "ผี": ไม่มีทั้งเป้า/won/คาดการณ์/จำนวนดีล — เกิดจาก target ค้างค่า 0
  // หรือถังที่ถูกสร้างโดยไม่มีข้อมูลจริง → ตัดทิ้งไม่ให้โผล่บนหน้า.
  const isEmptyBucket = (b) => !b.target && !b.won && !b.weighted && !b.openCount && !b.wonCount;

  // Per-SA breakdown: target (person-level rows) vs won vs weighted forecast.
  // Team-level target rows (ownerId null) are aggregated in byTeam, not here.
  const ownerMap = {};
  const normalizedOwnerName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const ownerBucket = (id, name, team) => {
    // Prefer name+team over raw ownerId so legacy targets/deals with stale user
    // ids do not render the same person twice on the overview.
    const cleanName = normalizedOwnerName(name);
    const key = cleanName ? `${team || 'no-team'}|${cleanName}` : (id || 'unassigned');
    if (!ownerMap[key]) {
      ownerMap[key] = { ownerId: id || null, ownerName: name || 'ไม่ระบุ', team: team || null, target: 0, won: 0, weighted: 0, openCount: 0, wonCount: 0 };
    } else {
      ownerMap[key].ownerId ||= id || null;
      ownerMap[key].ownerName = ownerMap[key].ownerName === 'ไม่ระบุ' && name ? name : ownerMap[key].ownerName;
      ownerMap[key].team ||= team || null;
    }
    return ownerMap[key];
  };
  for (const t of targets || []) {
    if (!t.ownerId) continue;
    ownerBucket(t.ownerId, t.ownerName, t.team).target += Number(t.targetAmount || 0);
  }
  for (const d of [...openDeals, ...wonDeals]) {
    const b = ownerBucket(d.ownerId, d.ownerName, d.team);
    if (isWon(d)) { b.won += wonAmt(d); b.wonCount += 1; }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; }
  }
  const byOwner = Object.values(ownerMap)
    .filter((b) => !isEmptyBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => b.target - a.target || b.won - a.won);

  // Per-team breakdown. เป้าต่อทีม = team-level (ownerId ว่าง) ถ้ามี, ไม่งั้นรวมราย SA
  // — กันบวกซ้ำเมื่อทีมมี target ทั้งสองแบบ (เดิมบวกรวมทั้งคู่ = เป้าเบิ้ล).
  const teamMap = {};
  const teamKey = (team) => team || 'ไม่ระบุ';
  const teamBucket = (team) => {
    const key = teamKey(team);
    if (!teamMap[key]) teamMap[key] = { team: team || null, target: 0, won: 0, weighted: 0, openCount: 0, wonCount: 0 };
    return teamMap[key];
  };
  const teamTargetParts = {};
  for (const t of targets || []) {
    const key = teamKey(t.team);
    teamBucket(t.team);
    if (!teamTargetParts[key]) teamTargetParts[key] = { level: 0, person: 0 };
    if (t.ownerId) teamTargetParts[key].person += Number(t.targetAmount || 0);
    else teamTargetParts[key].level += Number(t.targetAmount || 0);
  }
  for (const [key, parts] of Object.entries(teamTargetParts)) {
    teamMap[key].target = parts.level > 0 ? parts.level : parts.person;
  }
  for (const d of [...openDeals, ...wonDeals]) {
    const b = teamBucket(d.team);
    if (isWon(d)) { b.won += wonAmt(d); b.wonCount += 1; }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; }
  }
  const byTeam = Object.values(teamMap)
    .filter((b) => !isEmptyBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => b.target - a.target);

  // KPI เป้ารวม ใช้เป้าต่อทีมที่ dedup แล้ว (สอดคล้องกับ byTeam ไม่บวกซ้ำ)
  const targetAmount = byTeam.reduce((sum, b) => sum + Number(b.target || 0), 0);

  return ok({
    month,
    totals: {
      deals: monthDeals.length,
      openDeals: openDeals.length,
      targetAmount,
      pipelineValue,
      weightedForecast,
      wonValue,
      wonForecastValue,
      wonVariance,
      fullForecast,
      remainingForecast,
      targetGap: targetAmount - wonValue,
    },
    byStage: Object.values(byStage),
    byOwner,
    byTeam,
    targets: targets || [],
  });
});
