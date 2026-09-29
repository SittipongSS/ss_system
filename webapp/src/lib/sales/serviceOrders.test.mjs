// ── เกณฑ์ "ใบไหนมีรอบบริการ" (มติ 2026-08-30) — logic ล้วน ────────────────
//
// กติกาที่ชุดนี้ล็อก: ต้องครบสองข้อ (สาย SERVICE + มีบรรทัดหมวด 02-001) ·
// ตัดสินระดับใบไม่ใช่รายบรรทัด · สายที่ยังไม่ระบุ (null) ไม่ใช่ "ไม่ใช่บริการ" แต่ก็ยังไม่เข้าเส้น ·
// อ่านหมวดจาก fgCode ที่ตรึงบนบรรทัด ไม่ใช่จากทะเบียนสินค้าสด
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_ROUND_CATEGORY,
  hasServicePackageLine,
  lineIsServicePackage,
  orderBusinessLineOf,
  orderHasServiceRounds,
} from './serviceOrders.js';

const svcLine = (over = {}) => ({ id: 'L1', fgCode: 'FG-0233-02-001-10001', qty: 6, ...over });
const otherLine = (over = {}) => ({ id: 'L9', fgCode: 'FG-0233-01-002-10001', qty: 1, ...over });
const serviceDeal = { id: 'DL1', line: 'SERVICE' };
const productDeal = { id: 'DL2', line: 'PRODUCT' };

test('หมวดที่ทำให้ใบเข้าเส้นบริการคือ 02-001 ค่าเดียว', () => {
  assert.equal(SERVICE_ROUND_CATEGORY, '02-001');
});

test('อ่านหมวดจาก fgCode ได้ทั้งรหัสออโต้และรหัสกรอกมือ', () => {
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-02-001-10001' }), true); // ออโต้
  assert.equal(lineIsServicePackage({ fgCode: 'FG-233-02-001-1234' }), true); // กรอกมือ
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-02-002-10001' }), false); // หมวดอื่นใน 02
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-01-001-10001' }), false); // กลุ่มหลักอื่น
  assert.equal(lineIsServicePackage({ fgCode: null }), false);
  assert.equal(lineIsServicePackage(null), false);
});

test('⭐ ใบมีบรรทัด 02-001 อย่างน้อยหนึ่งบรรทัด = ทั้งใบเข้าเกณฑ์ (ไม่ตัดสินรายบรรทัด)', () => {
  const lines = [otherLine({ id: 'A' }), svcLine({ id: 'B' }), otherLine({ id: 'C' })];
  assert.equal(hasServicePackageLine(lines), true);
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, lines), true);
});

test('สาย SERVICE แต่ไม่มีบรรทัด 02-001 เลย = ไม่มีรอบบริการ', () => {
  const lines = [otherLine(), otherLine({ id: 'C' })];
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, lines), false);
});

test('มีบรรทัด 02-001 แต่ดีลเป็นสายสินค้า = ไม่เข้าเส้นบริการ', () => {
  assert.equal(orderHasServiceRounds({ dealId: 'DL2', deal: productDeal }, [svcLine()]), false);
});

test('⭐ สายที่ยังไม่ระบุ (null) ยังไม่เข้าเส้น — และห้ามถูกอ่านว่าเป็นสายสินค้า', () => {
  const order = { dealId: 'DL3', deal: { id: 'DL3', line: null } };
  assert.equal(orderHasServiceRounds(order, [svcLine()]), false);
  assert.equal(orderBusinessLineOf(order), null);
});

test('โครงการมาก่อนดีลเสมอ — โครงการเป็นเจ้าของค่าสายจริง', () => {
  const order = { projectId: 'PJ1', project: { id: 'PJ1', line: 'SERVICE' }, dealId: 'DL2', deal: productDeal };
  assert.equal(orderBusinessLineOf(order), 'SERVICE');
  assert.equal(orderHasServiceRounds(order, [svcLine()]), true);
});

test('โครงการที่ยังไม่ระบุสาย ตกไปถามดีลต่อ ไม่ใช่ตอบ null ทันที', () => {
  const order = { projectId: 'PJ2', project: { id: 'PJ2', line: null }, dealId: 'DL1', deal: serviceDeal };
  assert.equal(orderBusinessLineOf(order), 'SERVICE');
});

test('เรียกจากคิวงานที่มี Map ของหลายใบก็ได้ผลเดียวกัน', () => {
  const ctx = {
    projectsById: new Map([['PJ1', { id: 'PJ1', line: 'SERVICE' }]]),
    dealsById: new Map([['DL2', productDeal]]),
  };
  assert.equal(orderHasServiceRounds({ projectId: 'PJ1', dealId: 'DL2' }, [svcLine()], ctx), true);
});

test('ไม่ส่ง lines มา ใช้ order.lines ที่ติดมากับใบ', () => {
  const order = { dealId: 'DL1', deal: serviceDeal, lines: [svcLine()] };
  assert.equal(orderHasServiceRounds(order), true);
});

