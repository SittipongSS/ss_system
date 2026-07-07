import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { canViewSalesPlanning } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// คืนรายการ forecastLineId ที่ "ถูกสร้างเป็นดีลไปแล้ว" (ดีลยังไม่ถูกยกเลิก) ของลูกค้านี้
// ใช้บนหน้า Forecast เพื่อปิดการเลือก line ที่มีดีลอยู่แล้ว (กันสร้างซ้ำตั้งแต่ UI).
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  if (!canViewSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { data: links, error } = await supabase
    .from('sales_deal_forecast_lines')
    .select('forecastLineId, dealId')
    .eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!links?.length) return Response.json([]);

  const dealIds = [...new Set(links.map((l) => l.dealId).filter(Boolean))];
  const { data: deals } = await supabase
    .from('sales_deals').select('id, stage').in('id', dealIds.length ? dealIds : ['__none__']);
  const activeDealIds = new Set((deals || []).filter((d) => d.stage !== 'lost').map((d) => d.id));

  const lineIds = [...new Set(
    links.filter((l) => activeDealIds.has(l.dealId) && l.forecastLineId).map((l) => String(l.forecastLineId)),
  )];
  return Response.json(lineIds);
}
