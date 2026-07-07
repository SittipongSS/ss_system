import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import { settleOnePoLine, monthGap } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

const CLOSED = ['won', 'in_project', 'lost'];
const lc = (v) => String(v || '').trim().toLowerCase();
function toQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function loadPoWithLines(supabase, customerId, id) {
  const { data: po, error } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (error) throw error;
  if (!po) return null;
  const { data: lines, error: lErr } = await supabase
    .from('sahamit_po_lines').select('*').eq('poId', id);
  if (lErr) throw lErr;
  return { ...po, lines: lines || [] };
}

// GET — จับคู่ราย "บรรทัด PO": แต่ละสินค้าใน PO เสนอดีลที่ fgCode ตรง เรียงตาม
// ความใกล้ของ "เดือนคาดปิดดีล" กับ "เดือนที่รับ PO". ไม่แก้ข้อมูล.
export async function GET(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  if (!canViewSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  const receivedMonth = (po.receivedDate || '').slice(0, 7) || null;
  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);

  // ดีล open ที่มาจาก forecast (ผ่าน junction) → map fgCode → deals
  const { data: links } = await supabase.from('sales_deal_forecast_lines').select('*').eq('customerId', customerId);
  const dealIds = [...new Set((links || []).map((l) => l.dealId))];
  const { data: deals } = dealIds.length
    ? await supabase.from('sales_deals').select('*').in('id', dealIds)
    : { data: [] };
  const openById = new Map((deals || []).filter((d) => !d.projectId && !CLOSED.includes(d.stage)).map((d) => [d.id, d]));
  const byFg = new Map(); // fgLower → Map(dealId→deal)
  for (const l of links || []) {
    const d = openById.get(l.dealId);
    if (!d) continue;
    const k = lc(l.fgCode);
    if (!byFg.has(k)) byFg.set(k, new Map());
    byFg.get(k).set(d.id, d);
  }

  // บรรทัดที่ PO นี้ settle ไปแล้ว (จาก deal.metadata.sahamitPoId + fgCodes)
  const { data: settled } = await supabase
    .from('sales_deals').select('id, metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledByFg = new Map();
  for (const d of settled || []) for (const fg of (d.metadata?.fgCodes || [])) settledByFg.set(lc(fg), d.id);

  const lines = activeLines.map((line) => {
    const k = lc(line.fgCode);
    const candidates = [...(byFg.get(k)?.values() || [])]
      .map((d) => ({
        id: d.id, title: d.title, forecastMonth: d.forecastMonth,
        projectValue: d.projectValue, ownerName: d.ownerName,
        gap: monthGap(d.forecastMonth, receivedMonth),
      }))
      .sort((a, b) => a.gap - b.gap || String(a.forecastMonth || '').localeCompare(String(b.forecastMonth || '')));
    return {
      poLineId: line.id,
      fgCode: line.fgCode,
      productName: line.productName,
      qty: toQty(line.qty),
      deliveryMonth: line.deliveryMonth || (line.dueDate || '').slice(0, 7) || null,
      settledDealId: settledByFg.get(k) || null,
      candidates,
      suggestedDealId: candidates[0]?.id || null,
    };
  });

  return Response.json({ poNumber: po.poNumber, poReceivedMonth: receivedMonth, lines });
}

// POST — settle รายบรรทัด. body: { settlements: [{ poLineId, dealId } | { poLineId, createNew:true }] }
// ปิด Won ได้หลายดีลจาก PO ใบเดียว.
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const settlements = Array.isArray(body.settlements) ? body.settlements : [];
  if (!settlements.length) return Response.json({ error: 'ยังไม่ได้เลือกบรรทัดที่จะเชื่อม' }, { status: 400 });

  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);
  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);
  const now = new Date().toISOString();

  const results = [];
  for (const s of settlements) {
    const line = activeLines.find((l) => l.id === s.poLineId);
    if (!line) continue;
    if (!s.dealId && !s.createNew) continue; // ข้าม
    const deal = await settleOnePoLine({
      supabase, user, po, customer, line, productIndex,
      dealId: s.dealId || null, createNew: !!s.createNew, now, request,
    });
    if (deal) results.push({ poLineId: line.id, dealId: deal.id, title: deal.title });
  }

  if (results.length) {
    await supabase.from('sahamit_pos')
      .update({ salesDealId: results[0].dealId, updatedAt: now })
      .eq('id', po.id).eq('customerId', customerId);
  }
  return Response.json({ settled: results.length, results });
}
