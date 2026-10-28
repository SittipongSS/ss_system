// ── ใบเสนอราคาค่าสรรพสามิตของ SO ลูกค้าใบนี้ (แผนรื้อสรรพสามิต PR3 · มติเจ้าของ 28/10/2026) ─────────────────
//
// GET  — สถานะของปุ่ม "ออกใบเสนอราคาค่าสรรพสามิต" บนเส้นเดินงานของ SO: ใบที่ยังมีผล (ถ้ามี) + เหตุที่ออกไม่ได้
// POST — ออกใบ (ร่าง · ยังไม่ยื่น) จากบรรทัดสินค้าสรรพสามิตของ SO · ตรรกะทั้งหมดอยู่ที่ lib/excise/exciseQuotation.js
// ⭐ สิทธิ์ = สิทธิ์แก้ SO ลูกค้าใบนั้น (`loadScoped` 'edit' · ฝ่ายขายทีมที่ดูแลดีลต้นทาง) — ใบค่าภาษีไม่มีดีลของตัวเอง
import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  ExciseQuotationError, createExciseQuotationDraft, exciseQuotationBlocker, loadLiveExciseQuotation,
} from '@/lib/excise/exciseQuotation';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;
  const { data: liveQuote, error } = await loadLiveExciseQuotation(supabase, order.id);
  if (error) return fail(error.message, 500);
  return ok({
    liveQuote,
    blocker: exciseQuotationBlocker(order, { liveQuote }),
    notBilled: order.exciseNotBilledKind ? {
      kind: order.exciseNotBilledKind,
      reason: order.exciseNotBilledReason,
      ref: order.exciseNotBilledRef,
      at: order.exciseNotBilledAt,
      byName: order.exciseNotBilledByName,
    } : null,
  });
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'edit');
  if (response) return response;
  try {
    const result = await createExciseQuotationDraft({ supabase, user, order, request: req });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ExciseQuotationError) return Response.json({ error: error.message, ...error.extra }, { status: error.status });
    throw error;
  }
});