test('ใบเปล่า/ไม่มีบรรทัด = ไม่เข้าเกณฑ์ ไม่ throw', () => {
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, []), false);
  assert.equal(orderHasServiceRounds(null, null), false);
});

/* ══ mig 0392 (PR-A): บรรทัดพิมพ์เองที่ฝ่ายขายเลือกแพ็คเกจให้ (`serviceFgCode`) ═══════════════════════════════
   🔴 ด่านเงิน (#1683) ขยายได้ **หลังใบประทับ `serviceTermsOpenedAt` แล้วเท่านั้น** — ก่อนนั้นตอบเหมือนเดิมทุกทาง */
import { effectiveServiceFgCode, serviceVisitsSold, siteRoundsSoldOf } from './serviceOrders.js';

const manualPkg = (over = {}) => ({ id: 'M1', fgCode: null, productId: null, serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-0233-02-001-10001', serviceRounds: 12, ...over });

test('effectiveServiceFgCode — FG ของบรรทัดก่อนเสมอ · serviceFgCode นับเมื่อใบประทับแล้วเท่านั้น', () => {
  assert.equal(effectiveServiceFgCode({ fgCode: 'FG-0233-01-002-10001', serviceFgCode: 'FG-0233-02-001-10001' }, { serviceTermsOpenedAt: '2026-10-01T00:00:00Z' }), 'FG-0233-01-002-10001');
  assert.equal(effectiveServiceFgCode(manualPkg(), null), null);
  assert.equal(effectiveServiceFgCode(manualPkg(), { serviceTermsOpenedAt: null }), null);
  assert.equal(effectiveServiceFgCode(manualPkg(), { serviceTermsOpenedAt: '2026-10-01T00:00:00Z' }), 'FG-0233-02-001-10001');
  assert.equal(effectiveServiceFgCode(null), null);
});

test('🔴 บรรทัดพิมพ์เองแบบเก่า (ไม่มี serviceFgCode) ไม่เข้าเกณฑ์แคบ แม้ใบประทับแล้ว', () => {
  const legacy = { id: 'M0', fgCode: null };
  const stamped = { dealId: 'DL1', deal: serviceDeal, serviceTermsOpenedAt: '2026-10-01T00:00:00Z' };
  assert.equal(lineIsServicePackage(legacy, stamped), false);
  assert.equal(orderHasServiceRounds(stamped, [legacy]), false);
});

test('🔴 บรรทัดพิมพ์เองที่เลือกแพ็คเกจ 02-001 แล้ว: ไม่แคบจนกว่าใบประทับ · ประทับแล้วแคบ', () => {
  const draft = { dealId: 'DL1', deal: serviceDeal, serviceTermsOpenedAt: null };
  const stamped = { ...draft, serviceTermsOpenedAt: '2026-10-01T00:00:00Z' };
  assert.equal(lineIsServicePackage(manualPkg(), draft), false);
  assert.equal(orderHasServiceRounds(draft, [manualPkg()]), false, 'ร่าง/รอตรวจ ห้ามเปลี่ยนพฤติกรรมของบัญชี');
  assert.equal(lineIsServicePackage(manualPkg(), stamped), true);
  assert.equal(hasServicePackageLine([manualPkg()], stamped), true);
  assert.equal(orderHasServiceRounds(stamped, [manualPkg()]), true);
});

test('บรรทัด FG 02-001 แคบเหมือนเดิม · ตัวเรียกที่ไม่ส่งใบ (ตัวเลือกสินค้า) ได้ผลเดิม', () => {
  assert.equal(lineIsServicePackage(svcLine(), null), true);
  assert.equal(lineIsServicePackage(svcLine(), { serviceTermsOpenedAt: null }), true);
  // วัตถุสินค้า (ไม่มี serviceFgCode) ไม่ส่งใบ = เหมือนเดิมทุกตัว
  assert.equal(lineIsServicePackage({ id: 'P1', fgCode: 'FG-0233-02-001-10001' }), true);
  assert.equal(lineIsServicePackage({ id: 'P2', fgCode: 'FG-0233-03-002-10001' }), false);
  // .filter(lineIsServicePackage) ส่ง index มาเป็นอาร์กิวเมนต์ที่สอง — ต้องไม่พัง และตอบเหมือนเดิม
  assert.deepEqual([{ fgCode: 'FG-0233-02-001-10001' }, { fgCode: null }].filter(lineIsServicePackage).length, 1);
});

/* ── n/N ของ TS: Σ รายไซต์ของ "รอบสูงสุดของบรรทัดที่ผูกไซต์นั้น" (D23) ──────────────────────── */
const zonesById = new Map([
  ['Z1', { id: 'Z1', siteId: 'S1' }],
  ['Z2', { id: 'Z2', siteId: 'S1' }],
  ['Z3', { id: 'Z3', siteId: 'S2' }],
]);

test('serviceVisitsSold — บรรทัดเดียวสองโซนในไซต์เดียว นับครั้งเดียว', () => {
  const lines = [{ id: 'L1', serviceRounds: 12 }];
  const links = [{ salesOrderLineId: 'L1', zoneId: 'Z1' }, { salesOrderLineId: 'L1', zoneId: 'Z2' }];
  const out = serviceVisitsSold({ lines, links, zonesById });
  assert.equal(out.total, 12);
  assert.equal(out.mixed, false);
  assert.deepEqual(out.bySite.get('S1'), { rounds: 12, mixed: false, values: [12] });
});

test('serviceVisitsSold — หลายบรรทัดในไซต์เดียวเอารอบสูงสุด + ธงรอบไม่เท่ากัน · รวมข้ามไซต์', () => {
  const lines = [{ id: 'L1', serviceRounds: 12 }, { id: 'L2', serviceRounds: 8 }, { id: 'L3', serviceRounds: 6 }];
  const links = [
    { salesOrderLineId: 'L1', zoneId: 'Z1' },
    { salesOrderLineId: 'L2', zoneId: 'Z2' },
    { salesOrderLineId: 'L3', zoneId: 'Z3' },
  ];
  const out = serviceVisitsSold({ lines, links, zonesById });
  assert.deepEqual(out.bySite.get('S1'), { rounds: 12, mixed: true, values: [12, 8] }, 'ค่าที่ต่างกันเรียงมากไปน้อย — จอบอก "12 · 8 รอบ"');
  assert.deepEqual(out.bySite.get('S2'), { rounds: 6, mixed: false, values: [6] });
  assert.equal(out.total, 18);
  assert.equal(out.mixed, true);
});

test('serviceVisitsSold — ไม่มีบรรทัดไหนกรอกรอบ = null (ไม่ใช่ 0) · ไม่มีลิงก์ = null · โซนที่ไม่รู้ไซต์ข้าม', () => {
  const none = serviceVisitsSold({ lines: [{ id: 'L1', serviceRounds: null }], links: [{ salesOrderLineId: 'L1', zoneId: 'Z1' }], zonesById });
  assert.equal(none.total, null);
  assert.deepEqual(none.bySite.get('S1'), { rounds: null, mixed: false, values: [] });
  assert.equal(serviceVisitsSold().total, null);
  const unknown = serviceVisitsSold({ lines: [{ id: 'L1', serviceRounds: 4 }], links: [{ salesOrderLineId: 'L1', zoneId: 'ZX' }], zonesById });
  assert.equal(unknown.total, null);
  assert.equal(unknown.bySite.size, 0);
});

test('F18: ขายไว้กี่รอบของไซต์เดียว (หน้าไซต์) — ใบที่ประทับแล้วนับรอบสูงสุดของบรรทัด (เท่าแถวรอตั้งรอบ) · ใบเดิมรวมรายบรรทัดตามเดิม', () => {
  const siteZones = new Map([['Z1', { id: 'Z1', siteId: 'S1' }], ['Z2', { id: 'Z2', siteId: 'S1' }]]);
  const lines = [{ id: 'L1', serviceRounds: 12 }, { id: 'L2', serviceRounds: 4 }];
  const terms = [
    { salesOrderId: 'SO1', salesOrderLineId: 'L1', zoneId: 'Z1' },
    { salesOrderId: 'SO1', salesOrderLineId: 'L2', zoneId: 'Z2' },
  ];
  const stamped = [{ id: 'SO1', serviceTermsOpenedAt: '2026-10-01T03:00:00Z' }];
  assert.equal(siteRoundsSoldOf({ orders: stamped, terms, lines, zonesById: siteZones }), 12, 'ไม่ใช่ 16 — ไปไซต์ทีเดียวทำทุกโซน');
  const legacy = [{ id: 'SO1', serviceTermsOpenedAt: null }];
  assert.equal(siteRoundsSoldOf({ orders: legacy, terms, lines, zonesById: siteZones }), 16, 'ใบเดิมยังนับแบบเดิม (serviceRoundsSold)');
  // สองใบที่ยังมีผลที่ไซต์เดียว (ต่ออายุซ้อน) = รวมกัน · ไม่มีรอบเลย = null
  const two = [...stamped, { id: 'SO2', serviceTermsOpenedAt: '2026-11-01T03:00:00Z' }];
  const twoTerms = [...terms, { salesOrderId: 'SO2', salesOrderLineId: 'L3', zoneId: 'Z1' }];
  assert.equal(siteRoundsSoldOf({ orders: two, terms: twoTerms, lines: [...lines, { id: 'L3', serviceRounds: 6 }], zonesById: siteZones }), 18);
  assert.equal(siteRoundsSoldOf({ orders: stamped, terms, lines: [{ id: 'L1', serviceRounds: null }], zonesById: siteZones }), null);
  assert.equal(siteRoundsSoldOf(), null);
});
