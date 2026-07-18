import { monthKey } from '@/lib/salesPlanning';

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

// Month distance helper is exported for per-line candidate ranking on the client/route.
export function monthGap(a, b) { return monthDistance(a, b); }
