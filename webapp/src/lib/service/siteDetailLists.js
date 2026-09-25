// ── ตารางโซน/อุปกรณ์บนหน้ารายละเอียดไซต์ — ค้นหา · กรองอาคาร/รุ่น/สถานะ · เรียง (logic ล้วน) ──
//
// ⭐ ไซต์ใหญ่มีจริงแล้ว: The Empire 247 โซน · 292 เครื่อง (ลงจาก Excel 25/09/2026) ⇒ เดิมสองตาราง
//   ยาวต่อกัน 539 แถวในหน้าเดียว ไม่มีช่องค้นหา ไม่มีตัวกรอง ไม่แบ่งหน้า (ผู้ใช้ทัก "มันยาวไปมั้ย")
//   ⇒ สองตารางเป็น ListPanel ที่มีช่องค้นหา · ชิปอาคาร · Pager (ไซต์เล็กหน้าตาแทบเท่าเดิม —
//      ไม่ถึง 25 แถว Pager ไม่ขึ้น · มีอาคารเดียว ชิปไม่ขึ้น)
// ⭐ กติกาค้นหา "ตาเห็นบนแถว = ต้องค้นเจอ" — ทุกช่องที่แถววาดอยู่ใน haystack ของตัวเอง
//   ⚠️ แก้คอลัมน์ของตารางบนหน้าไซต์เมื่อไร ต้องแก้ haystack ที่นี่ในคอมมิตเดียวกัน
import { floorLabel } from '@/lib/service/zoneCode';
import { ASSET_KIND_LABELS } from '@/lib/service/assetKinds';
import { ASSET_STATUS_LABELS } from '@/lib/service/sites';

/* ชิปอาคารกดตรงได้เมื่อมี 2–6 กลุ่ม (กติกา direct controls: ชุดเล็กเห็นทุกตัว) · เกินนั้นไม่วาดชิป —
   ชื่ออาคารอยู่ใน haystack อยู่แล้ว พิมพ์ค้นหาแทนได้ */
export const BUILDING_CHIP_MAX = 6;
/** ค่าของชิป "ทุกอาคาร" */
export const ALL_BUILDINGS = '';
/** ค่าของชิป "ไม่ระบุอาคาร" — โซนที่ไม่กรอกอาคาร และเครื่องที่ยังไม่อยู่ในโซนไหน */
export const NO_BUILDING = '__none__';

const text = (value) => String(value ?? '').trim();
const fold = (value) => text(value).toLocaleLowerCase('th');

/** เรียงแบบคนอ่าน — ตัวเลขในสตริงเทียบเป็นเลข ("Tower1_9_…" มาก่อน "Tower1_11_…") */
export function naturalCompare(a, b) {
  return text(a).localeCompare(text(b), 'th', { numeric: true, sensitivity: 'base' });
}

/** คำค้นหลายคำ = ต้องเจอครบทุกคำ ("tower1 20 men" เจอ "Tower1_20_MEN TOILET") */
export function matchesQuery(haystack, query) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = fold(haystack);
  return tokens.every((token) => hay.includes(token));
}

const zoneStatusLabel = (zone) => (zone?.isActive === false ? 'ปิดใช้งาน' : 'ใช้งาน');

/** ทุกอย่างที่แถวโซนวาด: รหัส · ชื่อ · อาคาร · ชั้น · หมายเหตุ · สถานะ + ชื่อ/หมายเหตุของจุดในโซน */
export function zoneHaystack(zone) {
  const spots = Array.isArray(zone?.spots) ? zone.spots : [];
  return [
    zone?.code, zone?.name, zone?.building, floorLabel(zone?.floor), zone?.floor, zone?.note, zoneStatusLabel(zone),
    ...spots.flatMap((spot) => [spot?.label, spot?.note]),
  ].filter(Boolean).join(' ');
}

/** ทุกอย่างที่แถวเครื่องวาด: รหัส · ชื่อ · ชนิด · โซน/จุด · รุ่น · สี · Serial · กลิ่น · สถานะ */
export function assetHaystack(asset, zone = null) {
  return [
    asset?.code, asset?.label, ASSET_KIND_LABELS[asset?.kind] || asset?.kind,
    asset?.model, asset?.colour, asset?.serial, asset?.productName,
    ASSET_STATUS_LABELS[asset?.status] || asset?.status, asset?.spot,
    zone ? [zone.name, zone.code, zone.building, floorLabel(zone.floor)] : 'ยังไม่ระบุโซน',
  ].flat().filter(Boolean).join(' ');
}

/** กลุ่มอาคารของโซน — ไม่กรอกอาคาร = NO_BUILDING */
export const zoneBuildingKey = (zone) => text(zone?.building) || NO_BUILDING;
/** กลุ่มอาคารของเครื่อง = อาคารของโซนที่อยู่ · ยังไม่อยู่ในโซนไหน = NO_BUILDING */
export const assetBuildingKey = (asset, zonesById) => (asset?.zoneId ? zoneBuildingKey(zonesById?.get(asset.zoneId)) : NO_BUILDING);

/**
 * ป้ายสั้นของอาคาร — ตัดคำนำหน้าที่ทุกอาคารใช้ร่วมกัน ("The Empire Tower1" → "Tower1")
 * ⚠️ ตัดเป็น **คำ** ไม่ใช่ตัวอักษร — "Tower1"/"Tower2" ห้ามเหลือ "1"/"2" · ตัดแล้วว่างสักตัว = ไม่ตัด
 */
