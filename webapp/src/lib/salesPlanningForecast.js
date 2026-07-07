import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { monthKey, toMoney } from '@/lib/salesPlanning';
import { createWonDealStub, insertWinSideEffects, markWon, winStageForProject } from '@/lib/salesPlanningWin';

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

// List OPEN sales deals a PO could fulfil, using the real Forecast↔Sales mapping
// (sales_deal_forecast_lines). Returns scored candidates [{ deal, links, overlap }]
// sorted best-first (overlap → nearest month → oldest). Empty if none overlap.
// Excludes closed (won/in_project/lost) + already project-linked deals → ดีลที่
// settle ไปแล้วจะไม่โผล่ให้เลือกซ้ำ.
export async function listMappedDealCandidatesForPo(supabase, customerId, poFgCodes, poMonth) {
  const wanted = new Set([...poFgCodes].map(lc).filter(Boolean));
  if (!wanted.size) return [];

  const { data: allLinks, error: linkErr } = await supabase
    .from('sales_deal_forecast_lines')
    .select('*')
    .eq('customerId', customerId);
  if (linkErr) throw linkErr;
  if (!allLinks?.length) return [];

  const dealIds = [...new Set(allLinks.filter((l) => wanted.has(lc(l.fgCode))).map((l) => l.dealId))];
  if (!dealIds.length) return [];

  const { data: deals, error: dealErr } = await supabase
    .from('sales_deals')
    .select('*')
    .in('id', dealIds);
  if (dealErr) throw dealErr;

  const open = (deals || []).filter((d) => !d.projectId && !CLOSED_STAGES.includes(d.stage));
  if (!open.length) return [];

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

  scored.sort((a, b) =>
    b.overlap - a.overlap ||
    monthDistance(a.deal.forecastMonth, poMonth) - monthDistance(b.deal.forecastMonth, poMonth) ||
    String(a.deal.createdAt || '').localeCompare(String(b.deal.createdAt || '')),
  );
  return scored;
}

