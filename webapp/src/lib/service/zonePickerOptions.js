// ── ตัวเลือก "ไซต์ · โซน" ของตารางงานบริการบนใบสั่งขาย + หน้าต่าง "เพิ่มหลายโซน" (PR-A · mig 0392) ──────────
//
// ⭐ **ตรรกะล้วน** — จอและเทสต์ใช้ตัวเดียวกัน · ต้นทางคือทะเบียนของลูกค้าจาก
//   `GET /api/service/customers/[customerId]/zones` (`sites[{ id, code, name, isActive, zones:[zoneRegistryRow…] }]`)
//   ⇒ ไม่มีเส้นอ่านทะเบียนเส้นที่สอง (ทะเบียนเดียว สองจอ — กติกาหัวไฟล์ zoneRegistry.js)
//
// ⭐ ต้นแบบคือ `historicalZonePickerOptions` (lib/sales/historicalIntakeForm.js) — รูปของตัวเลือกเท่ากัน
//   (เทสต์ยึดไว้) ⇒ PR-D สลับฟอร์มใบย้อนหลังมาใช้ตัวนี้ได้ · ⚠️ ไม่แตะไฟล์ของใบย้อนหลังใน PR นี้
//   ต่างกันที่เดียวโดยตั้งใจ: ใบสั่งขายหนึ่งบรรทัดมีได้หลายโซน ⇒ "ซ้ำ" แยกเป็นสองแบบ
//     · ซ้ำในบรรทัดเดียวกัน = เลือกไม่ได้ (RPC ตีกลับ `service_setup_zone_duplicate` อยู่แล้ว)
//     · อยู่บรรทัดอื่นของใบด้วย = แค่บอก ("อยู่ในรายการ 3 ด้วย") เลือกได้ — หลายแพ็คเกจลงโซนเดียวกันได้จริง
//
// 🔴 กฎบ้าน "ติดด่าน = เห็นว่ามีอยู่ + บอกเหตุ": ไซต์/โซนที่ปิดใช้งาน และโซนซ้ำในบรรทัด **ยังอยู่ในลิสต์**
//    (`disabled` + `why`) ไม่ใช่หายไปเงียบ ๆ · ยกเว้นค่าที่แถวนี้ถืออยู่แล้ว — ถอนออก/เปลี่ยนได้เสมอ (R10 ของใบย้อนหลัง)
// 🔴 โซนที่แถวนี้ถือแต่ทะเบียนไม่มี (กำลังโหลด · โหลดพัง · ถูกลบ/ย้ายลูกค้า) ⇒ เติมตัวเลือกบอกเหตุไว้บนสุด
//    ไม่งั้นช่องเด้งเป็น "เลือกไซต์ · โซน" ทั้งที่ใบยังถือโซนนั้นอยู่ (อ่านเป็นว่ายังไม่ได้เลือก)
// ⭐ คำค้น = ทุกอย่างที่ตาเห็นบนแถว: รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน (กฎบ้าน search haystack)

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const zoneHaystack = (...parts) => parts.map(text).filter(Boolean).join(' ').toLowerCase();

/* เหตุที่ตัวเลือกบอก — ตัวเดียวกับที่จอ/เทสต์อ้าง */
export const ZONE_TAKEN_SAME_LINE = 'อยู่ในรายการนี้แล้ว';
export const ZONE_SITE_INACTIVE = 'ไซต์ปิดใช้งานในทะเบียน';
export const ZONE_INACTIVE = 'ปิดใช้งานในทะเบียน';
export const zoneTakenOtherLine = (lineNo) => `อยู่ในรายการ ${lineNo ?? '—'} ด้วย`;

/**
 * กางทะเบียนเป็นดัชนี — `{ sites, zonesById: Map, siteById: Map }`
 * · ไซต์ตามลำดับที่ API คืน (id ซ้ำ = ตัวแรกชนะ · แถวไม่มี id ถูกข้าม)
 * · โซนทุกตัวพก `siteId` (ขาด = ได้ของไซต์แม่) · `site.zones` = โซนของไซต์นั้นทั้งหมด
 */
