// ── ข้อมูลลูกค้าสำหรับ IFRA / MSDS ของฟอร์มคำร้องขอเอกสาร (ม-167 · มติเจ้าของ 25/11/2026) ────────────
//
// ⭐ ทำไมต้องมีเส้นแยก: ฟอร์มเปิดใบยังไม่มีใบให้ GET (`docCustomer` ของ `[id]/route.js`) และรายชื่อลูกค้าของ picker
//    (`/api/customers`) ไม่พก `addresses` (ลากทั้งก้อน jsonb ให้ทุก picker = แพงฟรี) ⇒ ฟอร์มถามที่นี่ทีละลูกค้า
//    · คำตอบ = `docCustomerView` ตัวเดียวกับหน้าคำร้องและด่านกดส่ง ⇒ ฟอร์มบอก "ยังขาดอะไร" ประโยคเดียวกับที่ server จะตีกลับ
// ⚠️ ด่านเดียวกับ `form-options/route.js` (`canViewRequests`) — คนเปิดคำร้องได้ต้องเห็นข้อมูลลูกค้าที่จะไปอยู่บนใบของตัวเอง
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadDocCustomerView } from '@/lib/requests/docRequestContextAdmin';

export const dynamic = 'force-dynamic';

// GET /api/sa/requests/doc-customer?customerId=CUS-1&addressId=ADR-1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const sp = new URL(request.url).searchParams;
    const customerId = String(sp.get('customerId') ?? '').trim();
    if (!customerId) return Response.json({ error: 'ต้องระบุลูกค้า' }, { status: 400 });
    const view = await loadDocCustomerView(getSupabaseAdmin(), customerId, sp.get('addressId') || null);
    if (!view) return Response.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });
    return Response.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
