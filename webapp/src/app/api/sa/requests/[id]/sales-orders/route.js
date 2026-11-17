// ── SO ที่ลูกค้าซื้อเพิ่ม ↔ คำร้องพัฒนากลิ่น (ม-164 · PR-2 · docs/scent-dev-topup-plan.md §2) ──────────────
// GET  : ใบสั่งขายที่แนบเข้าคำร้องนี้ได้ (ลูกค้าเดียวกันทั้งนิติบุคคล · อนุมัติแล้ว · มีงานพัฒนากลิ่น · ยังไม่มีเจ้าของ)
//        🔴 อ่านอย่างเดียว ไม่เขียนอะไรเลย (GET ที่เขียนข้อมูลคือกับดักที่เจอมาแล้ว)
// POST : { salesOrderId } แนบ SO เข้าคำร้อง → ตอบใบหลังแนบ (รูปเดียวกับ GET /api/sa/requests/[id] ส่วน findRequest)
//
// ⭐ route บาง — ด่านทุกข้อมาจาก `lib/requests/scentOrderAttach.js` ตัวเดียวกับปุ่ม · ตัวเขียนอยู่ `scentOrderAttachAdmin.js`
// ⚠️ proxy ปล่อยเส้นนี้ด้วย prefix `/api/sa/requests` ตัวเดียวกับใบแม่ · ด่านจริงคือ `canViewRequests` +
//   `canReadRequestRow` (อ่าน) และ `canActOnScentOrders` (แนบ · ผู้ขอ/ทีม · เจ้าของดีลของ SO · หัวหน้าฝ่ายขาย · แอดมิน)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { findRequest } from '@/lib/materialPricesAdmin';
import { attachScentOrder, loadAttachCandidates } from '@/lib/requests/scentOrderAttachAdmin';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const row = await findRequest(supabase, id);
    if (!row) return answer({ error: 'ไม่พบคำร้อง' }, 404);
    if (!canReadRequestRow(user, row)) return answer({ error: 'ไม่มีสิทธิ์เปิดคำร้องนี้' }, 403);
    return answer(await loadAttachCandidates(supabase, row));
  } catch (e) {
    console.error('[request-sales-orders] GET', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}

export async function POST(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const row = await findRequest(supabase, id);
    if (!row) return answer({ error: 'ไม่พบคำร้อง' }, 404);
    if (!canReadRequestRow(user, row)) return answer({ error: 'ไม่มีสิทธิ์เปิดคำร้องนี้' }, 403);
    const result = await attachScentOrder({
      supabase, user, request: row, salesOrderId: body?.salesOrderId, httpRequest: request,
    });
    if (result.error) return answer({ error: result.error }, result.status);
    return answer(await findRequest(supabase, id));
  } catch (e) {
    console.error('[request-sales-orders] POST', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
