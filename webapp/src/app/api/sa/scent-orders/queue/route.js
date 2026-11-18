// ── คิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" (ม-164 PR-5 · มติเจ้าของ 13/11 ข้อ 5–6) ─────────────────────────────
// GET ?scope=mine|all → `{ pending, dismissed, scope, canSeeAll }`
//   · mine = ดีลของฉัน (เจ้าของดีล) · all = หัวหน้าฝ่ายขาย/แอดมิน ในขอบเขตทีม (`inSalesDocScope`) · คนอื่นขอ all ได้ของตัวเอง
// 🔴 อ่านอย่างเดียว · ⚠️ ไม่อยู่ใน `/api/nav/counts` (แพงเกินสำหรับเส้นที่ยิงทุก 2 นาที)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { inSalesDocScope } from '@/lib/scopedRow';
import { businessDate } from '@/lib/businessDate';
import { loadScentOrderQueue } from '@/lib/requests/scentOrderQueueAdmin';
import { canSeeAllScentOrders, canUseScentOrderQueue, scentOrderQueueScope } from '@/lib/requests/scentOrderQueue';

export const dynamic = 'force-dynamic';

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return answer({ error: 'forbidden' }, 403);
    const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'mine';
    const canSeeAll = canSeeAllScentOrders(user);
    // ไม่ใช่ฝ่ายขาย = ไม่มีวันมีใบในคิว ⇒ ไม่ต้องอ่านทะเบียน SO
    if (!canUseScentOrderQueue(user)) return answer({ scope: 'mine', canSeeAll: false, pending: [], dismissed: [] });
    const { pending, dismissed } = await loadScentOrderQueue(getSupabaseAdmin(), { today: businessDate() });
    // ด่านขอบเขตทีมของใบขาย — ดีลของใบเป็นตัวตัดสิน (กติกาเดียวกับทะเบียน SO)
    const inScope = (row) => inSalesDocScope(user, { deal: { team: row.team, ownerId: row.dealOwnerId } });
    const opts = { user, scope, inScope };
    return answer({
      scope: scope === 'all' && canSeeAll ? 'all' : 'mine',
      canSeeAll,
      pending: scentOrderQueueScope(pending, opts),
      dismissed: scentOrderQueueScope(dismissed, opts),
    });
  } catch (e) {
    console.error('[scent-orders/queue] GET', e?.message || e);
    return answer({ error: e?.message || String(e) }, 500);
  }
}
