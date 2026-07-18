import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { monthKey, toMoney } from '@/lib/salesPlanning';

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

// ── ท่อขายเต็ม (มติ §7 2026-07-19): โมดูลสหมิตรไม่ปิด Won เองอีกแล้ว ─────────────
// PO ครอบดีลบางส่วน + ผู้ใช้เลือก "แบ่งดีล": สร้างดีลลูก (เปิด, สถานะ/ความน่าจะเป็น
// เท่าดีลแม่ — ไม่ใช่ Won) รับส่วนที่ PO ครอบเพื่อไปออก QT ต่อ, ดีลแม่เก็บส่วนที่เหลือ
// open รอ PO ถัดไป. ครอบเต็ม/ไม่ครอบเลย → ใช้ดีลเดิมทั้งใบ (split=false).
// Won เกิดทีหลังทางเดียวผ่าน accept QT มาตรฐาน (แนบไฟล์ PO + เลือกเดือน) → SO.
export async function carveOpenDealForPo({ supabase, user, deal, links, poQtyByFg, priceOf, po, now, request }) {
  const cov = computeCoverage(links, poQtyByFg, priceOf);
  if (!cov.anyCovered || cov.allCovered) return { deal, split: false };

  const coveredFg = [...new Set(cov.rows.filter((r) => r.covered > 0).map((r) => r.link.fgCode))].sort();
  const childRow = {
    id: genId('DEAL'),
    customerId: deal.customerId,
    customerName: deal.customerName,
    title: `${deal.title} (PO ${po.poNumber})`,
    stage: deal.stage,
    projectValue: toMoney(cov.coveredValue),
    probability: deal.probability,
    forecastMonth: deal.forecastMonth,
    expectedCloseDate: deal.expectedCloseDate,
    depositPaid: false,
    confirmedAt: null,
    notes: deal.notes,
    ownerId: deal.ownerId,
    ownerName: deal.ownerName,
    team: deal.team,
    dealType: deal.dealType || 'RE-ORDER',
    parentDealId: deal.id,
    metadata: {
      ...(deal.metadata || {}),
      splitFromDealId: deal.id,
      fgCodes: coveredFg,
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

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'), dealId: child.id, fromStage: null, toStage: child.stage,
    changedBy: user.id || null, changedByName: user.name || null,
  });
  await recordAudit({
    user, action: 'create', entityType: 'sales_deal', entityId: child.id,
    after: child,
    summary: `split Sahamit deal ${deal.id} → open child for PO ${po.poNumber} (ท่อ QT→SO)`,
    request,
  });
  return { deal: child, split: true };
}

// Month distance helper is exported for per-line candidate ranking on the client/route.
export function monthGap(a, b) { return monthDistance(a, b); }
