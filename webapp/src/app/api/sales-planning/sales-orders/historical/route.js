import { withUser, badRequest, fail, forbidden, unauthorized } from '@/lib/http';
import { canKeyHistoricalSalesOrder } from '@/lib/sales/historicalOrders';
import { commitHistoricalOrder } from '@/lib/sales/historicalOrderCommit';

export const dynamic = 'force-dynamic';

/* POST /api/sales-planning/sales-orders/historical — คีย์ใบสั่งขายย้อนหลัง (mig 0374 · มติ 22/09)
   body.preview = true → คืนแผน (ไม่เขียนอะไร) · false → สร้างใบ **ร่าง** ด้วย intakeKey ของฟอร์ม
   (ส่งอนุมัติเป็นอีกคำสั่ง · แก้ใบร่าง/ใบที่ถูกตีกลับ = PATCH historical/[id] ฟอร์มตัวเดียวกัน)
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/sales/historicalOrderCommit.js` (ทดสอบด้วย supabase ปลอมได้)
   ⚠️ proxy บังคับ `salesplan:edit` ของ `/api/sales-planning/*` อยู่แล้ว · ด่านจริงคือฝ่ายขายทุกตำแหน่ง + Admin
      (AE/Senior AE คีย์ได้เฉพาะของตัวเอง · ขอบเขตทีมของดีลที่ใบจะเข้าไปอยู่ — ตัดสินใน lib)
   ⚠️ จอห้ามส่ง `retry: true` — ส่งซ้ำด้วยรหัสเดิมได้ใบเดิมอยู่แล้ว (RPC เทียบลายนิ้วมือคำขอ)
      และหลังสร้างสำเร็จฟอร์มต้องเดินต่อด้วย PATCH ไม่ใช่สร้างซ้ำ */
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canKeyHistoricalSalesOrder(user)) return forbidden('คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('ข้อมูลการคีย์ไม่ถูกต้อง');
  try {
    const result = await commitHistoricalOrder({ supabase, user, body, request: req });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[historical sales order] unexpected error:', error);
    return fail('บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ', 500);
  }
});