export function registryIndex(registrySites = []) {
  const sites = [];
  const zonesById = new Map();
  const siteById = new Map();
  for (const raw of list(registrySites)) {
    const id = text(raw?.id);
    if (!id || siteById.has(id)) continue;
    const zones = list(raw?.zones)
      .filter((zone) => text(zone?.id))
      .map((zone) => ({ ...zone, siteId: text(zone.siteId) || id }));
    const site = { ...raw, id, zones };
    sites.push(site);
    siteById.set(id, site);
    for (const zone of zones) {
      const zoneId = text(zone.id);
      if (!zonesById.has(zoneId)) zonesById.set(zoneId, zone);
    }
  }
  return { sites, zonesById, siteById };
}

/* ค่าใน `taken` → `{ why, block }` · สตริงเปล่า ๆ = ติด (โซนถูกใช้ไปแล้ว) · `{ why, block: false }` = แค่บอก */
function takenOf(value) {
  if (value === null || value === undefined || value === false) return null;
  if (typeof value === 'string') return text(value) ? { why: text(value), block: true } : null;
  if (typeof value === 'object') {
    const why = text(value.why);
    return why ? { why, block: value.block !== false } : null;
  }
  return null;
}
const takenGet = (taken, zoneId) => takenOf(taken instanceof Map ? taken.get(zoneId) : taken?.[zoneId]);

/* เหตุของตัวเลือกหนึ่งตัว — ลำดับ: ซ้ำในบรรทัด > ไซต์ปิด > โซนปิด > อยู่บรรทัดอื่น (แค่บอก)
   ⚠️ ค่าที่แถวนี้ถืออยู่ (`mine`) ไม่ถูกล็อก — เหตุยังขึ้นให้เห็น แต่ถอน/เปลี่ยนได้ */
function zoneMark(site, zone, taken, mine) {
  let why = null;
  let blocked = false;
  if (taken?.block) { why = taken.why; blocked = true; }
  else if (site?.isActive === false) { why = ZONE_SITE_INACTIVE; blocked = true; }
  else if (zone?.isActive === false) { why = ZONE_INACTIVE; blocked = true; }
  else if (taken) why = taken.why;
  return { why, disabled: blocked && !mine };
}

const siteLabel = (site) => [text(site?.code), text(site?.name)].filter(Boolean).join(' ') || text(site?.id);
const zoneLabel = (zone) => [text(zone?.code), text(zone?.name)].filter(Boolean).join(' · ') || text(zone?.id);
const assessedOf = (zone) => (zone?.assessedPackages === undefined ? null : zone.assessedPackages);

/**
 * ตัวเลือกของช่อง "ไซต์ · โซน" หนึ่งแถว — ป้อน `SearchableSelect` ตรง ๆ (หัวกลุ่ม = ไซต์ · ตัวเลือก = โซน)
 * @param registrySites ทะเบียนของลูกค้า (รูปของ GET …/zones)
 * @param taken   Map|object zoneId → เหตุ: สตริง = ติด · `{ why, block }` (ใช้ `zoneTakenMap` สร้าง)
 * @param currentZoneId โซนที่แถวนี้ถืออยู่ · @param missingNote เหตุของโซนที่ถือแต่ทะเบียนไม่มี (กำลังโหลด/โหลดพัง)
 * @returns `[{ value, label, group?, zoneName, zoneCode, siteId, siteCode, siteName, assessedPackages, disabled, why, missing?, search }]`
 *   หัวกลุ่ม: `{ value: 'site:<id>', label: 'ST-… ชื่อไซต์', group: true }` · ไซต์ที่ไม่มีโซนไม่ขึ้นหัว (หัวลอยคือคำโกหก)
 */
export function zonePickerOptions({ registrySites = [], taken = new Map(), currentZoneId = null, missingNote = null } = {}) {
  const current = text(currentZoneId);
  const options = [];
  let found = false;
  for (const site of registryIndex(registrySites).sites) {
    if (!site.zones.length) continue;
    options.push({ value: `site:${site.id}`, label: siteLabel(site), group: true });
    for (const zone of site.zones) {
      const id = text(zone.id);
      const mine = !!current && id === current;
      if (mine) found = true;
      const { why, disabled } = zoneMark(site, zone, takenGet(taken, id), mine);
      options.push({
        value: id,
        label: zoneLabel(zone),
        zoneName: text(zone.name) || id,
        zoneCode: text(zone.code) || null,
        siteId: site.id,
        siteCode: text(site.code) || null,
        siteName: text(site.name) || null,
        assessedPackages: assessedOf(zone),
        disabled,
        why,
        search: zoneHaystack(site.code, site.name, zone.name, zone.code),
      });
    }
  }
  if (current && !found) {
    options.unshift({
      value: current,
      label: text(missingNote) || `${current} — ไม่อยู่ในทะเบียนที่โหลดมา`,
      zoneName: current,
      zoneCode: null,
      siteId: null,
      siteCode: null,
      siteName: null,
      assessedPackages: null,
      disabled: true,
      why: null,
      missing: true,
      search: current.toLowerCase(),
    });
  }
  return options;
}

