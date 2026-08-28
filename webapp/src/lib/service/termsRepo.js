// ── Data access ของรอบขายโซน (mig 0297) ──────────────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
// ⚠️ เงื่อนไข "รอบมีผลไหม" ไม่ได้อยู่ไฟล์นี้ — อยู่ที่ terms.js ที่เดียว (mig 0297:84)
//    ที่นี่มีหน้าที่เดียวคือหยิบแถวมา/เขียนแถวลง

export async function loadTerms(supabase, { zoneIds = null, salesOrderId = null } = {}) {
  let query = supabase.from('service_zone_terms').select('*');
  if (zoneIds) {
    if (!zoneIds.length) return [];
    query = query.in('zoneId', zoneIds);
  }
  if (salesOrderId) query = query.eq('salesOrderId', salesOrderId);
  const { data, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* โซนของหลายไซต์ในคำสั่งเดียว — หน้าคิวต้องรู้ว่าไซต์ไหนมีโซนอะไรบ้าง
   โดยไม่ยิงทีละไซต์ (ไซต์ 200 แห่ง = 200 คำขอ) */
export async function loadZonesForSites(supabase, siteIds = []) {
  if (!siteIds.length) return [];
  const { data, error } = await supabase
    .from('service_zones').select('*').in('siteId', siteIds)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadAllZones(supabase) {
  const { data, error } = await supabase
    .from('service_zones').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
