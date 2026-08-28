// ── ข้อมูลหน้าอุปกรณ์รายตัว (เฟส 4) ──────────────────────────────────────
//
// ⭐ ค่าตั้งเครื่องจริงเคยอยู่ใน **รูปถ่ายหน้าจอที่ช่างส่งเข้า LINE ทุกเดือน** — mig 0298
//   เพิ่งมีที่เก็บ (`settings`) แต่ยังไม่มีจอไหนแสดง · และเครื่องหนึ่งตัวมีประวัติของ
//   ตัวเอง (ย้ายโซน · ส่งซ่อม · ถูกเปลี่ยน) ที่วันนี้เป็นแค่แถวกระจายอยู่หลายตาราง
import { withUser, ok, fail, notFound } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { findAsset, loadAssets, loadZones, requireSite } from '@/lib/service/sitesRepo';
import { loadVisits } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id, assetId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;

    const asset = await findAsset(supabase, id, assetId);
    if (!asset) return notFound('ไม่พบอุปกรณ์ในไซต์นี้');

    const [zones, siteAssets, visits] = await Promise.all([
      loadZones(supabase, id),
      loadAssets(supabase, id),
      loadVisits(supabase, { siteId: id }),
    ]);

    const visitIds = visits.map((v) => v.id);
    /* ของที่ใช้กับเครื่องนี้ + ผลรายเครื่องของทุกนัด — สองตารางคนละหน้าที่:
       items = ใช้อะไรไปเท่าไร · visit_assets = จบยังไง (ทำได้/ทำไม่ได้/เปลี่ยนเครื่อง) */
    const [{ data: items, error: itemError }, { data: results, error: resultError }] = await Promise.all([
      visitIds.length
        ? fetchAllResult(() => supabase.from('service_visit_items')
          .select('id, visitId, assetId, label, qty, unit')
          .eq('assetId', assetId)
          .order('id', { ascending: true }))
        : Promise.resolve({ data: [], error: null }),
      visitIds.length
        ? fetchAllResult(() => supabase.from('service_visit_assets')
          .select('id, visitId, assetId, outcome, reason, replacedByAssetId, createdAt')
          /* ⚠️ เอาทั้งแถวที่เครื่องนี้ "เป็นตัวถูกเปลี่ยน" และ "เป็นตัวแทน" —
             ประวัติของเครื่องสำรองที่ถูกเอาไปแทนเครื่องอื่นคือประวัติของมันเหมือนกัน */
          .or(`assetId.eq.${assetId},replacedByAssetId.eq.${assetId}`)
          .order('createdAt', { ascending: false }))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemError) return fail(itemError.message, 500);
    if (resultError) return fail(resultError.message, 500);

    return ok({
      site: access.site,
      asset,
      zone: zones.find((z) => z.id === asset.zoneId) || null,
      // เครื่องอื่นในโซนเดียวกัน — ใช้เทียบว่าเครื่องนี้กินน้ำหอมผิดปกติไหม
      zoneAssets: siteAssets.filter((a) => a.zoneId && a.zoneId === asset.zoneId),
      visits,
      items: items || [],
      results: results || [],
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
