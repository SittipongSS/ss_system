// ── ตัวตัดสินเดียวของการคีย์ใบสั่งขายย้อนหลัง (พรีวิว = บันทึก) ─────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONTRACT_DATE_MESSAGES, SERVICE_PACKAGE_CATEGORY, historicalServiceFingerprintSource,
  historicalServiceRpcArgs, isCalendarDate, planHistoricalServiceOrder, splitHistoricalAmounts,
} from './historicalOrderPlan.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
import { OPENING_INSTALLMENT_LABEL } from './historicalOrders.js';

/* รุ่นแรกของตัวตัดสิน (โมดัล 0360 · จุดติดตั้งเป็นข้อความ · ยกเว้นด่านเงิน) และตัวตรวจงวดของทางคีย์งวดเพิ่ม
   ถูกลบพร้อมเทสต์ของมัน — เหลือตัวแบ่งยอดตาม VAT · วันในปฏิทิน */
const satang = (n) => Math.round(n * 100);

test('เศษสตางค์ของบรรทัดโยนให้บรรทัดยอดสูงสุด — Σ บรรทัดไม่คลาดจากยอดก่อน VAT', () => {
  const split = splitHistoricalAmounts([100, 100, 100.01], { amountsIncludeVat: true, vatRate: 7 });
  assert.equal(split.lineTotals.reduce((s, v) => s + satang(v), 0), satang(split.subtotal));
  assert.equal(satang(split.subtotal) + satang(split.vatAmount), satang(split.totalAmount));
  const excl = splitHistoricalAmounts([90480], { amountsIncludeVat: false, vatRate: 7 });
  assert.deepEqual(excl, { lineTotals: [90480], subtotal: 90480, vatAmount: 6333.6, totalAmount: 96813.6 });
  const zeroRate = splitHistoricalAmounts([500, 250], { vatRate: 0 });
  assert.deepEqual(zeroRate, { lineTotals: [500, 250], subtotal: 750, vatAmount: 0, totalAmount: 750 });
});

test('วันในปฏิทิน', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2023-02-29'), false);
  assert.equal(isCalendarDate('2024-6-1'), false);
  assert.equal(isCalendarDate(null), false);
});

/* ══ v2 · ใบย้อนหลังงานบริการ (มติเจ้าของ 22/09 · mig 0374) ═══════════════════════════════════
   ข้อมูลชุดม็อก (mockups/legacy-so-service-flow/SPEC.md) — สยามพิวรรธน์ · 4 โซน 17 แพ็ค · 261,936
   ยกมา 196,452 ครอบ ม.ค.–ก.ย. + งวด ต.ค.–ธ.ค. 65,484 = ยอดใบพอดี ครอบต่อเนื่องเต็มสัญญา 2026 */
