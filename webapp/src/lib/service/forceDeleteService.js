// ── บังคับลบของโมดูลบริการ (break-glass ผู้ดูแลระบบ) ─────────────────────
//
// 🐞 **ที่มา** (ผู้ใช้แจ้ง 2026-09-02 "แอดมินลบแล้วติดนู่นนี่") — มติ #1501
//   ให้แอดมินลบได้ทุกอย่าง และ 9 route ทั่วระบบต่อ `?force=1` ไปแล้ว
//   แต่ **โมดูลบริการไม่เคยต่อสักเส้น** ⇒ แอดมินชนกำแพงทุกครั้งที่จะเก็บกวาด
//   ไซต์/โซน/เครื่องที่สร้างผิดหรือเป็นข้อมูลทดสอบ
//
// ⚠️ **ทำไมปลด guard เฉย ๆ ไม่พอ** — ลูกของสามตัวนี้เป็น FK `RESTRICT` หลายชั้น
//   ปลดด่านฝั่งแอปแล้ว Postgres จะตีกลับ 23503 เป็นภาษาอังกฤษแทน
//   ⇒ ต้องเก็บกวาดลูกให้ครบ **ตามลำดับ FK** ไม่งั้นลบครึ่งทางแล้วค้าง
//
// ⚠️ ทุกตัวพรีวิว (`*Manifest`) เป็น query ล้วน ไม่ลบอะไร — `?dryRun=1` กับตัวลบจริง
//   เดินเส้นเดียวกัน ⇒ สิ่งที่โชว์ในพรีวิว = สิ่งที่จะโดนลบเป๊ะ
import { fetchAll } from '@/lib/supabaseFetchAll';

const line = (label, count) => ({ label, count: count || 0 });

async function countBy(supabase, table, column, value) {
  try {
    const { count } = await supabase.from(table)
      .select('id', { count: 'exact', head: true }).eq(column, value);
    return count || 0;
  } catch {
    return 0;
  }
}

async function countIn(supabase, table, column, values) {
  if (!values.length) return 0;
  try {
    const { count } = await supabase.from(table)
      .select('id', { count: 'exact', head: true }).in(column, values);
    return count || 0;
  } catch {
    return 0;
  }
}

const idsOf = (rows) => (rows || []).map((r) => r.id);

/* ── เครื่องหนึ่งตัว ─────────────────────────────────────────────────────
   ลูกที่ RESTRICT: `service_visit_assets.assetId` · `.replacedByAssetId` (0301/0303)
   ลูกที่ CASCADE: `service_asset_moves` (0335) · `service_visit_items.assetId` เป็น SET NULL */
export async function assetForceManifest(supabase, assetId) {
  const [results, swaps, items, moves] = await Promise.all([
    countBy(supabase, 'service_visit_assets', 'assetId', assetId),
    countBy(supabase, 'service_visit_assets', 'replacedByAssetId', assetId),
    countBy(supabase, 'service_visit_items', 'assetId', assetId),
    countBy(supabase, 'service_asset_moves', 'assetId', assetId),
  ]);
  return {
    cascade: [
      line('ผลรายเครื่องในใบส่งงาน', results),
      line('รายการที่เครื่องนี้ถูกเอาไปแทนตัวอื่น', swaps),
      line('ประวัติการย้าย/เปลี่ยนสถานะ', moves),
    ].filter((l) => l.count > 0),
    notes: items > 0
      ? [`ของที่ใช้กับเครื่องนี้ ${items} รายการจะยังอยู่ในใบส่งงาน แต่จะไม่รู้ว่าเป็นของเครื่องไหนอีก`]
      : [],
  };
}

export async function deleteAssetDeep(supabase, assetId) {
  /* ลำดับสำคัญ: ปลด RESTRICT ก่อนเสมอ
     ⚠️ `replacedByAssetId` ต้องล้างเป็น NULL ไม่ใช่ลบแถว — แถวนั้นเป็นประวัติของ
        **เครื่องอื่น** ที่ถูกเปลี่ยน ลบทิ้งคือลบประวัติของคนที่ไม่เกี่ยว */
  await supabase.from('service_visit_assets')
    .update({ replacedByAssetId: null }).eq('replacedByAssetId', assetId);
  await supabase.from('service_visit_assets').delete().eq('assetId', assetId);
  // moves เป็น CASCADE อยู่แล้ว — ลบตรงนี้เพื่อให้ลำดับอ่านออกและไม่พึ่ง DB เงียบ ๆ
  await supabase.from('service_asset_moves').delete().eq('assetId', assetId);
  const { error } = await supabase.from('service_assets').delete().eq('id', assetId);
  if (error) throw error;
}

/* ── โซนหนึ่งโซน ─────────────────────────────────────────────────────────
   ลูกที่ RESTRICT: `service_zone_terms.zoneId` (0297) · `service_survey_zones.zoneId` (0314)
   ลูกที่ SET NULL: `service_assets.zoneId` (0298) — เครื่องหลุดกลับกอง "ยังไม่ระบุโซน" */
