import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import { settleOnePoLine, monthGap } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

const CLOSED = ['won', 'in_project', 'lost'];
const lc = (v) => String(v || '').trim().toLowerCase();
// normalize fgCode สำหรับจับคู่: ตัดช่องว่าง/ขีด/จุด ให้ "ABC-001" = "ABC 001" = "abc001"
const norm = (v) => lc(v).replace(/[\s\-_.]/g, '');
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

  // ดีล open ที่มาจาก forecast — จับ fgCode จาก deal.metadata.fgCodes (เก็บบนตัวดีลเอง
  // ทุกดีล forecast มี ไม่พึ่ง junction ที่อาจหลุดตอนแก้/ลบรอบ) → map normFg → deals
  const { data: deals } = await supabase.from('sales_deals').select('*')
    .eq('customerId', customerId).is('projectId', null).eq('metadata->>source', 'sahamit-forecast');
  const allOpen = (deals || []).filter((d) => !CLOSED.includes(d.stage));
  const byFg = new Map(); // normFg → Map(dealId→deal)
  for (const d of allOpen) {
    for (const fg of (d.metadata?.fgCodes || [])) {
      const k = norm(fg);
      if (!k) continue;
      if (!byFg.has(k)) byFg.set(k, new Map());
      byFg.get(k).set(d.id, d);
    }
  }

  // บรรทัดที่ PO นี้ settle ไปแล้ว (จาก deal.metadata.sahamitPoId + fgCodes)
  const { data: settled } = await supabase
    .from('sales_deals').select('id, metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledByFg = new Map();
  for (const d of settled || []) for (const fg of (d.metadata?.fgCodes || [])) settledByFg.set(norm(fg), d.id);

  const cand = (d, match) => ({
    id: d.id, title: d.title, forecastMonth: d.forecastMonth,
    projectValue: d.projectValue, ownerName: d.ownerName, match,
    gap: monthGap(d.forecastMonth, receivedMonth),
  });
  const byGap = (a, b) => a.gap - b.gap || String(a.forecastMonth || '').localeCompare(String(b.forecastMonth || ''));

  const lines = activeLines.map((line) => {
    const k = norm(line.fgCode);
    // เสนอ "เฉพาะดีลที่เลข FG ตรงกับสินค้า" เท่านั้น — ถ้าไม่มี → ให้สร้างดีลใหม่/ข้าม
    const matched = [...(byFg.get(k)?.values() || [])].map((d) => cand(d, true)).sort(byGap);
    return {
      poLineId: line.id,
      fgCode: line.fgCode,
      productName: line.productName,
      qty: toQty(line.qty),
      deliveryMonth: line.deliveryMonth || (line.dueDate || '').slice(0, 7) || null,
      settledDealId: settledByFg.get(k) || null,
      candidates: matched,
      suggestedDealId: matched[0]?.id || null,
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

  // กันเชื่อมซ้ำ: บรรทัดที่ PO นี้ settle ไปแล้ว (ดีลมี metadata.sahamitPoId = PO นี้)
  // จะไม่ถูก settle ซ้ำ แม้ client ส่งมาอีก. จับด้วย fgCode (normalize) เหมือนตอน GET.
  const { data: alreadySettled } = await supabase
    .from('sales_deals').select('metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledFg = new Set();
  for (const d of alreadySettled || []) for (const fg of (d.metadata?.fgCodes || [])) settledFg.add(norm(fg));

  const results = [];
  const skipped = [];
  for (const s of settlements) {
    const line = activeLines.find((l) => l.id === s.poLineId);
    if (!line) continue;
    if (!s.dealId && !s.createNew) continue; // ข้าม
    if (settledFg.has(norm(line.fgCode))) { skipped.push(line.id); continue; } // เชื่อมไปแล้ว
    const deal = await settleOnePoLine({
      supabase, user, po, customer, line, productIndex,
      dealId: s.dealId || null, createNew: !!s.createNew, now, request,
    });
    if (deal) {
      results.push({ poLineId: line.id, dealId: deal.id, title: deal.title });
      settledFg.add(norm(line.fgCode)); // กันซ้ำภายในคำขอเดียวกัน (สองบรรทัด fgCode เดียว)
    }
  }

  if (results.length) {
    await supabase.from('sahamit_pos')
      .update({ salesDealId: po.salesDealId || results[0].dealId, updatedAt: now })
      .eq('id', po.id).eq('customerId', customerId);
  }
  return Response.json({ settled: results.length, results, skipped: skipped.length });
}