export function shortBuildingLabels(names = []) {
  const list = names.map(text).filter(Boolean);
  const words = list.map((name) => name.split(/\s+/));
  let common = 0;
  if (list.length >= 2) {
    const shortest = Math.min(...words.map((w) => w.length));
    while (common < shortest - 1 && words.every((w) => w[common] === words[0][common])) common += 1;
  }
  return new Map(list.map((name, i) => [name, words[i].slice(common).join(' ') || name]));
}

/**
 * ตัวเลือกชิปอาคาร `[{ value, label, count }]` — ชิปแรก "ทุกอาคาร"
 * @param keys  กลุ่มอาคารของทุกแถว **หลังกรองอย่างอื่นแล้วยกเว้นอาคาร** ⇒ เลขบนชิปคือจำนวนที่จะเห็นถ้ากด
 * @param names ชื่ออาคารทั้งหมดของไซต์ (ชิปไม่หายตอนค้นหาแล้วเหลือศูนย์)
 * คืน `[]` เมื่อกลุ่มไม่ถึง 2 หรือเกิน BUILDING_CHIP_MAX
 */
export function buildingChipOptions(keys = [], names = []) {
  const groups = [...new Set([...names.map((n) => text(n) || NO_BUILDING), ...keys])];
  if (groups.length < 2 || groups.length > BUILDING_CHIP_MAX) return [];
  const real = groups.filter((g) => g !== NO_BUILDING).sort(naturalCompare);
  const short = shortBuildingLabels(real);
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  /* ⚠️ ชิป "ทุกอาคาร" ไม่มีตัวเลข — ป้ายจำนวนหัวแผงบอกยอดอยู่แล้ว และ Segmented ตัดเลขเกิน 99 เป็น "99+"
     (ไซต์ใหญ่ขึ้น "ทุกอาคาร 99+" ซึ่งไม่ได้บอกอะไร) */
  return [
    { value: ALL_BUILDINGS, label: 'ทุกอาคาร' },
    ...real.map((name) => ({ value: name, label: short.get(name) || name, count: counts.get(name) || 0 })),
    ...(groups.includes(NO_BUILDING) ? [{ value: NO_BUILDING, label: 'ไม่ระบุอาคาร', count: counts.get(NO_BUILDING) || 0 }] : []),
  ];
}

/** โซนเรียง: ใช้งานก่อน แล้วชื่อแบบเลขธรรมชาติ (ทางเดียวกับที่ API เรียง แต่ "_9_" มาก่อน "_11_") */
export function sortZones(zones = []) {
  return [...zones].sort((a, b) => (a.isActive === false) - (b.isActive === false) || naturalCompare(a.name, b.name));
}

export function filterZones(zones = [], { query = '', building = ALL_BUILDINGS } = {}) {
  return zones.filter((zone) => (building === ALL_BUILDINGS || zoneBuildingKey(zone) === building)
    && matchesQuery(zoneHaystack(zone), query));
}

/** คีย์รุ่นของเครื่อง = สิ่งที่คอลัมน์ "รุ่น" วาด (สำเนาชื่อรุ่นบนแถว + สี) */
export const assetModelKey = (asset) => `${text(asset?.model) || '—'}|${text(asset?.colour)}`;
export const assetModelLabel = (key) => {
  const [model, colour] = String(key).split('|');
  return colour ? `${model} ${colour}` : model;
};

/** สรุปจำนวนตามรุ่น/สี (ไม่นับปลดระวาง) — มากไปน้อย */
export function assetModelSummary(assets = []) {
  const counts = new Map();
  for (const asset of assets) {
    if (asset?.status === 'removed') continue;
    const key = assetModelKey(asset);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, label: assetModelLabel(key), count }))
    .sort((a, b) => b.count - a.count || naturalCompare(a.label, b.label));
}

/** เครื่องเรียง: ปลดระวางไว้ท้าย → ตามลำดับโซน (ไม่มีโซนไว้ท้าย) → จุด → รหัส */
export function sortSiteAssets(assets = [], zones = []) {
  const order = new Map(sortZones(zones).map((zone, index) => [zone.id, index]));
  const rank = (asset) => (order.has(asset.zoneId) ? order.get(asset.zoneId) : Number.MAX_SAFE_INTEGER);
  return [...assets].sort((a, b) => (a.status === 'removed') - (b.status === 'removed')
    || rank(a) - rank(b)
    || naturalCompare(a.spot, b.spot)
    || naturalCompare(a.code || a.label, b.code || b.label));
}

/**
 * @param filters.building ALL_BUILDINGS | ชื่ออาคาร | NO_BUILDING
 * @param filters.models   คีย์รุ่นที่เลือก (ว่าง = ทุกรุ่น)
 * @param filters.statuses สถานะที่เลือก (ว่าง = ทุกสถานะ)
 */
export function filterSiteAssets(assets = [], zonesById = new Map(), {
  query = '', building = ALL_BUILDINGS, models = [], statuses = [],
} = {}) {
  return assets.filter((asset) => (building === ALL_BUILDINGS || assetBuildingKey(asset, zonesById) === building)
    && (!models.length || models.includes(assetModelKey(asset)))
    && (!statuses.length || statuses.includes(asset.status))
    && matchesQuery(assetHaystack(asset, asset.zoneId ? zonesById.get(asset.zoneId) : null), query));
}
