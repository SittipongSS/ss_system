// ── ตรวจตัวเลข L11 (26/10): การ์ดบนแถบของทะเบียนใบสั่งขาย = แถวที่ตารางเหลือหลังกด ─────────────────────────────
//
// 🐞 การ์ด "รอตรวจอนุมัติ" · "อนุมัติแล้ว" · "Actual ก่อน VAT" นับเฉพาะใบจากใบเสนอราคา (ใบย้อนหลังไม่นับ Actual · mig 0360)
//    แต่กดไม่ได้ และตัวเลือกสถานะคำเดียวกันรวมใบย้อนหลัง ⇒ คำเดียวกันได้สองตัวเลขบนจอเดียว · เรียกชุดของการ์ดขึ้นมาไม่ได้
// ⭐ เทสต์ยิงตัวตัดสินตัวจริง (`salesOrderPassesListFilters`) ที่หน้าเรียกตรง ๆ (ด่านซอร์สท้ายไฟล์ผูกหน้าเข้ากับตัวนี้)
//    — ไม่ลอกเงื่อนไขมาเขียนในเทสต์ · ไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_SALES_ORDER_FILTERS, ORIGIN_FILTERS, SALES_ORDER_CARD_PICKS,
  historicalPendingCount, historicalPendingNote, salesOrderPassesListFilters, salesOrderPickActive,
} from './salesOrderListFilter.js';
import { ORIGIN_HISTORICAL, ORIGIN_PIPELINE } from './historicalOrders.js';
import { salesOrderActual, splitSalesOrderAmounts } from './salesOrderWorkflow.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

/* ชุดคละทุกมิติ: สถานะ × ที่มา × สาย × การชำระ/ใบกำกับ × ธงจาก server */
const STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'approval_revoked', 'cancelled'];
const PAYMENTS = [
  null,
  { tracked: true, complete: true, paid: 2, count: 2, invoiced: 2, invoiceNeeded: 2 },
  { tracked: true, complete: false, overdue: 1, paid: 0, count: 2, invoiced: 0, invoiceNeeded: 1 },
  { tracked: true, rejected: 1, paid: 1, count: 3, invoiced: 0, invoiceNeeded: 0 },
];
const ROWS = [];
let seq = 0;
for (const status of STATUSES) {
  for (const origin of [ORIGIN_PIPELINE, ORIGIN_HISTORICAL]) {
    for (const businessLine of ['PRODUCT', 'SERVICE', null]) {
      for (const payment of PAYMENTS) {
        seq += 1;
        ROWS.push({
          id: `SO-${seq}`, orderNumber: `SO-2610${String(seq).padStart(4, '0')}`, status, origin, businessLine, payment,
          actualAmount: seq * 1000, customerName: seq % 2 ? 'ลูกค้า ก' : 'ลูกค้า ข',
          _waitingOnMe: seq % 3 === 0, _serviceSetupPending: status === 'approved' && businessLine === 'SERVICE' && seq % 2 === 0,
        });
      }
    }
  }
}

/* ใบ "Actual รายงวด" ที่อนุมัติแล้ว (mig 0412 · review รอบสาม 26/10) — งวดที่ยื่นรอ AE Sup อยู่กองรออนุมัติ (มติข้อ 5) แต่ใบเป็น
   'approved' ⇒ ต้องไม่เข้าเลขการ์ด "รอตรวจอนุมัติ" (กดแล้วกรอง pending_approval — เลขบนการ์ด = แถวหลังกด) · ยื่นสองงวด/ไม่มีงวดยื่น/ใบย้อนหลัง */
ROWS.push(
  { id: 'SO-I1', orderNumber: 'SO-26109001', status: 'approved', origin: ORIGIN_PIPELINE, businessLine: 'PRODUCT', payment: null,
    actualMode: 'installment', actualAmount: 100000, actualCountedAmount: 30000, actualSubmittedAmount: 60000, actualSubmittedCount: 2,
    customerName: 'ลูกค้า ก', _waitingOnMe: true, _serviceSetupPending: false },
  { id: 'SO-I2', orderNumber: 'SO-26109002', status: 'approved', origin: ORIGIN_PIPELINE, businessLine: 'SERVICE', payment: null,
    actualMode: 'installment', actualAmount: 50000, actualCountedAmount: 25000, actualSubmittedAmount: 0, actualSubmittedCount: 0,
    customerName: 'ลูกค้า ข', _waitingOnMe: false, _serviceSetupPending: false },
  { id: 'SO-I3', orderNumber: 'SO-26109003', status: 'approved', origin: ORIGIN_HISTORICAL, businessLine: null, payment: null,
    actualMode: 'installment', actualAmount: 40000, actualCountedAmount: 0, actualSubmittedAmount: 40000, actualSubmittedCount: 1,
    customerName: 'ลูกค้า ก', _waitingOnMe: false, _serviceSetupPending: false },
);