const V2_TODAY = '2026-09-22';
const spw = { id: 'CUS-SPW', name: 'บจก. สยามพิวรรธน์', nameEn: 'Siam Piwat', approvalStatus: 'approved', isActive: true };
const pim = { id: 'U-PIM', role: 'ae', team: 'SV', teams: ['SV'] };
const pimOwner = { ok: true, ownerId: 'U-PIM', ownerName: 'พิมพ์ชนก รัตนา', team: 'SV', teams: ['SV'] };
const pkg = { id: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจกลิ่นรายเดือน (30 วัน)', saleUnit: 'แพ็ค' };
const oil = { id: 'P-OIL', fgCode: 'FG-SNS-01-002-0001', productDescription: 'น้ำมันหอม', saleUnit: null };
const v2Sites = [
  { id: 'ST-1002', code: 'ST-1002', name: 'สยามพารากอน', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
  { id: 'ST-1044', code: 'ST-1044', name: 'สยามดิสคัฟเวอรี่', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
  { id: 'ST-OTHER', code: 'ST-2001', name: 'ไซต์ลูกค้าอื่น', customerId: 'CUS-OTHER', kind: 'customer', isActive: true },
  { id: 'WH-1', code: 'WH-1', name: 'คลังเครื่อง', customerId: 'CUS-SPW', kind: 'warehouse', isActive: true },
];
const v2Zones = [
  { id: 'Z-1002-01', siteId: 'ST-1002', name: 'ชั้น G ล็อบบี้', isActive: true },
  { id: 'Z-1002-02', siteId: 'ST-1002', name: 'ชั้น M ทางเชื่อม BTS', isActive: true },
  { id: 'Z-1002-03', siteId: 'ST-1002', name: 'ห้องน้ำหญิง ชั้น 1', isActive: true },
  { id: 'Z-1044-01', siteId: 'ST-1044', name: 'ทางเข้าหลัก', isActive: true },
  { id: 'Z-1044-02', siteId: 'ST-1044', name: 'ชั้น 3 โซนเด็ก', isActive: false },
  { id: 'Z-OTHER', siteId: 'ST-OTHER', name: 'ล็อบบี้', isActive: true },
  { id: 'Z-WH', siteId: 'WH-1', name: 'ชั้นวาง A', isActive: true },
];
const v2Ctx = (extra = {}) => ({
  actor: pim, customer: spw, owner: pimOwner, products: [pkg, oil], zones: v2Zones, sites: v2Sites,
  containerDeals: [], existingHistorical: [], liveTermsByZone: null, todayIso: V2_TODAY, selfOrderId: null, ...extra,
});
const zoneRow = (zoneId, packs, lineAmount, extra = {}) => ({ zoneId, productId: 'P-PKG', packs, rounds: 12, lineAmount, ...extra });
const v2Input = (extra = {}) => ({
  customerId: 'CUS-SPW',
  ownerId: 'U-PIM',
  contract: { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' },
  refs: { quote: null, express: null, invoice: 'IV-2601-0412' },
  amountsIncludeVat: false,
  vatRate: 7,
  notes: null,
  zones: [
    zoneRow('Z-1002-01', 6, 86400),
    zoneRow('Z-1002-02', 4, 57600),
    zoneRow('Z-1002-03', 3, 43200),
    zoneRow('Z-1044-01', 4, 57600),
  ],
  opening: { amount: 196452, coversTo: '2026-09-30', paidOn: '2026-09-15', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.' },
  installments: [
    { label: 'งวด ต.ค.–ธ.ค. 2026', amount: 65484, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' },
  ],
  ...extra,
});
const planV2 = (extra = {}, ctxExtra = {}) => planHistoricalServiceOrder(v2Input(extra), v2Ctx(ctxExtra));
const v2Has = (plan, field, pattern) => {
  const hits = plan.errors.filter((e) => e.field === field);
  assert.ok(hits.length, `ต้องมี error ที่ ${field} · ได้ ${JSON.stringify(plan.errors)}`);
  if (pattern) assert.ok(hits.some((e) => pattern.test(e.message)), `${field} ต้องตรง ${pattern} · ได้ ${JSON.stringify(hits)}`);
};
const zonesWith = (index, patch) => v2Input().zones.map((z, i) => (i === index ? { ...z, ...patch } : z));

test('v2 ⭐ ม็อก: ไม่รวม VAT 7% · 4 โซน 17 แพ็ค → ก่อน VAT 244,800 · VAT 17,136 · รวม 261,936 · งวดครบ ครอบต่อเนื่อง', () => {
  const plan = planV2();
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.header.subtotal, 244800);
  assert.equal(plan.header.vatAmount, 17136);
  assert.equal(plan.header.totalAmount, 261936);
  assert.equal(plan.header.actualAmount, 244800);
  assert.equal(plan.header.orderDate, '2026-01-01', 'วันที่ใบ = วันเริ่มสัญญา');
  assert.equal(plan.header.docLanguage, 'th');
  assert.equal(plan.lines.reduce((s, l) => s + l.qty, 0), 17);
  assert.deepEqual(plan.lines.map((l) => l.lineTotal), [86400, 57600, 43200, 57600]);
  assert.equal(plan.lines[0].unitPrice, 14400);
  assert.equal(plan.lines[0].installationPoint, 'ST-1002 สยามพารากอน · ชั้น G ล็อบบี้');
  assert.equal(plan.lines[0].fgCode, pkg.fgCode);
  assert.equal(plan.lines[0].serviceRounds, 12);
  assert.deepEqual(plan.check, { installmentSum: 261936, sumMatches: true, coverageContinuous: true, coverageErrors: [] });
  assert.equal(plan.opening.coversFrom, '2026-01-01', 'งวดยกมาเริ่มครอบวันเริ่มสัญญาเสมอ');
  assert.equal(plan.opening.dueDate, null);
  assert.equal(plan.opening.label, OPENING_INSTALLMENT_LABEL);
  assert.equal(plan.deal.willCreate, true);
  assert.equal(plan.deal.team, 'SV');
  assert.equal(plan.zeroValue, false);
});

test('v2 เงิน: ยอดรวม VAT แล้ว — Σ บรรทัด = ก่อน VAT · ก่อน VAT + VAT = ยอดรวม (สตางค์เป๊ะ) · ไม่มี VAT', () => {
  const inclusive = planV2({ amountsIncludeVat: true, opening: null, installments: [
    { label: 'ทั้งสัญญา', amount: 244800, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' },
  ] });
  assert.deepEqual(inclusive.errors, []);
  assert.equal(inclusive.header.totalAmount, 244800);
  assert.equal(satang(inclusive.header.subtotal) + satang(inclusive.header.vatAmount), satang(244800));
  assert.equal(inclusive.lines.reduce((s, l) => s + satang(l.lineTotal), 0), satang(inclusive.header.subtotal));
  const noVat = planV2({ vatRate: 0, amountsIncludeVat: undefined, opening: null, installments: [
    { label: 'ทั้งสัญญา', amount: 244800, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' },
  ] });
  assert.deepEqual(noVat.errors, []);
  assert.equal(noVat.header.vatAmount, 0);
  assert.equal(noVat.header.amountsIncludeVat, false);
});

test('v2 VAT ไม่มีค่าตั้งต้น: ไม่เลือก = ตีกลับ · 7% ต้องบอกว่ารวม VAT หรือยัง · อัตราอื่นไม่รับ', () => {
  v2Has(planV2({ vatRate: undefined }), 'vatRate', /รวม VAT/);
  v2Has(planV2({ vatRate: '' }), 'vatRate');
  v2Has(planV2({ vatRate: 5 }), 'vatRate', /0 หรือ 7/);
  v2Has(planV2({ amountsIncludeVat: undefined }), 'amountsIncludeVat');
  v2Has(planV2({ amountsIncludeVat: 'false' }), 'amountsIncludeVat');
});

test('v2 โซน: ต้องเป็นโซนของลูกค้าในใบ · ไซต์ลูกค้า · ใช้งานอยู่ · ไม่ซ้ำ (ด่านเดียวกับที่ TS ผูกโซน)', () => {
  v2Has(planV2({ zones: [] }), 'zones', /อย่างน้อย 1 โซน/);
  v2Has(planV2({ zones: zonesWith(0, { zoneId: '' }) }), 'zones.0', /เลือกโซนจากทะเบียน/);
  v2Has(planV2({ zones: zonesWith(0, { zoneId: 'Z-NONE' }) }), 'zones.0', /ไม่พบโซน/);
  v2Has(planV2({ zones: zonesWith(0, { zoneId: 'Z-OTHER' }) }), 'zones.0', /ลูกค้ารายอื่น/);
  v2Has(planV2({ zones: zonesWith(0, { zoneId: 'Z-WH' }) }), 'zones.0', /ไม่ใช่ไซต์ลูกค้า/);
  v2Has(planV2({ zones: zonesWith(0, { zoneId: 'Z-1044-02' }) }), 'zones.0', /ปิดใช้งาน/);
  v2Has(planV2({ zones: zonesWith(1, { zoneId: 'Z-1002-01' }) }), 'zones.1', /ซ้ำ/);
  const closedSite = v2Sites.map((site) => (site.id === 'ST-1044' ? { ...site, isActive: false } : site));
  v2Has(planV2({}, { sites: closedSite }), 'zones.3', /ปิดใช้งาน/);
  // ⚠️ ไม่รู้สถานะใช้งาน (route ไม่ได้ select มา) = นับเป็นปิด — ฐานต้องการ isActive = true จริง
  const unknown = v2Zones.map((zone) => (zone.id === 'Z-1002-01' ? { ...zone, isActive: undefined } : zone));
  v2Has(planV2({}, { zones: unknown }), 'zones.0', /ปิดใช้งาน/);
  // พก site มากับโซนเองก็ได้
  const embedded = v2Zones.map((zone) => ({ ...zone, site: v2Sites.find((site) => site.id === zone.siteId) }));
  assert.deepEqual(planV2({}, { zones: embedded, sites: [] }).errors, []);
});

test('v2 แพ็คเกจ: สินค้านอกหมวด 02-001 = error (ไม่ใช่คำเตือน) · แพ็คจำนวนเต็ม · รอบ · ยอดไม่ติดลบ', () => {
  v2Has(planV2({ zones: zonesWith(0, { productId: 'P-OIL' }) }), 'zones.0', /ไม่ใช่แพ็คเกจบริการ \(หมวด 02-001\)/);
  v2Has(planV2({ zones: zonesWith(0, { productId: '' }) }), 'zones.0', /ต้องเลือกแพ็คเกจ/);
  v2Has(planV2({ zones: zonesWith(0, { productId: 'P-NONE' }) }), 'zones.0', /ไม่พบแพ็คเกจ/);
  for (const packs of [0, -1, 1.5, '', 'สาม']) v2Has(planV2({ zones: zonesWith(0, { packs }) }), 'zones.0', /แพ็คต้องเป็นจำนวนเต็ม/);
  for (const rounds of [0, 2.5, 3e9]) v2Has(planV2({ zones: zonesWith(0, { rounds }) }), 'zones.0', /รอบในสัญญา/);
  assert.equal(planV2({ zones: zonesWith(0, { rounds: '' }) }).lines[0].serviceRounds, null, 'ไม่ระบุรอบได้');
  v2Has(planV2({ zones: zonesWith(0, { lineAmount: -1 }) }), 'zones.0', /ไม่ติดลบ/);
  v2Has(planV2({ zones: zonesWith(0, { lineAmount: 'abc' }) }), 'zones.0', /ไม่ติดลบ/);
  assert.equal(SERVICE_PACKAGE_CATEGORY, SERVICE_ROUND_CATEGORY);
});

test('v2 AE / Senior AE คีย์ได้เฉพาะของตัวเอง · AE Sup / Admin คีย์ให้ AE คนไหนก็ได้', () => {
  const otherOwner = { ...pimOwner, ownerId: 'U-OTHER', ownerName: 'สมชาย' };
  for (const role of ['ae', 'senior_ae']) {
    v2Has(planV2({ ownerId: 'U-OTHER' }, { actor: { ...pim, role }, owner: otherOwner }), 'ownerId', /เฉพาะของตัวเอง/);
  }
  assert.deepEqual(planV2({}, { actor: { ...pim, role: 'senior_ae' } }).errors, []);
  for (const role of ['ae_supervisor', 'admin']) {
    const plan = planV2({ ownerId: 'U-OTHER' }, { actor: { id: 'U-SUP', role, teams: [] }, owner: otherOwner });
    assert.deepEqual(plan.errors, [], role);
  }
  v2Has(planV2({}, { actor: null }), 'ownerId', /ตรวจสิทธิ์ผู้คีย์/);
  v2Has(planV2({ ownerId: '' }), 'ownerId', /ต้องเลือก AE/);
  v2Has(planV2({}, { owner: { ok: false, error: 'ผู้รับผิดชอบดีลต้องเป็น AE / Senior AE' } }), 'ownerId', /Senior AE/);
  v2Has(planV2({}, { owner: { ...pimOwner, team: null, teams: [] } }), 'ownerId', /ยังไม่มีทีม/);
});

test('v2 AC: ต้องแก้ "ดีลที่ใบจะเข้าไปอยู่จริง" ได้ — ดีลภาชนะเดิมทีมอื่น / AE ทีมหลักนอกทีมตัวเอง = ตีกลับ', () => {
  const ac = { id: 'U-AC', role: 'ac', team: 'SV', teams: ['SV'] };
  const owner = { ok: true, ownerId: 'U-AE2', ownerName: 'อรุณี', team: 'ODM', teams: ['ODM', 'SV'] };
  const input = { ownerId: 'U-AE2' };
  const container = (team) => ({
    id: 'DEAL-C', code: 'DL-260900007', title: 'งานบริการย้อนหลัง · บจก. สยามพิวรรธน์', ownerId: 'U-AE2',
    customerId: 'CUS-SPW', stage: 'won', line: 'SERVICE', projectId: null, team,
  });
  // ① คู่นี้มีดีลภาชนะอยู่แล้วที่ทีม ODM — RPC จะใช้ดีลนั้นไม่ว่าทีมไหน ⇒ ตีกลับก่อนถึงฐาน
  v2Has(planV2(input, { actor: ac, owner: { ...owner, team: 'SV' }, containerDeals: [container('ODM')] }),
    'ownerId', /อยู่ทีม ODM ซึ่งคุณไม่ได้ดูแล/);
  // ② ยังไม่มีดีล — ดีลใหม่ทีมตาม AE (ทีมหลัก ODM) ⇒ AC ทีม SV แก้ไม่ได้
  v2Has(planV2(input, { actor: ac, owner }), 'ownerId', /อยู่ทีม ODM/);
  // ③ เลือกทีมที่ AC ดูแลร่วม (validateDealOwner คืน team: 'SV') ⇒ ผ่าน · ดีลภาชนะเดิมทีม SV ก็ผ่าน
  assert.deepEqual(planV2(input, { actor: ac, owner: { ...owner, team: 'SV' } }).errors, []);
  const reuse = planV2(input, { actor: ac, owner: { ...owner, team: 'SV' }, containerDeals: [container('SV')] });
  assert.deepEqual(reuse.errors, []);
  assert.deepEqual(reuse.deal, { id: 'DEAL-C', code: 'DL-260900007', title: container('SV').title, team: 'SV', willCreate: false });
  // ดีลภาชนะสภาพเพี้ยน = ตีกลับ
  v2Has(planV2(input, { actor: ac, owner: { ...owner, team: 'SV' }, containerDeals: [{ ...container('SV'), projectId: 'PRJ-1' }] }), 'deal');
});

test('v2 เอกสารแทนสัญญา: ชนิด · เลขอ้างอิง ≤200 · เริ่มไม่เกินวันนี้ · สิ้นสุดไม่ก่อนวันนี้ (มติข้อ 9) · สิ้นสุด ≥ เริ่ม', () => {
  const contract = (patch) => ({ contract: { ...v2Input().contract, ...patch } });
  v2Has(planV2(contract({ docKind: '' })), 'contract.docKind', /ชนิดเอกสาร/);
  v2Has(planV2(contract({ docKind: 'fax' })), 'contract.docKind', /ไม่ถูกต้อง/);
  v2Has(planV2(contract({ ref: 'R'.repeat(201) })), 'contract.ref', /200/);
  assert.deepEqual(planV2(contract({ ref: '' })).errors, [], 'เลขอ้างอิงไม่บังคับ');
  v2Has(planV2(contract({ startDate: '2026-09-23' })), 'contract.startDate', /ไม่เกินวันนี้/);
  v2Has(planV2(contract({ startDate: '2026-02-30' })), 'contract.startDate');
  v2Has(planV2(contract({ endDate: '2026-09-21' })), 'contract.endDate', /มติข้อ 9/);
  v2Has(planV2(contract({ startDate: '2026-09-22', endDate: '2026-09-21' })), 'contract.endDate', /ไม่ก่อนวันเริ่ม/);
  v2Has(planV2(contract({ endDate: '2101-01-01' })), 'contract.endDate');
  v2Has(planV2({}, { todayIso: null }), 'todayIso');
});

/* 🐞 UAT 23/09: ขั้น ① ล้อมช่องวันด้วย min/max ⇒ `DateInput` **กลืนค่าที่พิมพ์** แล้วเด้งกลับ
   เงียบ ๆ · ทางแก้คือฟอร์มโชว์กฎเอง ซึ่งแปลว่ามีข้อความชุดที่สองได้ ⇒ ผูกทั้งสองฝั่งไว้ที่
   ก้อนเดียว: แผนตีกลับด้วยสตริงจาก `CONTRACT_DATE_MESSAGES` เป๊ะ (ฟอร์มอ่านก้อนเดียวกัน
   ผ่าน `historicalContractDateIssues` ซึ่งมีเทสต์ของตัวเองที่ historicalIntakeForm.test.mjs) */
test('⭐ ข้อความของสองช่องวันสัญญามาจาก CONTRACT_DATE_MESSAGES ก้อนเดียว (จอกับ server พูดคำเดียวกัน)', () => {
  const contract = (patch) => ({ contract: { ...v2Input().contract, ...patch } });
  const messageOf = (plan, field) => plan.errors.find((e) => e.field === field)?.message || null;
  assert.equal(
    messageOf(planV2(contract({ startDate: '2026-09-23' })), 'contract.startDate'),
    CONTRACT_DATE_MESSAGES.startAfterToday,
  );
  assert.equal(
    messageOf(planV2(contract({ startDate: '2026-09-22', endDate: '2026-09-21' })), 'contract.endDate'),
    CONTRACT_DATE_MESSAGES.endBeforeStart,
  );
  assert.equal(
    messageOf(planV2(contract({ endDate: '2026-09-21' })), 'contract.endDate'),
    CONTRACT_DATE_MESSAGES.endBeforeToday,
  );
});

/* 🐞 ทางตันของมติข้อ 9: ใบร่าง/ตีกลับไม่มีปุ่ม "ยื่นอนุมัติ" ที่หน้ารายละเอียด — ทางเดียวคือฟอร์มคีย์
   ซึ่ง **บันทึก (PATCH) ก่อนส่งเสมอ** ⇒ ใบที่นอนข้ามวันสิ้นสุดสัญญาจะแก้ไม่ได้ ส่งไม่ได้ ตลอดกาล
   (ทางออกที่เหลือคือทิ้งใบที่คีย์ไว้ทั้งใบ หรือพิมพ์วันสิ้นสุดปลอม ซึ่งไหลต่อไปถึงวันหมดอายุของ
   เอกสารแทนสัญญาและรอบขายของโซน) · ฐานไม่ตรวจข้อนี้ด้วยเหตุผลเดียวกัน (0374 §7a)
   ⇒ กฎ: ตีกลับเฉพาะ "ใบใหม่" · ใบที่มีอยู่แล้วเตือนอย่างเดียว แล้วแก้/ส่งอนุมัติต่อได้ */
const EXPIRED_CONTRACT = { docKind: 'customer_po', ref: 'PO-SPW-2025-0118', startDate: '2025-01-01', endDate: '2025-12-31' };
const expiredInput = ({ contract = {}, ...extra } = {}) => v2Input({
  contract: { ...EXPIRED_CONTRACT, ...contract },
  opening: { ...v2Input().opening, coversTo: '2025-09-30', paidOn: '2025-09-15' },
  installments: [
    { label: 'งวด ต.ค.–ธ.ค. 2025', amount: 65484, dueDate: '2025-10-01', coversFrom: '2025-10-01', coversTo: '2025-12-31' },
  ],
  ...extra,
});
const planExpired = (extra = {}, ctxExtra = {}) => planHistoricalServiceOrder(expiredInput(extra), v2Ctx(ctxExtra));

test('v2 มติข้อ 9 กันที่ประตูเข้า — คีย์ใบใหม่ตีกลับ · ใบที่มีอยู่แล้ว (ร่าง/ตีกลับ) เตือนแล้วแก้ต่อได้', () => {
  const create = planExpired();
  v2Has(create, 'contract.endDate', /มติข้อ 9/);
  assert.equal(
    create.errors.find((e) => e.field === 'contract.endDate').message,
    CONTRACT_DATE_MESSAGES.endBeforeToday,
  );
  assert.ok(!create.warnings.includes(CONTRACT_DATE_MESSAGES.endBeforeTodayEditing), 'ใบใหม่ไม่เตือน มันตีกลับไปแล้ว');

  const edit = planExpired({}, { editing: true, selfOrderId: 'SOR-HEDIT0000000001' });
  assert.deepEqual(edit.errors, [], 'ใบที่มีอยู่แล้วต้องแก้และส่งอนุมัติต่อได้ ไม่ใช่ทางตัน');
  assert.ok(
    edit.warnings.includes(CONTRACT_DATE_MESSAGES.endBeforeTodayEditing),
    `ต้องเตือนว่าสัญญาสิ้นสุดแล้ว · ได้ ${JSON.stringify(edit.warnings)}`,
  );
  assert.equal(edit.contract.endDate, '2025-12-31', 'วันสิ้นสุดของจริงต้องไม่ถูกแตะ');
});

test('v2 แก้ใบ: ข้ออื่นของสองช่องวันสัญญายังตรวจเท่าเดิม (ผ่อนเฉพาะ "สิ้นสุดไปแล้ว" ข้อเดียว)', () => {
  const editing = { editing: true, selfOrderId: 'SOR-HEDIT0000000001' };
  v2Has(planExpired({ contract: { startDate: '2026-09-23', endDate: '2026-12-31' } }, editing), 'contract.startDate', /ไม่เกินวันนี้/);
  v2Has(planExpired({ contract: { endDate: '2024-12-31' } }, editing), 'contract.endDate', /ไม่ก่อนวันเริ่ม/);
  v2Has(planExpired({ contract: { endDate: '2101-01-01' } }, editing), 'contract.endDate', /2000–2100/);
  v2Has(planExpired({ contract: { endDate: '' } }, editing), 'contract.endDate', /ต้องระบุวันสิ้นสุดสัญญา/);
  // ช่วงครอบยังวัดกับวันสิ้นสุดของจริง — ใบที่หมดอายุแล้วก็ยังต้องครอบเต็มสัญญา
  v2Has(planExpired({
    installments: [
      { label: 'งวด ต.ค.–พ.ย. 2025', amount: 65484, dueDate: '2025-10-01', coversFrom: '2025-10-01', coversTo: '2025-11-30' },
    ],
  }, editing), 'installments.0', /วันสิ้นสุดสัญญา/);
});

test('v2 งวดยกมา: ยอด > 0 (หลังปัด) · ครอบถึงอยู่ในสัญญา · รับเงินไม่เกินวันนี้ · หมายเหตุ ≤ 1000', () => {
  const opening = (patch) => ({ opening: { ...v2Input().opening, ...patch } });
  v2Has(planV2(opening({ amount: 0 })), 'opening.amount', /มากกว่า 0/);
  v2Has(planV2(opening({ amount: 0.004 })), 'opening.amount', /มากกว่า 0/);
  v2Has(planV2(opening({ coversTo: '' })), 'opening.coversTo', /ครอบบริการถึงวันไหน/);
  v2Has(planV2(opening({ coversTo: '2027-01-31' })), 'opening.coversTo', /ในช่วงสัญญา/);
  v2Has(planV2(opening({ paidOn: '' })), 'opening.paidOn', /วันที่รับเงิน/);
  v2Has(planV2(opening({ paidOn: '2026-09-23' })), 'opening.paidOn', /ไม่เกินวันนี้/);
  v2Has(planV2(opening({ note: 'ก'.repeat(1001) })), 'opening.note', /1000/);
  assert.deepEqual(planV2(opening({ note: 'ก'.repeat(1000) })).errors, []);
  v2Has(planV2({ opening: 'x' }), 'opening', /รูปแบบ/);
});

test('v2 ผลรวมงวด = ยอดใบ (คลาด 1 สตางค์ได้) · งวดปกติต้องมีชื่อ วันครบกำหนด ช่วงครอบ · หมายเหตุ ≤ 1000', () => {
  const remaining = (patch) => ({ installments: [{ ...v2Input().installments[0], ...patch }] });
  v2Has(planV2(remaining({ amount: 65000 })), 'installments', /ขาด ฿484\.00/);
  v2Has(planV2(remaining({ amount: 65484.02 })), 'installments', /เกิน ฿0\.02/);
  assert.deepEqual(planV2(remaining({ amount: 65484.01 })).errors, []);
  v2Has(planV2({ opening: null, installments: [] }), 'installments', /อย่างน้อย 1 งวด/);
  v2Has(planV2(remaining({ label: '  ' })), 'installments.0', /1–120/);
  v2Has(planV2(remaining({ dueDate: '' })), 'installments.0', /วันครบกำหนด/);
  v2Has(planV2(remaining({ coversTo: '' })), 'installments.0', /ช่วงครอบบริการ/);
  v2Has(planV2(remaining({ coversFrom: '2026-12-31', coversTo: '2026-10-01' })), 'installments.0', /ไม่เกินวันสิ้นสุด/);
  v2Has(planV2(remaining({ note: 'ก'.repeat(1001) })), 'installments.0', /1000/);
  v2Has(planV2(remaining({ amount: -1 })), 'installments.0', /ไม่ติดลบ/);
  v2Has(planV2({ installments: 'x' }), 'installments', /รูปแบบ/);
});

test('v2 ช่วงครอบต่อเนื่องเต็มสัญญา: ขาดตอน · ซ้อน · ไม่ถึงวันสิ้นสุด · ไม่มียกมาแล้วงวดแรกเริ่มช้า', () => {
  const remaining = (patch) => ({ installments: [{ ...v2Input().installments[0], ...patch }] });
  const gap = planV2(remaining({ coversFrom: '2026-10-15' }));
  v2Has(gap, 'installments.0', /ขาดตอน 01\/10\/2026–14\/10\/2026/);
  assert.equal(gap.check.coverageContinuous, false);
  v2Has(planV2(remaining({ coversFrom: '2026-09-01' })), 'installments.0', /ซ้อน.*01\/09\/2026–30\/09\/2026/);
  v2Has(planV2(remaining({ coversTo: '2026-11-30' })), 'installments.0', /ยังไม่ถึงวันสิ้นสุดสัญญา.*01\/12\/2026–31\/12\/2026/);
  // ยกมาครอบถึงวันสิ้นสุดแล้ว + มีงวดต่อท้าย = ยกมาชนงวดถัดไป
  const both = planV2({ opening: { ...v2Input().opening, amount: 196452, coversTo: '2026-12-31' } });
  assert.ok(both.errors.some((e) => /ซ้อน|เกินวันสิ้นสุด/.test(e.message)), JSON.stringify(both.errors));
  // ไม่มีงวดยกมา — งวดแรกต้องเริ่มวันเริ่มสัญญาเอง
  const late = planV2({ opening: null, installments: [
    { label: 'งวดเดียว', amount: 261936, dueDate: '2026-10-01', coversFrom: '2026-02-01', coversTo: '2026-12-31' },
  ] });
  v2Has(late, 'installments.0', /ต้องเริ่มวันเริ่มสัญญา 01\/01\/2026/);
});

test('v2 ใบ ฿0: ไม่มีงวด + ต้องมีหมายเหตุ (มติข้อ 11) · ไม่มีคำเตือน "ไม่มีงวดยกมา"', () => {
  const zero = { zones: [zoneRow('Z-1002-01', 1, 0)], opening: null, installments: [] };
  const withNote = planV2({ ...zero, notes: 'เครื่องแถมตามสัญญาเดิม' });
  assert.deepEqual(withNote.errors, []);
  assert.equal(withNote.zeroValue, true);
  assert.equal(withNote.check.sumMatches, true);
  assert.equal(withNote.check.coverageContinuous, null, 'ใบ ฿0 ไม่มีงวด — ฐานข้ามข้อช่วงครอบ');
  assert.ok(!withNote.warnings.some((w) => /ไม่มีงวดยกมา/.test(w)));
  v2Has(planV2(zero), 'notes', /หมายเหตุ/);
  v2Has(planV2({ ...zero, notes: 'แถม', installments: v2Input().installments }), 'installments', /ยอด 0 บาทไม่มีงวด/);
  v2Has(planV2({ ...zero, notes: 'แถม', opening: v2Input().opening }), 'installments', /ยอด 0 บาทไม่มีงวด/);
});

test('v2 คำเตือน: งวดครบกำหนดแล้ว · ไม่มีงวดยกมา — เตือน ไม่บล็อก', () => {
  const overdue = planV2({ installments: [{ ...v2Input().installments[0], dueDate: '2026-09-01' }] });
  assert.deepEqual(overdue.errors, []);
  assert.ok(overdue.warnings.some((w) => /ครบกำหนดแล้ว \(01\/09\/2026\)/.test(w)));
  const noOpening = planV2({ opening: null, installments: [
    { label: 'งวด 1', amount: 196452, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-09-30' },
    { label: 'งวด 2', amount: 65484, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' },
  ] });
  assert.deepEqual(noOpening.errors, []);
  assert.ok(noOpening.warnings.some((w) => /ไม่มีงวดยกมา — TS/.test(w)));
  assert.ok(!planV2().warnings.some((w) => /ไม่มีงวดยกมา/.test(w)));
});

test('v2 ใบที่อาจซ้ำ: วันเริ่มสัญญาเดียวกันหรือเลขเดิมตรง · ไม่นับใบนี้เองและใบที่ยกเลิกแล้ว', () => {
  const sameDate = { id: 'SOR-A', orderNumber: 'SO-26090001-0', orderDate: '2026-01-01', status: 'pending_approval' };
  const sameRef = { id: 'SOR-B', orderNumber: 'SO-26090002-0', orderDate: '2025-01-01', status: 'approved', historicalInvoiceRef: 'iv-2601-0412' };
  const cancelled = { ...sameDate, id: 'SOR-C', orderNumber: 'SO-26090003-0', status: 'cancelled' };
  const self = { ...sameDate, id: 'SOR-SELF', orderNumber: 'SO-26090004-0', status: 'draft' };
  const plan = planV2({ acknowledgeDuplicates: true }, { existingHistorical: [sameDate, sameRef, cancelled, self], selfOrderId: 'SOR-SELF' });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.duplicates.map((d) => d.id), ['SOR-A', 'SOR-B']);
  assert.equal(plan.acknowledgeDuplicates, true);
  assert.equal(planV2().acknowledgeDuplicates, false);
});

test('v2 โซนที่มีรอบขายของใบอื่นยังมีผล = คำเตือนพร้อมเลขใบและวันสิ้นสุด (ไม่บล็อก) · ใบนี้เอง/ใบไม่มีผลไม่นับ', () => {
  const live = { id: 'SOR-X', orderNumber: 'SO-26050011-0', status: 'approved', supersededById: null };
  const liveTermsByZone = new Map([
    ['Z-1002-01', [{ term: { endDate: '2026-12-31' }, order: live }, { term: { endDate: null }, order: live }]],
    ['Z-1002-02', [{ term: { endDate: null }, order: { ...live, id: 'SOR-SELF' } }]],
    ['Z-1002-03', [{ term: {}, order: { ...live, id: 'SOR-C', status: 'cancelled' } }]],
    ['Z-1044-01', [{ term: { endDate: '2026-06-30' }, order: { ...live, id: 'SOR-OLD' } },
      { term: {}, order: { ...live, id: 'SOR-REV', supersededById: 'SOR-NEW' } }]],
  ]);
  const plan = planV2({}, { liveTermsByZone, selfOrderId: 'SOR-SELF' });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.liveTerms, [
    { zoneId: 'Z-1002-01', index: 0, orderId: 'SOR-X', orderNumber: 'SO-26050011-0', endDate: '2026-12-31' },
  ]);
  const hits = plan.warnings.filter((w) => /มีรอบขายของ/.test(w));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /โซน ชั้น G ล็อบบี้: โซนนี้มีรอบขายของ SO-26050011-0 อยู่แล้ว \(ถึง 31\/12\/2026\) — ตรวจว่าไม่ซ้ำสัญญา/);
  // object ธรรมดาแทน Map ก็ได้
  const asObject = planV2({}, { liveTermsByZone: Object.fromEntries(liveTermsByZone), selfOrderId: 'SOR-SELF' });
  assert.deepEqual(asObject.liveTerms, plan.liveTerms);
});

test('v2 อาร์กิวเมนต์ RPC: คีย์ตรงกับที่ 0374 อ่าน · งวดยกมาเป็นแถวแรก · หลักฐานส่งเฉพาะทางแก้ใบ', () => {
  const plan = planV2({ opening: { ...v2Input().opening, evidence: [{ storagePath: 'sales-orders/SOR-H1/payments/a.pdf' }] } });
  const create = historicalServiceRpcArgs(plan, 'create');
  assert.deepEqual(Object.keys(create).sort(), ['p_contract', 'p_header', 'p_installments', 'p_lines']);
  assert.deepEqual(Object.keys(create.p_header).sort(), [
    'customerId', 'discountAmount', 'historicalExpressRef', 'historicalInvoiceRef', 'historicalQuoteRef', 'intake',
    'notes', 'ownerId', 'subtotal', 'team', 'totalAmount', 'vatAmount',
  ]);
  assert.deepEqual(create.p_header.intake, { amountsIncludeVat: false, vatRate: 7 });
  assert.deepEqual(Object.keys(create.p_lines[0]).sort(), [
    'grossAmount', 'lineTotal', 'productId', 'qty', 'serviceRounds', 'unitPrice', 'zoneId',
  ]);
  assert.deepEqual(create.p_lines.map((l) => l.zoneId), ['Z-1002-01', 'Z-1002-02', 'Z-1002-03', 'Z-1044-01']);
  assert.deepEqual(create.p_installments.map((r) => r.kind), ['opening', 'regular']);
  assert.deepEqual(create.p_installments[0], {
    kind: 'opening', label: 'งวดยกมา', amount: 196452, dueDate: null, coversFrom: '2026-01-01', coversTo: '2026-09-30',
    paidOn: '2026-09-15', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.',
  });
  assert.equal(create.p_installments[1].paidOn, null);
  assert.ok(create.p_installments.every((r) => !('evidence' in r)), 'ตอนสร้างยังไม่มีไฟล์');
  assert.deepEqual(create.p_contract, { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' });
  const update = historicalServiceRpcArgs(plan, 'update');
  assert.deepEqual(update.p_installments[0].evidence, [{ storagePath: 'sales-orders/SOR-H1/payments/a.pdf' }]);
  assert.ok(!('evidence' in update.p_installments[1]), 'หลักฐานเป็นของงวดยกมาเท่านั้น');
  assert.throws(() => historicalServiceRpcArgs(plan, 'submit'), /mode/);
  for (const forbidden of ['status', 'frozenAt', 'fgCode', 'installationPoint', 'paymentGateExemptReason']) {
    assert.ok(!JSON.stringify(update).includes(`"${forbidden}"`), forbidden);
  }

  /* ⭐ ทุกคีย์ที่ส่ง ต้องเป็นคีย์ที่ฐานอ่านจริง (สะกดผิด = ค่าหายเงียบ — jsonb ไม่ฟ้อง) */
  const SQL = readFileSync(new URL('../../../supabase/migrations/0374_historical_so_approval_flow.sql', import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '');
  const readKeys = (pattern) => new Set([...SQL.matchAll(pattern)].map((m) => m[1]));
  const headerKeys = readKeys(/p_header(?:->>|->| \? )'(\w+)'/g);
  const lineKeys = readKeys(/(?:v_item|e\.l)->>'(\w+)'/g);
  const installmentKeys = readKeys(/(?:v_item|x\.i|e\.i)->>?'(\w+)'/g);
  const contractKeys = readKeys(/p_contract->>'(\w+)'/g);
  for (const key of Object.keys(update.p_header)) assert.ok(headerKeys.has(key), `p_header.${key} ฐานไม่อ่าน`);
  for (const key of Object.keys(update.p_lines[0])) assert.ok(lineKeys.has(key), `p_lines.${key} ฐานไม่อ่าน`);
  for (const key of Object.keys(update.p_installments[0])) assert.ok(installmentKeys.has(key), `p_installments.${key} ฐานไม่อ่าน`);
  for (const key of Object.keys(update.p_contract)) assert.ok(contractKeys.has(key), `p_contract.${key} ฐานไม่อ่าน`);
  // และทุกช่องที่ฐานอ่านจากหัวใบ ต้องถูกส่ง (ไม่มีช่องที่ฐานรอแต่เราลืม)
  for (const key of headerKeys) assert.ok(key in update.p_header, `ฐานอ่าน p_header.${key} แต่ไม่ได้ส่ง`);
});

test('v2 ลายนิ้วมือ: ไม่ขึ้นกับลำดับคีย์ · เปลี่ยนช่องเดียว = เปลี่ยน · หลักฐานไม่อยู่ในลายนิ้วมือ', () => {
  const base = historicalServiceFingerprintSource(planV2());
  const reorder = (value) => (Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)]))
      : value);
  assert.equal(historicalServiceFingerprintSource(planHistoricalServiceOrder(reorder(v2Input()), v2Ctx())), base);
  assert.equal(
    historicalServiceFingerprintSource(planV2({ opening: { ...v2Input().opening, evidence: [{ storagePath: 'x' }] } })),
    base, 'หลักฐานเกิดหลังใบ — ไม่ใช่ส่วนของคำขอสร้าง',
  );
  const variants = [
    { zones: zonesWith(0, { packs: 7, lineAmount: 100800 }) },
    { zones: zonesWith(0, { rounds: 13 }) },
    { opening: { ...v2Input().opening, paidOn: '2026-09-14' } },
    { installments: [{ ...v2Input().installments[0], label: 'งวดสุดท้าย' }] },
    { contract: { ...v2Input().contract, ref: 'PO-SPW-2026-0119' } },
    { refs: { ...v2Input().refs, express: 'EX-1' } },
    { notes: 'หมายเหตุใหม่' },
    { amountsIncludeVat: true },
  ];
  for (const variant of variants) {
    assert.notEqual(historicalServiceFingerprintSource(planV2(variant)), base, JSON.stringify(variant));
  }
});
