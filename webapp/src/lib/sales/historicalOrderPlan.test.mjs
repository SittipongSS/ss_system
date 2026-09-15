// ── ตัวตัดสินเดียวของการคีย์ใบสั่งขายย้อนหลัง (พรีวิว = บันทึก) ─────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_PACKAGE_CATEGORY, historicalIntakeFingerprintSource, historicalRpcPayload, isCalendarDate,
  planHistoricalOrder, splitHistoricalAmounts, validateHistoricalInstallments,
} from './historicalOrderPlan.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
import { ZERO_VALUE_EXEMPT_REASON } from './historicalOrders.js';
import { DEFAULT_SALE_UNIT } from '../master/units.js';

const TODAY = '2026-09-15';
const customer = { id: 'CUS-1', name: 'บจก. เอ็มไพร์', nameEn: 'Empire Co.', approvalStatus: 'approved', isActive: true };
const owner = { ok: true, ownerId: 'U-AE', ownerName: 'สมชาย ขายเก่ง', team: 'SV', teams: ['SV'] };
const products = [
  { id: 'P-SV', fgCode: 'FG-AAA-02-001-0001', productDescription: 'บริการกระจายกลิ่น', productDescriptionEn: 'Scent service', saleUnit: 'เครื่อง' },
  { id: 'P-OIL', fgCode: 'FG-AAA-01-002-0001', productDescription: 'น้ำมันหอม', productDescriptionEn: null, saleUnit: null },
];
const ctx = (extra = {}) => ({
  customer, owner, products, containerDeals: [], existingHistorical: [], todayIso: TODAY, ...extra,
});
const input = (extra = {}) => ({
  running: true,
  customerId: 'CUS-1',
  ownerId: 'U-AE',
  orderDate: '2024-06-01',
  refs: { quote: 'Q#250313-0004-D', express: null, invoice: 'IV6801041' },
  lines: [
    { installationPoint: 'Empire Tower · ล็อบบี้ ชั้น G', productId: 'P-SV', qty: 2, lineAmount: 60320, serviceRounds: 36 },
    { installationPoint: 'Empire Tower · ชั้น 5', productId: 'P-SV', qty: 1, lineAmount: 30160, serviceRounds: 36 },
  ],
  installments: [
    { label: 'งวด 3/3', amount: 30160, dueDate: '2026-12-01', coversFrom: '2026-06-01', coversTo: '2027-05-31' },
  ],
  ...extra,
});
const satang = (n) => Math.round(n * 100);
const fieldsOf = (plan) => plan.errors.map((e) => e.field);
const hasError = (plan, field, pattern) => {
  const hit = plan.errors.find((e) => e.field === field);
  assert.ok(hit, `ต้องมี error ที่ ${field} · ได้ ${JSON.stringify(plan.errors)}`);
  if (pattern) assert.match(hit.message, pattern);
};

test('VAT รวมในยอดชีต: Σ บรรทัด = ก่อน VAT และ ก่อน VAT + VAT = ยอดรวม (สตางค์เป๊ะ)', () => {
  const plan = planHistoricalOrder(input(), ctx());
  assert.deepEqual(plan.errors, []);
  const { header, lines } = plan;
  assert.equal(header.totalAmount, 90480);
  assert.equal(header.subtotal, 84560.75);
  assert.equal(header.vatAmount, 5919.25);
  assert.equal(satang(header.subtotal) + satang(header.vatAmount), satang(header.totalAmount));
  assert.equal(lines.reduce((s, l) => s + satang(l.lineTotal), 0), satang(header.subtotal));
  assert.equal(header.actualAmount, 84560.75);
  for (const line of lines) assert.ok(Math.abs(line.unitPrice * line.qty - line.lineTotal) < line.qty * 0.01);
  assert.equal(header.ownerName, 'สมชาย ขายเก่ง');
  assert.equal(header.team, 'SV');
  assert.equal(header.docLanguage, 'th');
});

