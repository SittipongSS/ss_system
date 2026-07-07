import { genId } from '@/lib/id';
import { monthKey, toMoney } from '@/lib/salesPlanning';
import { insertWinSideEffects, markWon, winStageForProject } from '@/lib/salesPlanningWin';

const CLOSED_STAGES = ['won', 'in_project', 'lost'];
const lc = (v) => String(v || '').trim().toLowerCase();

// Distance (in months) between two 'YYYY-MM' strings, or Infinity if unknown.
function monthDistance(a, b) {
  const ma = monthKey(a);
  const mb = monthKey(b);
  if (!ma || !mb) return Infinity;
  const [ya, mo] = ma.split('-').map(Number);
  const [yb, mn] = mb.split('-').map(Number);
  return Math.abs((ya * 12 + mo) - (yb * 12 + mn));
}

// Resolve which OPEN sales deal a PO fulfils, using the real Forecast↔Sales
// mapping (sales_deal_forecast_lines) instead of the old fgCode/month heuristic.
// Returns { deal, links } where links = ALL junction rows of that deal (needed
// for coverage/split), or null when no mapped deal overlaps the PO.
export async function resolveMappedDealForPo(supabase, customerId, poFgCodes, poMonth) {
  const wanted = new Set([...poFgCodes].map(lc).filter(Boolean));
  if (!wanted.size) return null;

  const { data: allLinks, error: linkErr } = await supabase
    .from('sales_deal_forecast_lines')
    .select('*')
    .eq('customerId', customerId);
  if (linkErr) throw linkErr;
  if (!allLinks?.length) return null;

  // ดีลที่มี line อย่างน้อยหนึ่งตรง fgCode ของ PO
  const dealIds = [...new Set(allLinks.filter((l) => wanted.has(lc(l.fgCode))).map((l) => l.dealId))];
  if (!dealIds.length) return null;

  const { data: deals, error: dealErr } = await supabase
    .from('sales_deals')
    .select('*')
    .in('id', dealIds);
  if (dealErr) throw dealErr;

  const open = (deals || []).filter((d) => !d.projectId && !CLOSED_STAGES.includes(d.stage));
  if (!open.length) return null;

  const linksByDeal = new Map();
  for (const l of allLinks) {
    if (!linksByDeal.has(l.dealId)) linksByDeal.set(l.dealId, []);
    linksByDeal.get(l.dealId).push(l);
  }

  const scored = open.map((deal) => {
    const links = linksByDeal.get(deal.id) || [];
    const overlap = links.filter((l) => wanted.has(lc(l.fgCode))).length;
    return { deal, links, overlap };
  }).filter((r) => r.overlap > 0);
  if (!scored.length) return null;

  scored.sort((a, b) =>
    b.overlap - a.overlap ||
    monthDistance(a.deal.forecastMonth, poMonth) - monthDistance(b.deal.forecastMonth, poMonth) ||
    String(a.deal.createdAt || '').localeCompare(String(b.deal.createdAt || '')),
  );
  const best = scored[0];
  return { deal: best.deal, links: best.links };
}

// Compute how much of each mapped line the PO covers (by fgCode qty), first-come
// per link. Returns per-link { link, covered, remaining } + rollups.
function computeCoverage(links, poQtyByFg, priceOf) {
  const remainingByFg = new Map();
  for (const [fg, qty] of poQtyByFg.entries()) remainingByFg.set(lc(fg), Number(qty) || 0);

  const ordered = [...links].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));

  let coveredValue = 0;
  let remainingValue = 0;
  let anyCovered = false;
  let allCovered = true;
  const rows = ordered.map((link) => {
    const fg = lc(link.fgCode);
    const alloc = Number(link.qtyAllocated || 0);
    const avail = remainingByFg.get(fg) || 0;
    const covered = Math.max(0, Math.min(alloc, avail));
    remainingByFg.set(fg, avail - covered);
    const remaining = alloc - covered;
    const price = Number(priceOf(link.fgCode) ?? 0);
    coveredValue += covered * (Number.isFinite(price) ? price : 0);
    remainingValue += remaining * (Number.isFinite(price) ? price : 0);
    if (covered > 0) anyCovered = true;
    if (remaining > 0) allCovered = false;
    return { link, covered, remaining };
  });

  return { rows, coveredValue, remainingValue, anyCovered, allCovered };
}

