// ── ข้อมูลหน้าอุปกรณ์รายตัว — ตัวประกอบร่างเดียวของทั้งสองเส้น ──────────────
//
// ⭐ ยกออกมาจาก route ตอนเฟส B เพราะมีสองทางเข้าหาเครื่องตัวเดียวกัน:
//   `/api/service/sites/[id]/assets/[assetId]/detail` (เส้นเดิม ใต้ไซต์) และ
//   `/api/service/assets/[id]/detail` (เส้นใหม่ ทะเบียนรวม)
//   ⚠️ ถ้าปล่อยให้เป็นสองชุด มันจะเพี้ยนหากันแน่ ๆ — โรคเดียวกับที่ AGENTS.md ห้ามไว้
//      เรื่องฟอร์มสร้าง/แก้ · ที่ต่างกันได้คือ **ด่านสิทธิ์** ซึ่งอยู่ที่ route ไม่ใช่ที่นี่
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { loadAssets, loadZones } from './sitesRepo';
import { loadVisits } from './visitsRepo';

/* ประกอบข้อมูลหน้าอุปกรณ์ — คืน { data } หรือ { error } (ข้อความไทย + status)
   ผู้เรียกต้องหา `asset` กับ `site` มาก่อนแล้ว (คนละวิธีกันในสองเส้น) */
export async function buildAssetDetail(supabase, { site, asset }) {
  const siteId = asset.siteId || null;

  /* 🪤 **ห้ามยิงสามตัวนี้เมื่อไม่มีไซต์** (mig 0344) — สองตัวแรกส่ง null แล้วได้ 0 แถว
     ซึ่งไม่มีพิษ แต่ `loadVisits` เขียนเป็น `if (siteId)` ⇒ **ส่ง null = ไม่กรองเลย**
     ได้นัดทั้งบริษัทมาแปะบนหน้าเครื่องตัวเดียว · ความไม่สมมาตรนี้มองไม่เห็นจากตรงนี้ */
  const [zones, siteAssets, visits] = siteId ? await Promise.all([
    loadZones(supabase, siteId),
    loadAssets(supabase, siteId),
    loadVisits(supabase, { siteId }),
  ]) : [[], [], []];

  const visitIds = visits.map((v) => v.id);
  /* ของที่ใช้กับเครื่องนี้ + ผลรายเครื่องของทุกนัด — สองตารางคนละหน้าที่:
     items = ใช้อะไรไปเท่าไร · visit_assets = จบยังไง (ทำได้/ทำไม่ได้/เปลี่ยนเครื่อง) */
  const [
    { data: items, error: itemError },
    { data: results, error: resultError },
    { data: moves, error: moveError },
  ] = await Promise.all([
    visitIds.length
      ? fetchAllResult(() => supabase.from('service_visit_items')
        .select('id, visitId, assetId, label, qty, unit')
        .eq('assetId', asset.id)
        .order('id', { ascending: true }))
      : Promise.resolve({ data: [], error: null }),
    visitIds.length
      ? fetchAllResult(() => supabase.from('service_visit_assets')
        .select('id, visitId, assetId, outcome, reason, replacedByAssetId, createdAt')
        /* ⚠️ เอาทั้งแถวที่เครื่องนี้ "เป็นตัวถูกเปลี่ยน" และ "เป็นตัวแทน" —
           ประวัติของเครื่องสำรองที่ถูกเอาไปแทนเครื่องอื่นคือประวัติของมันเหมือนกัน */
        .or(`assetId.eq.${asset.id},replacedByAssetId.eq.${asset.id}`)
        .order('createdAt', { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    /* ประวัติการย้าย/เปลี่ยนสถานะ (mig 0335) — ไม่ผูกกับนัด จึงดึงเสมอ ไม่ใช่
       เฉพาะตอนมีนัด · เรียงใหม่สุดก่อน แล้วปิดท้ายด้วย id เพราะย้ายสองครั้ง
       ในวันเดียวกันมีจริง (ถอนตอนเช้า ติดตั้งตอนบ่าย) */
    fetchAllResult(() => supabase.from('service_asset_moves')
      .select('*').eq('assetId', asset.id)
      .order('movedAt', { ascending: false })
      .order('id', { ascending: false })),
  ]);
  if (itemError) return { error: itemError.message };
  if (resultError) return { error: resultError.message };
  if (moveError) return { error: moveError.message };

  return {
    data: {
      site,
      asset,
      zone: zones.find((z) => z.id === asset.zoneId) || null,
      // เครื่องอื่นในโซนเดียวกัน — ใช้เทียบว่าเครื่องนี้กินน้ำหอมผิดปกติไหม
      zoneAssets: siteAssets.filter((a) => a.zoneId && a.zoneId === asset.zoneId),
      visits,
      items: items || [],
      results: results || [],
      moves: moves || [],
    },
  };
}