test('เศษสตางค์ของบรรทัดโยนให้บรรทัดยอดสูงสุด — Σ บรรทัดไม่คลาดจากยอดก่อน VAT', () => {
  const split = splitHistoricalAmounts([100, 100, 100.01], { amountsIncludeVat: true, vatRate: 7 });
  assert.equal(split.lineTotals.reduce((s, v) => s + satang(v), 0), satang(split.subtotal));
  assert.equal(satang(split.subtotal) + satang(split.vatAmount), satang(split.totalAmount));
  const excl = splitHistoricalAmounts([90480], { amountsIncludeVat: false, vatRate: 7 });
  assert.deepEqual(excl, { lineTotals: [90480], subtotal: 90480, vatAmount: 6333.6, totalAmount: 96813.6 });
  const zeroRate = splitHistoricalAmounts([500, 250], { vatRate: 0 });
  assert.deepEqual(zeroRate, { lineTotals: [500, 250], subtotal: 750, vatAmount: 0, totalAmount: 750 });
});

test('สำเนาสินค้า: รหัส FG · คำอธิบายตามภาษาใบ · หน่วยขาย (ว่าง = หน่วยตั้งต้น)', () => {
  const en = planHistoricalOrder(input({ docLanguage: 'en' }), ctx());
  assert.equal(en.lines[0].fgCode, 'FG-AAA-02-001-0001');
  assert.equal(en.lines[0].description, 'Scent service');
  assert.equal(en.lines[0].unit, 'เครื่อง');
  const oil = planHistoricalOrder(input({
    lines: [{ installationPoint: 'จุด A', productId: 'P-OIL', qty: 1, lineAmount: 1070 }],
    installments: [],
  }), ctx());
  assert.equal(oil.lines[0].unit, DEFAULT_SALE_UNIT);
  assert.equal(oil.lines[0].description, 'น้ำมันหอม');
  assert.ok(oil.warnings.some((w) => /ไม่ใช่แพ็คเกจบริการ/.test(w)));
  const noProduct = planHistoricalOrder(input({
    lines: [{ installationPoint: 'จุด B', qty: 1, lineAmount: 1070 }], installments: [],
  }), ctx());
  assert.deepEqual(noProduct.errors, []);
  assert.ok(noProduct.warnings.some((w) => /ไม่ได้เลือกสินค้า/.test(w)));
  assert.equal(SERVICE_PACKAGE_CATEGORY, SERVICE_ROUND_CATEGORY);
});

test('ใบยอด 0: ยกเว้นด่านเงินอัตโนมัติ + ต้องมีหมายเหตุ (ข้อ 11)', () => {
  const zero = input({
    lines: [{ installationPoint: 'จุดแถม', productId: 'P-SV', qty: 1, lineAmount: 0 }], installments: [],
  });
  const withNote = planHistoricalOrder({ ...zero, notes: 'เครื่องแถมตามสัญญาเดิม' }, ctx());
  assert.deepEqual(withNote.errors, []);
  assert.deepEqual(withNote.exemption, { reason: ZERO_VALUE_EXEMPT_REASON, automatic: true });
  assert.equal(historicalRpcPayload(withNote).p_header.paymentGateExemptReason, ZERO_VALUE_EXEMPT_REASON);
  hasError(planHistoricalOrder(zero, ctx()), 'notes', /หมายเหตุ/);
});

