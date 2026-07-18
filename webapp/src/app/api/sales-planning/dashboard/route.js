import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { DEAL_TYPES, canViewSalesPlanning, dealTypeOf, forecastAmount, monthKey, teamRank } from '@/lib/salesPlanning';
import { cachedJson } from '@/lib/serverCache';
import { forecastAccuracyRollup, isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf } from '@/lib/sales/dashboardMetrics';

export const dynamic = 'force-dynamic';

// ภาพรวมเป็นข้อมูลระดับ "ทั้งฝ่าย" เหมือนกันทุกผู้ใช้ (ไม่ scope ตามทีม/คน) → cache ได้เต็มที่
// endpoint นี้เคยกิน Active CPU อันดับ 1 ของระบบ (Vercel Observability 2026-07-17:
// 1.4K ครั้ง/12ชม. — โควตา Fluid CPU ฟรี 4 ชม./เดือนเต็มเพราะแบบนี้). ความสดช้าสุด
// 5 นาทีรับได้กับ KPI ภาพรวม — ใครเพิ่งกด Won แล้วรีเฟรชยังเห็นเลขเก่าไม่เกิน 5 นาที
const DASHBOARD_TTL_MS = 5 * 60 * 1000;

// เฉพาะคอลัมน์ที่ตัวรวมยอดแตะจริง — select('*') ลากทุกคอลัมน์ของทุกดีลมา parse ทิ้ง
// ทุกครั้งที่ cache หมดอายุ เปลือง CPU + origin transfer โดยไม่มีใครใช้
const DEAL_COLUMNS = 'stage, projectValue, probability, forecastMonth, wonValue, metadata, confirmedAt, dealType, ownerId, ownerName, team';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const sp = new URL(req.url).searchParams;
  // โหมด ?year=YYYY: หน้า /sa เปิดทีเดียวต้องการครบ 12 เดือน — เดิมยิง 12 request
  // แต่ละอันสแกน sales_deals ทั้งตาราง (= สแกน 12 รอบต่อการเปิดหนึ่งครั้ง). โหมดปี
  // สแกนดีลรอบเดียว + ดึงเป้าทุกเดือนรอบเดียว แล้ว aggregate 12 เดือนใน JS.
  const yearParam = sp.get('year');
  const year = /^\d{4}$/.test(yearParam || '') ? yearParam : null;
  try {
    if (year) {
      return ok(await cachedJson(`sales-dashboard:year:${year}`, DASHBOARD_TTL_MS, () => buildYearDashboards(supabase, year)));
    }
    const month = monthKey(sp.get('month')) || monthKey(new Date().toISOString());
    return ok(await cachedJson(`sales-dashboard:${month}`, DASHBOARD_TTL_MS, () => buildDashboard(supabase, month)));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// ภาพรวมเป็นระดับ "ทั้งฝ่าย" — เปิดให้ทุก sales role เห็นทุกทีม (นโยบาย: overview
// โปร่งใสทั้งบริษัท). การจำกัด scope ตามทีม/เจ้าของ ยังบังคับที่หน้า pipeline
// (deals) และหน้าวางเป้า (targets) ตามเดิม — เฉพาะภาพรวมนี้ที่เห็นครบ.
async function loadAllDeals(supabase) {
  const { data: deals, error } = await supabase.from('sales_deals').select(DEAL_COLUMNS);
  if (error) throw new Error(error.message);
  return deals || [];
}

async function buildDashboard(supabase, month) {
  const visibleDeals = await loadAllDeals(supabase);
  const { data: targets, error: targetsError } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('targetMonth', month);
  if (targetsError) throw new Error(targetsError.message);
  return aggregateMonth(visibleDeals, targets || [], month);
}

async function buildYearDashboards(supabase, year) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const visibleDeals = await loadAllDeals(supabase);
  const { data: targets, error: targetsError } = await supabase
    .from('sales_targets')
    .select('*')
    .in('targetMonth', months);
  if (targetsError) throw new Error(targetsError.message);
  // shape ต่อเดือนเหมือน response โหมด ?month= ทุกประการ — client ใช้โค้ดเดิมได้เลย
  return {
    year,
    months: months.map((m) => aggregateMonth(visibleDeals, (targets || []).filter((t) => t.targetMonth === m), m)),
  };
}