/**
 * ตัวสร้าง `taken` ของแถวหนึ่ง (หรือของหน้าต่าง "เพิ่มหลายโซน" เมื่อไม่ส่ง `rowIndex`)
 * @param lines สถานะของตารางบนจอ `[{ lineId, lineNo, zones: [{ zoneId }] }]`
 * @param lineId บรรทัดที่กำลังเลือก · @param rowIndex แถวของตัวเองในบรรทัดนั้น (ไม่นับว่าซ้ำกับตัวเอง)
 * @returns Map zoneId → `{ why, block }` — บรรทัดเดียวกัน = ติด · บรรทัดอื่น = "อยู่ในรายการ n ด้วย" (แค่บอก)
 */
export function zoneTakenMap({ lines = [], lineId = null, rowIndex = null } = {}) {
  const self = text(lineId);
  const out = new Map();
  for (const line of list(lines)) {
    if (text(line?.lineId) === self) continue;
    for (const row of list(line?.zones)) {
      const id = text(row?.zoneId);
      if (id && !out.has(id)) out.set(id, { why: zoneTakenOtherLine(line?.lineNo), block: false });
    }
  }
  const own = list(lines).find((line) => text(line?.lineId) === self);
  list(own?.zones).forEach((row, index) => {
    const id = text(row?.zoneId);
    if (id && index !== rowIndex) out.set(id, { why: ZONE_TAKEN_SAME_LINE, block: true });
  });
  return out;
}

/**
 * แถวของหน้าต่าง "เพิ่มหลายโซน" (`ZonesBulkModal`) — ค้น → ติ๊ก → เพิ่มใต้บรรทัด
 * @param query คำค้น (รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน) · @param taken ดู `zonePickerOptions` · @param picked Set|array ที่ติ๊กไว้
 * @returns `[{ site, zones: [{ ...zone, why, disabled, picked }], selectableIds }]`
 *   · ไซต์ตรงคำค้น = ทุกโซนของมัน · ตรงบางโซน = เฉพาะโซนนั้น · ไม่ตรงเลย = ไม่อยู่ใน rows
 *   · ไซต์ที่ยังไม่มีโซนยังขึ้น (`zones: []`) เมื่อไม่ค้นหรือชื่อไซต์ตรง — ลูกค้ามีสาขานี้แต่ยังไม่ประเมิน คือคำตอบที่ต้องเห็น
 *   · `selectableIds` = โซนที่เห็นและเลือกได้ (ปุ่ม "เลือกทุกโซนที่เห็น (n)") · `site.zones` ยังเป็นโซนทั้งหมดของไซต์
 */
export function zoneBrowserRows({ registrySites = [], query = '', taken = new Map(), picked = new Set() } = {}) {
  const q = text(query).toLowerCase();
  const pickedSet = picked instanceof Set ? picked : new Set(list(picked).map(text).filter(Boolean));
  const rows = [];
  for (const site of registryIndex(registrySites).sites) {
    const siteHit = !q || zoneHaystack(site.code, site.name).includes(q);
    const shown = q
      ? site.zones.filter((zone) => zoneHaystack(site.code, site.name, zone.name, zone.code).includes(q))
      : site.zones;
    if (q && !siteHit && !shown.length) continue;
    const zones = shown.map((zone) => {
      const id = text(zone.id);
      return { ...zone, ...zoneMark(site, zone, takenGet(taken, id), false), picked: pickedSet.has(id) };
    });
    rows.push({ site, zones, selectableIds: zones.filter((zone) => !zone.disabled).map((zone) => text(zone.id)) });
  }
  return rows;
}
