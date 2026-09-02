// ── แตกยอด FC เป็นบรรทัด (หมวด · ปริมาตร · จำนวน) — มติผู้ใช้ 2026-09-02 ─────
//
// กฎข้อเดียวที่ทั้งไฟล์นี้ปกป้อง: **ยอดรวมของบรรทัดต้องเท่ากับ FC ที่แดชบอร์ดโชว์เป๊ะ**
// รายงานที่ยอดไม่ตรงจอคือรายงานที่ทำให้คนเถียงกันว่าเลขไหนถูก แล้วเลิกใช้ทั้งคู่
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNCATEGORIZED,
  canExportForecastReport,
  allocateToLines,
  forecastBreakdownOfDeal,
  forecastMonthOfDeal,
  gridForecastLines,
  monthsOfYear,
  summarizeForecastLines,
} from './forecastBreakdown.js';

const product = (over = {}) => ({
  id: 'P1', fgCode: 'FG-001', productDescription: 'EDP 30 ml',
  categoryCode: '01-002', volume: 30, volumeUnit: 'ml', saleUnit: 'ชิ้น', ...over,
});
const line = (over = {}) => ({
  id: 'L1', productId: 'P1', fgCode: null, description: null,
  qty: 100, unit: 'ชิ้น', unitPrice: 500, lineTotal: 50000, sortOrder: 0, ...over,
});

/* ⚠️ ไฟล์นี้มียอด FC ของทุกทีมทุกคนพร้อมชื่อลูกค้าและราคาต่อหน่วยเป็นแถว ๆ
   "ดูตัวเลขรวมบนจอได้" กับ "โหลดรายการทั้งบริษัทออกไปได้" เป็นคนละสิทธิ์ */
test('โหลดรายงาน FC ได้เฉพาะ AE Supervisor ขึ้นไป', () => {
  for (const role of ['admin', 'ae_supervisor']) {
    assert.equal(canExportForecastReport(role), true, role);
  }
  for (const role of ['ae', 'ac', 'senior_ae', 'marketing', 'rd', 'finance', 'ts_manager', '', null]) {
    assert.equal(canExportForecastReport(role), false, String(role));
  }
});

/* กติกาเดือนของรายงาน — ข้อเดียวที่ผู้ใช้ขอจริง ๆ จึงต้องมีเทสต์ล็อกไว้
   (มติผู้ใช้ 2026-09-02: "วันสิ้นสุด คือวันรับของ · ไฟล์ FC เอาเดือนที่จะได้รับของ") */
const mk = (v) => (v ? String(v).slice(0, 7) : null);

test('เดือนของรายงานมาจาก "วันที่สิ้นสุด" ก่อนเสมอ', () => {
  const got = forecastMonthOfDeal({
    endDate: '2026-11-30', expectedCloseDate: '2026-08-31', forecastMonth: '2026-08',
  }, mk);
  assert.deepEqual(got, { month: '2026-11', basis: 'endDate' });
});

test('🐞 ดีลสหมิตรใช้ metadata.demandMonth — ไม่ใช่วันปิดการขาย', () => {
  /* ของจริง 2026-09-02: 39 ดีล 9,202,345 บาท ไม่มี endDate เลย แต่มี demandMonth
     ที่ create-sales-deal เขียนไว้ = เดือนที่ลูกค้าต้องการของ · ถ้าอ่านวันปิดแทน
     32 ใบจะลงเดือนเร็วไป 2 เดือน */
  const got = forecastMonthOfDeal({
    endDate: null, expectedCloseDate: '2026-10-31',
    metadata: { demandMonth: '2026-12' }, forecastMonth: '2026-10',
  }, mk);
  assert.deepEqual(got, { month: '2026-12', basis: 'demandMonth' });
});

test('วันสิ้นสุดชนะ demandMonth เมื่อมีทั้งคู่', () => {
  const got = forecastMonthOfDeal({
    endDate: '2026-09-15', metadata: { demandMonth: '2026-12' },
  }, mk);
  assert.equal(got.basis, 'endDate');
});