export async function zoneForceManifest(supabase, zoneId) {
  const [terms, surveys, assets, moves] = await Promise.all([
    countBy(supabase, 'service_zone_terms', 'zoneId', zoneId),
    countBy(supabase, 'service_survey_zones', 'zoneId', zoneId),
    countBy(supabase, 'service_assets', 'zoneId', zoneId),
    countBy(supabase, 'service_asset_moves', 'toZoneId', zoneId),
  ]);
  return {
    cascade: [
      line('รอบขายที่ผูกกับโซนนี้', terms),
      line('บรรทัดโซนในใบประเมินพื้นที่', surveys),
    ].filter((l) => l.count > 0),
    notes: [
      assets > 0 ? `เครื่อง ${assets} ตัวในโซนนี้จะไม่ถูกลบ แต่จะกลับไปกอง "ยังไม่ระบุโซน"` : null,
      moves > 0 ? `ประวัติการย้าย ${moves} รายการจะยังอยู่ แต่จะไม่รู้ว่าเป็นโซนไหน` : null,
    ].filter(Boolean),
  };
}

export async function deleteZoneDeep(supabase, zoneId) {
  await supabase.from('service_zone_terms').delete().eq('zoneId', zoneId);
  await supabase.from('service_survey_zones').delete().eq('zoneId', zoneId);
  const { error } = await supabase.from('service_zones').delete().eq('id', zoneId);
  if (error) throw error;
}

/* ── ไซต์ทั้งใบ ──────────────────────────────────────────────────────────
   ลูกที่ RESTRICT: `service_visits` (0188) · `service_zones` (0297) ·
     `service_assets` (0332 — เปลี่ยนจาก CASCADE ตอนทำคลัง) · `service_renewal_followups` (0327)
   ลูกที่ CASCADE: `service_plans` (0188)
   🔴 **ลำดับคือหัวใจ** — ลบนัดก่อนเสมอ เพราะ `service_visit_assets` (CASCADE จากนัด)
      คือตัวที่ถือ RESTRICT บนเครื่องอยู่ · ลบเครื่องก่อนนัดจะติดทันที */
export async function siteForceManifest(supabase, siteId) {
  const [zones, assets] = await Promise.all([
    fetchAll(() => supabase.from('service_zones').select('id').eq('siteId', siteId).order('id')),
    fetchAll(() => supabase.from('service_assets').select('id').eq('siteId', siteId).order('id')),
  ]);
  const zoneIds = idsOf(zones);
  const assetIds = idsOf(assets);

  const [visits, plans, followups, terms, surveys, moves] = await Promise.all([
    countBy(supabase, 'service_visits', 'siteId', siteId),
    countBy(supabase, 'service_plans', 'siteId', siteId),
    countBy(supabase, 'service_renewal_followups', 'siteId', siteId),
    countIn(supabase, 'service_zone_terms', 'zoneId', zoneIds),
    countIn(supabase, 'service_survey_zones', 'zoneId', zoneIds),
    countIn(supabase, 'service_asset_moves', 'assetId', assetIds),
  ]);

  return {
    cascade: [
      line('ประวัตินัดเข้าบริการ (พร้อมผลรายเครื่องและของที่ใช้)', visits),
      line('เครื่องในไซต์', assetIds.length),
      line('ประวัติการย้าย/เปลี่ยนสถานะของเครื่อง', moves),
      line('โซน', zoneIds.length),
      line('รอบขายที่ผูกกับโซน', terms),
      line('บรรทัดโซนในใบประเมินพื้นที่', surveys),
      line('รอบบริการ', plans),
      line('รายการติดตามต่อสัญญา', followups),
    ].filter((l) => l.count > 0),
    notes: [
      'ประวัติการเข้าไซต์ทั้งหมดจะหายถาวร — ถ้าแค่เลิกใช้ไซต์นี้ ให้ปิดใช้งานแทน',
    ],
  };
}

export async function deleteSiteDeep(supabase, siteId) {
  const [zones, assets] = await Promise.all([
    fetchAll(() => supabase.from('service_zones').select('id').eq('siteId', siteId).order('id')),
    fetchAll(() => supabase.from('service_assets').select('id').eq('siteId', siteId).order('id')),
  ]);
  const zoneIds = idsOf(zones);
  const assetIds = idsOf(assets);

  /* 1) นัด — CASCADE พาลูกสองตารางไปเอง (`service_visit_items` · `service_visit_assets`)
        ⇒ ปลด RESTRICT ที่เครื่องถืออยู่ให้เสร็จก่อนแตะเครื่อง */
  await supabase.from('service_visits').delete().eq('siteId', siteId);

  // 2) ประวัติการย้ายของเครื่องในไซต์นี้ (CASCADE อยู่แล้ว — ลบให้ลำดับอ่านออก)
  if (assetIds.length) {
    await supabase.from('service_asset_moves').delete().in('assetId', assetIds);
    /* แถวที่ **ชี้เข้ามา** จากเครื่องอื่น (fromSite/toSite) เป็น SET NULL อยู่แล้ว
       ปล่อยไว้ — เป็นประวัติของเครื่องที่ยังอยู่ ไม่ใช่ของไซต์นี้ */
  }

  // 3) เครื่อง
  await supabase.from('service_assets').delete().eq('siteId', siteId);

  // 4) ลูกของโซน แล้วค่อยโซน
  if (zoneIds.length) {
    await supabase.from('service_zone_terms').delete().in('zoneId', zoneIds);
    await supabase.from('service_survey_zones').delete().in('zoneId', zoneIds);
  }
  await supabase.from('service_zones').delete().eq('siteId', siteId);

  // 5) ที่เหลือของไซต์
  await supabase.from('service_renewal_followups').delete().eq('siteId', siteId);
  await supabase.from('service_plans').delete().eq('siteId', siteId);

  const { error } = await supabase.from('service_sites').delete().eq('id', siteId);
  if (error) throw error;
}
