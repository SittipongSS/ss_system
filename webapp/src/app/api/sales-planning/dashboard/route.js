import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, forecastAmount, monthKey, teamRank } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const month = monthKey(new URL(req.url).searchParams.get('month')) || monthKey(new Date().toISOString());

  // ภาพรวมเป็นระดับ "ทั้งฝ่าย" — เปิดให้ทุก sales role เห็นทุกทีม (นโยบาย: overview
  // โปร่งใสทั้งบริษัท). การจำกัด scope ตามทีม/เจ้าของ ยังบังคับที่หน้า pipeline
  // (deals) และหน้าวางเป้า (targets) ตามเดิม — เฉพาะภาพรวมนี้ที่เห็นครบ.
  const { data: deals, error: dealsError } = await supabase.from('sales_deals').select('*');
  if (dealsError) return fail(dealsError.message, 500);
  const visibleDeals = deals || [];

  const { data: targets, error: targetsError } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('targetMonth', month);
  if (targetsError) return fail(targetsError.message, 500);

  const isWon = (d) => ['won', 'in_project'].includes(d.stage);
  const isOpen = (d) => !['won', 'in_project', 'lost'].includes(d.stage);
  // ยอดปิดจริง = wonValue (มูลค่าปิดจริงที่กรอกตอน Won); fallback projectValue สำหรับ
  // ดีลเก่าก่อน migration 0081. ค่าคาดการณ์ของดีล won = projectValue (ใช้คิด variance).
  const wonAmt = (d) => Number(d.wonValue ?? d.projectValue ?? 0);
  const forecastAmt = (d) => Number(d.projectValue ?? 0);
  // เดือนที่นับยอด Won: ใช้เดือนที่ผู้ใช้เลือกตอนกด Won ก่อน (metadata.wonMonth),
  // ไม่งั้นเดือนของ confirmedAt / วันรับ PO / forecastMonth ตามลำดับ (ดีลเก่า).
  const wonMonth = (d) => monthKey(d.metadata?.wonMonth) || monthKey(d.confirmedAt) || monthKey(d.metadata?.poReceivedDate) || monthKey(d.forecastMonth);
  const openDeals = visibleDeals.filter((d) => isOpen(d) && monthKey(d.forecastMonth) === month);
  const wonDeals = visibleDeals.filter((d) => isWon(d) && wonMonth(d) === month);
  const lostDeals = visibleDeals.filter((d) => d.stage === 'lost' && monthKey(d.forecastMonth) === month);
  // ดีลที่ปิด Won แล้ว แต่ "เดือนพยากรณ์" (FC) = เดือนนี้ — นับ "มูลค่าคาดการณ์" ของมัน
  // เข้า FC Total ของเดือนนี้ (วัดความแม่นการพยากรณ์). ยอดปิดจริง (AT) ของมันไปนับที่
  // เดือนที่ปิด (wonMonth) แยกต่างหาก. เดือนตรงกัน = นับทั้ง FC (ที่นี่) และ AT (ใน wonDeals).
  const wonForecastDeals = visibleDeals.filter((d) => isWon(d) && monthKey(d.forecastMonth) === month);
  const wonForecastFc = wonForecastDeals.reduce((sum, d) => sum + forecastAmt(d), 0);
  const monthDeals = [...openDeals, ...wonDeals, ...lostDeals];
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + wonAmt(d), 0);
  // variance = ผลต่างคาดการณ์ vs ปิดจริง ของดีลที่ Won (บวก = ปิดต่ำกว่าคาด)
  const wonForecastValue = wonDeals.reduce((sum, d) => sum + forecastAmt(d), 0);
  const wonVariance = wonForecastValue - wonValue;
  // มูลค่าคาดการณ์ของดีลที่ "แพ้" ในเดือนนี้ — ใช้คิด FC คงเหลือ = FC Total − AT − Lost
  const lostForecast = lostDeals.reduce((sum, d) => sum + forecastAmt(d), 0);
  // "FC เต็ม" = ยอดคาดการณ์ทั้งหมดของ "เดือนพยากรณ์" นี้ = ยังเปิด + ปิดได้(Won) + แพ้(Lost)
  //   ทุกก้อนคิดที่มูลค่า "คาดการณ์" (projectValue) — วัดความแม่นเทียบ AT ที่เก็บได้จริง.
  //   ดีลที่ Won ใช้ wonForecastFc (คาดการณ์ ณ เดือน FC นี้) ไม่ใช่ยอดปิดจริง (ที่ไปนับเดือน AT).
  // "FC คงเหลือ" = ส่วนที่ยังต้องปิดต่อ = ดีลที่ยังเปิด (open pipeline) เท่านั้น.
  const fullForecast = pipelineValue + wonForecastFc + lostForecast;
  const remainingForecast = pipelineValue;

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

  // แถว "ผี": ไม่มีทั้งเป้า/won/คาดการณ์/จำนวนดีล — เกิดจาก target ค้างค่า 0
  // หรือถังที่ถูกสร้างโดยไม่มีข้อมูลจริง → ตัดทิ้งไม่ให้โผล่บนหน้า.
  const isEmptyBucket = (b) => !b.target && !b.won && !b.weighted && !b.lost && !b.openCount && !b.wonCount && !b.wonForecast;

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
      ownerMap[key] = { ownerId: id || null, ownerName: name || 'ไม่ระบุ', team: team || null, target: 0, won: 0, weighted: 0, lost: 0, wonForecast: 0, openCount: 0, wonCount: 0, fc: { 20: 0, 50: 0, 80: 0, 100: 0 } };
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
    if (isWon(d)) { b.won += wonAmt(d); b.wonCount += 1; }
    else if (d.stage === 'lost') { b.lost += forecastAmt(d); }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; b.fc[snapFc(d.probability)] += forecastAmount(d); }
  }
  // มูลค่าคาดการณ์ของดีลที่ Won แล้ว แต่ FC = เดือนนี้ (แยกจาก AT ที่ไปนับเดือนที่ปิด)
  for (const d of wonForecastDeals) {
    ownerBucket(d.ownerId, d.ownerName, d.team).wonForecast += forecastAmt(d);
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
    if (!teamMap[key]) teamMap[key] = { team: team || null, target: 0, won: 0, weighted: 0, lost: 0, wonForecast: 0, openCount: 0, wonCount: 0, fc: { 20: 0, 50: 0, 80: 0, 100: 0 } };
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
    if (isWon(d)) { b.won += wonAmt(d); b.wonCount += 1; }
    else if (d.stage === 'lost') { b.lost += forecastAmt(d); }
    else if (isOpen(d)) { b.weighted += forecastAmount(d); b.openCount += 1; b.fc[snapFc(d.probability)] += forecastAmount(d); }
  }
  for (const d of wonForecastDeals) {
    teamBucket(d.team).wonForecast += forecastAmt(d);
  }
  const byTeam = Object.values(teamMap)
    .filter((b) => b.team) // ตัดถัง null (SA รวม / ดีลไม่ระบุทีม) ออกจากตารางทีม
    .filter((b) => !isEmptyBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => teamRank(a.team) - teamRank(b.team) || b.target - a.target);

  // KPI เป้ารวม (ภาพรวมทั้งฝ่าย): ใช้เป้า SA รวมถ้าตั้งไว้ (ครอบทุกทีม) ไม่งั้นผลรวมรายทีม.
  const teamTargetSum = byTeam.reduce((sum, b) => sum + Number(b.target || 0), 0);
  const targetAmount = saWideTarget > 0 ? saWideTarget : teamTargetSum;

  return ok({
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
      wonForecastFc,
      wonVariance,
      lostForecast,
      fullForecast,
      remainingForecast,
      targetGap: targetAmount - wonValue,
    },
    byStage: Object.values(byStage),
    byForecast,
    byOwner,
    byTeam,
    targets: targets || [],
  });
});
