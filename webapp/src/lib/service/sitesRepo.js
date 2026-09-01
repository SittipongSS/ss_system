// ── Data access + ด่านสิทธิ์ของทะเบียนไซต์บริการ (mig 0187) ───────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { forbidden, notFound, unauthorized } from '@/lib/http';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { canEditService, canPickServiceSite, canViewService } from '@/lib/permissions';

// ⚠️ ด่านจริงของโมดูลบริการอยู่ตรงนี้ — proxy เห็นแค่ role จึงปล่อย `staff` ทุกฝ่าย
// ผ่านมาถึงนี่ (รวม PC/PD/WH/QC) · canEditService เป็นตัวที่เห็น department/team
/**
 * ด่านของโมดูลธุรกิจบริการ
 *
 * ⚠️ `forRequestForm` = "อ่านทะเบียนไซต์/พื้นที่เพื่อ **ผูกกับใบคำร้อง**" ซึ่งฝ่ายขาย
 *    ทำได้ ทั้งที่เข้าโมดูลไม่ได้แล้ว (มติ 2026-08-30 "ระบบธุรกิจบริการเข้าได้เฉพาะ TS")
 *    🐞 ไม่มีทางนี้ ฟอร์มใบประเมินพื้นที่จะกางรายการสถานที่ไม่ได้เลย — ว่างเปล่าโดยไม่มี
 *       ข้อความบอกว่าทำไม ทั้งที่ปุ่ม "สร้างสถานที่ใหม่" ยังอยู่ตรงนั้น
 */
export function requireService({ user, edit = false, forRequestForm = false }) {
  if (!user) return { response: unauthorized() };
  if (edit) {
    if (!canEditService(user)) return { response: forbidden('ไม่มีสิทธิ์แก้ข้อมูลธุรกิจบริการ') };
  } else if (forRequestForm ? !canPickServiceSite(user) : !canViewService(user)) {
    return { response: forbidden() };
  }
  return {};
}

/* `kind` — 'customer' (ค่าตั้งต้น) = ทะเบียนไซต์ลูกค้า · 'warehouse' = คลัง · null = ทั้งหมด
   ⭐ **คลังไม่ใช่แถวในทะเบียนไซต์** (mig 0332) — มันไม่มีลูกค้าให้ไปหา ไม่มีรอบบริการ
   และเรียง/กรองตามคอลัมน์ของทะเบียนไม่ได้เลย · ปล่อยให้ปนเข้ามาคือแถวปลอมที่กดแล้ว
   พาไปเจอหน้าที่ไม่มีอะไรตรงกับหัวตาราง ⇒ ตัดออกเป็นค่าตั้งต้น ให้คนที่อยากได้ขอเอง */
