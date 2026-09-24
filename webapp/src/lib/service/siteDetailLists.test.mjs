// ตารางโซน/อุปกรณ์บนหน้ารายละเอียดไซต์ — ค้นหา · ชิปอาคาร · เรียง · สรุปรุ่น
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_BUILDINGS,
  NO_BUILDING,
  assetHaystack,
  assetModelSummary,
  buildingChipOptions,
  filterSiteAssets,
  filterZones,
  matchesQuery,
  naturalCompare,
  shortBuildingLabels,
  sortSiteAssets,
  sortZones,
  zoneBuildingKey,
  zoneHaystack,
} from './siteDetailLists.js';

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
