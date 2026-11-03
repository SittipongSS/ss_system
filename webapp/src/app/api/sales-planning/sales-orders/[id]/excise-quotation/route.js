// ── ใบเสนอราคาค่าสรรพสามิตของ SO ลูกค้าใบนี้ (แผนรื้อสรรพสามิต PR3 · มติเจ้าของ 28/10/2026) ─────────────────
//
// GET  — สถานะของปุ่ม "ออกใบเสนอราคาค่าสรรพสามิต" บนเส้นเดินงานของ SO: รอบที่ยังมีผล (แบ่งรอบ · หมวด 13) พร้อม
//        SO ค่าสรรพสามิต + บันทึกการยื่นของ RA รายรอบ + คงเหลือรายบรรทัด + เหตุที่ออกรอบใหม่ไม่ได้
//        `liveQuote`/`exciseOrder` = รอบล่าสุด (เส้นเดินงานแบบรอบเดียว)
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
  loadExciseRoundState, previewExciseQuotationDraft,
} from '@/lib/excise/exciseQuotation';
import { EXCISE_TASK_SYNC } from '@/lib/pm/exciseBillingTaskSync';

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
  let state;
  try {
    state = await loadExciseRoundState(supabase, order);
  } catch (error) {
    if (error instanceof ExciseQuotationError) return fail(error.message, error.status);
    throw error;
  }
  const latest = state.rounds.at(-1) || null;
  return ok({
    // PR4: ใบที่ลูกค้ารับแล้ว → SO ค่าสรรพสามิตที่ยังมีผลของใบนั้น (ช่วงบนเส้นเดินงานตามใบนี้ต่อ) — รอบล่าสุด
    liveQuote: latest?.quote || null,
    exciseOrder: latest?.exciseOrder || null,
    rounds: state.rounds,
    remaining: state.summary ? { rows: state.rows, ...state.summary } : null,
    blocker: exciseQuotationBlocker(order, {
      rounds: { liveCount: state.rounds.length, hasRemaining: state.summary ? state.summary.hasRemaining : true },
    }),
    remainderClosed: order.exciseRemainderClosedAt ? {
      at: order.exciseRemainderClosedAt,
      byName: order.exciseRemainderClosedByName || null,
      reason: order.exciseRemainderClosedReason || null,
    } : null,
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
}, EXCISE_TASK_SYNC.salesOrder);
