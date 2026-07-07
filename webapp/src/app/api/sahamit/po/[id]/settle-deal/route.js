import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { settlePoIntoSalesDeal } from '@/lib/salesPlanningForecast';

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

// POST /api/sahamit/po/[id]/settle-deal — เชื่อม PO เข้าดีลแผนการขายแล้วปิด Won
// (action หลัก, ไม่ต้องมี PM project). idempotent ผ่าน sahamit_pos.salesDealId.
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
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
    supabase, user, po, customer, activeLines, productIndex, project: null, now, request,
  });

  if (deal?.id) {
    await supabase.from('sahamit_pos').update({ salesDealId: deal.id, updatedAt: now }).eq('id', po.id).eq('customerId', customerId);
  }
  return Response.json({ deal, matchedBy });
}
