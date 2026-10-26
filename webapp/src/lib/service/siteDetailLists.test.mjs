// ตารางโซน/อุปกรณ์บนหน้ารายละเอียดไซต์ — ค้นหา · ชิปอาคาร · เรียง · สรุปรุ่น
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_BUILDINGS,
  MODEL_SUMMARY_PREFIX,
  NO_BUILDING,
  assetBuildingKey,
  assetHaystack,
  assetModelSummary,
  assetPanelSummary,
  buildingChipOptions,
  countsAsZoneAsset,
  filterSiteAssets,
  filterZones,
  isUnzonedOnSiteAsset,
  matchesQuery,
  naturalCompare,
  shortBuildingLabels,
  sortSiteAssets,
  sortZones,
  zoneAssetCounts,
  zoneBuildingKey,
  zoneHaystack,
} from './siteDetailLists.js';
import { ASSET_STATUS_LABELS } from './sites.js';

const zone = (id, name, building, floor, extra = {}) => ({ id, code: `ZN-1023-${id}`, name, building, floor, spots: [], ...extra });
const asset = (id, zoneId, model, colour, extra = {}) => ({ id, code: `MC-${id}`, label: model, kind: 'diffuser', model, colour, status: 'active', zoneId, ...extra });

const ZONES = [
  zone('10278', 'Tower1_11_MEN TOILET', 'The Empire Tower1', '11', { spots: [{ id: 's1', label: 'MEN TOILET', note: null }] }),
  zone('10279', 'Tower1_9_MEN TOILET', 'The Empire Tower1', '09'),
  zone('10300', 'Tower2_12_WOMEN TOILET', 'The Empire Tower2', '12'),
  zone('10500', 'TowerEmspace_B1_MEN TOILET', 'The Empire Space', 'B1', { spots: [{ id: 's2', label: 'MEN TOILET-1', note: 'ข้างอ่าง' }] }),
  zone('10026', 'EA Lobby', 'The Empire Tower1', 'GF', { note: 'หน้าทางเข้า' }),
];
const BY_ID = new Map(ZONES.map((z) => [z.id, z]));

test('เรียงแบบเลขธรรมชาติ — ชั้น 9 มาก่อนชั้น 11', () => {
  assert.ok(naturalCompare('Tower1_9_MEN TOILET', 'Tower1_11_MEN TOILET') < 0);
  assert.deepEqual(sortZones(ZONES).map((z) => z.name).slice(0, 3), ['EA Lobby', 'Tower1_9_MEN TOILET', 'Tower1_11_MEN TOILET']);
});

test('โซนปิดใช้งานไปท้ายเสมอ', () => {
  const list = sortZones([zone('1', 'A', null, '01', { isActive: false }), zone('2', 'B', null, '01')]);
  assert.deepEqual(list.map((z) => z.name), ['B', 'A']);
});

test('คำค้นหลายคำต้องเจอครบ · ไม่สนตัวพิมพ์', () => {
  assert.equal(matchesQuery('Tower1_20_MEN TOILET', 'tower1 20 men'), true);
  assert.equal(matchesQuery('Tower1_20_MEN TOILET', 'tower1 women'), false);
  assert.equal(matchesQuery('อะไรก็ได้', '   '), true);
});

test('haystack โซน = ทุกอย่างที่แถววาด + ชื่อ/หมายเหตุจุด', () => {
  const hay = zoneHaystack(ZONES[3]);
  for (const piece of ['ZN-1023-10500', 'TowerEmspace_B1_MEN TOILET', 'The Empire Space', 'ชั้นใต้ดิน 1', 'MEN TOILET-1', 'ข้างอ่าง', 'ใช้งาน']) {
    assert.ok(hay.includes(piece), `ค้นไม่เจอ "${piece}"`);
  }
  assert.ok(zoneHaystack({ ...ZONES[0], isActive: false }).includes('ปิดใช้งาน'));
});

