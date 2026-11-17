// ── ตัวเลือก "ต่อจากคำร้อง" ของฟอร์มคำร้องพัฒนากลิ่น (ม-164 PR-4 · แผน §3) ─────────────────────────────
// GET ?customerId=…&exclude=… → `{ candidates: [{ id, docNo, title, status, createdAt, confirmedScentIds }] }`
//   · คำร้องพัฒนากลิ่นของลูกค้าเดียวกันทั้งนิติบุคคล · ไม่รวมใบยกเลิก · ใหม่สุดก่อน
//   · `confirmedScentIds` = กลิ่นที่ลูกค้าคอนเฟิร์มในใบนั้น — ฟอร์มใช้เรียงตัวเลือก "แก้จากกลิ่น" ให้ขึ้นก่อน
// 🔴 อ่านอย่างเดียว · ⚠️ ลิสต์โชว์เฉพาะใบที่คนเปิดฟอร์มเปิดได้ (`canReadRequestRow`) — ไม่หลุดเลขที่ของทีมอื่น
// ⚠️ ด่านจริงตอนบันทึกอยู่ที่ POST/PATCH (`checkContinueTarget`) — ลูกค้าที่ส่งมาทาง query ใช้แค่ทำลิสต์
// ⚠️ static segment ชนะ `[id]` ของ Next — เส้นนี้ไม่ไปตกที่หน้ารายใบ
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { loadContinueCandidates } from '@/lib/requests/scentContinueAdmin';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    const customerId = String(url.searchParams.get('customerId') || '').trim();
    const excludeId = String(url.searchParams.get('exclude') || '').trim() || null;
    if (!customerId) return answer({ candidates: [] });
    const candidates = await loadContinueCandidates(getSupabaseAdmin(), {
      customerId, excludeId, canRead: (row) => canReadRequestRow(user, row),
    });
    return answer({ candidates });
  } catch (e) {
    console.error('[continue-candidates] GET', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