/* ชุดค้นของหน้าเป็นรูป `!q || [...]…includes(q)` (ด่านซอร์สยืนยัน) — ในเทสต์ใช้เลขที่ใบกับชื่อลูกค้าแทนชุดเต็ม */
const tableRows = (filters) => {
  const q = String(filters.query || '').trim().toLowerCase();
  const matchesSearch = (row) => !q || [row.orderNumber, row.customerName].some((v) => String(v || '').toLowerCase().includes(q));
  return ROWS.filter((row) => salesOrderPassesListFilters(row, filters, { matchesSearch }));
};

/* ตัวกรองที่ค้างก่อนกดการ์ด — ทุกมิติของตารางอย่างน้อยหนึ่งแบบ + แบบผสม */
const STALE = [
  {}, { query: 'ลูกค้า ก' }, { query: 'SO-2610' }, { status: ['pending_approval'] }, { status: ['approved', 'draft'] },
  { payment: ['overdue'] }, { invoice: ['missing'] }, { origin: [ORIGIN_HISTORICAL] }, { origin: [ORIGIN_PIPELINE, ORIGIN_HISTORICAL] },
  { lineView: 'SERVICE' }, { lineView: 'PRODUCT' }, { waitingOnMe: true }, { serviceSetupPending: true },
  { query: 'ข', status: ['rejected'], payment: ['complete'], invoice: ['complete'], origin: [ORIGIN_HISTORICAL], lineView: 'SERVICE', waitingOnMe: true, serviceSetupPending: true },
];

test('🔴 L11: ทุกการ์ด × ตัวกรองที่ค้าง — กดแล้วตารางเหลือเท่าเลขบนการ์ด (นิยามของการ์ดไม่เปลี่ยน)', () => {
  const amounts = splitSalesOrderAmounts(ROWS); // ตัวเดียวกับที่หน้าคิด summary
  // การ์ด "รอตรวจอนุมัติ" = ใบ pending_approval ล้วน (pendingOrderCount) — งวดที่ยื่นของใบรายงวดอยู่นอกเลขการ์ด (review รอบสาม 26/10)
  const expected = { total: ROWS.length, pending: amounts.pendingOrderCount, approved: amounts.actualCount };
  assert.equal(amounts.instPendingCount, 2, 'ชุดทดสอบมีงวดที่ยื่นของใบรายงวด (ใบย้อนหลังไม่นับ)');
  assert.equal(amounts.instPendingAmount, 60000);
  assert.equal(amounts.pendingApproval, amounts.pendingOrderAmount + amounts.instPendingAmount, 'กองรออนุมัติรวม = ใบ + งวด (มติข้อ 5)');
  assert.equal(amounts.pendingApprovalCount, amounts.pendingOrderCount + 1, 'จำนวนใบที่มียอดรออนุมัติ: ใบรายงวดนับหนึ่งใบ ไม่ใช่สองงวด');
  assert.ok(expected.pending > 0 && expected.approved > 0, 'ชุดทดสอบต้องมีใบทั้งสองกอง');
  for (const [key, pick] of Object.entries(SALES_ORDER_CARD_PICKS)) {
    // การ์ดระบุครบทุกมิติ — เพิ่มมิติใหม่แล้วลืมใส่ = ของค้างหลุดรอด
    assert.deepEqual(Object.keys(pick).sort(), Object.keys(EMPTY_SALES_ORDER_FILTERS).sort(), key);
    for (const stale of STALE) {
      const after = tableRows({ ...EMPTY_SALES_ORDER_FILTERS, ...stale, ...pick });
      assert.equal(after.length, expected[key], `${key} หลัง ${JSON.stringify(stale)}`);
    }
    assert.equal(salesOrderPickActive(pick, pick), true, `${key}: หลังกด การ์ดต้องขึ้นว่ากำลังใช้`);
  }
  // "Actual ก่อน VAT" ใช้ชุดเดียวกับ "อนุมัติแล้ว" — ยอดรวมของแถวหลังกด = ยอดบนการ์ด
  const approvedRows = tableRows(SALES_ORDER_CARD_PICKS.approved);
  assert.equal(approvedRows.reduce((sum, row) => sum + salesOrderActual(row), 0), amounts.actual);
  // ยอดรออนุมัติบนหมายเหตุ = ยอดของแถวหลังกด "รอตรวจอนุมัติ" (ใบ pending_approval ล้วน)
  assert.equal(splitSalesOrderAmounts(tableRows(SALES_ORDER_CARD_PICKS.pending)).pendingApproval, amounts.pendingOrderAmount);
  assert.ok(tableRows(SALES_ORDER_CARD_PICKS.pending).every((row) => row.status === 'pending_approval'));

  // 🐞 ของเดิม: ตัวเลือกสถานะคำเดียวกันรวมใบย้อนหลัง ⇒ ได้มากกว่าเลขบนการ์ด
  assert.ok(tableRows({ status: ['pending_approval'] }).length > expected.pending);
  assert.ok(tableRows({ status: ['approved'] }).length > expected.approved);
  // แถวหลังกดไม่มีใบย้อนหลังเลย (กองของการ์ดตัดใบย้อนหลัง)
  for (const key of ['pending', 'approved']) {
    assert.ok(tableRows(SALES_ORDER_CARD_PICKS[key]).every((row) => ORIGIN_FILTERS[ORIGIN_PIPELINE].match(row)), key);
  }
});

