// ── ตัวเลือก "ไซต์ · โซน" ของตารางงานบริการบนใบสั่งขาย + หน้าต่าง "เพิ่มหลายโซน" (PR-A · mig 0391) ──────────
//
// สิ่งที่ชุดนี้ล็อกไว้: จัดกลุ่มตามไซต์ · ไซต์/โซนที่ปิดใช้งาน = เห็นแต่เลือกไม่ได้ (ยกเว้นแถวที่เลือกไว้แล้ว) ·
// โซนซ้ำในบรรทัดเดียวกัน = เลือกไม่ได้ / อยู่บรรทัดอื่น = แค่บอก · โซนที่แถวนี้ถืออยู่แต่ทะเบียนไม่มี = ตัวเลือกบอกเหตุบนสุด ·
// คำค้น = ทุกอย่างที่ตาเห็น · รูปร่างตรงกับตัวเลือกของใบย้อนหลัง (historicalZonePickerOptions) เมื่อข้อมูลชุดเดียวกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE_INACTIVE, ZONE_SITE_INACTIVE, ZONE_TAKEN_SAME_LINE,
  registryIndex, zoneBrowserRows, zonePickerOptions, zoneTakenMap, zoneTakenOtherLine,
} from './zonePickerOptions.js';
import { historicalZonePickerOptions } from '../sales/historicalIntakeForm.js';

/* รูปเดียวกับที่ GET /api/service/customers/[customerId]/zones คืน (customerZoneRegistry → zoneRegistryRow) */
const zone = (id, siteId, over = {}) => ({
  id, code: `ZN-${id}`, name: `Lobby ${id}`, siteId, isActive: true, assessedPackages: null, ...over,
});
const site = (id, zones, over = {}) => ({ id, code: `ST-${id}`, name: `สาขา ${id}`, isActive: true, zones, ...over });

const REGISTRY = [
  site('S1', [zone('Z1', 'S1', { name: 'Lobby', assessedPackages: 2 }), zone('Z2', 'S1', { name: 'ห้องประชุม' })], { name: 'บางนา' }),
  site('S2', [zone('Z3', 'S2', { name: 'ทางเข้า' })], { name: 'สีลม' }),
  site('S3', [], { name: 'ยังไม่เคยประเมิน' }),
];

const zonesOnly = (options) => options.filter((o) => !o.group);

test('registryIndex — ไซต์ตามลำดับ · Map โซน/ไซต์ · โซนที่ไม่มี siteId ได้ของไซต์แม่', () => {
  const index = registryIndex([
    ...REGISTRY,
    site('S4', [{ id: 'Z9', code: 'ZN-Z9', name: 'ไม่มี siteId' }]),
    { id: 'S1', zones: [zone('Z1', 'S1', { name: 'ซ้ำ' })] }, // ไซต์ซ้ำ = ตัวแรกชนะ
    null,
  ]);
  assert.deepEqual(index.sites.map((s) => s.id), ['S1', 'S2', 'S3', 'S4']);
  assert.equal(index.zonesById.get('Z1').name, 'Lobby');
  assert.equal(index.zonesById.get('Z9').siteId, 'S4');
  assert.equal(index.siteById.get('S2').name, 'สีลม');
  assert.equal(index.zonesById.size, 4);
  assert.deepEqual(registryIndex(undefined), { sites: [], zonesById: new Map(), siteById: new Map() });
});

test('zonePickerOptions — หัวกลุ่ม = ไซต์ (site:<id> · "ST-… ชื่อ") · ตัวเลือก = "ZN-… · ชื่อโซน" · ไซต์ไม่มีโซนไม่ขึ้นหัวลอย', () => {
  const options = zonePickerOptions({ registrySites: REGISTRY });
  assert.deepEqual(options.map((o) => o.value), ['site:S1', 'Z1', 'Z2', 'site:S2', 'Z3']);
  assert.deepEqual(options[0], { value: 'site:S1', label: 'ST-S1 บางนา', group: true });
  assert.deepEqual(options[1], {
    value: 'Z1', label: 'ZN-Z1 · Lobby', zoneName: 'Lobby', zoneCode: 'ZN-Z1',
    siteId: 'S1', siteCode: 'ST-S1', siteName: 'บางนา', assessedPackages: 2,
    disabled: false, why: null, search: 'st-s1 บางนา lobby zn-z1',
  });
  assert.equal(options[2].assessedPackages, null, 'ยังไม่ประเมิน = null ไม่ใช่ 0');
});

