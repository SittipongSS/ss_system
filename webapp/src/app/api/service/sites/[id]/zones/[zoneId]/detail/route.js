// ── ข้อมูลหน้าโซน (เฟส 4 · จอที่ม็อกเรียกว่า "หน้าที่เป็นเหตุผลของทั้งแผน") ──
//
// ⭐ ตารางรอบขายของโซนอยู่ใน DB ตั้งแต่ mig 0297 แต่ไม่เคยมีจอไหนอ่าน ⇒ ตอนลบโซน
//   ผู้ใช้เจอข้อความ "โซนนี้มีรอบขายผูกอยู่" ที่อ้างถึงของที่เขาไม่เคยเห็นมาก่อน
//
// ⚠️ แยกเป็น `/detail` ไม่ใช่ทับ GET เดิมของโซน — เส้นเดิม (`../[zoneId]`) เป็น
//   PATCH/DELETE ของฟอร์มโซน ถ้ายัดข้อมูลหนักไว้ในเส้นเดียวกัน ทุกครั้งที่กดแก้ชื่อ
//   โซนจะลากประวัติทั้งกองมาด้วย
import { withUser, ok, fail, notFound } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { findZone, loadAssets, requireSite } from '@/lib/service/sitesRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { loadVisits } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;

    const zone = await findZone(supabase, id, zoneId);
    if (!zone) return notFound('ไม่พบโซนในไซต์นี้');

    const [terms, assets, visits] = await Promise.all([
      loadTerms(supabase, { zoneIds: [zoneId] }),
      loadAssets(supabase, id),
      loadVisits(supabase, { siteId: id }),
    ]);

    /* รายการของที่ใช้ของทุกนัดในไซต์นี้ — ชั้นคำนวณ (consumption.js) จะกรองเอง
       ว่าอันไหนผูกกับเครื่องในโซนนี้ · ดึงทีเดียวแทนที่จะไล่ทีละนัด (N+1) */
    const visitIds = visits.map((v) => v.id);
    const { data: items, error: itemError } = visitIds.length
      ? await fetchAllResult(() => supabase.from('service_visit_items')
        .select('id, visitId, assetId, label, qty, unit')
        .in('visitId', visitIds)
        .order('visitId', { ascending: true })
        .order('id', { ascending: true }))
      : { data: [], error: null };
    if (itemError) return fail(itemError.message, 500);

    /* ใบสั่งขายแม่ของแต่ละรอบ — ตัวตัดสินว่า "รอบยังมีผลไหม" อยู่ที่ terms.js
       ซึ่งต้องได้ใบมาด้วย ไม่งั้นมันจะตอบ false ทุกใบตามที่ออกแบบไว้ */
    const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
    // ห่อ fetchAllResult ตามกติกา check:rowcap — โซนหนึ่งมีรอบขายไม่กี่รอบก็จริง
    // แต่ด่านนับ "จุดอ่านที่ไม่มีขอบเขต" ไม่ได้นับจากขนาดข้อมูลที่คาดว่าจะเจอ
    const { data: orders, error: orderError } = orderIds.length
      ? await fetchAllResult(() => supabase.from('sales_orders')
        .select('id, "orderNumber", status, supersededById, approvedAt')
        .in('id', orderIds)
        .order('id', { ascending: true }))
      : { data: [], error: null };
    if (orderError) return fail(orderError.message, 500);

    return ok({
      site: access.site,
      zone,
      terms,
      orders: orders || [],
      assets,
      visits,
      items: items || [],
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