// Settle an open forecast-mapped deal against an incoming PO:
//  - full coverage  → mark the whole deal Won/in_project
//  - partial        → SPLIT: child deal (covered) = Won, parent keeps the rest open
// Returns the WON deal (child on split, or the deal itself), or null if the PO
// does not actually cover any allocated qty.
export async function settleMappedDealWithPo({ supabase, user, deal, links, poQtyByFg, priceOf, project, po, now, request }) {
  const wonMeta = {
    sahamitPoId: po.id,
    poNumber: po.poNumber,
    poReceivedDate: po.receivedDate || null,
    poDueDate: po.dueDate || null,
    projectCode: project.code,
    quoteRef: po.quoteRef || null,
    wonMatchedBy: 'fc-mapping',
  };
  const wonNow = po.receivedDate ? `${po.receivedDate}T00:00:00.000Z` : now;

  const cov = computeCoverage(links, poQtyByFg, priceOf);
  if (!cov.anyCovered) return null;

  // เต็ม → ปิดทั้งดีล ไม่ต้อง split
  if (cov.allCovered) {
    return markWon({
      supabase, user, deal, source: 'sahamit-po', now: wonNow,
      projectValue: cov.coveredValue, projectId: project.id,
      metadata: wonMeta, request,
      auditSummary: `mark Sahamit forecast deal won from PO ${po.poNumber}`,
    });
  }

  // บางส่วน → สร้างดีลลูก (ส่วนที่ได้ PO) = Won, ดีลแม่เก็บส่วนที่เหลือ open ต่อ
  const coveredFg = [...new Set(cov.rows.filter((r) => r.covered > 0).map((r) => r.link.fgCode))].sort();
  const childId = genId('DEAL');
  const childRow = {
    id: childId,
    customerId: deal.customerId,
    customerName: deal.customerName,
    title: `${deal.title} (ส่งมอบ ${po.poNumber})`,
    stage: winStageForProject(project.id),
    projectValue: toMoney(cov.coveredValue),
    probability: 100,
    forecastMonth: deal.forecastMonth,
    expectedCloseDate: deal.expectedCloseDate,
    depositPaid: true,
    confirmedAt: wonNow,
    notes: deal.notes,
    ownerId: deal.ownerId,
    ownerName: deal.ownerName,
    team: deal.team,
    projectId: project.id,
    parentDealId: deal.id,
    metadata: {
      ...(deal.metadata || {}),
      ...wonMeta,
      source: 'sahamit-forecast',
      splitFromDealId: deal.id,
      fgCodes: coveredFg,
      wonSource: 'sahamit-po',
      wonAt: wonNow,
    },
  };
  const { data: child, error: childErr } = await supabase.from('sales_deals').insert(childRow).select().single();
  if (childErr) throw childErr;

  // ย้าย allocation: line ที่ covered เต็ม → ดีลลูก; line ที่ covered บางส่วน →
  // แยกเป็นสองแถว (ลูก = covered, แม่ = remaining).
  for (const r of cov.rows) {
    if (r.covered <= 0) continue;
    if (r.remaining <= 0) {
      await supabase.from('sales_deal_forecast_lines')
        .update({ dealId: child.id, qtyAllocated: r.covered })
        .eq('id', r.link.id);
    } else {
      await supabase.from('sales_deal_forecast_lines')
        .update({ qtyAllocated: r.remaining })
        .eq('id', r.link.id);
      await supabase.from('sales_deal_forecast_lines').insert({
        id: genId('SDF'),
        dealId: child.id,
        forecastLineId: r.link.forecastLineId,
        customerId: r.link.customerId,
        fgCode: r.link.fgCode,
        demandMonth: r.link.demandMonth,
        qtyAllocated: r.covered,
        createdById: user.id || null,
        createdByName: user.name || null,
      });
    }
  }

  // ดีลแม่: หักมูลค่าที่ split ออก, เก็บ open ต่อ (stage เดิม)
  const childIds = [...(Array.isArray(deal.metadata?.splitChildDealIds) ? deal.metadata.splitChildDealIds : []), child.id];
  await supabase.from('sales_deals').update({
    projectValue: toMoney(cov.remainingValue),
    metadata: { ...(deal.metadata || {}), splitChildDealIds: childIds },
    updatedAt: now,
  }).eq('id', deal.id);

  await insertWinSideEffects({
    supabase, user, before: null, deal: child, source: 'sahamit-po',
    request, auditAction: 'create',
    auditSummary: `split Sahamit forecast deal ${deal.id} → won child from PO ${po.poNumber}`,
  });

  return child;
}