test('zonePickerOptions — ไซต์/โซนปิดใช้งาน: เห็นพร้อมเหตุแต่เลือกไม่ได้ · แถวที่ถืออยู่แล้วยังคงเลือกค้างไว้ได้ (ถอนออกได้เสมอ)', () => {
  const registry = [
    site('S1', [zone('Z1', 'S1'), zone('Z2', 'S1', { isActive: false })]),
    site('S2', [zone('Z3', 'S2')], { isActive: false }),
  ];
  const byValue = (options) => new Map(zonesOnly(options).map((o) => [o.value, o]));
  const fresh = byValue(zonePickerOptions({ registrySites: registry }));
  assert.deepEqual([fresh.get('Z2').disabled, fresh.get('Z2').why], [true, ZONE_INACTIVE]);
  assert.deepEqual([fresh.get('Z3').disabled, fresh.get('Z3').why], [true, ZONE_SITE_INACTIVE]);
  assert.deepEqual([fresh.get('Z1').disabled, fresh.get('Z1').why], [false, null]);
  assert.equal(ZONE_INACTIVE, 'ปิดใช้งานในทะเบียน');
  assert.equal(ZONE_SITE_INACTIVE, 'ไซต์ปิดใช้งานในทะเบียน');

  const mine = byValue(zonePickerOptions({ registrySites: registry, currentZoneId: 'Z2' }));
  assert.deepEqual([mine.get('Z2').disabled, mine.get('Z2').why], [false, ZONE_INACTIVE], 'เหตุยังขึ้น แต่ไม่ล็อกค่าที่ถืออยู่');
});

test('zonePickerOptions — โซนซ้ำ: บรรทัดเดียวกัน = เลือกไม่ได้ · อยู่บรรทัดอื่น = บอกเฉย ๆ เลือกได้', () => {
  const taken = new Map([
    ['Z1', { why: ZONE_TAKEN_SAME_LINE, block: true }],
    ['Z2', { why: zoneTakenOtherLine(3), block: false }],
    ['Z3', 'อยู่ในรายการนี้แล้ว'], // สตริงเปล่า ๆ = ติดเสมอ
  ]);
  const options = new Map(zonesOnly(zonePickerOptions({ registrySites: REGISTRY, taken })).map((o) => [o.value, o]));
  assert.deepEqual([options.get('Z1').disabled, options.get('Z1').why], [true, 'อยู่ในรายการนี้แล้ว']);
  assert.deepEqual([options.get('Z2').disabled, options.get('Z2').why], [false, 'อยู่ในรายการ 3 ด้วย']);
  assert.equal(options.get('Z3').disabled, true);

  /* object ธรรมดาใช้แทน Map ได้ · โซนที่ปิดใช้งานและอยู่บรรทัดอื่นด้วย = เหตุปิดใช้งานชนะ (สำคัญกว่า) */
  const closed = [site('S1', [zone('Z1', 'S1', { isActive: false })])];
  const [, z1] = zonePickerOptions({ registrySites: closed, taken: { Z1: { why: zoneTakenOtherLine(2), block: false } } });
  assert.deepEqual([z1.disabled, z1.why], [true, ZONE_INACTIVE]);
});

test('zonePickerOptions — โซนที่แถวนี้ถือแต่ทะเบียนไม่มี ⇒ ตัวเลือกบอกเหตุบนสุด (ไม่งั้นช่องเด้งเป็นว่าง)', () => {
  const options = zonePickerOptions({ registrySites: REGISTRY, currentZoneId: 'ZX' });
  assert.deepEqual(options[0], {
    value: 'ZX', label: 'ZX — ไม่อยู่ในทะเบียนที่โหลดมา', zoneName: 'ZX', zoneCode: null,
    siteId: null, siteCode: null, siteName: null, assessedPackages: null,
    disabled: true, why: null, missing: true, search: 'zx',
  });
  const noted = zonePickerOptions({ registrySites: [], currentZoneId: 'ZX', missingNote: 'กำลังโหลดทะเบียนไซต์…' });
  assert.equal(noted.length, 1);
  assert.equal(noted[0].label, 'กำลังโหลดทะเบียนไซต์…');
  assert.equal(zonePickerOptions({ registrySites: REGISTRY, currentZoneId: 'Z1' }).some((o) => o.missing), false);
});

