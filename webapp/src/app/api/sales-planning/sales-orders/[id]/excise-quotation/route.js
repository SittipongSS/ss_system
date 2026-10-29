// ── ใบเสนอราคาค่าสรรพสามิตของ SO ลูกค้าใบนี้ (แผนรื้อสรรพสามิต PR3 · มติเจ้าของ 28/10/2026) ─────────────────
//
// GET  — สถานะของปุ่ม "ออกใบเสนอราคาค่าสรรพสามิต" บนเส้นเดินงานของ SO: ใบที่ยังมีผล (ถ้ามี) + เหตุที่ออกไม่ได้
//        + SO ค่าสรรพสามิตของใบที่ลูกค้ารับแล้ว (PR4)
//        `?preview=1` — พรีวิวใบใหม่สำหรับหน้าออกใบ (มติเจ้าของ 29/10 "แก้ก่อนบันทึก"): บรรทัด/ยอด/หัวใบที่จะได้
//        ไม่ออกเลข ไม่สร้างสินค้า 04-003 ไม่ลงฐาน · สิทธิ์เท่าการออกใบ (แก้ SO ลูกค้าใบนั้นได้)
// POST — ออกใบ (ร่าง · ยังไม่ยื่น) จากบรรทัดสินค้าสรรพสามิตของ SO + หัวใบที่แก้บนหน้าออกใบ (exciseQuotationOverrides)
//        ตรรกะทั้งหมดอยู่ที่ lib/excise/exciseQuotation.js
// ⭐ สิทธิ์ = สิทธิ์แก้ SO ลูกค้าใบนั้น (`loadScoped` 'edit' · ฝ่ายขายทีมที่ดูแลดีลต้นทาง) — ใบค่าภาษีไม่มีดีลของตัวเอง
import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  ExciseQuotationError, createExciseQuotationDraft, exciseQuotationBlocker, exciseQuotationOverrides,
  loadLiveExciseQuotation, previewExciseQuotationDraft,
} from '@/lib/excise/exciseQuotation';
import { loadLiveExciseSalesOrder } from '@/lib/excise/exciseSalesOrder';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  if (new URL(req.url).searchParams.get('preview') === '1') {
    if (!canEditSalesPlanning(user)) return forbidden();
    const { row: order, response: editResponse } = await loadScoped(supabase, 'sales_orders', id, user, 'edit');
    if (editResponse) return editResponse;
    try {
      return ok(await previewExciseQuotationDraft({ supabase, user, order }));
    } catch (error) {
      if (error instanceof ExciseQuotationError) return Response.json({ error: error.message, ...error.extra }, { status: error.status });
      throw error;
    }
  }
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;
  const { data: liveQuote, error } = await loadLiveExciseQuotation(supabase, order.id);
  if (error) return fail(error.message, 500);
  // PR4: ใบที่ลูกค้ารับแล้ว → SO ค่าสรรพสามิตที่ยังมีผลของใบนั้น (ช่วงบนเส้นเดินงานตามใบนี้ต่อ)
  let exciseOrder = null;
  if (liveQuote?.status === 'accepted') {
    const { data, error: orderError } = await loadLiveExciseSalesOrder(supabase, liveQuote.id);
    if (orderError) return fail(orderError.message, 500);
    exciseOrder = data ? { id: data.id, orderNumber: data.orderNumber, status: data.status } : null;
  }
  return ok({
    liveQuote,
    exciseOrder,
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
  const body = await req.json().catch(() => ({}));
  const overrides = exciseQuotationOverrides(body || {});
  if (overrides.error) return fail(overrides.error, 400);
  try {
    const result = await createExciseQuotationDraft({ supabase, user, order, request: req, overrides: overrides.value });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ExciseQuotationError) return Response.json({ error: error.message, ...error.extra }, { status: error.status });
    throw error;
  }
});
