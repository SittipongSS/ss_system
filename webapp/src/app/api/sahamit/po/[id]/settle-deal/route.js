import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import { settlePoIntoSalesDeal, listMappedDealCandidatesForPo } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

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

function poFgCodes(activeLines) {
  return [...new Set((activeLines || []).map((l) => String(l.fgCode || '').trim()).filter(Boolean))];
}

// GET — ดีลที่ระบบแนะนำให้เชื่อม (สำหรับ modal เลือกเอง). ไม่แก้ข้อมูล.
export async function GET(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  if (!canViewSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  if (po.salesDealId) {
    const { data: existing } = await supabase.from('sales_deals').select('*').eq('id', po.salesDealId).maybeSingle();
    return Response.json({ alreadyLinked: true, linkedDeal: existing || null, candidates: [] });
  }

  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);
  const poMonth = (po.dueDate || '').slice(0, 7) || null;

  // ดีลที่มี junction (เรียงตัวตรง fgCode ก่อน; รวมตัวที่ไม่ตรงด้วยเพื่อให้เลือกได้)
  const scored = activeLines.length
    ? await listMappedDealCandidatesForPo(supabase, customerId, poFgCodes(activeLines), poMonth, { includeZeroOverlap: true })
    : [];
  const seen = new Set(scored.map((s) => s.deal.id));

  // fallback: ดีล open ที่มาจาก FC แต่ junction หลุด (แก้/ลบรอบ) — จะได้ไม่หายไปจากตัวเลือก
  const { data: extra } = await supabase
    .from('sales_deals').select('*').eq('customerId', customerId).is('projectId', null);
  const extraCands = (extra || [])
    .filter((d) => !['won', 'in_project', 'lost'].includes(d.stage) && d.metadata?.source === 'sahamit-forecast' && !seen.has(d.id))
    .map((d) => ({ deal: d, overlap: 0 }));

  const all = [...scored, ...extraCands].map(({ deal, overlap }) => ({
    id: deal.id,
    title: deal.title,
    forecastMonth: deal.forecastMonth,
    projectValue: deal.projectValue,
    stage: deal.stage,
    ownerName: deal.ownerName,
    fgCodes: Array.isArray(deal.metadata?.fgCodes) ? deal.metadata.fgCodes : [],
    overlap,
  }));
  // เสนอเฉพาะดีลที่ "สินค้าตรงกับ PO" (overlap>0); เปิดกว้างทั้งหมดเป็น fallback
  // เฉพาะกรณีไม่มีดีลไหนตรงเลย (จะได้ไม่เป็นทางตัน)
  const matched = all.filter((c) => c.overlap > 0);
  const candidates = matched.length ? matched : all;
  const hasMatch = matched.length > 0;
  return Response.json({ alreadyLinked: false, suggestedDealId: candidates[0]?.id || null, hasMatch, candidates });
}

// POST /api/sahamit/po/[id]/settle-deal — เชื่อม PO เข้าดีลแผนการขายแล้วปิด Won
// (action หลัก, ไม่ต้องมี PM project). idempotent ผ่าน sahamit_pos.salesDealId.
// body: { dealId? } เลือกดีลเอง, { createNew:true } สร้างดีลใหม่ (นอก forecast),
// ไม่ระบุ = auto-match.
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  if (po.salesDealId) {
    const { data: existing } = await supabase.from('sales_deals').select('*').eq('id', po.salesDealId).maybeSingle();
    return Response.json({ deal: existing, alreadyLinked: true });
  }

  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);
  if (!activeLines.length) return Response.json({ error: 'PO ต้องมีบรรทัดที่ใช้งานอย่างน้อยหนึ่งรายการ' }, { status: 400 });

  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);
  const now = new Date().toISOString();

  const { deal, matchedBy } = await settlePoIntoSalesDeal({
    supabase, user, po, customer, activeLines, productIndex, project: null,
    chosenDealId: body.dealId || null, forceStub: !!body.createNew, now, request,
  });
  if (!deal) return Response.json({ error: 'เชื่อมดีลไม่สำเร็จ (ดีลที่เลือกอาจถูกปิด/เชื่อมไปแล้ว หรือ PO ไม่มีจำนวนตรงกับดีล)' }, { status: 400 });

  if (deal?.id) {
    await supabase.from('sahamit_pos').update({ salesDealId: deal.id, updatedAt: now }).eq('id', po.id).eq('customerId', customerId);
  }
  return Response.json({ deal, matchedBy });
}