test('zonePickerOptions — คำค้นเจอทุกอย่างที่ตาเห็น: รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน (ตัวพิมพ์เล็ก)', () => {
  const z1 = zonesOnly(zonePickerOptions({ registrySites: REGISTRY })).find((o) => o.value === 'Z1');
  for (const needle of ['st-s1', 'บางนา', 'lobby', 'zn-z1', 'บางนา lobby']) {
    assert.ok(z1.search.includes(needle), `ค้น "${needle}" ต้องเจอ`);
  }
});

test('zoneTakenMap — บรรทัดเดียวกัน (ยกเว้นแถวตัวเอง) = ติด · บรรทัดอื่น = บอกเลขรายการ · บรรทัดเดียวกันชนะบรรทัดอื่น', () => {
  const lines = [
    { lineId: 'L1', lineNo: 1, zones: [{ zoneId: 'Z1' }, { zoneId: 'Z2' }, { zoneId: '' }] },
    { lineId: 'L3', lineNo: 3, zones: [{ zoneId: 'Z2' }, { zoneId: 'Z3' }] },
  ];
  const forRow0 = zoneTakenMap({ lines, lineId: 'L1', rowIndex: 0 });
  assert.equal(forRow0.has('Z1'), false, 'โซนของแถวตัวเองไม่ติด');
  assert.deepEqual(forRow0.get('Z2'), { why: ZONE_TAKEN_SAME_LINE, block: true });
  assert.deepEqual(forRow0.get('Z3'), { why: 'อยู่ในรายการ 3 ด้วย', block: false });
  assert.equal(forRow0.has(''), false);

  /* หน้าต่าง "เพิ่มหลายโซน" (ไม่มีแถวตัวเอง) — ทุกโซนของบรรทัดนี้ติด */
  const bulk = zoneTakenMap({ lines, lineId: 'L1' });
  assert.deepEqual([...bulk.keys()].sort(), ['Z1', 'Z2', 'Z3']);
  assert.equal(bulk.get('Z1').block, true);
});

test('zoneBrowserRows — จัดกลุ่มตามไซต์ · picked · selectableIds ข้ามตัวที่เลือกไม่ได้ · ไซต์ว่างยังขึ้น (ลูกค้ามีสาขานี้)', () => {
  const registry = [
    site('S1', [zone('Z1', 'S1'), zone('Z2', 'S1', { isActive: false }), zone('Z4', 'S1')]),
    site('S2', [zone('Z3', 'S2')], { isActive: false }),
    site('S3', []),
  ];
  const taken = new Map([['Z4', { why: ZONE_TAKEN_SAME_LINE, block: true }], ['Z1', { why: zoneTakenOtherLine(2), block: false }]]);
  const rows = zoneBrowserRows({ registrySites: registry, taken, picked: new Set(['Z1']) });
  assert.deepEqual(rows.map((r) => r.site.id), ['S1', 'S2', 'S3']);
  const [s1, s2, s3] = rows;
  assert.deepEqual(s1.zones.map((z) => [z.id, z.picked, z.disabled, z.why]), [
    ['Z1', true, false, 'อยู่ในรายการ 2 ด้วย'],
    ['Z2', false, true, ZONE_INACTIVE],
    ['Z4', false, true, ZONE_TAKEN_SAME_LINE],
  ]);
  assert.deepEqual(s1.selectableIds, ['Z1']);
  assert.deepEqual(s2.selectableIds, []);
  assert.equal(s2.zones[0].why, ZONE_SITE_INACTIVE);
  assert.deepEqual([s3.zones, s3.selectableIds], [[], []]);
  /* picked รับ array ได้ด้วย */
  assert.equal(zoneBrowserRows({ registrySites: registry, picked: ['Z4'] })[0].zones[2].picked, true);
});

