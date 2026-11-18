// ── ปัด SO ออกจากคิว "รอเปิดคำร้อง" / คืนเข้าคิว (ม-164 PR-5 · มติเจ้าของ 13/11 ข้อ 6) ────────────────────
// POST   { reason } — "ไม่ต้องมีคำร้อง" (ทำนอกระบบไปแล้ว) · เหตุผลบังคับ · บันทึกคนปัด/เวลา
// DELETE           — คืนเข้าคิว
// ⭐ ด่านมาจาก `scentOrderQueue.js` ตัวเดียวกับปุ่ม — เจ้าของดีลของ SO · หัวหน้าฝ่ายขาย · แอดมิน (คืนเข้าคิว: + คนที่ปัดเอง)
// ⚠️ ไม่แตะใบสั่งขาย — เขียน/ลบแถวใน `scent_order_dismissals` อย่างเดียว · แนบ/เปิดคำร้องล้างการปัดให้เอง (PR-2)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { businessDate } from '@/lib/businessDate';
import { dismissScentOrder, undismissScentOrder } from '@/lib/requests/scentOrderQueueAdmin';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { salesOrderId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await dismissScentOrder(getSupabaseAdmin(), {
      user, salesOrderId, reason: body?.reason, today: businessDate(), httpRequest: request,
    });
    return result.error ? answer({ error: result.error }, result.status) : answer({ ok: true });
  } catch (e) {
    console.error('[scent-orders/dismissal] POST', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { salesOrderId } = await params;
    const result = await undismissScentOrder(getSupabaseAdmin(), {
      user, salesOrderId, today: businessDate(), httpRequest: request,
    });
    return result.error ? answer({ error: result.error }, result.status) : answer({ ok: true });
  } catch (e) {
    console.error('[scent-orders/dismissal] DELETE', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