/* PR-C (R1): ป้ายขายแล้ว/ใบที่ยังถือโซนอยู่บนแถว ⇒ ต้องค้นเจอ (กติกา "ตาเห็นบนแถว = ต้องค้นเจอ") */
test('haystack โซน = ป้าย "ขายแล้ว n แพ็ค/รอบ" + ป้ายใบที่ยังถือโซนไว้', () => {
  const sold = zoneHaystack({ ...ZONES[0], sale: { soldLabel: 'ขายแล้ว 4 แพ็ค/รอบ (SO-26090247-0)', pendingLabel: null } });
  assert.ok(sold.includes('แพ็ค/รอบ'));
  assert.ok(sold.includes('SO-26090247-0'));
  assert.equal(matchesQuery(sold, 'แพ็ค/รอบ'), true);
  const pending = zoneHaystack({
    ...ZONES[0],
    sale: {
      soldLabel: null,
      pendingLabel: 'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง) · อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง: SO-26080036-0 (ฝ่ายขายกำลังตั้ง)',
    },
  });
  for (const piece of ['ฉบับร่าง', 'กำลังตั้งงานบริการย้อนหลัง', 'SO-26100011-0', 'SO-26080036-0']) {
    assert.ok(pending.includes(piece), `ค้นไม่เจอ "${piece}"`);
  }
  // โซนที่ไม่มีก้อนการขาย (ผู้เรียกเก่า) ต้องไม่พัง
  assert.doesNotMatch(zoneHaystack(ZONES[0]), /undefined|null/);
});

test('haystack เครื่อง = รหัส · รุ่น · สี · จุด · โซน · สถานะ · ชนิด · Serial · กลิ่น', () => {
  const a = asset('APM1-260901073', '10278', 'M240', 'ขาว', { kind: 'soap', spot: 'MEN TOILET', serial: 'SN-9', productName: 'กลิ่นลาเวนเดอร์' });
  const hay = assetHaystack(a, BY_ID.get('10278'));
  for (const piece of ['MC-APM1-260901073', 'M240', 'ขาว', 'MEN TOILET', 'Tower1_11_MEN TOILET', 'ใช้งานอยู่', 'SN-9', 'กลิ่นลาเวนเดอร์']) {
    assert.ok(hay.includes(piece), `ค้นไม่เจอ "${piece}"`);
  }
  // คอลัมน์โซนของเครื่องที่ไม่มีโซนวาดคำว่า "ยังไม่ระบุ" ⇒ ต้องค้นเจอด้วย
  assert.ok(assetHaystack(asset('x', null, 'OV-05', 'เทา'), null).includes('ยังไม่ระบุ'));
});

test('ป้ายอาคารสั้น — ตัดคำนำหน้าที่ใช้ร่วมกันเป็นคำ ไม่ใช่ตัวอักษร', () => {
  const short = shortBuildingLabels(['The Empire Tower1', 'The Empire Tower2', 'The Empire Space']);
  assert.equal(short.get('The Empire Tower1'), 'Tower1');
  assert.equal(short.get('The Empire Space'), 'Space');
  // คำแรกต่างกันตั้งแต่ต้น = ไม่ตัด · ห้ามตัดจนเหลือแค่เลข
  assert.equal(shortBuildingLabels(['Tower1', 'Tower2']).get('Tower1'), 'Tower1');
  assert.equal(shortBuildingLabels(['A B', 'A']).get('A'), 'A');
});

test('ชิปอาคาร — ทุกอาคารก่อน · เลขบนชิปคือจำนวนที่จะเห็น · ไม่ระบุอาคารท้ายสุด', () => {
  const keys = [...ZONES.map(zoneBuildingKey), NO_BUILDING];
  const options = buildingChipOptions(keys, ZONES.map((z) => z.building));
  assert.deepEqual(options.map((o) => [o.value, o.label, o.count]), [
    [ALL_BUILDINGS, 'ทุกอาคาร', undefined],
    ['The Empire Space', 'Space', 1],
    ['The Empire Tower1', 'Tower1', 3],
    ['The Empire Tower2', 'Tower2', 1],
    [NO_BUILDING, 'ไม่ระบุอาคาร', 1],
  ]);
});

test('ชิปอาคารไม่ขึ้นเมื่อกลุ่มเดียว หรือเกินหกกลุ่ม · ค้นหาจนเหลือศูนย์ ชิปยังอยู่', () => {
  assert.deepEqual(buildingChipOptions(['A', 'A'], ['A']), []);
  const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  assert.deepEqual(buildingChipOptions(seven, seven), []);
  const none = buildingChipOptions([], ['A', 'B']);
  assert.deepEqual(none.map((o) => o.count), [undefined, 0, 0]);
});