test('zoneBrowserRows — ค้น: ไซต์ตรง = ทุกโซนของมัน · ตรงบางโซน = เฉพาะโซนนั้น · ไม่ตรงเลย = ซ่อน', () => {
  const byName = zoneBrowserRows({ registrySites: REGISTRY, query: '  บางนา ' });
  assert.deepEqual(byName.map((r) => [r.site.id, r.zones.map((z) => z.id)]), [['S1', ['Z1', 'Z2']]]);
  const byZone = zoneBrowserRows({ registrySites: REGISTRY, query: 'ห้องประชุม' });
  assert.deepEqual(byZone.map((r) => [r.site.id, r.zones.map((z) => z.id)]), [['S1', ['Z2']]]);
  const byCode = zoneBrowserRows({ registrySites: REGISTRY, query: 'ZN-Z3' });
  assert.deepEqual(byCode.map((r) => [r.site.id, r.zones.map((z) => z.id)]), [['S2', ['Z3']]]);
  const across = zoneBrowserRows({ registrySites: REGISTRY, query: 'สีลม ทางเข้า' });
  assert.deepEqual(across.map((r) => r.site.id), ['S2'], 'ชื่อไซต์ต่อชื่อโซนค้นได้ (คำเดียวกับที่ตาเห็นบนแถว)');
  assert.deepEqual(zoneBrowserRows({ registrySites: REGISTRY, query: 'ไม่มีแน่นอน' }), []);
  const emptySite = zoneBrowserRows({ registrySites: REGISTRY, query: 'ยังไม่เคย' });
  assert.deepEqual(emptySite.map((r) => r.site.id), ['S3'], 'ไซต์ว่างที่ชื่อตรงยังขึ้น');
});

test('รูปร่างตรงกับ historicalZonePickerOptions เมื่อข้อมูลชุดเดียวกัน (PR-D จะสลับฟอร์มย้อนหลังมาใช้ตัวนี้)', () => {
  const registry = [
    site('S1', [zone('Z1', 'S1', { name: 'Lobby' }), zone('Z2', 'S1', { name: 'หลังร้าน', isActive: false }), zone('Z5', 'S1')], { name: 'บางนา' }),
    site('S2', [zone('Z3', 'S2', { name: 'ทางเข้า' })], { name: 'สีลม' }),
  ];
  const sites = registry.map(({ zones, ...rest }) => rest);
  const zonesBySite = Object.fromEntries(registry.map((s) => [s.id, s.zones]));
  /* ใบย้อนหลัง: หนึ่งบรรทัดหนึ่งโซน ⇒ "บรรทัดอื่น" ของมัน = "แถวอื่นในบรรทัดเดียวกัน" ของที่นี่ (ติดเหมือนกัน) */
  const rows = [{ key: 'r1', zoneId: 'Z2' }, { key: 'r2', zoneId: 'Z3' }];
  const shape = (options) => options.map((o) => ({
    value: o.value, group: !!o.group, disabled: !!o.disabled, missing: !!o.missing, search: o.search ?? null,
    ...(o.group ? { label: o.label } : {}),
  }));

  for (const rowKey of ['r1', 'r2']) {
    const current = rows.find((r) => r.key === rowKey).zoneId;
    const taken = new Map(rows.filter((r) => r.key !== rowKey).map((r) => [r.zoneId, { why: ZONE_TAKEN_SAME_LINE, block: true }]));
    assert.deepEqual(
      shape(zonePickerOptions({ registrySites: registry, taken, currentZoneId: current })),
      shape(historicalZonePickerOptions({ sites, zonesBySite, rows, rowKey })),
      `แถว ${rowKey}`,
    );
  }

  /* โซนกำพร้า — ทั้งคู่เติมตัวเลือกบอกเหตุไว้บนสุด */
  const orphanRows = [{ key: 'r1', zoneId: 'ZX' }];
  assert.deepEqual(
    shape(zonePickerOptions({ registrySites: registry, currentZoneId: 'ZX', missingNote: 'หาย' })),
    shape(historicalZonePickerOptions({ sites, zonesBySite, rows: orphanRows, rowKey: 'r1', missingNote: 'หาย' })),
  );
});