// Best single candidate (auto-match). Returns { deal, links } or null.
export async function resolveMappedDealForPo(supabase, customerId, poFgCodes, poMonth) {
  const scored = await listMappedDealCandidatesForPo(supabase, customerId, poFgCodes, poMonth);
  return scored.length ? { deal: scored[0].deal, links: scored[0].links } : null;
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

// ── Phase 3: FC drift ────────────────────────────────────────────────────
// ดีลถูก "freeze" ตัวเลขไว้ตั้งแต่ตอน map (Sales คุมเดือน/มูลค่าเอง) แต่ FC เป็น
// การคาดการณ์ — รอบ FC ใหม่อาจเปลี่ยน qty / เลื่อนเดือน / ตัดสินค้าออก. ฟังก์ชันนี้
// เทียบ "เส้น FC ต้นทางที่ดีล map ไว้" (line เดิม ไม่ใช่ qtyAllocated ที่อาจถูก split)
// กับ "รอบ FC ล่าสุด" แล้วคืนธงแนะนำ ให้ AE ตัดสินใจปรับเดือนเอง (ไม่ auto-update).

// คำนวณ drift ของหลายดีลพร้อมกัน (ใช้ query ชุดเดียว) → Map<dealId, drift|absent>.
export async function loadForecastDriftMap(supabase, deals) {
  const fcDeals = (deals || []).filter((d) => d.metadata?.source === 'sahamit-forecast' && !CLOSED_STAGES.includes(d.stage));
  if (!fcDeals.length) return new Map();
  const dealIds = fcDeals.map((d) => d.id);

  const { data: links, error: linkErr } = await supabase
    .from('sales_deal_forecast_lines').select('*').in('dealId', dealIds);
  if (linkErr) throw linkErr;
  if (!links?.length) return new Map();

  const lineIds = [...new Set(links.map((l) => l.forecastLineId))];
  const { data: mappedLines, error: mlErr } = await supabase
    .from('sahamit_forecast_lines').select('id, fgCode, month, qty, roundId').in('id', lineIds);
  if (mlErr) throw mlErr;
  const mappedById = new Map((mappedLines || []).map((l) => [l.id, l]));

  const customerIds = [...new Set(fcDeals.map((d) => d.customerId).filter(Boolean))];
  const { data: rounds, error: rErr } = await supabase
    .from('sahamit_forecast_rounds').select('id, roundNo, customerId').in('customerId', customerIds);
  if (rErr) throw rErr;
  const latestByCustomer = new Map();
  for (const r of rounds || []) {
    const cur = latestByCustomer.get(r.customerId);
    if (!cur || r.roundNo > cur.roundNo) latestByCustomer.set(r.customerId, r);
  }

  const latestRoundIds = [...latestByCustomer.values()].map((r) => r.id);
  const { data: latestLines } = latestRoundIds.length
    ? await supabase.from('sahamit_forecast_lines').select('fgCode, month, qty, customerId').in('roundId', latestRoundIds)
    : { data: [] };
  const snapByCustomer = new Map(); // customerId → Map(fgLower → Map(month→qty))
  for (const l of latestLines || []) {
    if (!snapByCustomer.has(l.customerId)) snapByCustomer.set(l.customerId, new Map());
    const snap = snapByCustomer.get(l.customerId);
    const fg = lc(l.fgCode);
    if (!snap.has(fg)) snap.set(fg, new Map());
    const mm = snap.get(fg);
    mm.set(l.month, (mm.get(l.month) || 0) + Number(l.qty || 0));
  }

  const linksByDeal = new Map();
  for (const l of links) {
    if (!linksByDeal.has(l.dealId)) linksByDeal.set(l.dealId, []);
    linksByDeal.get(l.dealId).push(l);
  }

  const result = new Map();
  for (const deal of fcDeals) {
    const dlinks = linksByDeal.get(deal.id) || [];
    if (!dlinks.length) continue;
    const latest = latestByCustomer.get(deal.customerId);
    if (!latest) continue;
    const snap = snapByCustomer.get(deal.customerId) || new Map();

    // รวมเส้นต้นทางเป็น (fgCode, month) → qty เดิม (line.qty ไม่ใช่ qtyAllocated)
    const orig = new Map();
    const sourceRoundIds = new Set();
    for (const link of dlinks) {
      const ml = mappedById.get(link.forecastLineId);
      if (!ml) continue;
      sourceRoundIds.add(ml.roundId);
      const key = `${lc(ml.fgCode)}||${ml.month}`;
      if (!orig.has(key)) orig.set(key, { fgCode: ml.fgCode, month: ml.month, qty: 0 });
      orig.get(key).qty += Number(ml.qty || 0);
    }

    // map จากรอบล่าสุดอยู่แล้ว → ไม่มี drift
    if (sourceRoundIds.size === 1 && sourceRoundIds.has(latest.id)) {
      result.set(deal.id, { hasDrift: false, latestRoundNo: latest.roundNo, items: [] });
      continue;
    }

    const items = [];
    for (const { fgCode, month, qty } of orig.values()) {
      const fgSnap = snap.get(lc(fgCode));
      if (!fgSnap || fgSnap.size === 0) { items.push({ fgCode, month, kind: 'dropped', fromQty: qty }); continue; }
      const latestQty = fgSnap.get(month) || 0;
      if (latestQty === 0) {
        items.push({ fgCode, month, kind: 'shifted', toMonths: [...fgSnap.keys()].sort() });
      } else if (latestQty !== qty) {
        items.push({ fgCode, month, kind: 'qtyChanged', fromQty: qty, toQty: latestQty });
      }
    }
    result.set(deal.id, { hasDrift: items.length > 0, latestRoundNo: latest.roundNo, items });
  }
  return result;
}

// drift ของดีลเดียว (ใช้ในหน้า detail).
export async function loadForecastDrift(supabase, deal) {
  if (!deal) return null;
  const map = await loadForecastDriftMap(supabase, [deal]);
  return map.get(deal.id) || null;
}

// Settle an open forecast-mapped deal against an incoming PO:
//  - full coverage  → mark the whole deal Won/in_project
//  - partial        → SPLIT: child deal (covered) = Won, parent keeps the rest open
// Returns the WON deal (child on split, or the deal itself), or null if the PO
// does not actually cover any allocated qty.
export async function settleMappedDealWithPo({ supabase, user, deal, links, poQtyByFg, priceOf, project = null, po, now, request }) {
  const projectId = project?.id || null;
  const wonMeta = {
    sahamitPoId: po.id,
    poNumber: po.poNumber,
    poReceivedDate: po.receivedDate || null,
    poDueDate: po.dueDate || null,
    projectCode: project?.code || null,
    quoteRef: po.quoteRef || null,
    wonMatchedBy: 'fc-mapping',
  };
  const wonNow = po.receivedDate ? `${po.receivedDate}T00:00:00.000Z` : now;

  const cov = computeCoverage(links, poQtyByFg, priceOf);
  if (!cov.anyCovered) return null;

  // เต็ม → ปิดทั้งดีล ไม่ต้อง split (projectId อาจเป็น null = ปิด Won โดยยังไม่สร้าง PM)
  if (cov.allCovered) {
    return markWon({
      supabase, user, deal, source: 'sahamit-po', now: wonNow,
      projectValue: cov.coveredValue, projectId,
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
    stage: winStageForProject(projectId),
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
    projectId,
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

// ── Orchestration: settle a PO into a sales deal (project OPTIONAL) ──────────
// action หลัก = ปิด Won เข้าดีล; ถ้าเจอดีลที่ map ไว้ → settle (เต็ม/หรือ split),
// ถ้าไม่เจอ → สร้าง won-deal stub (PO นอก forecast). คืน { deal, matchedBy }.
export async function settlePoIntoSalesDeal({ supabase, user, po, customer, activeLines, productIndex, project = null, chosenDealId = null, forceStub = false, now, request }) {
  const poQty = new Map();
  let stubValue = 0;
  for (const line of activeLines || []) {
    const fg = String(line.fgCode || '').trim();
    const q = Number(line.qty || 0);
    if (!fg || q <= 0) continue;
    poQty.set(fg, (poQty.get(fg) || 0) + q);
    const price = Number(productIndex.get(fg.toLowerCase())?.price ?? 0);
    stubValue += q * (Number.isFinite(price) ? price : 0);
  }
  const priceOf = (fg) => productIndex.get(String(fg || '').trim().toLowerCase())?.price ?? 0;

  if (!forceStub) {
    // เลือกดีลเอง (chosenDealId) หรือ auto-match ดีลที่เข้าข่ายมากสุด
    let target = null;
    if (chosenDealId) {
      const { data: d } = await supabase.from('sales_deals').select('*').eq('id', chosenDealId).maybeSingle();
      if (d && !d.projectId && !CLOSED_STAGES.includes(d.stage)) {
        const { data: links } = await supabase.from('sales_deal_forecast_lines').select('*').eq('dealId', d.id);
        target = { deal: d, links: links || [] };
      }
    } else {
      target = await resolveMappedDealForPo(supabase, po.customerId, [...poQty.keys()], monthKey(po.dueDate));
    }
    if (target) {
      const deal = await settleMappedDealWithPo({
        supabase, user, deal: target.deal, links: target.links,
        poQtyByFg: poQty, priceOf, project, po, now, request,
      });
      if (deal) return { deal, matchedBy: chosenDealId ? 'chosen' : 'fc-mapping' };
    }
  }

  const wonNow = po.receivedDate ? `${po.receivedDate}T00:00:00.000Z` : now;
  const deal = await createWonDealStub({
    supabase, user, source: 'sahamit-po', request,
    auditSummary: `create won-deal stub from Sahamit PO ${po.poNumber}`,
    row: {
      customerId: po.customerId,
      customerName: customer?.name || null,
      title: `Sahamit PO ${po.poNumber}`,
      projectValue: stubValue,
      forecastMonth: po.receivedDate || po.dueDate || now,
      expectedCloseDate: po.receivedDate || po.docDate || null,
      confirmedAt: wonNow,
      notes: po.note || null,
      ownerId: user.id || null,
      ownerName: user.name || null,
      team: user.team || 'KA',
      projectId: project?.id || null,
      metadata: {
        source: 'sahamit-po', sahamitPoId: po.id, poNumber: po.poNumber,
        poReceivedDate: po.receivedDate || null, poDueDate: po.dueDate || null,
        projectCode: project?.code || null, quoteRef: po.quoteRef || null, bypassPipeline: true,
      },
    },
  });
  return { deal, matchedBy: 'stub' };
}

// ผูก PM project เข้าดีลที่ปิด Won ไว้แล้ว (ยกระดับ won → in_project). ใช้ตอน
// สร้าง PM ทีหลังจาก PO ที่ settle เข้าดีลไปแล้ว.
export async function linkProjectToSettledDeal({ supabase, user, deal, project, now, request }) {
  if (!deal || deal.projectId) return deal;
  const patch = {
    projectId: project.id,
    stage: 'in_project',
    metadata: { ...(deal.metadata || {}), projectCode: project.code, projectLinkedAt: now },
    updatedAt: now,
  };
  const { data, error } = await supabase.from('sales_deals').update(patch).eq('id', deal.id).select().single();
  if (error) throw error;
  if (deal.stage !== 'in_project') {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'), dealId: deal.id, fromStage: deal.stage, toStage: 'in_project',
      changedBy: user.id || null, changedByName: user.name || null,
    });
  }
  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id,
    before: deal, after: data, summary: `link PM project ${project.code} to sales deal ${deal.id}`, request,
  });
  return data;
}
