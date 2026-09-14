// ── Data access ของรอบขายโซน (mig 0297) ──────────────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
// ⚠️ เงื่อนไข "รอบมีผลไหม" ไม่ได้อยู่ไฟล์นี้ — อยู่ที่ terms.js ที่เดียว (mig 0297:84)
//    ที่นี่มีหน้าที่เดียวคือหยิบแถวมา/เขียนแถวลง

import { fetchAll } from '@/lib/supabaseFetchAll';
import { byColumns, fetchAllInChunks } from '@/lib/supabaseInChunks';

/* P0 ใบสั่งขายย้อนหลัง: term โตสะสม (ไม่มีสถานะ ไม่ถูกลบตอน Rev./ต่อสัญญา) ⇒ ไล่หน้าเสมอ
   · ลำดับเดิม createdAt desc + id ปิดท้าย · ซอยตามโซนแล้วเรียงซ้ำ (PostgREST เรียงต่อก้อน) */
const TERM_SORT = byColumns(['createdAt', 'desc'], 'id');

export async function loadTerms(supabase, { zoneIds = null, salesOrderId = null } = {}) {
  const ordered = (query) => (salesOrderId ? query.eq('salesOrderId', salesOrderId) : query)
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true });
  if (zoneIds) {
    if (!zoneIds.length) return [];
    return fetchAllInChunks(zoneIds, (chunk) => ordered(supabase
      .from('service_zone_terms').select('*').in('zoneId', chunk)), { sort: TERM_SORT });
  }
  return fetchAll(() => ordered(supabase
    .from('service_zone_terms').select('*')));
}

/* โซนของหลายไซต์ในคำสั่งเดียว — หน้าคิวต้องรู้ว่าไซต์ไหนมีโซนอะไรบ้าง
   โดยไม่ยิงทีละไซต์ (ไซต์ 200 แห่ง = 200 คำขอ) */
export async function loadZonesForSites(supabase, siteIds = []) {
  if (!siteIds.length) return [];
  return fetchAllInChunks(siteIds, (chunk) => supabase
    .from('service_zones').select('*').in('siteId', chunk)
    .order('name', { ascending: true })
    .order('id', { ascending: true }), { sort: byColumns('name', 'id') });
}

export async function loadAllZones(supabase) {
  return fetchAll(() => supabase
    .from('service_zones').select('*')
    .order('name', { ascending: true })
    .order('id', { ascending: true }));
}
