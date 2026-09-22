import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { buildSalesReportBuffer, monthSheetRows } from './salesReportWorkbook.js';
import { summarizeSalesReport } from './reportSummary.js';
import { parseReportPeriod } from './reportPeriod.js';

/* ไฟล์ Excel ของรายงานยอดขาย (มติผู้ใช้ 2026-09-22 "ทั้งรายงาน")
   ล็อก: ตัวเลขในไฟล์ = ตัวเลขของ summarizeSalesReport ตัวเดียวกับจอ · ชีตครบ · ใบทุกใบในงวด ·
   route ออกไฟล์ผ่านสามตัวเดียวกับ route ของจอ (ไม่คิดเลขเอง) */

const NOW = new Date('2026-09-22T05:00:00Z');
const TODAY = '2026-09-22';
const z = (n) => Array(n).fill(0);

function fixture({ pending = false } = {}) {
  const period = parseReportPeriod({ mode: 'year', year: '2026' }, { today: TODAY });
  const cT = z(12); const cA = z(12); const hist = z(12);
  cT[6] = 1000; cA[6] = 900; hist[6] = 1;       // ก.ค. กรอกมือ
  cT[7] = 2000; cA[7] = 2500;                     // ส.ค. จากใบ
  cT[8] = 3000; cA[8] = 700;                      // ก.ย. ยังไม่จบ
  const pA = z(12); pA[6] = 900; pA[7] = 2500; pA[8] = 700;
  const pT = z(12); pT[7] = 2000;
  const orders = [
    { id: 's1', orderNumber: 'SO-1', month: '2026-08', day: '2026-08-05', approvedAt: '2026-08-05T03:00:00Z', ownerId: 'u1', ownerName: 'A', team: 'KA', amount: 2500, vatAmount: 175, totalAmount: 2675, lineCount: 2, financeStatus: 'approved' },
    { id: 's2', orderNumber: 'SO-2', month: '2026-09', day: '2026-09-02', approvedAt: '2026-09-02T03:00:00Z', ownerId: 'u1', ownerName: 'A', team: 'KA', amount: 700, vatAmount: 49, totalAmount: 749, lineCount: 1, financeStatus: 'pending' },
    { id: 's3', orderNumber: 'SO-3', month: '2026-09', day: '2026-09-03', approvedAt: '2026-09-03T03:00:00Z', ownerId: 'u1', ownerName: 'A', team: 'KA', amount: 0, vatAmount: 0, totalAmount: 0, lineCount: 1, financeStatus: null, free: true },
  ];
  const pendingApproval = pending ? {
    month: '2026-09', amount: 300, count: 1,
    byOwner: [{ key: 'KA:u1', ownerId: 'u1', ownerName: 'A', team: 'KA', amount: 300, count: 1 }],
    byTeam: [{ key: 'team:KA', team: 'KA', amount: 300, count: 1 }],
    noTeam: { key: 'team:-', team: null, amount: 0, count: 0 },
    unassigned: { amount: 0, count: 0 },
    orders: [{ id: 'p1', orderNumber: 'SO-P', ownerName: 'A', team: 'KA', amount: 300, submittedAt: '2026-09-20T10:00:00Z' }],
  } : { month: null, amount: 0, count: 0, byOwner: [], byTeam: [], noTeam: { count: 0, amount: 0 }, unassigned: { count: 0, amount: 0 }, orders: [] };
  const data = {
    period, axis: period.axis, months: period.months, lead: 0, targetFactor: z(12).map(() => 1),
    company: { key: 'company', scope: 'company', target: cT, actual: cA, history: hist, targetFull: cT },
    teams: [{ key: 'team:KA', scope: 'team', team: 'KA', target: pT, actual: pA, history: z(12) }],
    people: [{ key: 'KA:u1', scope: 'owner', ownerId: 'u1', ownerName: 'A', team: 'KA', target: pT, actual: pA, history: z(12) }],
    pendingApproval, orders, byDay: {}, historyDropped: [], generatedAt: NOW.toISOString(),
  };
  return { data, summary: summarizeSalesReport(data, { now: NOW }) };
}

async function readBook(buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book;
}

const lastRowValues = (sheet) => sheet.getRow(sheet.rowCount).values.slice(1);

test('ชีตครบ · ชีตรออนุมัติมีเฉพาะงวดที่มีใบค้าง', async () => {
  const a = fixture();
  const bookA = await readBook(await buildSalesReportBuffer(a.data, a.summary, { origin: 'https://x.test' }));
  assert.deepEqual(bookA.worksheets.map((s) => s.name), ['สรุปรายเดือน', 'รายทีม', 'รายคน', 'ใบสั่งขาย']);
  const b = fixture({ pending: true });
  const bookB = await readBook(await buildSalesReportBuffer(b.data, b.summary, {}));
  assert.deepEqual(bookB.worksheets.map((s) => s.name), ['สรุปรายเดือน', 'รายทีม', 'รายคน', 'ใบสั่งขาย', 'รออนุมัติ']);
});

test('แถวรวมของชีตสรุป = แถบตัวเลขบนจอ (summary.metrics) ตรงทุกช่อง', async () => {
  const { data, summary } = fixture();
  const book = await readBook(await buildSalesReportBuffer(data, summary, {}));
  const sheet = book.getWorksheet('สรุปรายเดือน');
  const [label, target, , , actual, diff, pct] = lastRowValues(sheet);
  assert.equal(label, 'รวมเดือนที่นับ');
  assert.equal(target, summary.metrics.target);
  assert.equal(actual, summary.metrics.actual);
  assert.equal(diff, summary.metrics.diff);
  assert.equal(pct, summary.metrics.pct / 100);
  // สมการที่มาของขายจริงอยู่บนหัวไฟล์
  const header = [1, 2, 3, 4, 5].map((n) => String(sheet.getRow(n).getCell(1).value || '')).join('\n');
  assert.match(header, /กรอกย้อนหลัง 1 เดือน/);
});

