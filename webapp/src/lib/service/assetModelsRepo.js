// ── Data access ของทะเบียนรุ่นเครื่อง (mig 0344) ──────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { fetchAll } from '@/lib/supabaseFetchAll';

/**
 * รุ่นทั้งหมด — รวมที่ปิดใช้งาน (หน้าตั้งค่าต้องเห็นเพื่อเปิดกลับ)
 * ⚠️ ผู้เรียกที่ทำ **ตัวเลือก** ต้องกรอง `isActive` เอง ผ่าน `modelOptions`
 */
export async function loadAssetModels(supabase) {
  const rows = await fetchAll(() => supabase
    .from('service_asset_models').select('*').order('name', { ascending: true }));
  return rows || [];
}

export async function findAssetModel(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('service_asset_models').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * จำนวนเครื่องที่อ้างรุ่นนี้ — ด่าน "รุ่นที่ใช้อยู่ลบไม่ได้ / แก้รหัสไม่ได้"
 *
 * ⚠️ **นับด้วย `count` ไม่ใช่ดึงแถวมานับ** — `service_assets` มีเพดาน 0 ใน
 *   `check:rowcap` และการดึงเครื่องทั้งหมดมานับคือการอ่านทั้งตารางเพื่อได้เลขตัวเดียว
 *   (`head: true` ไม่คืนแถวสักแถว ⇒ ด่าน rowcap ไม่นับเป็นความผิด)
 */
export async function countAssetsOfModel(supabase, modelId) {
  if (!modelId) return 0;
  const { count, error } = await supabase
    .from('service_assets')
    .select('id', { count: 'exact', head: true })
    .eq('modelId', modelId);
  if (error) throw error;
  return count || 0;
}

/** จำนวนเครื่องต่อรุ่นทั้งทะเบียน — คอลัมน์ "ใช้อยู่" ของหน้าตั้งค่า */
export async function assetCountByModel(supabase) {
  /* ⚠️ ดึงเฉพาะคอลัมน์เดียวและห่อ `fetchAll` — ตารางนี้เพดาน rowcap เป็น 0
     (ไม่ห่อ = PostgREST ตัดที่ 1,000 แถวเงียบ ๆ แล้วตัวเลข "ใช้อยู่" ต่ำกว่าจริง
      ซึ่งจะทำให้ด่าน "รุ่นที่ใช้อยู่ลบไม่ได้" ปล่อยให้ลบรุ่นที่ยังมีเครื่อง) */
  const rows = await fetchAll(() => supabase
    .from('service_assets').select('modelId').order('id', { ascending: true }));
  const out = {};
  for (const row of rows || []) {
    if (!row?.modelId) continue;
    out[row.modelId] = (out[row.modelId] || 0) + 1;
  }
  return out;
}