test('ไม่มีทั้งวันสิ้นสุดและ demandMonth = ถอยไปวันปิด และบอกว่าเป็นค่าที่ถอยมา', () => {
  const got = forecastMonthOfDeal({ expectedCloseDate: '2026-08-31', forecastMonth: '2026-08' }, mk);
  assert.deepEqual(got, { month: '2026-08', basis: 'expectedCloseDate' });
  const last = forecastMonthOfDeal({ forecastMonth: '2026-08' }, mk);
  assert.equal(last.basis, 'forecastMonth');
  assert.deepEqual(forecastMonthOfDeal({}, mk), { month: null, basis: null });
});

test('ปันส่วนแล้วยอดรวมต้องเท่ากับ FC เป๊ะ แม้ปัดเศษไม่ลงตัว', () => {
  const rows = allocateToLines([{ amount: 1 }, { amount: 1 }, { amount: 1 }], 1000);
  const sum = rows.reduce((s, r) => s + r.fcAmount, 0);
  assert.equal(Math.round(sum * 100) / 100, 1000);
  assert.equal(rows.length, 3);
});

test('ใบมีส่วนลดท้ายใบ — บรรทัดถูกย่อลงให้เท่า FC ไม่ใช่ใช้ lineTotal ดิบ', () => {
  // ของจริง QT-26080032-1: บรรทัดรวม 843,000 · FC (หลังส่วนลด ก่อน VAT) 756,600
  const deal = { id: 'D', projectValue: 756600, forecastSource: 'quotation', forecastQuotationId: 'Q' };
  const rows = forecastBreakdownOfDeal(deal, {
    quotationLines: [line({ lineTotal: 600000 }), line({ id: 'L2', lineTotal: 243000, sortOrder: 1 })],
    productById: new Map([['P1', product()]]),
    quoteNumber: 'QT-26080032-1',
  });
  const sum = rows.reduce((s, r) => s + r.fcAmount, 0);
  assert.equal(Math.round(sum * 100) / 100, 756600, 'ต้องตรง FC ไม่ใช่ 843,000');
  assert.ok(rows[0].fcAmount < 600000, 'บรรทัดต้องถูกย่อตามสัดส่วน');
  assert.equal(rows[0].quoteNumber, 'QT-26080032-1');
});

test('หมวดกับปริมาตรมาจากทะเบียนสินค้าผ่าน productId', () => {
  const deal = { id: 'D', projectValue: 50000, forecastSource: 'quotation' };
  const [row] = forecastBreakdownOfDeal(deal, {
    quotationLines: [line()],
    productById: new Map([['P1', product()]]),
  });
  assert.equal(row.categoryCode, '01-002');
  assert.equal(row.volume, 30);
  assert.equal(row.volumeUnit, 'ml');
  assert.equal(row.qty, 100);
  assert.equal(row.volumeTotal, 3000, 'ปริมาตรรวม = ขนาดต่อหน่วย × จำนวน');
  assert.equal(row.source, 'quotation');
});

test('บรรทัดที่พิมพ์เอง (ไม่มี productId) ลงกอง "ไม่ระบุหมวด" แต่ยอดไม่หาย', () => {
  // ของจริง 89/329 บรรทัด: "PERFUME LOTION" 30,000 ชิ้น 1,140,000 ไม่มีสินค้าผูก
  const deal = { id: 'D', projectValue: 1190000, forecastSource: 'quotation' };
  const rows = forecastBreakdownOfDeal(deal, {
    quotationLines: [
      line({ productId: null, description: 'PERFUME LOTION', qty: 30000, lineTotal: 1140000 }),
      line({ id: 'L2', lineTotal: 50000, sortOrder: 1 }),
    ],
    productById: new Map([['P1', product()]]),
  });
  assert.equal(rows[0].categoryCode, null);
  assert.equal(rows[0].categoryLabel, UNCATEGORIZED);
  assert.equal(rows[0].volumeTotal, null, 'ไม่มีสินค้า = ไม่รู้ปริมาตร ห้ามเดาเป็น 0');
  assert.equal(rows[1].categoryLabel, '01-002');
  assert.equal(rows.reduce((s, r) => s + r.fcAmount, 0), 1190000);
});