export async function loadSites(supabase, { customerId = null, includeInactive = true, kind = 'customer' } = {}) {
  let query = supabase.from('service_sites').select('*');
  if (customerId) query = query.eq('customerId', customerId);
  if (!includeInactive) query = query.eq('isActive', true);
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query
    .order('customerName', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findSite(supabase, id) {
  const { data, error } = await supabase
    .from('service_sites').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

// โหลดไซต์ + กันกรณีไม่พบในที่เดียว (ทุก route ของเครื่องต้องผ่านตรงนี้)
export async function requireSite({ user, supabase, id, edit = false, forRequestForm = false }) {
  const access = requireService({ user, edit, forRequestForm });
  if (access.response) return access;
  const site = await findSite(supabase, id);
  if (!site) return { response: notFound('ไม่พบไซต์บริการ') };
  return { site };
}

export async function loadAssets(supabase, siteId) {
  /* ⚠️ ไซต์เดียวไม่น่าถึงพัน — **ยกเว้นไซต์คลัง** ที่ถือเครื่องทั้งสต๊อก (343 ตัววันนี้
     และโตขึ้นทุกล็อตที่รับเข้า) ⇒ ต้องห่อ fetchAll เหมือนกัน (mig 0332)
     ⚠️ `id` ปิดท้ายเสมอ — status/label ไม่ unique พอจะไล่หน้า */
  return fetchAll(() => supabase
    .from('service_assets').select('*').eq('siteId', siteId)
    .order('status', { ascending: true })
    .order('label', { ascending: true })
    .order('id', { ascending: true }));
}

// นับเครื่องของหลายไซต์ในคำสั่งเดียว — หน้าทะเบียนต้องโชว์จำนวนเครื่องต่อแถว
// โดยไม่ยิง N+1 (ไซต์ 200 แห่ง = 200 คำขอ ถ้าทำแบบไร้เดียงสา)
export async function assetCountsBySite(supabase, siteIds = []) {
  const counts = new Map();
  if (!siteIds.length) return counts;
  /* 🔴 ต้องห่อ fetchAll — เครื่องทั้งระบบมี 1,239 ตัว เกินเพดาน 1,000 แถวของ
     PostgREST ตั้งแต่วันแรก · หน้านี้ส่ง siteId ของ **ทุกไซต์** เข้ามา ⇒ ถ้าไม่ห่อ
     ตัวเลข "จำนวนเครื่อง" จะต่ำกว่าจริงโดยไม่มี error ให้เห็นเลย
     ⚠️ ต้อง order ด้วยคีย์ที่ unique (`id`) — เรียงด้วย status/siteId ไล่หน้าแล้ว
        ได้แถวซ้ำและแถวหายพร้อมกัน */
  const data = await fetchAll(() => supabase
    .from('service_assets').select('id, siteId, status, condition')
    .in('siteId', siteIds).order('id', { ascending: true }));
  for (const row of data || []) {
    const entry = counts.get(row.siteId) || { total: 0, active: 0, inStock: 0, broken: 0 };
    entry.total += 1;
    if (row.status === 'active') entry.active += 1;
    // mig 0332: นับสองกองใหม่แยก — คลังกับของเสียไม่ใช่ "เครื่องที่ใช้งานอยู่"
    if (row.status === 'in_stock') entry.inStock += 1;
    if (row.condition === 'broken') entry.broken += 1;
    counts.set(row.siteId, entry);
  }
  return counts;
}

/* จำนวนโซนของหลายไซต์ในคำสั่งเดียว — คู่กับ assetCountsBySite
   🐞 ที่มา (UAT 2026-08-28): ไทล์เลือกไซต์ในวิซาร์ด "งานเข้าใหม่" โชว์ **"0 โซน" เสมอ**
   เพราะหน้าจอมีโซนเฉพาะของไซต์ที่ "เลือกไปแล้ว" (ensureZones โหลดทีละไซต์) แต่ตัวเลข
   นี้คือสิ่งที่คนใช้ **ตัดสินใจก่อนเลือก** ว่าจะผูกโซนเดิมหรือสร้างใหม่ ⇒ ต้องมาพร้อมรายการ
   ⚠️ นับ **ทุกโซน** ไม่กรอง isActive — โซนที่พักไว้ก็ยังผูกใหม่ได้ และเป็นเหตุผลที่ไม่ควร
      สร้างโซนชื่อซ้ำ (unique index กันไว้ที่ mig 0297) */
export async function zoneCountsBySite(supabase, siteIds = []) {
  const counts = new Map();
  if (!siteIds.length) return counts;
  const { data, error } = await supabase
    .from('service_zones').select('siteId').in('siteId', siteIds);
  if (error) throw error;
  for (const row of data || []) counts.set(row.siteId, (counts.get(row.siteId) || 0) + 1);
  return counts;
}

export async function findZone(supabase, siteId, zoneId) {
  const { data, error } = await supabase
    .from('service_zones').select('*')
    .eq('id', zoneId).eq('siteId', siteId).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function loadZones(supabase, siteId) {
  const { data, error } = await supabase
    .from('service_zones').select('*').eq('siteId', siteId)
    .order('isActive', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findAsset(supabase, siteId, assetId) {
  const { data, error } = await supabase
    .from('service_assets').select('*')
    .eq('id', assetId).eq('siteId', siteId).maybeSingle();
  if (error) throw error;
  return data || null;
}

// ลูกค้าที่ไซต์ผูกอยู่ต้องมีจริง — ผูกไปยัง id มั่วแล้วไซต์จะกลายเป็นเด็กกำพร้า
// ที่ไม่โผล่ในแท็บของลูกค้ารายไหนเลย (คืน { name } หรือ null)
// ⭐ ดึง `addresses` มาด้วย — ใช้ตรวจว่า customerAddressId ที่ส่งมาเป็นแถวของลูกค้า
//    รายนี้จริง (mig 0313) · เป็น jsonb ในแถวเดียวกัน ไม่มีคำสั่งเพิ่ม
export async function findCustomer(supabase, customerId) {
  const { data, error } = await supabase
    // ⚠️ `team`/`teams` ต้องมาด้วย — ด่าน "ไซต์ของลูกค้าที่ฉันดูแล" อ่านจากสองช่องนี้
    //    ไม่มีมาแล้ว `caretakerTeamsOf` คืน [] ซึ่งแปลว่า "ของกลาง ใครก็แก้ได้"
    .from('customers').select('id, name, arCode, addresses, team, teams')
    .eq('id', customerId).maybeSingle();
  if (error) throw error;
  return data || null;
}