test('ตีกลับรายกรณี — ข้อความไทยรายช่อง', () => {
  hasError(planHistoricalOrder(input({ running: false }), ctx()), 'running');
  hasError(planHistoricalOrder(input({ orderDate: '2026-09-16' }), ctx()), 'orderDate');
  hasError(planHistoricalOrder(input({ orderDate: '1999-12-31' }), ctx()), 'orderDate');
  hasError(planHistoricalOrder(input({ orderDate: '2024-02-30' }), ctx()), 'orderDate');
  const line = (extra) => input({ lines: [{ installationPoint: 'จุด A', productId: 'P-SV', qty: 1, lineAmount: 1000, ...extra }], installments: [] });
  hasError(planHistoricalOrder(line({ installationPoint: '' }), ctx()), 'lines.0', /สาขา\/จุดติดตั้ง/);
  hasError(planHistoricalOrder(line({ installationPoint: 'ก'.repeat(201) }), ctx()), 'lines.0', /200/);
  hasError(planHistoricalOrder(line({ zoneId: 'ZN-1' }), ctx()), 'lines.0', /โซน/);
  hasError(planHistoricalOrder(line({ zoneId: null }), ctx()), 'lines.0', /โซน/);
  hasError(planHistoricalOrder(line({ qty: 0 }), ctx()), 'lines.0');
  hasError(planHistoricalOrder(line({ lineAmount: -1 }), ctx()), 'lines.0');
  hasError(planHistoricalOrder(line({ serviceRounds: 1.5 }), ctx()), 'lines.0', /รอบบริการ/);
  hasError(planHistoricalOrder(line({ productId: 'P-NONE' }), ctx()), 'lines.0', /ไม่พบสินค้า/);
  hasError(planHistoricalOrder(input({ lines: [] }), ctx()), 'lines');

  const inst = (extra) => input({ installments: [{ label: 'งวด 1', amount: 1000, ...extra }] });
  hasError(planHistoricalOrder(inst({ status: 'confirmed' }), ctx()), 'installments.0', /รอบัญชียืนยัน/);
  hasError(planHistoricalOrder(inst({ label: '  ' }), ctx()), 'installments.0', /1–120/);
  hasError(planHistoricalOrder(inst({ label: 'ก'.repeat(121) }), ctx()), 'installments.0', /1–120/);
  hasError(planHistoricalOrder(inst({ coversFrom: '2026-06-01', coversTo: '2026-05-31' }), ctx()), 'installments.0', /ไม่เกินวันสิ้นสุด/);
  hasError(planHistoricalOrder(inst({ dueDate: '2202-08-06' }), ctx()), 'installments.0', /2000–2100/);
  hasError(planHistoricalOrder(inst({ amount: 'abc' }), ctx()), 'installments.0', /ตัวเลข/);
  hasError(planHistoricalOrder(inst({ amount: 90480.02 }), ctx()), 'installments', /เกินยอดใบ/);
  // คลาด 1 สตางค์ = ยอมตาม RPC
  assert.deepEqual(planHistoricalOrder(inst({ amount: 90480.01 }), ctx()).errors, []);

  hasError(planHistoricalOrder(input({ paymentGateExemptReason: '123456789' }), ctx()), 'paymentGateExemptReason');
  hasError(planHistoricalOrder(input({ paymentGateExemptReason: 'ก'.repeat(501) }), ctx()), 'paymentGateExemptReason');
  hasError(planHistoricalOrder(input({ vatRate: 5 }), ctx()), 'vatRate');
  hasError(planHistoricalOrder(input({ refs: { quote: 'Q'.repeat(201) } }), ctx()), 'refs.quote', /200/);
});

test('AE บังคับ (คำตอบข้อ 1): ไม่เลือก = ตีกลับ · AE ที่ validateDealOwner ไม่ผ่าน = ข้อความของด่านนั้น', () => {
  hasError(planHistoricalOrder(input({ ownerId: null }), ctx()), 'ownerId', /AE/);
  hasError(planHistoricalOrder(input({ ownerId: '' }), ctx({ owner: null })), 'ownerId', /AE/);
  hasError(
    planHistoricalOrder(input(), ctx({ owner: { ok: false, error: 'ผู้รับผิดชอบดีลต้องเป็น AE / Senior AE' } })),
    'ownerId', /Senior AE/,
  );
  // ทีมตามดีล: AE ไม่มีทีม + ต้องสร้างดีลภาชนะใหม่ = ตีกลับ · มีดีลภาชนะอยู่แล้ว = ผ่าน
  const noTeam = { ...owner, team: null, teams: [] };
  hasError(planHistoricalOrder(input(), ctx({ owner: noTeam })), 'ownerId', /ทีม/);
  const existing = { id: 'DEAL-1', code: 'DL-260900001', ownerId: 'U-AE', customerId: 'CUS-1', stage: 'won', line: 'SERVICE', projectId: null };
  assert.deepEqual(planHistoricalOrder(input(), ctx({ owner: noTeam, containerDeals: [existing] })).errors, []);
});

