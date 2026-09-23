// ── ตัวตัดสินเดียวของการคีย์ใบสั่งขายย้อนหลัง (พรีวิว = บันทึก) ─────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as planModule from './historicalOrderPlan.js';
import {
  CONTRACT_DATE_MESSAGES, HISTORICAL_LINE_MESSAGES, HISTORICAL_VAT_RATES, SERVICE_PACKAGE_CATEGORY,
  historicalLinesMoney, historicalServiceFingerprintSource, historicalServiceRpcArgs, isCalendarDate,
  planHistoricalServiceOrder,
} from './historicalOrderPlan.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
import { OPENING_INSTALLMENT_LABEL } from './historicalOrders.js';
import { QUOTE_VAT_OPTIONS, quoteLineMoney, quoteTotals } from '../salesPlanning.js';
import { normalizeManualLines } from './quoteLines.js';

/* รุ่นแรกของตัวตัดสิน (โมดัล 0360 · จุดติดตั้งเป็นข้อความ · ยกเว้นด่านเงิน) และตัวตรวจงวดของทางคีย์งวดเพิ่ม
   ถูกลบพร้อมเทสต์ของมัน · ตัวแบ่งยอดตาม VAT (`splitHistoricalAmounts`) ถูกลบตามมติ 23/09 */
const satang = (n) => Math.round(n * 100);

test('🚫 ตัวแบ่งยอด "รวม VAT แล้ว — ถอด VAT" ไม่มีอีกแล้ว · VAT ของใบ = ตัวเลือกของใบเสนอราคา (0 · 7)', () => {
  assert.equal(planModule.splitHistoricalAmounts, undefined, 'หารบรรทัดด้วย 1.07 = ยอดบรรทัด ≠ จำนวน × ราคา');
  assert.deepEqual([...HISTORICAL_VAT_RATES], QUOTE_VAT_OPTIONS.map((o) => o.value));
  assert.deepEqual(QUOTE_VAT_OPTIONS.map((o) => o.label), ['รวม VAT แล้ว', '+ VAT 7% ท้ายใบ']);
});

