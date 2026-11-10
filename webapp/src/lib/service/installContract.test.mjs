// ── ขั้นเข้าติดตั้ง PR-5c: ผลติดตั้งบนใบสั่งขาย (A3) + การ์ดผลติดตั้งสำหรับทำสัญญา (A6) ───────────────────────────
//
// ⭐ มติเจ้าของ 09/11/2026: สัญญาเป็นราย SO ทำหลังทุกไซต์ที่เลือกติดตั้งเสร็จ · สัญญาระบุจำนวนเครื่องและจุดที่ติด
//    ⇒ การ์ดในแท็บสัญญารวมผลจริงทุกไซต์ + ไซต์ Service จากทะเบียนเครื่อง · ระบบชี้ ไม่ล็อก ไม่เติม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installContractView, installSitesView, machineGroupsText } from './installRequest.js';

const ctx = {
  order: { id: 'SO1', status: 'approved', origin: 'pipeline', serviceTermsOpenedAt: '2026-11-19T03:00:00Z', totalAmount: 0 },
  installments: [],
  allocations: [
    { zoneId: 'Z1', packsPerRound: 2, sortOrder: 1 }, { zoneId: 'Z2', packsPerRound: 1, sortOrder: 2 },
    { zoneId: 'Z3', packsPerRound: 1, sortOrder: 3 }, { zoneId: 'Z9', packsPerRound: 1, sortOrder: 4 },
  ],
  zonesById: new Map([
    ['Z1', { id: 'Z1', code: 'ZN-01', name: 'ทางเข้าหลัก', siteId: 'S1' }], ['Z2', { id: 'Z2', code: 'ZN-02', name: 'โซนผักผลไม้', siteId: 'S1' }],
    ['Z3', { id: 'Z3', code: 'ZN-03', name: 'แคชเชียร์', siteId: 'S1' }], ['Z9', { id: 'Z9', code: 'ZN-91', name: 'ลิฟต์โถง', siteId: 'S2' }],
  ]),
  sitesById: new Map([['S1', { id: 'S1', code: 'ST-01', name: 'FASHION' }], ['S2', { id: 'S2', code: 'ST-03', name: 'สีลม' }]]),
};
const requests = [
  { id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-05' },
  { id: 'R2', salesOrderId: 'SO1', siteId: 'S2', mode: 'none' },
];
const requestZones = [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R1', zoneId: 'Z2' }, { requestId: 'R1', zoneId: 'Z3' }];
const visits = [
  { id: 'V1', code: 'SV-27010007', installRequestId: 'R1', status: 'done', actualDate: '2027-01-05', scheduledDate: '2027-01-05' },
  { id: 'V2', code: 'SV-27010015', installRequestId: 'R1', status: 'draft', scheduledDate: '2027-01-12', tsConfirmedAt: '2027-01-02T03:00:00Z' },
];
const installedAssets = [
  { visitId: 'V1', zoneId: 'Z1', assetId: 'A1', code: 'MC-0231', label: 'OV-10', colour: 'ขาว', spot: 'ฝั่งซ้าย' },
  { visitId: 'V1', zoneId: 'Z1', assetId: 'A2', code: 'MC-0232', label: 'OV-10', colour: 'ขาว', spot: 'ฝั่งขวา' },
  { visitId: 'V1', zoneId: 'Z2', assetId: 'A3', code: 'MC-0198', label: 'OV-08', colour: 'ดำ' },
];
const siteAssets = [{ id: 'A9', siteId: 'S2', zoneId: 'Z9', code: 'MC-0117', label: 'OV-08', colour: 'ดำ', status: 'active' }];
const view = () => installSitesView(ctx, {
  requests, requestZones, visits, visitZonesByVisitId: { V1: ['Z1', 'Z2'], V2: ['Z3'] },
  doneZonesByVisitId: { V1: ['Z1', 'Z2'] }, installedAssets, siteAssets,
});

test('A3: โซนที่ติดตั้งแล้วบอกวัน · ใบส่งงาน · เครื่อง · ไซต์ติดตั้งบางโซน = installed n/N', () => {
  const site = view().sites.find((s) => s.siteId === 'S1');
  const z1 = site.zones.find((z) => z.zoneId === 'Z1');
  assert.deepEqual([z1.installed.date, z1.installed.visitCode, z1.installed.assets.map((a) => a.code)], ['2027-01-05', 'SV-27010007', ['MC-0231', 'MC-0232']]);
  assert.equal(site.zones.find((z) => z.zoneId === 'Z3').installed, null);
  assert.deepEqual([site.installed, site.total, site.stage], [2, 3, 'awaiting_customer']);
});

test('A6: แถวรายโซนของไซต์ติดตั้ง (รอติดตั้ง = แถวจาง) + ไซต์ Service จากทะเบียน · ยอดรวมทั้งใบ', () => {
  const c = installContractView(view());
  const fashion = c.sites.find((s) => s.siteId === 'S1');
  assert.deepEqual(fashion.rows.map((r) => [r.name, r.machines, r.codes.join(','), r.visitCode, r.pending]), [
    ['ทางเข้าหลัก', 'OV-10 ขาว ×2', 'MC-0231,MC-0232', 'SV-27010007', false],
    ['โซนผักผลไม้', 'OV-08 ดำ ×1', 'MC-0198', 'SV-27010007', false],
    ['แคชเชียร์', null, '', null, true],
  ]);
  const silom = c.sites.find((s) => s.siteId === 'S2');
  assert.deepEqual(silom.rows.map((r) => [r.name, r.machines, r.codes.join(',')]), [['ลิฟต์โถง', 'OV-08 ดำ ×1', 'MC-0117']]);
  assert.deepEqual(c.totals.install, { sites: 1, zones: 2, machines: 3, groups: 'OV-10 ขาว ×2 · OV-08 ดำ ×1' });
  assert.deepEqual(c.totals.service, { sites: 1, machines: 1 });
  assert.equal(c.totals.machines, 4);
  assert.equal(c.readiness.ready, false, 'แคชเชียร์ยังไม่ติดตั้ง = ยังไม่พร้อมทำสัญญา');
  assert.equal(machineGroupsText([]), '');
});

test('A6 จอ: แท็บสัญญาบอก "พร้อมทำ" / "หลังติดตั้ง" ตามผลจริง · การ์ดอยู่เหนือการ์ดสัญญาเดิม · ตัวรายงานผลคงที่ (useCallback)', () => {
  const page = readFileSync(new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /installReadiness\.ready \? "สัญญา · พร้อมทำ" : "สัญญา · หลังติดตั้ง"/);
  assert.match(page, /const onInstallLoaded = useCallback\(/);
  const contractTab = page.slice(page.indexOf('activeTab === "contract"'));
  assert.ok(contractTab.indexOf('<InstallContractCard') < contractTab.indexOf('<ServiceContractCard'), 'การ์ดผลติดตั้งอยู่บนสุดของแท็บ');
});
