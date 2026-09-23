import { withUser, badRequest, fail, forbidden, unauthorized } from '@/lib/http';
import { canKeyHistoricalSalesOrder } from '@/lib/sales/historicalOrders';
import { commitHistoricalOrder } from '@/lib/sales/historicalOrderCommit';

export const dynamic = 'force-dynamic';

/* PATCH /api/sales-planning/sales-orders/historical/[id] — แก้ใบสั่งขายย้อนหลังที่เป็นร่างหรือถูกตีกลับ (mig 0374)
   ⭐ ฟอร์มคีย์ตัวเดียวกับตอนสร้าง (กฎ "ฟอร์มแก้ = ฟอร์มสร้าง") · ตัวเขียนตัวเดียวกับ POST historical
   body.preview = true → คืนแผน (ไม่เขียนอะไร) · false → เขียนทับทั้งชุด (ต้องส่ง expectedUpdatedAt)
   ⚠️ โหลดใบ + ตรวจขอบเขตอยู่ใน lib (loadScoped) — route นี้ไม่โหลดแถวเอง
   ⚠️ path สองท่อนหลัง sales-orders ⇒ ไม่เข้ากฎ PATCH ของฝ่ายบัญชีใน proxy · ยังต้อง `salesplan:edit` ตามเดิม
   ⚠️ จอห้ามส่ง `retry: true` — PATCH ซ้ำหลังเขียนสำเร็จได้ 409 "เอกสารถูกเปลี่ยน" แทนผลจริง */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canKeyHistoricalSalesOrder(user)) return forbidden('คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน');
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('ข้อมูลการคีย์ไม่ถูกต้อง');
  try {
    const result = await commitHistoricalOrder({ supabase, user, body, orderId: id, request: req });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[historical sales order] unexpected error (update):', error);
    return fail('บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ', 500);
  }
});