function aggregateMonth(visibleDeals, targets, month) {

  // กติกา Won/open/ยอด/เดือน — ใช้ชุดกลางร่วมกับ drill-down modal (lib/sales/dashboardMetrics)
  const isWon = isWonDeal;
  const isOpen = isOpenDeal;
  // Actual อ่านผ่าน cache wonValue เฉพาะเมื่อ DB ยืนยันว่า cache มาจาก Approved SO.
  // projectValue ยังคงเป็นค่าคาดการณ์ของดีลและใช้คิด variance เท่านั้น.
  const wonAmt = wonAmountOf;
  const forecastAmt = (d) => Number(d.projectValue ?? 0);
  const wonMonth = wonMonthOf;
  const openDeals = visibleDeals.filter((d) => isOpen(d) && monthKey(d.forecastMonth) === month);
  const wonDeals = visibleDeals.filter((d) => isWon(d) && wonMonth(d) === month);
  const lostDeals = visibleDeals.filter((d) => d.stage === 'lost' && monthKey(d.forecastMonth) === month);
  const monthDeals = [...openDeals, ...wonDeals, ...lostDeals];
  const accuracy = forecastAccuracyRollup(openDeals, wonDeals, lostDeals);
  const pipelineValue = accuracy.remainingForecast;
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);
  const wonValue = accuracy.wonValue;
  // variance = ผลต่างคาดการณ์ vs ปิดจริง ของดีลที่ Won (บวก = ปิดต่ำกว่าคาด)
  const wonForecastValue = accuracy.wonForecastValue;
  const wonVariance = wonForecastValue - wonValue;
  // มูลค่าคาดการณ์ของดีลที่ "แพ้" ในเดือนนี้ — ใช้คิด FC คงเหลือ = FC Total − AT − Lost
  const lostForecast = accuracy.lostForecast;
  // FC Total is the original forecast footprint for accuracy review: Open + Won + Lost.
  // Keep the frozen projectValue for resolved deals; never substitute Actual for their FC.
  // FC remaining is operational follow-up and therefore contains Open deals only.
  const fullForecast = accuracy.fullForecast;
  const remainingForecast = accuracy.remainingForecast;

  const byStage = {};
  for (const d of monthDeals) {
    const bucket = byStage[d.stage] || { stage: d.stage, count: 0, value: 0, weighted: 0 };
    bucket.count += 1;
    bucket.value += Number(d.projectValue || 0);
    bucket.weighted += forecastAmount(d);
    byStage[d.stage] = bucket;
  }

  // pipeline ของดีลที่ยังเปิด แยกตามระดับโอกาสปิด (FC% 20/50/80/100) — โชว์บนภาพรวม.
  // FC% เป็นข้อมูลจัดลำดับความน่าจะปิด ไม่ถ่วงมูลค่า (value = projectValue เต็ม).
  const FC_LEVELS = [20, 50, 80, 100];
  const snapFc = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) return 50;
    return FC_LEVELS.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), FC_LEVELS[0]);
  };
  const fcMap = {};
  for (const d of openDeals) {
    const k = snapFc(d.probability);
    const b = fcMap[k] || { level: k, count: 0, value: 0 };
    b.count += 1;
    b.value += Number(d.projectValue || 0);
    fcMap[k] = b;
  }
  const byForecast = FC_LEVELS.map((l) => fcMap[l] || { level: l, count: 0, value: 0 });

  // Per type: FC Total = Open + Won + Lost, Actual = Won actual,
  // FC remaining = Open only. Lost stays in FC Total so forecast misses remain visible.
  const typeMap = Object.fromEntries(DEAL_TYPES.map((t) => [t, { type: t, fcTotal: 0, actual: 0, fcRemaining: 0, openCount: 0, wonCount: 0, lostCount: 0 }]));
  for (const d of monthDeals) {
    const b = typeMap[dealTypeOf(d)];
    if (isWon(d)) { b.actual += wonAmt(d); b.fcTotal += forecastAmt(d); b.wonCount += 1; }
    else if (d.stage === 'lost') { b.fcTotal += forecastAmt(d); b.lostCount += 1; }
    else { b.fcRemaining += forecastAmt(d); b.fcTotal += forecastAmt(d); b.openCount += 1; }
  }
  const byType = DEAL_TYPES.map((t) => typeMap[t]);

  // แถว "ผี": ไม่มีทั้งเป้า/won/คาดการณ์/จำนวนดีล — เกิดจาก target ค้างค่า 0
  // หรือถังที่ถูกสร้างโดยไม่มีข้อมูลจริง → ตัดทิ้งไม่ให้โผล่บนหน้า.
  const isEmptyBucket = (b) => !b.target && !b.won && !b.weighted && !b.lost && !b.openCount && !b.wonCount;

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
      ownerMap[key] = { ownerId: id || null, ownerName: name || 'ไม่ระบุ', team: team || null, target: 0, won: 0, weighted: 0, fcTotal: 0, lost: 0, openCount: 0, wonCount: 0, fc: { 20: 0, 50: 0, 80: 0, 100: 0 } };
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
  for (const d of [...openDeals, ...wonDeals, ...lostDeals]) {
    const b = ownerBucket(d.ownerId, d.ownerName, d.team);
    if (isWon(d)) { b.won += wonAmt(d); b.fcTotal += forecastAmt(d); b.wonCount += 1; }
    else if (d.stage === 'lost') { b.lost += forecastAmt(d); b.fcTotal += forecastAmt(d); }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.fcTotal += forecastAmt(d); b.openCount += 1; b.fc[snapFc(d.probability)] += forecastAmount(d); }
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
    if (!teamMap[key]) teamMap[key] = { team: team || null, target: 0, won: 0, weighted: 0, fcTotal: 0, lost: 0, openCount: 0, wonCount: 0, fc: { 20: 0, 50: 0, 80: 0, 100: 0 } };
    return teamMap[key];
  };
  // เป้าระดับ SA (team=null) = "ยอดรวมบริษัท" คร่อมทุกทีม — แยกไว้ต่างหาก ไม่ใช่ทีมหนึ่ง
  // เพื่อไม่ให้ถูกบวกซ้ำกับเป้ารายทีมทั้งใน byTeam และ KPI เป้ารวม.
  let saWideTarget = 0;
  const teamTargetParts = {};
  for (const t of targets || []) {
    if (!t.team) { saWideTarget += Number(t.targetAmount || 0); continue; }
    const key = teamKey(t.team);
    teamBucket(t.team);
    if (!teamTargetParts[key]) teamTargetParts[key] = { level: 0, person: 0 };
    if (t.ownerId) teamTargetParts[key].person += Number(t.targetAmount || 0);
    else teamTargetParts[key].level += Number(t.targetAmount || 0);
  }
  for (const [key, parts] of Object.entries(teamTargetParts)) {
    teamMap[key].target = parts.level > 0 ? parts.level : parts.person;
  }
  for (const d of [...openDeals, ...wonDeals, ...lostDeals]) {
    const b = teamBucket(d.team);
    if (isWon(d)) { b.won += wonAmt(d); b.fcTotal += forecastAmt(d); b.wonCount += 1; }
    else if (d.stage === 'lost') { b.lost += forecastAmt(d); b.fcTotal += forecastAmt(d); }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.fcTotal += forecastAmt(d); b.openCount += 1; b.fc[snapFc(d.probability)] += forecastAmount(d); }
  }
  const byTeam = Object.values(teamMap)
    .filter((b) => b.team) // ตัดถัง null (SA รวม / ดีลไม่ระบุทีม) ออกจากตารางทีม
    .filter((b) => !isEmptyBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => teamRank(a.team) - teamRank(b.team) || b.target - a.target);

  // KPI เป้ารวม (ภาพรวมทั้งฝ่าย): ใช้เป้า SA รวมถ้าตั้งไว้ (ครอบทุกทีม) ไม่งั้นผลรวมรายทีม.
  const teamTargetSum = byTeam.reduce((sum, b) => sum + Number(b.target || 0), 0);
  const targetAmount = saWideTarget > 0 ? saWideTarget : teamTargetSum;

  return {
    month,
    totals: {
      deals: monthDeals.length,
      openDeals: openDeals.length,
      targetAmount,
      saTarget: saWideTarget,
      pipelineValue,
      weightedForecast,
      wonValue,
      wonForecastValue,
      wonVariance,
      lostForecast,
      fullForecast,
      remainingForecast,
      targetGap: targetAmount - wonValue,
    },
    byStage: Object.values(byStage),
    byForecast,
    byType,
    byOwner,
    byTeam,
    targets: targets || [],
  };
}