test('L11: salesOrderPickActive — ตรงทุกมิติเท่านั้น · ตัวกรองที่ค้างแม้มิติเดียว = ไม่ใช่การ์ดที่ใช้อยู่', () => {
  const { pending, approved, total } = SALES_ORDER_CARD_PICKS;
  assert.equal(salesOrderPickActive(EMPTY_SALES_ORDER_FILTERS, total), true, 'ไม่มีตัวกรอง = การ์ดทั้งหมด');
  assert.equal(salesOrderPickActive(EMPTY_SALES_ORDER_FILTERS, pending), false);
  assert.equal(salesOrderPickActive(pending, approved), false);
  for (const stale of STALE.filter((s) => Object.keys(s).length)) {
    assert.equal(salesOrderPickActive({ ...pending, ...stale }, pending), JSON.stringify({ ...pending, ...stale }) === JSON.stringify(pending),
      JSON.stringify(stale));
  }
  // ลำดับในอาร์เรย์ไม่สำคัญ · คำค้นที่เป็นช่องว่างล้วนเท่ากับว่าง
  assert.equal(salesOrderPickActive({ ...pending, query: '   ' }, pending), true);
  assert.equal(salesOrderPickActive({ ...total, origin: [ORIGIN_HISTORICAL, ORIGIN_PIPELINE] }, total), false);
  assert.equal(Object.isFrozen(EMPTY_SALES_ORDER_FILTERS), true);
});

test('ตัวตัดสินของตาราง: ทุกมิติเท่าเดิม (รอฉันลงมือ · งานบริการ · สาย · สถานะ · การชำระ OR · ใบกำกับ · ที่มา · คำค้น)', () => {
  const row = { status: 'approved', origin: ORIGIN_PIPELINE, businessLine: 'SERVICE', payment: PAYMENTS[2], _waitingOnMe: true, _serviceSetupPending: false };
  assert.equal(salesOrderPassesListFilters(row, EMPTY_SALES_ORDER_FILTERS), true);
  assert.equal(salesOrderPassesListFilters(row), true, 'ไม่ส่งตัวกรอง = ไม่กรอง');
  assert.equal(salesOrderPassesListFilters(row, { waitingOnMe: true }), true);
  assert.equal(salesOrderPassesListFilters(row, { serviceSetupPending: true }), false);
  assert.equal(salesOrderPassesListFilters(row, { lineView: 'PRODUCT' }), false);
  assert.equal(salesOrderPassesListFilters({ ...row, businessLine: null }, { lineView: 'all' }), true, 'ยังไม่ระบุสายอยู่ใน "ทุกสาย" เสมอ');
  assert.equal(salesOrderPassesListFilters(row, { payment: ['complete', 'overdue'] }), true, 'หลายหมวดการชำระ = OR');
  assert.equal(salesOrderPassesListFilters(row, { payment: ['complete'] }), false);
  assert.equal(salesOrderPassesListFilters(row, { invoice: ['missing'] }), true);
  assert.equal(salesOrderPassesListFilters(row, { invoice: ['complete'] }), false);
  assert.equal(salesOrderPassesListFilters(row, { origin: [ORIGIN_HISTORICAL] }), false);
  assert.equal(salesOrderPassesListFilters(row, {}, { matchesSearch: () => false }), false, 'คำค้นของหน้าผ่าน ctx');
});