test('กรองโซน — อาคาร + คำค้น', () => {
  assert.deepEqual(filterZones(ZONES, { building: 'The Empire Tower1' }).map((z) => z.id), ['10278', '10279', '10026']);
  assert.deepEqual(filterZones(ZONES, { query: 'men toilet', building: 'The Empire Space' }).map((z) => z.id), ['10500']);
  assert.deepEqual(filterZones([zone('9', 'X', null, '01')], { building: NO_BUILDING }).map((z) => z.id), ['9']);
});

const ASSETS = [
  asset('A3', '10279', 'M240', 'ขาว', { spot: 'MEN TOILET' }),
  asset('A1', '10278', 'M240', 'ขาว', { spot: 'MEN TOILET' }),
  asset('A2', '10026', 'OV-05', 'เทา'),
  asset('A4', null, 'OV-08', 'ดำ'),
  asset('A5', '10026', 'OV-05', 'เทา', { status: 'removed' }),
];

test('เครื่องเรียง: ตามลำดับโซน · ไม่มีโซนไว้ท้าย · ปลดระวางท้ายสุด', () => {
  assert.deepEqual(sortSiteAssets(ASSETS, ZONES).map((a) => a.id), ['A2', 'A3', 'A1', 'A4', 'A5']);
});

test('กรองเครื่อง — อาคารของโซน · รุ่น · สถานะ · คำค้น', () => {
  const ids = (filters) => filterSiteAssets(ASSETS, BY_ID, filters).map((a) => a.id);
  assert.deepEqual(ids({ building: 'The Empire Tower1' }), ['A3', 'A1', 'A2', 'A5']);
  assert.deepEqual(ids({ building: NO_BUILDING }), ['A4']);
  assert.deepEqual(ids({ models: ['OV-05|เทา'] }), ['A2', 'A5']);
  assert.deepEqual(ids({ statuses: ['removed'] }), ['A5']);
  assert.deepEqual(ids({ query: 'mc-a1' }), ['A1']);
  assert.deepEqual(ids({ query: 'tower1_9' }), ['A3']);
});

test('สรุปรุ่น — ไม่นับปลดระวาง · มากไปน้อย', () => {
  assert.deepEqual(assetModelSummary(ASSETS).map((s) => [s.label, s.count]), [['M240 ขาว', 2], ['OV-05 เทา', 1], ['OV-08 ดำ', 1]]);
  assert.deepEqual(assetModelSummary([{ model: 'Reed100ML', colour: null, status: 'active' }]).map((s) => s.label), ['Reed100ML']);
});

/* ── ยามรูปโค้ดของหน้าไซต์ — ตารางยาวต้องมีเครื่องมือจริง ไม่ใช่แค่ logic ที่ไม่มีใครเรียก ── */
const PAGE = fs.readFileSync(path.resolve(import.meta.dirname, '../../app/database/sites/[id]/page.js'), 'utf8');