test('ดีลที่ยังกรอกยอดเอง ใช้แถวมูลค่ารายหมวด ไม่ใช่บรรทัดใบ', () => {
  const deal = { id: 'D', projectValue: 90000, forecastSource: 'manual' };
  const rows = forecastBreakdownOfDeal(deal, {
    quotationLines: [line({ lineTotal: 999999 })],
    valueItems: [
      { seq: 1, categoryCode: '02-001', volume: 100, volumeUnit: 'ml', qty: 300, unit: 'ขวด', unitPrice: 200, amount: 60000 },
      { seq: 2, categoryCode: '03-004', qty: 3, unit: 'งาน', unitPrice: 10000, amount: 30000 },
    ],
    productById: new Map(),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].categoryCode, '02-001');
  assert.equal(rows[0].volumeTotal, 30000);
  assert.equal(rows[1].volumeTotal, null, 'งานบริการไม่มีขนาด');
  assert.equal(rows[0].source, 'manual');
  assert.equal(rows[0].quoteNumber, null);
  assert.equal(rows.reduce((s, r) => s + r.fcAmount, 0), 90000);
});

test('ดีลที่ไม่มีบรรทัดเลย ยังต้องมีแถวถือยอด FC ไว้ ไม่ใช่หายจากไฟล์', () => {
  const deal = { id: 'D', projectValue: 250000, forecastSource: 'manual' };
  const rows = forecastBreakdownOfDeal(deal, { valueItems: [], productById: new Map() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].categoryLabel, UNCATEGORIZED);
  assert.equal(rows[0].fcAmount, 250000);
});

test('ยอดบรรทัดถูกปัดตั้งแต่ต้นทาง — ทศนิยมลอยห้ามหลุดลง Excel', () => {
  // ของจริง: ใบสหมิตรมี lineTotal = 196799.99999999997 จากการคูณที่ฐาน
  const deal = { id: 'D', projectValue: 196800, forecastSource: 'manual' };
  const [row] = forecastBreakdownOfDeal(deal, {
    valueItems: [{ seq: 1, categoryCode: '01-002', qty: 2, unit: 'ชิ้น', unitPrice: 98400, amount: 196799.99999999997 }],
    productById: new Map(),
  });
  assert.equal(row.amount, 196800);
  assert.equal(row.fcAmount, 196800);
});

test('กริดมี 12 คอลัมน์เสมอเมื่อระบุปี — เดือนที่ไม่มียอดเป็นช่องว่าง ไม่ใช่ 0', () => {
  const months = monthsOfYear('2026');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-01');
  assert.equal(months[11], '2026-12');
  const [row] = gridForecastLines([{ month: '2026-09', fcAmount: 1000, categoryLabel: 'x' }], months);
  assert.equal(Object.keys(row.months).length, 12);
  assert.equal(row.months['2026-09'], 1000);
  assert.equal(row.months['2026-01'], null, 'เดือนที่ไม่มียอดต้องเป็นขีด ไม่ใช่ศูนย์');
  assert.equal(row.total, 1000);
});

test('เดือนของดีลที่อยู่นอกปีของรายงาน ต้องไม่หลุดเข้ากริด', () => {
  const months = monthsOfYear('2026');
  const [row] = gridForecastLines([{ month: '2025-12', fcAmount: 500, categoryLabel: 'x' }], months);
  assert.equal(Object.values(row.months).every((value) => value === null), true);
  assert.equal(row.total, 500, 'ยอดรวมยังต้องอยู่ ไม่ใช่หายไปเงียบ ๆ');
});

test('แถวสรุปไม่บวกจำนวนข้ามหน่วย', () => {
  // ของจริงมีทั้ง "13 เดือน" และ "30000 ชิ้น" — บวกกันได้ 30,013 ซึ่งไม่มีความหมาย
  const rows = summarizeForecastLines([
    { month: '2026-09', categoryLabel: '01-002', categoryCode: '01-002', unit: 'ชิ้น', volumeUnit: 'ml', qty: 30000, volumeTotal: 900000, fcAmount: 1140000, dealId: 'A' },
    { month: '2026-09', categoryLabel: '01-002', categoryCode: '01-002', unit: 'เดือน', volumeUnit: null, qty: 13, volumeTotal: null, fcAmount: 42000, dealId: 'B' },
    { month: '2026-09', categoryLabel: '01-002', categoryCode: '01-002', unit: 'ชิ้น', volumeUnit: 'ml', qty: 1000, volumeTotal: 30000, fcAmount: 150000, dealId: 'C' },
  ]);
  assert.equal(rows.length, 2, 'หน่วยต่างกันต้องแยกแถว');
  assert.equal(rows[0].months['2026-09'] > 0, true, 'ยอดต้องลงช่องเดือนของมัน');
  const pieces = rows.find((r) => r.unit === 'ชิ้น');
  assert.equal(pieces.qty, 31000);
  assert.equal(pieces.volumeTotal, 930000);
  assert.equal(pieces.fcAmount, 1290000);
  assert.equal(pieces.dealCount, 2);
  const months = rows.find((r) => r.unit === 'เดือน');
  assert.equal(months.volumeTotal, null, 'ไม่มีปริมาตรเลย ต้องเป็นขีด ไม่ใช่ 0');
});