test('ชีตใบสั่งขาย: ลำดับคอลัมน์ตามที่ผู้ใช้กำหนด · ทุกใบในงวด · แถวรวม = ผลรวมใบ · ลิงก์อยู่บนเลข SO', async () => {
  const { data, summary } = fixture();
  data.orders[0].line = 'SERVICE';
  data.orders[0].dealType = 'RE-ORDER';
  Object.assign(data.orders[0], { collectedAmount: 1000, awaitingAmount: 675, installmentCount: 2 });
  Object.assign(data.orders[1], { collectedAmount: 0, awaitingAmount: 0, installmentCount: 0 });
  const book = await readBook(await buildSalesReportBuffer(data, summary, { origin: 'https://suk.example' }));
  const sheet = book.getWorksheet('ใบสั่งขาย');
  const header = sheet.getRow(4).values.slice(1);
  // มติผู้ใช้ 2026-09-22 — ห้ามสลับลำดับโดยไม่ถาม
  assert.deepEqual(header, [
    '#', 'งวด', 'วันที่อนุมัติ', 'ประเภทธุรกิจ', 'ประเภทดีล', 'QT', 'SO', 'ลูกค้า', 'บรรทัด',
    'ยอดที่นับ', 'VAT', 'ยอดหน้าใบ', 'ยอดเก็บจริง', 'ขั้นบัญชี', 'หมายเหตุ', 'ผู้รับผิดชอบ', 'ทีม',
  ]);
  const col = (name) => header.indexOf(name);
  const first = sheet.getRow(5).values.slice(1);
  assert.equal(first[col('#')], 1);
  assert.equal(first[col('ประเภทธุรกิจ')], 'บริการ (Services)');
  assert.equal(first[col('ประเภทดีล')], 'RE-ORDER');
  assert.equal(first[col('SO')].hyperlink, 'https://suk.example/sa/sales-orders/s1');
  assert.equal(first[col('SO')].text, 'SO-1');
  // ยอดเก็บจริงอยู่ถัดจากยอดหน้าใบ · ยอดที่รอบัญชีรับรองไม่นับ แต่บอกในหมายเหตุ
  assert.equal(col('ยอดเก็บจริง'), col('ยอดหน้าใบ') + 1);
  assert.equal(first[col('ยอดเก็บจริง')], 1000);
  assert.match(first[col('หมายเหตุ')], /รอบัญชีรับรอง ฿675\.00/);
  const second = sheet.getRow(6).values.slice(1);
  assert.equal(second[col('ยอดเก็บจริง')], 0);
  assert.match(second[col('หมายเหตุ')], /ยังไม่มีงวดชำระ/);
  const total = lastRowValues(sheet);
  assert.equal(total[0], 'รวม 3 ใบ');
  assert.equal(total[col('ยอดที่นับ')], 3200);
  assert.equal(total[col('ยอดเก็บจริง')], 1000);
  const freeRow = sheet.getRow(7).values.slice(1);
  assert.equal(freeRow[col('ขั้นบัญชี')], 'ไม่ผ่านบัญชี');
  assert.equal(freeRow[col('หมายเหตุ')], 'ไม่คิดเงิน');
  assert.equal(freeRow[col('ยอดเก็บจริง')], '—');
  // ดีลที่ยังไม่ระบุสาย/ประเภท = ขีด ไม่เดาให้
  assert.equal(freeRow[col('ประเภทธุรกิจ')], '—');
  assert.equal(freeRow[col('ประเภทดีล')], '—');
});

test('โหมดช่วงวัน: มีคอลัมน์วันที่นับ/เป้าเต็มเดือน ไม่มีทบยอด', () => {
  const period = parseReportPeriod({ mode: 'range', from: '2026-09-09', to: '2026-09-22' }, { today: TODAY });
  const summary = summarizeSalesReport({
    period, axis: period.axis, lead: 0, targetFactor: [14 / 30],
    company: { key: 'company', target: [1400], actual: [1000], history: [0], targetFull: [3000] },
    teams: [], people: [], orders: [],
  }, { now: NOW });
  const [row] = monthSheetRows(summary, { rangeMode: true });
  assert.equal(row.days, '14/30');
  assert.equal(row.fullTarget, 3000);
  assert.equal(row.carry, undefined);
});

test('route ของไฟล์ใช้สามตัวเดียวกับ route ของจอ — ห้ามคิดเลขเอง', () => {
  const read = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
  for (const rel of ['app/api/sales-planning/report/route.js', 'app/api/sales-planning/report/export/route.js']) {
    const source = read(rel);
    assert.match(source, /parseReportPeriod\(/, rel);
    assert.match(source, /loadSalesReportData\(/, rel);
    assert.match(source, /summarizeSalesReport\(/, rel);
    assert.match(source, /canEditSalesTarget\(user\)/, rel);
    assert.doesNotMatch(source, /\.from\('sales_orders'\)/, `${rel} ห้ามอ่านใบเอง — ผ่าน salesReportData`);
  }
  assert.match(read('app/api/sales-planning/report/export/route.js'), /export const runtime = 'nodejs'/);
});
