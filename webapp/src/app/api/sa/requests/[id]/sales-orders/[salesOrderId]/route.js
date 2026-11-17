// ── ถอด SO ที่แนบออกจากคำร้องพัฒนากลิ่น (ม-164 · PR-2) ──────────────────────────────────────────────
// DELETE : ถอดลิงก์ของ SO ใบนี้ออกจากคำร้อง → ตอบใบหลังถอด · SO กลับไปเป็น "ยังไม่มีคำร้อง" (เข้าคิว PR-5)
//
// ⭐ ด่านมาจาก `detachOrderError` ตัวเดียวกับปุ่ม — บล็อกเมื่อถอดแล้วคอนเฟิร์มเกินจำนวนกลิ่นโดยไม่มีแถมรองรับ
// ⚠️ ลบเฉพาะแถวลิงก์ (`dept_request_sales_orders`) — ใบสั่งขายไม่ถูกแตะ
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { findRequest } from '@/lib/materialPricesAdmin';
import { detachScentOrder } from '@/lib/requests/scentOrderAttachAdmin';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { id, salesOrderId } = await params;
    const supabase = getSupabaseAdmin();
    const row = await findRequest(supabase, id);
    if (!row) return answer({ error: 'ไม่พบคำร้อง' }, 404);
    if (!canReadRequestRow(user, row)) return answer({ error: 'ไม่มีสิทธิ์เปิดคำร้องนี้' }, 403);
    const result = await detachScentOrder({ supabase, user, request: row, salesOrderId, httpRequest: request });
    if (result.error) return answer({ error: result.error }, result.status);
    return answer(await findRequest(supabase, id));
  } catch (e) {
    console.error('[request-sales-orders] DELETE', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
