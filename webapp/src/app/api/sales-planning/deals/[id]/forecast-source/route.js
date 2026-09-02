import { recordAudit } from '@/lib/audit';
import { withUser, ok, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, dealAuditLabel, isWonStage } from '@/lib/salesPlanning';
import { loadScoped } from '@/lib/scopedRow';
import { chooseForecastSource } from '@/lib/sales/forecastSourceRepo';

export const dynamic = 'force-dynamic';

/* POST /api/sales-planning/deals/[id]/forecast-source — คนเลือกที่มาของยอด FC เอง
 *
 * ปลายทางเดียวของสามการกระทำที่หน้าตาต่างกันแต่เป็นเรื่องเดียวกัน (mig 0337):
 *   · กดรับจากคิว "FC ไม่ตรงใบเสนอราคา"  → { source: 'quotation', quotationId }
 *   · เลือกว่าใบไหนคือ FC เมื่อมีหลายฉบับ → { source: 'quotation', quotationId }
 *   · ปลดล็อกกลับไปกรอกยอดเอง            → { source: 'manual' }
 *
 * ⭐ ทุกครั้งที่คนเลือกเอง = **ปัก** (`pin`) ให้อัตโนมัติ เพราะการเลือกคือการตัดสิน
 *    ระบบจะไม่มาเลื่อนที่มาทับทีหลัง · ส่ง `pin: false` มาเพื่อคืนสิทธิ์ให้ระบบเลื่อนเอง
 */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  // โหลด + ตรวจขอบเขตรายแถวในจังหวะเดียว (กฎ 6 ของ systemRules — ห้ามถือแถวไว้ก่อนผ่านด่าน)
  if (!canEditSalesPlanning(user)) return forbidden();
  const { row: before, response } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  if (response) return response;
  // ด่านเดียวกับ projectValue ใน PATCH — ยอดของดีลที่ปิดแล้วคือ Actual ไม่ใช่ประมาณการ
  if (isWonStage(before.stage)) return badRequest('ดีลปิดแล้ว แก้ที่มาของ FC ไม่ได้');

  const source = body?.source;
  if (source !== 'manual' && source !== 'quotation') {
    return badRequest('ต้องระบุที่มาของ FC เป็น manual หรือ quotation');
  }
  if (source === 'quotation' && !body?.quotationId) {
    return badRequest('ต้องเลือกใบเสนอราคาที่ให้ FC เดินตาม');
  }

  const outcome = await chooseForecastSource(supabase, id, {
    source,
    quotationId: body.quotationId || null,
    pin: body.pin !== false,
    user,
  });
  if (outcome.error) return badRequest(outcome.error);
  if (outcome.warning) return badRequest(outcome.warning);

  const { row: after } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: id, before, after,
    summary: source === 'quotation'
      ? `ตั้ง FC ของดีล ${dealAuditLabel(before)} ให้เดินตามใบเสนอราคา (${Number(outcome.previousValue ?? 0)} → ${Number(outcome.value ?? 0)})`
      : `ปลดล็อก FC ของดีล ${dealAuditLabel(before)} กลับไปยอดที่กรอกเอง (${Number(outcome.previousValue ?? 0)} → ${Number(outcome.value ?? 0)})`,
    request: req,
  });
  return ok({ deal: after, forecast: outcome });
});