test('ลูกค้า: ไม่อนุมัติ/พักใช้ = ตีกลับ · approvalStatus ว่างยุคก่อน 0027 = ผ่าน', () => {
  hasError(planHistoricalOrder(input(), ctx({ customer: { ...customer, isActive: false } })), 'customerId', /พักใช้/);
  hasError(planHistoricalOrder(input(), ctx({ customer: { ...customer, approvalStatus: 'rejected' } })), 'customerId');
  hasError(planHistoricalOrder(input(), ctx({ customer: null })), 'customerId', /ไม่พบลูกค้า/);
  hasError(planHistoricalOrder(input({ customerId: '' }), ctx()), 'customerId', /เลือกลูกค้า/);
  assert.deepEqual(planHistoricalOrder(input(), ctx({ customer: { ...customer, approvalStatus: null } })).errors, []);
});

test('ดีลภาชนะ: ใช้ใบของคู่ (ลูกค้า × AE) ถ้ามี · ของ AE อื่นไม่นับ · สภาพเพี้ยน = ตีกลับ', () => {
  const mine = { id: 'DEAL-1', code: 'DL-260900001', title: 'งานบริการย้อนหลัง · บจก. เอ็มไพร์', ownerId: 'U-AE', customerId: 'CUS-1', stage: 'won', line: 'SERVICE', projectId: null };
  const other = { ...mine, id: 'DEAL-2', code: 'DL-260900002', ownerId: 'U-OTHER' };
  const reuse = planHistoricalOrder(input(), ctx({ containerDeals: [other, mine] }));
  assert.deepEqual(reuse.deal, { id: 'DEAL-1', code: 'DL-260900001', title: mine.title, willCreate: false });
  const create = planHistoricalOrder(input(), ctx({ containerDeals: [other] }));
  assert.equal(create.deal.willCreate, true);
  assert.equal(create.deal.id, null);
  assert.match(create.deal.title, /บจก\. เอ็มไพร์/);
  hasError(planHistoricalOrder(input(), ctx({ containerDeals: [{ ...mine, projectId: 'PRJ-1' }] })), 'deal');
});

test('ใบที่อาจซ้ำ: วันเดียวกันหรือเลขเดิมตรง (ไม่สนตัวพิมพ์) = รายการ ไม่ใช่ error · ใบของรหัสการคีย์นี้ไม่นับ', () => {
  const sameDate = { id: 'SOR-A', orderNumber: 'SO-26090001-0', orderDate: '2024-06-01', status: 'approved' };
  const sameRef = { id: 'SOR-B', orderNumber: 'SO-26090002-0', orderDate: '2023-01-01', status: 'cancelled', historicalInvoiceRef: 'iv6801041' };
  const unrelated = { id: 'SOR-C', orderNumber: 'SO-26090003-0', orderDate: '2023-01-01', historicalQuoteRef: 'Q-OTHER' };
  const plan = planHistoricalOrder(input(), ctx({ existingHistorical: [sameDate, sameRef, unrelated] }));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.duplicates.map((d) => d.id), ['SOR-A', 'SOR-B']);
  assert.deepEqual(plan.duplicates[1].refs, ['iv6801041']);
  const replay = planHistoricalOrder(input(), ctx({ existingHistorical: [sameDate], replayOrderId: 'SOR-A' }));
  assert.deepEqual(replay.duplicates, []);
});