test('หน้าไซต์: ตารางโซนกับอุปกรณ์เป็น ListPanel ที่มีช่องค้นหาและ Pager', () => {
  assert.equal((PAGE.match(/<ListPanel\b/g) || []).length >= 2, true, 'ต้องมี ListPanel สองแผง (โซน · อุปกรณ์)');
  assert.equal((PAGE.match(/<Pager\b/g) || []).length, 2, 'ต้องมี Pager ของทั้งสองตาราง');
  assert.match(PAGE, /filterZones\(/);
  assert.match(PAGE, /filterSiteAssets\(/);
  assert.equal((PAGE.match(/autoComplete="off"/g) || []).length >= 2, true, 'ช่องค้นหาทุกช่องต้องมี autoComplete="off"');
});

test('หน้าไซต์: แถวเครื่องขึ้นรหัส MC บรรทัดบน (รหัสบน · ชื่อล่าง) ไม่ใช่ชื่อรุ่นซ้ำทุกแถว', () => {
  assert.match(PAGE, /asset\.code \|\| asset\.label/);
});

/* ══ ตัวเลขบนหน้าไซต์ = แถวที่เห็น (ตรวจตัวเลข L7 · L7b · 26/10/2026) ══════════════════════════════════════ */
const ONSITE = 'S1';
const NO_BUILDING_ZONE = zone('20001', 'ห้องเก็บของ', null, '01');
const ZONES_L7 = [...ZONES, NO_BUILDING_ZONE];
const BY_ID_L7 = new Map(ZONES_L7.map((z) => [z.id, z]));
const FLEET = [
  asset('U1', null, 'M240', 'ขาว', { siteId: ONSITE }),                                   // ใช้งานอยู่ ไม่มีโซน → นับ
  asset('U2', null, 'M240', 'ขาว', { siteId: ONSITE, status: 'repair' }),                 // ซ่อม อยู่ที่ไซต์ ไม่มีโซน → นับ
  asset('U3', null, 'OV-05', 'เทา', { siteId: ONSITE, status: 'removed' }),               // ปลดระวาง ไม่มีโซน → ไม่นับ
  asset('U4', null, 'OV-05', 'เทา', { siteId: ONSITE, status: 'in_stock' }),              // ว่าง (ไม่อยู่หน้างาน) → ไม่นับ
  asset('Z1', NO_BUILDING_ZONE.id, 'OV-08', 'ดำ', { siteId: ONSITE }),                    // อยู่ในโซนที่ไม่กรอกอาคาร → ไม่นับ
  asset('Z2', '10026', 'OV-05', 'เทา', { siteId: ONSITE, condition: 'broken' }),
  asset('Z3', '10026', 'OV-05', 'เทา', { siteId: ONSITE, status: 'removed' }),            // ปลดระวางแต่ยังจำโซนเดิม
  asset('Z4', '10026', 'OV-05', 'เทา', { siteId: ONSITE, status: 'in_stock' }),
];

/* จำลองหน้าไซต์: ตัวกรองสองขั้น (ทุกอย่างยกเว้นอาคาร → อาคาร) แบบเดียวกับ assetsByFilters → shownAssets */
const shownOnPage = ({ query = '', models = [], statuses = [], unzoned = false, building = ALL_BUILDINGS } = {}) => {
  const byFilters = filterSiteAssets(sortSiteAssets(FLEET, ZONES_L7), BY_ID_L7, { query, models, statuses, unzoned });
  return { byFilters, shown: filterSiteAssets(byFilters, BY_ID_L7, { building }) };
};

test('L7 🔴 แถบ "ยังไม่ระบุโซน N" = แถวหลังกด "ดู N รายการ" — ไม่นับปลดระวาง/ว่าง/โซนที่ไม่มีอาคาร', () => {
  const n = FLEET.filter(isUnzonedOnSiteAsset).length;
  assert.equal(n, 2);
  // ก่อนกด: มีคำค้น/รุ่น/สถานะ/อาคารค้างอยู่ — ปุ่มล้างทั้งชุดแล้วตั้ง unzoned
  const before = shownOnPage({ query: 'tower1', models: ['OV-05|เทา'], statuses: ['removed'], building: 'The Empire Tower1' });
  assert.notEqual(before.shown.length, n);
  const after = shownOnPage({ unzoned: true });
  assert.deepEqual(after.shown.map((a) => a.id).sort(), ['U1', 'U2']);
  assert.equal(after.shown.length, n, 'ป้ายจำนวนแผง (shownAssets.length) = เลขบนแถบ');
  // ชิป "ไม่ระบุอาคาร" ไม่ใช่ชุดเดียวกัน (รวมโซนไม่กรอกอาคาร + ปลดระวาง + ว่าง) ⇒ ต้องมีตัวกรองของตัวเอง
  assert.notEqual(filterSiteAssets(FLEET, BY_ID_L7, { building: NO_BUILDING }).length, n);
});

test('L7 ชิปอาคารนับตามตัวกรอง "ยังไม่ระบุโซน" ด้วย (ใช้ที่ขั้น assetsByFilters)', () => {
  const { byFilters } = shownOnPage({ unzoned: true });
  const chips = buildingChipOptions(byFilters.map((a) => assetBuildingKey(a, BY_ID_L7)), [...ZONES_L7.map((z) => z.building), null]);
  const noBuilding = chips.find((c) => c.value === NO_BUILDING);
  assert.equal(noBuilding.count, 2);
  for (const chip of chips.filter((c) => c.value !== ALL_BUILDINGS && c.value !== NO_BUILDING)) assert.equal(chip.count, 0, chip.label);
  assert.equal(shownOnPage({ unzoned: true, building: NO_BUILDING }).shown.length, noBuilding.count);
});

test('L7b(a) หัวแผงใช้คำของตัวเลือก "สถานะ" · เลขแต่ละคำ = แถวจากตัวเลือกชื่อเดียวกัน · ชำรุดนำหน้าด้วย "สภาพ"', () => {
  const parts = assetPanelSummary(FLEET);
  assert.deepEqual(parts.map((p) => `${p.label} ${p.count}`), ['ใช้งานอยู่ 3', 'ว่าง 2', 'ซ่อม 1', 'ปลดระวาง 2', 'สภาพชำรุด 1']);
  for (const part of parts.filter((p) => p.status)) {
    assert.equal(part.label, ASSET_STATUS_LABELS[part.status]);
    assert.equal(shownOnPage({ statuses: [part.status] }).shown.length, part.count, part.label);
  }
  // กองสถานะครบ ⇒ รวมกันเท่าจำนวนเครื่อง (สภาพเป็นแกนที่สอง ไม่บวกรวม)
  assert.equal(parts.filter((p) => p.status).reduce((n, p) => n + p.count, 0), FLEET.length);
  // ใช้งานอยู่/ซ่อมขึ้นเสมอแม้เป็นศูนย์ (แบบเดิม) · กองอื่นที่เป็นศูนย์ตัดทิ้ง
  assert.deepEqual(assetPanelSummary([]).map((p) => `${p.label} ${p.count}`), ['ใช้งานอยู่ 0', 'ซ่อม 0']);
});

test('L7b(b) สรุปรุ่นไม่นับปลดระวาง — ตัวเลือก "รุ่น" รวม ⇒ บรรทัดบนจอต้องบอกด้วยคำนำหน้า', () => {
  const ov05 = assetModelSummary(FLEET).find((s) => s.key === 'OV-05|เทา');
  assert.equal(ov05.count, 3);
  assert.equal(shownOnPage({ models: ['OV-05|เทา'] }).shown.length, 5, 'ตัวเลือกรุ่นเห็นปลดระวางด้วย — เลขไม่ใช่ปลายทางของการกด');
  assert.equal(MODEL_SUMMARY_PREFIX, 'ไม่นับปลดระวาง:');
});

test('L7b(c) 🔴 "N เครื่อง" บนแถวโซน = "อุปกรณ์ในโซน M ตัว" ของหน้าโซน แม้มีเครื่องปลดระวางค้างโซนเดิม', () => {
  const counts = zoneAssetCounts(FLEET);
  // หน้าโซน: เครื่องที่ zoneId ตรง (ทุกสถานะ) → นับด้วยตัวตัดสินเดียวกัน
  const zonePageCount = (zoneId) => FLEET.filter((a) => a.zoneId === zoneId).filter(countsAsZoneAsset).length;
  assert.equal(FLEET.filter((a) => a.zoneId === '10026').length, 3, 'ฐานข้อมูลยังจำโซนของเครื่องปลดระวาง');
  assert.equal(counts.get('10026'), 2);
  for (const z of ZONES_L7) assert.equal(counts.get(z.id) || 0, zonePageCount(z.id), z.name);
});

test('L7b(c) 🔴 การ์ดโซนของหน้าเครื่อง "เครื่องในโซน N ตัว" = หน้าโซนที่การ์ดพาไป — รวมตอนดูเครื่องที่ปลดระวางเอง', () => {
  const zonePageCount = (zoneId) => FLEET.filter((a) => a.zoneId === zoneId).filter(countsAsZoneAsset).length;
  /* จำลอง assetDetail.js: zoneAssets = เครื่องของไซต์ที่ zoneId ตรง (loadAssets ไม่กรองสถานะ) → การ์ดนับด้วยตัวตัดสินเดียวกัน */
  const assetCardCount = (viewed) => FLEET.filter((a) => a.zoneId && a.zoneId === viewed.zoneId).filter(countsAsZoneAsset).length;
  for (const viewed of FLEET.filter((a) => a.zoneId)) {
    assert.equal(assetCardCount(viewed), zonePageCount(viewed.zoneId), viewed.id);
  }
  const retired = FLEET.find((a) => a.id === 'Z3');
  assert.equal(FLEET.filter((a) => a.zoneId === retired.zoneId).length, 3, 'นับดิบ = 3 (รวมปลดระวาง) — เลขที่เคยขึ้นบนการ์ด');
  assert.equal(assetCardCount(retired), 2);
});

/* ── ยามรูปโค้ด: สองหน้าถามตัวตัดสินเดียวกัน ไม่เทียบสถานะเอง ── */
const ZONE_PAGE = fs.readFileSync(path.resolve(import.meta.dirname, '../../app/database/sites/[id]/zones/[zoneId]/page.js'), 'utf8');
const liveSrc = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

test('หน้าไซต์/หน้าโซน: เลขทุกตัวของ L7/L7b มาจาก lib ตัวเดียว', () => {
  const page = liveSrc(PAGE);
  assert.match(page, /assets\.filter\(isUnzonedOnSiteAsset\)\.length/);
  assert.match(page, /unzoned: assetUnzoned/);
  assert.match(page, /resetKey: JSON\.stringify\(\[[^\]]*assetUnzoned\]\)/);
  assert.match(page, /กรอง: ยังไม่ระบุโซน ×/);
  assert.match(page, /onClick=\{showUnzonedAssets\}/);
  const show = page.match(/const showUnzonedAssets = [\s\S]*?\n {2}\};/)?.[0] || '';
  for (const call of ['setAssetQuery("")', 'setAssetBuilding(ALL_BUILDINGS)', 'setAssetModels([])', 'setAssetStatuses([])', 'setAssetUnzoned(true)']) {
    assert.ok(show.includes(call), call);
  }
  assert.match(page, /zoneAssetCounts\(assets\)/);
  assert.match(page, /assetPanelSummary\(assets\)/);
  assert.match(page, /\{MODEL_SUMMARY_PREFIX\}/);
  assert.doesNotMatch(page, /status !== "removed"/, 'ห้ามเทียบสถานะเองบนหน้าไซต์');
  assert.doesNotMatch(page, /อยู่ในคลัง \$\{|ส่งซ่อม \$\{/, 'คำบนหัวแผงต้องมาจาก ASSET_STATUS_LABELS');
  const zonePage = liveSrc(ZONE_PAGE);
  assert.match(zonePage, /zoneAssetsEver\.filter\(countsAsZoneAsset\)/);
  assert.match(zonePage, /\$\{fmtNumber\(zoneAssets\.length\)\} ตัว/);
  // การ์ดข้าง: หัวเป็นจำนวนเต็ม ⇒ ตัดลิสต์เมื่อไรต้องบอกบนการ์ด (ทรงเดียวกับการ์ดจุดติดตั้ง)
  assert.match(zonePage, /const ASSET_PREVIEW = 6;/);
  assert.match(zonePage, /zoneAssets\.slice\(0, ASSET_PREVIEW\)/);
  assert.match(zonePage, /subtitle=\{zoneAssets\.length > ASSET_PREVIEW \? `แสดง \$\{ASSET_PREVIEW\} ตัวแรก — /);
  assert.doesNotMatch(zonePage, /zoneAssets\.slice\(0, 6\)/, 'ห้ามตัดลิสต์เงียบ');
});

/* หน้าเครื่องเป็นทางที่สองที่พาเข้าหน้าโซน (การ์ด "โซน" ทั้งใบเป็นลิงก์) ⇒ เลขบนการ์ดต้องถามตัวตัดสินเดียวกัน
   🐞 ตรวจตัวเลข L7b(c) รอบสอง 26/10: แก้หน้าโซนให้ไม่นับปลดระวางแล้ว แต่การ์ดยังนับ `data.zoneAssets` ดิบ
      ⇒ ความไม่ตรงย้ายจากแถวโซนของหน้าไซต์ไปอยู่ที่การ์ดของหน้าเครื่อง ("4 ตัว" → หน้าโซน "3 ตัว") */
const ASSET_PAGE = fs.readFileSync(path.resolve(import.meta.dirname, '../../app/database/assets/[id]/page.js'), 'utf8');

test('หน้าเครื่อง: การ์ดโซน "เครื่องในโซน" นับด้วย countsAsZoneAsset (เลขเดียวกับหน้าโซนที่การ์ดพาไป)', () => {
  const page = liveSrc(ASSET_PAGE);
  assert.match(page, /import \{[^}]*\bcountsAsZoneAsset\b[^}]*\} from "@\/lib\/service\/siteDetailLists"/);
  assert.match(page, /zoneAssets \|\| \[\]\)\.filter\(countsAsZoneAsset\)\.length/);
});