test('🔴 L11c: หัวกลุ่ม — ใบย้อนหลังที่รออนุมัติถูกบอกแยก (ป้าย n ใบ = รออนุมัติจากใบเสนอราคา + ใบย้อนหลังรออนุมัติ + ใบอื่น)', () => {
  // กลุ่ม "รออนุมัติ" ของโหมดจัดตามสถานะ: ใบจากใบเสนอราคา 1 + ใบย้อนหลัง 2
  const bucket = [
    { status: 'pending_approval', origin: ORIGIN_PIPELINE, actualAmount: 5000 },
    { status: 'pending_approval', origin: ORIGIN_HISTORICAL, actualAmount: 7000 },
    { status: 'pending_approval', origin: ORIGIN_HISTORICAL, actualAmount: 9000 },
  ];
  const split = splitSalesOrderAmounts(bucket);
  assert.equal(split.pendingApprovalCount, 1);
  assert.equal(split.pendingOrderCount, 1);
  assert.equal(split.pendingApproval, 5000, 'ยอดรออนุมัติไม่รวมใบย้อนหลัง');
  assert.equal(historicalPendingCount(bucket), 2);
  assert.equal(split.pendingApprovalCount + historicalPendingCount(bucket), bucket.length, 'สองกองรวมกัน = ป้าย n ใบ');
  assert.equal(historicalPendingNote(2), ' · ใบย้อนหลังรออนุมัติ 2 ใบ (ไม่นับยอด)');
  assert.equal(historicalPendingNote(0), '', 'ไม่มีใบย้อนหลังรออนุมัติ = หัวกลุ่มหน้าตาเดิม');
  // ทุกกลุ่ม: ใบ pending_approval ทั้งหมด = กองรออนุมัติ (ใบ) + ใบย้อนหลังรออนุมัติ (ไม่มีใบหล่นหาย) — หัวกลุ่มวาด pendingOrderCount
  // · ถัง "อนุมัติแล้ว" มีงวดที่ยื่นของใบรายงวดแต่ไม่มีใบรออนุมัติ ⇒ "· n ใบ" ไม่นับงวด (บอกแยกเป็น "งวด")
  for (const status of STATUSES) {
    const items = ROWS.filter((row) => row.status === status);
    assert.equal(splitSalesOrderAmounts(items).pendingOrderCount + historicalPendingCount(items),
      items.filter((row) => row.status === 'pending_approval').length, status);
  }
  assert.equal(splitSalesOrderAmounts(ROWS.filter((row) => row.status === 'approved')).instPendingCount, 2);
  assert.equal(historicalPendingCount(null), 0);
});