test('คำเตือน: งวดเลยกำหนดแล้ว · ไม่มีงวดและไม่ยกเว้น · ด่านสัญญา', () => {
  const late = planHistoricalOrder(input({ installments: [{ label: 'งวด 2', amount: 100, dueDate: '2026-01-01' }] }), ctx());
  assert.deepEqual(late.errors, []);
  assert.ok(late.warnings.some((w) => /เลยกำหนด/.test(w) && /ยกเว้นด่านเงิน/.test(w)));
  const bare = planHistoricalOrder(input({ installments: [] }), ctx());
  assert.ok(bare.warnings.some((w) => /ติดด่านเงิน/.test(w)));
  const exempt = planHistoricalOrder(input({ installments: [], paymentGateExemptReason: 'เก็บเงินครบนอกระบบแล้วทั้งสัญญา' }), ctx());
  assert.ok(!exempt.warnings.some((w) => /ติดด่านเงิน/.test(w)));
  assert.ok(exempt.warnings.some((w) => /ด่านสัญญา/.test(w)));
});

test('ลายนิ้วมือคำขอ: ไม่ขึ้นกับลำดับคีย์ · เปลี่ยนช่องเดียวในบรรทัด/งวด/เลขเดิม = เปลี่ยน', () => {
  const base = planHistoricalOrder(input(), ctx());
  const reordered = {};
  for (const key of Object.keys(input()).reverse()) reordered[key] = input()[key];
  reordered.lines = input().lines.map((l) => Object.fromEntries(Object.entries(l).reverse()));
  const same = planHistoricalOrder(reordered, ctx());
  assert.equal(historicalIntakeFingerprintSource(same), historicalIntakeFingerprintSource(base));
  const variants = [
    input({ lines: [{ ...input().lines[0], qty: 3 }, input().lines[1]] }),
    input({ lines: [{ ...input().lines[0], installationPoint: 'Empire Tower · ชั้น 2' }, input().lines[1]] }),
    input({ installments: [{ ...input().installments[0], label: 'งวด 2/3' }] }),
    input({ installments: [{ ...input().installments[0], coversTo: '2027-05-30' }] }),
    input({ refs: { ...input().refs, express: 'EX-1' } }),
    input({ notes: 'หมายเหตุใหม่' }),
  ];
  for (const variant of variants) {
    assert.notEqual(
      historicalIntakeFingerprintSource(planHistoricalOrder(variant, ctx())),
      historicalIntakeFingerprintSource(base),
    );
  }
});

test('อาร์กิวเมนต์ RPC: คีย์ตรงกับที่ create_historical_sales_order อ่าน · ไม่มี zoneId/status หลุดเข้าไป', () => {
  const payload = historicalRpcPayload(planHistoricalOrder(input(), ctx()));
  assert.deepEqual(Object.keys(payload.p_header).sort(), [
    'customerId', 'discountAmount', 'docLanguage', 'historicalExpressRef', 'historicalInvoiceRef', 'historicalQuoteRef',
    'notes', 'orderDate', 'ownerId', 'paymentGateExemptReason', 'subtotal', 'team', 'totalAmount', 'vatAmount',
  ]);
  assert.equal(payload.p_header.historicalQuoteRef, 'Q#250313-0004-D');
  assert.deepEqual(Object.keys(payload.p_lines[0]).sort(), [
    'description', 'fgCode', 'installationPoint', 'lineTotal', 'productId', 'qty', 'serviceRounds', 'unit', 'unitPrice',
  ]);
  assert.deepEqual(Object.keys(payload.p_installments[0]).sort(), ['amount', 'coversFrom', 'coversTo', 'dueDate', 'label']);
});

test('ตัวตรวจงวดใช้ซ้ำตอนคีย์งวดเพิ่ม: total = null ข้ามด่านผลรวม · % คิดเมื่อรู้ยอดใบ', () => {
  const rows = [{ label: 'งวด 4', amount: 999999 }];
  const append = validateHistoricalInstallments(rows, { total: null, todayIso: TODAY });
  assert.deepEqual(append.errors, []);
  assert.equal(append.installments[0].percent, undefined);
  const withTotal = validateHistoricalInstallments([{ label: 'ครึ่งแรก', amount: 50 }], { total: 200 });
  assert.equal(withTotal.installments[0].percent, 25);
  assert.equal(validateHistoricalInstallments('x').errors.length, 1);
});

test('วันในปฏิทิน', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2023-02-29'), false);
  assert.equal(isCalendarDate('2024-6-1'), false);
  assert.equal(isCalendarDate(null), false);
});
