// ── Data access + ด่านสิทธิ์ของทะเบียนไซต์บริการ (mig 0187) ───────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditService, canViewService } from '@/lib/permissions';

// ⚠️ ด่านจริงของโมดูลบริการอยู่ตรงนี้ — proxy เห็นแค่ role จึงปล่อย `staff` ทุกฝ่าย
// ผ่านมาถึงนี่ (รวม PC/PD/WH/QC) · canEditService เป็นตัวที่เห็น department/team
export function requireService({ user, edit = false }) {
  if (!user) return { response: unauthorized() };
  if (edit) {
    if (!canEditService(user)) return { response: forbidden('ไม่มีสิทธิ์แก้ข้อมูลธุรกิจบริการ') };
  } else if (!canViewService(user)) {
    return { response: forbidden() };
  }
  return {};
}

export async function loadSites(supabase, { customerId = null, includeInactive = true } = {}) {
  let query = supabase.from('service_sites').select('*');
  if (customerId) query = query.eq('customerId', customerId);
  if (!includeInactive) query = query.eq('isActive', true);
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
export async function requireSite({ user, supabase, id, edit = false }) {
  const access = requireService({ user, edit });
  if (access.response) return access;
  const site = await findSite(supabase, id);
  if (!site) return { response: notFound('ไม่พบไซต์บริการ') };
  return { site };
}

export async function loadAssets(supabase, siteId) {
  const { data, error } = await supabase
    .from('service_assets').select('*').eq('siteId', siteId)
    .order('status', { ascending: true })
    .order('label', { ascending: true });
  if (error) throw error;
  return data || [];
}

// นับเครื่องของหลายไซต์ในคำสั่งเดียว — หน้าทะเบียนต้องโชว์จำนวนเครื่องต่อแถว
// โดยไม่ยิง N+1 (ไซต์ 200 แห่ง = 200 คำขอ ถ้าทำแบบไร้เดียงสา)
export async function assetCountsBySite(supabase, siteIds = []) {
  const counts = new Map();
  if (!siteIds.length) return counts;
  const { data, error } = await supabase
    .from('service_assets').select('siteId, status').in('siteId', siteIds);
  if (error) throw error;
  for (const row of data || []) {
    const entry = counts.get(row.siteId) || { total: 0, active: 0 };
    entry.total += 1;
    if (row.status === 'active') entry.active += 1;
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
export async function findCustomer(supabase, customerId) {
  const { data, error } = await supabase
    .from('customers').select('id, name, arCode').eq('id', customerId).maybeSingle();
  if (error) throw error;
  return data || null;
}