test('ด่านซอร์ส L11: หน้ากรองด้วยตัวตัดสินกลาง · การ์ดสี่ใบเป็นปุ่มที่ตั้ง state ทุกตัวของตารางจาก pick', () => {
  const page = read('../../app/sales-planning/sales-orders/page.js');
  assert.match(page, /import \{\s*EMPTY_SALES_ORDER_FILTERS, INVOICE_FILTERS, ORIGIN_FILTERS, PAYMENT_FILTERS, SALES_ORDER_CARD_PICKS,\s*historicalPendingCount, historicalPendingNote, salesOrderPassesListFilters, salesOrderPickActive,\s*\} from "@\/lib\/sales\/salesOrderListFilter";/);
  const memo = slice(page, 'const filtered = useMemo(', '\n\n');
  assert.match(memo, /return rows\.filter\(\(row\) => salesOrderPassesListFilters\(row, filters, \{ matchesSearch \}\)\);/);
  assert.doesNotMatch(memo, /Filter\.length && !|lineView !== "all"|_waitingOnMe|_serviceSetupPending/, 'ห้ามเขียนเงื่อนไขของมิติซ้ำในหน้า');
  assert.match(memo, /const matchesSearch = \(row\) => \{[\s\S]*return !q \|\| \[row\.orderNumber,/, 'ชุดค้นเป็นรูป !q || […] ตามที่เทสต์จำลอง');
  // คีย์ของตัวกรองในหน้า = คีย์ของ EMPTY_SALES_ORDER_FILTERS (ยกเว้น query ที่ไปทาง matchesSearch)
  const literal = slice(memo, 'const filters = {', '};');
  const pairs = literal.slice('const filters = {'.length).split(',').map((part) => part.trim()).filter(Boolean)
    .map((part) => { const [key, value] = part.split(':').map((x) => x.trim()); return [key, value || key]; });
  assert.deepEqual(pairs.map(([key]) => key).concat('query').sort(), Object.keys(EMPTY_SALES_ORDER_FILTERS).sort());
  // applyOrderPick ตั้ง state ทุกตัวของตัวกรองจาก pick (รวมคำค้น)
  const apply = slice(page, 'const applyOrderPick = (pick) => {', '\n  };');
  for (const [key, state] of [...pairs, ['query', 'query']]) {
    const setter = `set${state[0].toUpperCase()}${state.slice(1)}`;
    assert.match(apply, new RegExp(`${setter}\\((\\[\\.\\.\\.)?pick\\.${key}\\]?\\)`), `applyOrderPick ต้องตั้ง ${state} จาก pick.${key}`);
  }
  // state ที่ memo อ่าน (dependency) = state ของตัวกรอง + rows — ไม่มีตัวกรองแอบอยู่นอก filters
  const deps = /\}, \[([^\]]*)\]\);/.exec(memo)[1].split(',').map((d) => d.trim());
  assert.deepEqual(deps.filter((d) => d !== 'rows').sort(), pairs.map(([, state]) => state).concat('query').sort());
  // การ์ด: ปุ่มจริง · aria-pressed · กดซ้ำ = ล้าง
  assert.match(page, /const pickCard = \(key\) => applyOrderPick\(cardActive\(key\) \? EMPTY_SALES_ORDER_FILTERS : SALES_ORDER_CARD_PICKS\[key\]\);/);
  const strip = slice(page, '<SaMetricStrip>', '</SaMetricStrip>');
  assert.equal((strip.match(/<SaMetric\s/g) || []).length, 4);
  assert.equal((strip.match(/as="button" type="button"/g) || []).length, 4, 'การ์ดทั้งสี่กดได้');
  for (const key of ['total', 'pending', 'approved']) {
    assert.ok(strip.includes(`active={cardActive("${key}")} aria-pressed={cardActive("${key}")} onClick={() => pickCard("${key}")}`), key);
  }
  assert.equal((strip.match(/pickCard\("approved"\)/g) || []).length, 2, '"อนุมัติแล้ว" กับ "Actual ก่อน VAT" ชุดเดียวกัน');
  // หมายเหตุใต้เลขพูดชุดของการ์ดตรง ๆ (คำบนตัวเลือกสถานะรวมใบย้อนหลัง)
  /* การ์ด "รอตรวจอนุมัติ": หมายเหตุสั้น + title ประโยคเต็ม (UAT 27/10 ข้อ 6 — หมายเหตุการ์ดตัดด้วย "…") · ประโยคชุดของการ์ดอยู่ที่ pendingCardNoteOf */
  assert.ok(strip.includes('note={pendingCardNote.note}\n            title={pendingCardNote.title}'));
  assert.ok(slice(page, 'const pendingCardNoteOf = (summary) => {', '\n};\n')
    .includes('ใบจากใบเสนอราคา · ${fmtMoney(summary.pendingApproval)} ก่อน VAT · ยังไม่นับ Actual'));
  assert.ok(strip.includes('note="ใบจากใบเสนอราคา · นับเป็น Actual"'));
  assert.ok(strip.includes('note="รวมเฉพาะใบจากใบเสนอราคาที่อนุมัติแล้ว"'));
  assert.ok(ORIGIN_FILTERS[ORIGIN_PIPELINE].label === 'ใบจากใบเสนอราคา', 'คำบนหมายเหตุ = คำบนตัวเลือกที่มาที่การ์ดตั้ง');
});