/* ⭐ เงินของใบย้อนหลัง = สูตรใบเสนอราคาทุกตัวอักษร — บรรทัดเดียวกันต้องได้เลขเดียวกันกับที่ใบเสนอราคาบันทึก */
test('⭐ historicalLinesMoney = quoteLineMoney ต่อบรรทัด + quoteTotals ทั้งใบ = ที่ใบเสนอราคาบันทึก (normalizeManualLines)', () => {
  const rows = [
    { qty: 12, unitPrice: 3500, discountType: null, discountValue: 0 },
    { qty: 12, unitPrice: 3500, discountType: 'percent', discountValue: 150 },   // ตัดเหลือ 100
    { qty: 3, unitPrice: 33.33, discountType: 'amount', discountValue: 100.555 },
    { qty: 7, unitPrice: 1.005, discountType: 'foo', discountValue: 9 },         // ชนิดแปลก = ไม่ลด
  ];
  for (const vatRate of [0, 7]) {
    const money = historicalLinesMoney(rows, vatRate);
    const quote = normalizeManualLines(rows.map((r) => ({ ...r, description: 'x' })));
    assert.deepEqual(money.lines.map((l) => l.lineTotal), quote.map((l) => l.lineTotal));
    assert.deepEqual(money.lines.map((l) => [l.discountType, l.discountValue]), quote.map((l) => [l.discountType, l.discountValue]));
    assert.deepEqual(
      { subtotal: money.subtotal, discountAmount: money.discountAmount, vatAmount: money.vatAmount, totalAmount: money.totalAmount },
      quoteTotals(quote, { vatRate }),
    );
  }
  assert.deepEqual(historicalLinesMoney([rows[1]]).lines[0], quoteLineMoney(rows[1]));
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
const pkg = { id: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจกลิ่นรายเดือน (30 วัน)', saleUnit: 'แพ็คเกจ', costPrice: 1200 };
const oil = { id: 'P-OIL', fgCode: 'FG-SNS-01-002-0001', productDescription: 'น้ำมันหอม', saleUnit: null, costPrice: 800 };
/* แพ็คเกจของตัวอย่างเจ้าของ 23/09 — "3500 x 1 ชุด x 12 เดือน" */
const sds = { id: 'P-SDS', fgCode: 'FG-SNS-02-001-0020', productDescription: 'แพ็คเกจ SDS รายเดือน', saleUnit: 'แพ็คเกจ', costPrice: 3500 };
const unpriced = { id: 'P-NOPRICE', fgCode: 'FG-SNS-02-001-0021', productDescription: 'แพ็คเกจใหม่', saleUnit: 'แพ็คเกจ', costPrice: null };
const noPriceKey = { id: 'P-NOKEY', fgCode: 'FG-SNS-02-001-0022', productDescription: 'แพ็คเกจ (route ลืม select ราคา)', saleUnit: 'แพ็คเกจ' };
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
  actor: pim, customer: spw, owner: pimOwner, products: [pkg, oil, sds, unpriced, noPriceKey], zones: v2Zones, sites: v2Sites,
  containerDeals: [], existingHistorical: [], liveTermsByZone: null, todayIso: V2_TODAY, selfOrderId: null, ...extra,
});
/* แถวโซนแบบใบเสนอราคา — จำนวน × ราคา/หน่วย (ทะเบียน 1,200) · ไม่มีส่วนลด (ม็อกเดิม "6 แพ็ค × 12 เดือน" = จำนวน 72) */
const zoneRow = (zoneId, qty, extra = {}) => ({ zoneId, productId: 'P-PKG', qty, discountType: null, discountValue: 0, rounds: 12, ...extra });
const v2Input = (extra = {}) => ({
  customerId: 'CUS-SPW',
  ownerId: 'U-PIM',
  contract: { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' },
  refs: { quote: null, express: null, invoice: 'IV-2601-0412' },
  vatRate: 7,
  notes: null,
  zones: [
    zoneRow('Z-1002-01', 72),
    zoneRow('Z-1002-02', 48),
    zoneRow('Z-1002-03', 36),
    zoneRow('Z-1044-01', 48),
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

test('v2 ⭐ ม็อก: + VAT 7% ท้ายใบ · 4 โซน จำนวน 72/48/36/48 × 1,200 → ยอดรวมสินค้า/บริการ 244,800 · VAT 17,136 · รวม 261,936 · งวดครบ ครอบต่อเนื่อง', () => {
  const plan = planV2();
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.header.subtotal, 244800);
  assert.equal(plan.header.vatAmount, 17136);
  assert.equal(plan.header.totalAmount, 261936);
  assert.equal(plan.header.actualAmount, 244800);
  assert.equal(plan.header.orderDate, '2026-01-01', 'วันที่ใบ = วันเริ่มสัญญา');
  assert.equal(plan.header.docLanguage, 'th');
  assert.deepEqual(plan.lines.map((l) => l.qty), [72, 48, 36, 48]);
  assert.deepEqual(plan.lines.map((l) => l.lineTotal), [86400, 57600, 43200, 57600]);
  assert.equal(plan.lines[0].unitPrice, 1200, 'ราคา/หน่วย = ราคาผลิตในทะเบียน');
  assert.equal(plan.lines[0].unit, 'แพ็คเกจ', 'หน่วย = หน่วยขายของสินค้า');
  assert.deepEqual([plan.lines[0].discountType, plan.lines[0].discountValue, plan.lines[0].discountAmount], [null, 0, 0]);
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

/* ⭐⭐ มติเจ้าของ 23/09 — "3500 x 1 ชุด x 12 เดือน" คีย์เหมือนใบเสนอราคา: จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000 */
const ownerExample = (vatRate, extra = {}) => {
  const total = vatRate ? 44940 : 42000;
  return planV2({
    vatRate,
    zones: [{ zoneId: 'Z-1002-01', productId: 'P-SDS', qty: 12, discountType: null, discountValue: 0, rounds: 12 }],
    opening: null,
    installments: [{ label: 'ทั้งสัญญา', amount: total, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' }],
    ...extra,
  });
};

test('v2 ⭐⭐ ตัวอย่างเจ้าของ: 1 ชุด × 12 เดือน = จำนวน 12 × 3,500 = 42,000 · + VAT 7% ท้ายใบ → 2,940 / 44,940 · รวม VAT แล้ว → 42,000', () => {
  const vat7 = ownerExample(7);
  assert.deepEqual(vat7.errors, []);
  assert.deepEqual(
    [vat7.lines[0].qty, vat7.lines[0].unit, vat7.lines[0].unitPrice, vat7.lines[0].discountAmount, vat7.lines[0].lineTotal],
    [12, 'แพ็คเกจ', 3500, 0, 42000],
  );
  assert.deepEqual([vat7.header.subtotal, vat7.header.vatAmount, vat7.header.totalAmount], [42000, 2940, 44940]);
  assert.equal(vat7.header.actualAmount, 42000);
  const vat0 = ownerExample(0);
  assert.deepEqual(vat0.errors, []);
  assert.deepEqual([vat0.header.subtotal, vat0.header.vatAmount, vat0.header.totalAmount], [42000, 0, 42000]);
  // 🐞 สิ่งที่ปุ่มลัดเดิมเสนอ (3,500 × 12 × 12 = 504,000) ต้องไม่มีทางเกิดจากแผน
  assert.notEqual(vat0.header.subtotal, 504000);
});

test('v2 ⭐ ราคา/หน่วยมาจากทะเบียนเสมอ — unitPrice / lineAmount / lineTotal ที่จอส่งมาไม่ถูกอ่าน', () => {
  const base = ownerExample(7);
  const forged = ownerExample(7, {
    zones: [{ zoneId: 'Z-1002-01', productId: 'P-SDS', qty: 12, discountType: null, discountValue: 0, rounds: 12,
      unitPrice: 1, lineTotal: 12, lineAmount: 999999, grossAmount: 5 }],
  });
  assert.deepEqual(forged.errors, []);
  assert.deepEqual(forged.lines, base.lines);
  assert.deepEqual(forged.header, base.header);
  assert.equal(historicalServiceFingerprintSource(forged), historicalServiceFingerprintSource(base), 'ค่าปลอมไม่เข้าลายนิ้วมือ');
});

test('v2 ส่วนลดรายการ = ตัวเลือกของใบเสนอราคา: % · บาท · ไม่ลด · ชนิดแปลก = ไม่ลด · % เกิน 100 ตัดเหลือ 100 · บาทเกินยอด = ยอด', () => {
  const lineOf = (discountType, discountValue, qty = 12) => {
    const total = historicalLinesMoney([{ qty, unitPrice: 3500, discountType, discountValue }], 7).totalAmount;
    const plan = planV2({
      zones: [{ zoneId: 'Z-1002-01', productId: 'P-SDS', qty, discountType, discountValue, rounds: 12 }],
      opening: null,
      notes: total ? null : 'ส่วนลดเต็มจำนวน',
      installments: total ? [{ label: 'ทั้งสัญญา', amount: total, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' }] : [],
    });
    assert.deepEqual(plan.errors, [], JSON.stringify([discountType, discountValue]));
    const { discountType: t, discountValue: v, discountAmount: a, lineTotal: l } = plan.lines[0];
    return [t, v, a, l];
  };
  assert.deepEqual(lineOf('percent', 5), ['percent', 5, 2100, 39900]);
  assert.deepEqual(lineOf('percent', '12.5'), ['percent', 12.5, 5250, 36750]);
  assert.deepEqual(lineOf('amount', 1000), ['amount', 1000, 1000, 41000]);
  assert.deepEqual(lineOf(null, 0), [null, 0, 0, 42000]);
  assert.deepEqual(lineOf('foo', 9), [null, 0, 0, 42000]);
  assert.deepEqual(lineOf('percent', 150), ['percent', 100, 42000, 0]);
  assert.deepEqual(lineOf('amount', 50000), ['amount', 50000, 42000, 0]);
  // ยอดเงินของบรรทัด = สูตรเดียวกับใบเสนอราคา
  assert.deepEqual(lineOf('percent', 7.5, 7).slice(2), [
    quoteLineMoney({ qty: 7, unitPrice: 3500, discountType: 'percent', discountValue: 7.5 }).discountAmount,
    quoteLineMoney({ qty: 7, unitPrice: 3500, discountType: 'percent', discountValue: 7.5 }).lineTotal,
  ]);
});

test('v2 เงินทั้งใบ = quoteTotals ของบรรทัดเดียวกัน (ใบย้อนหลังไม่มีส่วนลดท้ายใบ) · + VAT 7% · รวม VAT แล้ว', () => {
  for (const vatRate of [0, 7]) {
    const zones = [
      zoneRow('Z-1002-01', 72, { discountType: 'percent', discountValue: 5 }),
      zoneRow('Z-1002-02', 48, { productId: 'P-SDS', discountType: 'amount', discountValue: 999.99 }),
    ];
    const first = planV2({ vatRate, zones, opening: null, installments: [] });
    const plan = planV2({ vatRate, zones, opening: null, installments: [
      { label: 'ทั้งสัญญา', amount: first.header.totalAmount, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' },
    ] });
    assert.deepEqual(plan.errors, []);
    const expected = quoteTotals(plan.lines, { vatRate });
    assert.deepEqual(
      { subtotal: plan.header.subtotal, discountAmount: plan.header.discountAmount, vatAmount: plan.header.vatAmount, totalAmount: plan.header.totalAmount },
      expected,
    );
    assert.equal(plan.header.discountAmount, 0);
    assert.equal(plan.lines.reduce((s, l) => s + satang(l.lineTotal), 0), satang(plan.header.subtotal));
  }
});

test('v2 VAT ไม่มีค่าตั้งต้น: ไม่เลือก = ตีกลับ · อัตราอื่นไม่รับ · โหมด "รวม VAT แล้ว — ถอด VAT" ของแท็บรุ่นก่อน = ตีกลับ ไม่ตีความเอง', () => {
  v2Has(planV2({ vatRate: undefined }), 'vatRate', /รวม VAT แล้ว.*\+ VAT 7% ท้ายใบ/);
  v2Has(planV2({ vatRate: '' }), 'vatRate');
  v2Has(planV2({ vatRate: 5 }), 'vatRate', /รวม VAT แล้ว/);
  v2Has(planV2({ amountsIncludeVat: true }), 'vatRate', /เลิกใช้แล้ว.*โหลดหน้าใหม่/);
  v2Has(planV2({ vatRate: 0, amountsIncludeVat: true }), 'vatRate', /เลิกใช้แล้ว/);
  // false / ไม่ส่ง = ของเดิมที่มีความหมายเท่า 0 / 7 ปกติ — ไม่ขวาง
  assert.deepEqual(planV2({ amountsIncludeVat: false }).errors, []);
  assert.ok(!('amountsIncludeVat' in planV2().header), 'หัวใบไม่มีโหมด VAT ที่สามแล้ว');
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

test('v2 แพ็คเกจ: สินค้านอกหมวด 02-001 = error (ไม่ใช่คำเตือน) · จำนวนเต็ม > 0 (ว่าง = ตีกลับ ไม่ใช่ 1) · รอบบริการที่ขายไว้', () => {
  v2Has(planV2({ zones: zonesWith(0, { productId: 'P-OIL' }) }), 'zones.0', /ไม่ใช่แพ็คเกจบริการ \(หมวด 02-001\)/);
  v2Has(planV2({ zones: zonesWith(0, { productId: '' }) }), 'zones.0', /ต้องเลือกแพ็คเกจ/);
  v2Has(planV2({ zones: zonesWith(0, { productId: 'P-NONE' }) }), 'zones.0', /ไม่พบแพ็คเกจ/);
  for (const qty of [0, -1, 1.5, '', null, 'สาม']) {
    const plan = planV2({ zones: zonesWith(0, { qty }) });
    v2Has(plan, 'zones.0', /จำนวนต้องเป็นจำนวนเต็มมากกว่า 0/);
    assert.equal(plan.header.totalAmount, 0, 'คิดยอดไม่ได้ = ศูนย์ทั้งก้อน (ไม่ใช่เดาจำนวน 1)');
    assert.equal(plan.zeroValue, false);
  }
  const { qty: _qty, ...noQty } = v2Input().zones[0];
  v2Has(planV2({ zones: [noQty, ...v2Input().zones.slice(1)] }), 'zones.0', /จำนวนต้องเป็นจำนวนเต็ม/);
  assert.deepEqual(planV2({ zones: zonesWith(0, { qty: '72' }) }).errors, [], 'สตริงตัวเลขจากช่องกรอกรับได้');
  for (const rounds of [0, 2.5, 3e9]) v2Has(planV2({ zones: zonesWith(0, { rounds }) }), 'zones.0', /รอบบริการที่ขายไว้/);
  assert.equal(planV2({ zones: zonesWith(0, { rounds: '' }) }).lines[0].serviceRounds, null, 'ไม่ระบุรอบได้');
  assert.equal(SERVICE_PACKAGE_CATEGORY, SERVICE_ROUND_CATEGORY);
});

test('v2 ราคา: แพ็คเกจยังไม่ตั้งราคา = ตีกลับ (ใบเสนอราคาคงราคาเดิม แต่ใบนี้บันทึกกับส่งจังหวะเดียว) · ไม่มีคีย์ราคา = "อ่านราคาไม่ได้"', () => {
  const unpricedPlan = planV2({ zones: zonesWith(0, { productId: 'P-NOPRICE' }) });
  v2Has(unpricedPlan, 'zones.0', /ยังไม่ตั้งราคาในฐานข้อมูลสินค้า/);
  assert.equal(unpricedPlan.header.totalAmount, 0);
  assert.equal(unpricedPlan.zeroValue, false, 'ราคาที่ไม่รู้ ≠ ใบ ฿0');
  const zeroPrice = planV2({}, { products: [{ ...pkg, costPrice: 0 }, oil] });
  v2Has(zeroPrice, 'zones.0', new RegExp(HISTORICAL_LINE_MESSAGES.unpriced.slice(0, 20)));
  v2Has(planV2({ zones: zonesWith(0, { productId: 'P-NOKEY' }) }), 'zones.0', /อ่านราคาของแพ็คเกจ.*ไม่ได้/);
  // ราคาเป็นสตริงจากฐาน (numeric ของ PostgREST บางทางคืนเป็นข้อความ) ก็อ่านได้
  assert.deepEqual(planV2({}, { products: [{ ...pkg, costPrice: '1200.00' }, oil] }).errors, []);
});

test('v2 🪤 แท็บรุ่นก่อน (แพ็ค + ยอดที่พิมพ์เอง ไม่มีจำนวน) = ตีกลับให้โหลดหน้าใหม่ — ห้ามเดาว่าแพ็คคือจำนวน', () => {
  const stale = v2Input().zones.map(({ qty, discountType, discountValue, ...z }) => ({ ...z, packs: 6, lineAmount: 86400 }));
  const plan = planV2({ zones: stale });
  for (const index of [0, 1, 2, 3]) v2Has(plan, `zones.${index}`, /ฟอร์มรุ่นก่อน.*โหลดหน้าใหม่/);
  assert.ok(!plan.errors.some((e) => /จำนวนต้องเป็นจำนวนเต็ม/.test(e.message)), 'ข้อความเดียวต่อแถว: บอกเหตุจริง');
  assert.equal(plan.header.totalAmount, 0);
  v2Has(planV2({ zones: zonesWith(0, { qty: undefined, lineAmount: 1 }) }), 'zones.0', /ฟอร์มรุ่นก่อน/);
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
  /* ใบ ฿0 แบบใบเสนอราคา = ส่วนลดเต็มจำนวน (ไม่มี "ยอดที่พิมพ์เป็น 0" ให้คีย์แล้ว) */
  const zero = { zones: [zoneRow('Z-1002-01', 1, { discountType: 'percent', discountValue: 100 })], opening: null, installments: [] };
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

test('v2 อาร์กิวเมนต์ RPC: คีย์ตรงกับที่ 0374 + 0379 อ่าน · งวดยกมาเป็นแถวแรก · หลักฐานส่งเฉพาะทางแก้ใบ', () => {
  const plan = planV2({ opening: { ...v2Input().opening, evidence: [{ storagePath: 'sales-orders/SOR-H1/payments/a.pdf' }] } });
  const create = historicalServiceRpcArgs(plan, 'create');
  assert.deepEqual(Object.keys(create).sort(), ['p_contract', 'p_header', 'p_installments', 'p_lines']);
  assert.deepEqual(Object.keys(create.p_header).sort(), [
    'customerId', 'discountAmount', 'historicalExpressRef', 'historicalInvoiceRef', 'historicalQuoteRef', 'intake',
    'notes', 'ownerId', 'subtotal', 'team', 'totalAmount', 'vatAmount',
  ]);
  assert.deepEqual(create.p_header.intake, { vatRate: 7 });
  /* ⭐ รูปเดียวกับบรรทัดใบเสนอราคาที่ถูกก๊อปลงใบสั่งขาย (0363) + โซน + รอบ — ไม่มี grossAmount แล้ว */
  assert.deepEqual(Object.keys(create.p_lines[0]).sort(), [
    'discountAmount', 'discountType', 'discountValue', 'lineTotal', 'productId', 'qty', 'serviceRounds', 'unitPrice', 'zoneId',
  ]);
  assert.deepEqual(create.p_lines[0], {
    zoneId: 'Z-1002-01', productId: 'P-PKG', qty: 72, unitPrice: 1200, discountType: null, discountValue: 0,
    discountAmount: 0, lineTotal: 86400, serviceRounds: 12,
  });
  // 0379 บังคับ discountAmount/discountValue เป็นตัวเลขเสมอ (jsonb_typeof = 'number')
  for (const line of create.p_lines) {
    assert.equal(typeof line.discountAmount, 'number');
    assert.equal(typeof line.discountValue, 'number');
  }
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

  /* ⭐ ทุกคีย์ที่ส่ง ต้องเป็นคีย์ที่ฐานอ่านจริง (สะกดผิด = ค่าหายเงียบ — jsonb ไม่ฟ้อง)
     อ่าน 0374 (RPC · ตัวตรวจสัญญา/งวด) + 0379 (ตัวตรวจ/ตัวเขียนบรรทัดรุ่นใบเสนอราคา) ซึ่งนิยามทับสองตัวนั้น */
  const SQL = ['0374_historical_so_approval_flow.sql', '0379_historical_so_quote_lines.sql']
    .map((name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    .join('\n')
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
    { zones: zonesWith(0, { qty: 84 }) },
    { zones: zonesWith(0, { discountType: 'percent', discountValue: 5 }) },
    { zones: zonesWith(0, { discountType: 'amount', discountValue: 5 }) },
    { zones: zonesWith(0, { discountType: 'percent', discountValue: 6 }) },
    { zones: zonesWith(0, { rounds: 13 }) },
    { opening: { ...v2Input().opening, paidOn: '2026-09-14' } },
    { installments: [{ ...v2Input().installments[0], label: 'งวดสุดท้าย' }] },
    { contract: { ...v2Input().contract, ref: 'PO-SPW-2026-0119' } },
    { refs: { ...v2Input().refs, express: 'EX-1' } },
    { notes: 'หมายเหตุใหม่' },
    { vatRate: 0 },
  ];
  for (const variant of variants) {
    assert.notEqual(historicalServiceFingerprintSource(planV2(variant)), base, JSON.stringify(variant));
  }
  // อินพุตเดียวกัน (ส่วนลดที่เขียนต่างรูปแต่บันทึกได้ค่าเดียวกัน) = ลายนิ้วมือเดียวกัน — ส่งซ้ำได้ใบเดิม
  assert.equal(
    historicalServiceFingerprintSource(planV2({ zones: zonesWith(0, { discountType: 'percent', discountValue: '5' }) })),
    historicalServiceFingerprintSource(planV2({ zones: zonesWith(0, { discountType: 'percent', discountValue: 5 }) })),
  );
  assert.equal(
    historicalServiceFingerprintSource(planV2({ zones: zonesWith(0, { discountType: 'foo', discountValue: 3 }) })),
    base, 'ชนิดแปลก = ไม่ลด (เหมือนใบเสนอราคา)',
  );
});