/* มติผู้ใช้ 2026-09-02: หมวดเดียวกันคนละขนาด ต้องแยกบรรทัด — 30 ml กับ 100 ml
   เป็นคนละงานผลิต คนละขวด ยุบรวมแล้ว "จำนวนรวม" เอาไปสั่งของไม่ได้ */
test('หมวดเดียวกัน คนละขนาดต่อหน่วย = คนละแถวสรุป', () => {
  const rows = summarizeForecastLines([
    { month: '2026-09', categoryLabel: '01-002', categoryCode: '01-002', unit: 'ชิ้น', volume: 30, volumeUnit: 'ml', qty: 1000, volumeTotal: 30000, fcAmount: 200000, dealId: 'A' },
    { month: '2026-09', categoryLabel: '01-002', categoryCode: '01-002', unit: 'ชิ้น', volume: 100, volumeUnit: 'ml', qty: 500, volumeTotal: 50000, fcAmount: 350000, dealId: 'B' },
    { month: '2026-10', categoryLabel: '01-002', categoryCode: '01-002', unit: 'ชิ้น', volume: 30, volumeUnit: 'ml', qty: 200, volumeTotal: 6000, fcAmount: 40000, dealId: 'C' },
  ]);
  assert.equal(rows.length, 2, 'สองขนาด = สองแถว (เดือนเป็นคอลัมน์ ไม่ใช่แถว)');
  assert.deepEqual(rows.map((r) => r.volume), [30, 100], 'เรียงขนาดเล็กไปใหญ่');
  const small = rows[0];
  assert.equal(small.qty, 1200, 'ขนาดเดียวกันข้ามเดือนยังรวมกัน');
  assert.equal(small.volumeTotal, 36000);
  assert.equal(small.months['2026-09'], 200000);
  assert.equal(small.months['2026-10'], 40000);
  assert.equal(rows[1].qty, 500);
});

test('ไม่มีขนาด (งานบริการ) ยังรวมเป็นแถวเดียวได้ ไม่แตกเป็นแถวละใบ', () => {
  const rows = summarizeForecastLines([
    { month: '2026-09', categoryLabel: '03-002', categoryCode: '03-002', unit: 'งาน', volume: null, volumeUnit: null, qty: 1, volumeTotal: null, fcAmount: 30000, dealId: 'A' },
    { month: '2026-09', categoryLabel: '03-002', categoryCode: '03-002', unit: 'งาน', volume: null, volumeUnit: null, qty: 2, volumeTotal: null, fcAmount: 60000, dealId: 'B' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].qty, 3);
  assert.equal(rows[0].volume, null);
});

test('ยอดรวมของไฟล์เท่ากับผลบวก FC ของทุกดีล', () => {
  const deals = [
    { id: 'A', projectValue: 756600, forecastSource: 'quotation' },
    { id: 'B', projectValue: 90000, forecastSource: 'manual' },
    { id: 'C', projectValue: 250000, forecastSource: 'manual' },
  ];
  const all = [
    ...forecastBreakdownOfDeal(deals[0], { quotationLines: [line({ lineTotal: 843000 })], productById: new Map([['P1', product()]]) }),
    ...forecastBreakdownOfDeal(deals[1], { valueItems: [{ seq: 1, categoryCode: '02-001', qty: 1, unit: 'ชิ้น', unitPrice: 90000, amount: 90000 }], productById: new Map() }),
    ...forecastBreakdownOfDeal(deals[2], { valueItems: [], productById: new Map() }),
  ];
  const sum = all.reduce((s, r) => s + r.fcAmount, 0);
  assert.equal(Math.round(sum * 100) / 100, 1096600);
});
