import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { DEAL_LEAD_COLUMNS, STATUS_OPEN, STATUS_WON, SUMMARY_LEAD_COLUMNS, buildForecastReportBuffer, dealLeadColumns } from './forecastReportWorkbook.js';
import { forecastBreakdownOfDeal } from './forecastBreakdown.js';
import { PACK_COLUMN_LABEL } from './linePackView.js';

/* ไฟล์ FC รายหมวด — รอบรื้อ (มติผู้ใช้ 2026-09-22 "FC ยอดปิด รวมถึงวันที่รับของ เพื่อส่งให้ผลิตวางแผน")
   ล็อก: คอลัมน์เดือน = เฉพาะงวด · แกนปิดไม่มีกอง · แกนรับของมีกอง "ยังไม่ระบุวันรับของ" · สรุปแยก Won/คาดการณ์
   และแถวรวมย่อยไม่ถูกนับซ้ำในแถวรวมท้ายตาราง */

const line = (over) => ({
  dealId: 'd1', dealCode: 'DL-1', categoryCode: '01-001', categoryLabel: 'หมวดหนึ่ง', unit: 'ขวด',
  qty: 10, fcAmount: 1000, month: '2026-09', monthBasis: 'closeMonth', won: true, ...over,
});

async function sheetOf(buffer, name) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book.getWorksheet(name);
}
const headerOf = (sheet) => sheet.getRow(2).values.slice(1);
const rowsOf = (sheet) => { const out = []; sheet.eachRow((r, n) => { if (n > 2) out.push(r.values.slice(1)); }); return out; };

test('แกนเดือนปิด: คอลัมน์เฉพาะเดือนในงวด · ไม่มีกองยังไม่ระบุ · สรุปแยก Won/คาดการณ์ + รวมย่อย', async () => {
  const lines = [
    line({ dealId: 'w1', fcAmount: 1000, won: true }),
    line({ dealId: 'w2', fcAmount: 500, won: true, categoryCode: '01-002', categoryLabel: 'หมวดสอง' }),
    line({ dealId: 'o1', fcAmount: 300, won: false }),
  ];
  const buffer = await buildForecastReportBuffer(lines, { axis: 'close', months: ['2026-09'], periodLabel: 'ก.ย. 2026' });
  const summary = await sheetOf(buffer, 'สรุปรายหมวด');
  const header = headerOf(summary);
  assert.deepEqual(header.slice(-2), ['ก.ย. 26', 'รวมทั้งงวด']);
  assert.equal(header.includes('ยังไม่ระบุวันรับของ'), false);
  const rows = rowsOf(summary);
  assert.deepEqual(rows.map((r) => r[0]), [STATUS_WON, STATUS_WON, `รวม${STATUS_WON}`, STATUS_OPEN, `รวม${STATUS_OPEN}`, 'รวม']);
  assert.equal(rows[2].at(-1), 1500);
  assert.equal(rows[4].at(-1), 300);
  assert.equal(rows[5].at(-1), 1800); // แถวรวมท้ายไม่นับแถวรวมย่อยซ้ำ
  assert.equal(rows[5].at(-2), 1800);
  assert.match(String(summary.getRow(1).values[1]), /ยืนยันแล้ว \(Won\) 1,500\.00 \+ คาดการณ์ \(ยังเปิด\) 300\.00/);
});

test('แกนเดือนรับของ: ดีลที่ไม่มีวันรับของไปกอง "ยังไม่ระบุวันรับของ" · ยอดรวมครบ', async () => {
  const lines = [
    line({ dealId: 'a', month: '2026-11', monthBasis: 'endDate', fcAmount: 700, deliveryMonth: '2026-11' }),
    line({ dealId: 'b', month: '2026-09', monthBasis: 'expectedCloseDate', fcAmount: 200, deliveryMonth: null, won: false }),
  ];
  const buffer = await buildForecastReportBuffer(lines, { axis: 'delivery', months: ['2026-10', '2026-11'], periodLabel: 'ต.ค.–พ.ย. 2026' });
  const detail = await sheetOf(buffer, 'รายดีล');
  const header = headerOf(detail);
  assert.deepEqual(header.slice(-4), ['ต.ค. 26', 'พ.ย. 26', 'ยังไม่ระบุวันรับของ', 'รวมทั้งงวด']);
  const at = (name) => header.indexOf(name);
  const rows = rowsOf(detail);
  assert.equal(rows[0][at('พ.ย. 26')], 700);
  assert.equal(rows[1][at('ยังไม่ระบุวันรับของ')], 200);
  assert.equal(rows[1][at('เดือนรับของ')], 'ยังไม่ระบุ');
  assert.equal(rows[1][at('สถานะ')], STATUS_OPEN);
  assert.equal(rows.at(-1).at(-1), 900);
});

test('ยอดไม่หาย: แถวที่ไม่มีเดือน/เดือนนอกงวด ไปคอลัมน์กอง และคอลัมน์โผล่แม้แกนปิด (รีวิว #1787)', async () => {
  const lines = [
    line({ dealId: 'a', fcAmount: 1000 }),
    line({ dealId: 'b', fcAmount: 250, month: null }), // ลิงก์ไม่ระบุงวด · ดีลไม่มีวัน/เดือนปิด
    line({ dealId: 'c', fcAmount: 40, month: '2026-12' }), // ตัวคัดกับตัวลงช่องเพี้ยนกัน (ไม่ควรเกิด) — ต้องไม่หาย
  ];
  const buffer = await buildForecastReportBuffer(lines, { axis: 'close', months: ['2026-09'] });
  for (const name of ['สรุปรายหมวด', 'รายดีล']) {
    const sheet = await sheetOf(buffer, name);
    const header = headerOf(sheet);
    assert.deepEqual(header.slice(-3), ['ก.ย. 26', 'ยังไม่ระบุเดือนปิด', 'รวมทั้งงวด'], name);
    const total = rowsOf(sheet).at(-1);
    assert.equal(total.at(-1), 1290, name);
    assert.equal(total.at(-3) + total.at(-2), 1290, `${name}: ช่องเดือน + กอง = รวมทั้งงวด`);
  }
});

test('เศษปัดติดลบในกองไม่ถูกทิ้ง — ช่องกองของชีตสรุป/แถวรวมย่อยเท่ารวมทั้งงวดและเท่าชีตรายดีล (รีวิว #1787)', async () => {
  // ดีล Won ที่บรรทัดแถมท้ายใบได้เศษ -0.01 (allocateToLines ลงเศษบรรทัดสุดท้าย) · ไม่มีวันรับของทั้งคู่ ⇒ กอง
  const pile = { month: null, monthBasis: 'expectedCloseDate' };
  const lines = [
    line({ ...pile, dealId: 'A', fcAmount: 66.67, volume: 100 }),
    line({ ...pile, dealId: 'A', fcAmount: 66.67, volume: 100 }),
    line({ ...pile, dealId: 'A', fcAmount: 66.67, volume: 100 }),
    line({ ...pile, dealId: 'A', fcAmount: -0.01, volume: 5 }),
    line({ ...pile, dealId: 'B', fcAmount: 50, volume: 5, won: false }),
  ];
  const buffer = await buildForecastReportBuffer(lines, { axis: 'delivery', months: ['2026-09'] });
  const summary = await sheetOf(buffer, 'สรุปรายหมวด');
  const header = headerOf(summary);
  const pileAt = header.indexOf('ยังไม่ระบุวันรับของ');
  for (const row of rowsOf(summary)) {
    const pileValue = typeof row[pileAt] === 'number' ? row[pileAt] : 0;
    assert.equal(Math.round(pileValue * 100), Math.round(Number(row.at(-1)) * 100), `แถว ${row[0]}: กอง = รวมทั้งงวด`);
  }
  const detailRows = rowsOf(await sheetOf(buffer, 'รายดีล'));
  assert.equal(rowsOf(summary).at(-1)[pileAt], detailRows.at(-1)[headerOf(await sheetOf(buffer, 'รายดีล')).indexOf('ยังไม่ระบุวันรับของ')]);
});

/* ── เลขแพ็คของบรรทัดใบเสนอราคา (mig 0407 · งวด PR-2 · docs/qt-pack-column.md) ──────────────────────────
   ชีตรายดีลได้คอลัมน์ "แพ็ค/เดือน" หน้า "จำนวน" **เฉพาะไฟล์ที่มีบรรทัดที่มีเลขแพ็ค** · ไฟล์อื่นหัวตารางเท่าเดิมทุกช่อง */
const TODAY_DETAIL_HEADER = ['รหัสดีล', 'ชื่อดีล', 'ลูกค้า', 'ผู้ดูแล (AE)', 'ทีม', 'ขั้น', 'สถานะ', 'โอกาสปิด (%)', 'ที่มาของเดือน',
  'เดือนที่คาดการณ์ปิด', 'เดือนรับของ', 'ที่มา FC', 'เลขที่ใบเสนอราคา', 'รหัสหมวด', 'หมวดหลัก', 'หมวดย่อย', 'ที่มาของหมวด', 'รหัส FG',
  'รายละเอียด', 'จำนวน', 'หน่วยขาย', 'ปริมาตร/หน่วย', 'ปริมาตรรวม', 'หน่วยปริมาตร', 'ราคา/หน่วย', 'มูลค่าบรรทัด'];
const TODAY_SUMMARY_HEADER = ['สถานะ', 'รหัสหมวด', 'หมวดหลัก', 'หมวดย่อย', 'หน่วยขาย', 'ขนาด/หน่วย', 'จำนวนรวม', 'ปริมาตรรวม', 'หน่วยปริมาตร', 'จำนวนดีล'];

/* แถวจากตัวแตกยอดจริง (ไม่ใช่แถวที่เทสต์แต่งเอง) + บริบทของดีลแบบที่ route เติม */
const rowsFromBreakdown = (quotationLines) => forecastBreakdownOfDeal(
  { id: 'D1', projectValue: quotationLines.reduce((sum, l) => sum + l.lineTotal, 0), forecastSource: 'quotation' },
  { quotationLines, productById: new Map([['PK', { id: 'PK', fgCode: 'FG-364-02-001-1061', categoryCode: '02-001', volume: 500, volumeUnit: 'ml', saleUnit: 'แพ็คเกจ' }]]), quoteNumber: 'QT-1' },
).map((row) => ({ ...row, month: '2026-09', monthBasis: 'closeMonth', won: true, dealCode: 'DL-1', dealTitle: 'ดีล', stage: 'won' }));
const quoteLine = (over = {}) => ({ id: 'L1', productId: 'PK', fgCode: null, description: 'ระบบกระจายกลิ่น', qty: 12, unit: 'เดือน', unitPrice: 3500, lineTotal: 42000, sortOrder: 0, ...over });

test('🔴 ไฟล์ที่ไม่มีบรรทัดไหนมีเลขแพ็ค: หัวตารางสองชีตเท่ากับวันนี้ทุกช่อง · ค่าทุกช่องเท่ากันไม่ว่าบรรทัดจะพก packQty: null หรือไม่', async () => {
  assert.deepEqual(DEAL_LEAD_COLUMNS.map((c) => c.label), TODAY_DETAIL_HEADER, 'คอลัมน์ที่ส่งออก (ค่าคงที่) ไม่ถูกแก้');
  assert.deepEqual(SUMMARY_LEAD_COLUMNS.map((c) => c.label), TODAY_SUMMARY_HEADER);
  const meta = { axis: 'close', months: ['2026-09'], periodLabel: 'ก.ย. 2026' };
  const plain = rowsFromBreakdown([quoteLine(), quoteLine({ id: 'L2', productId: null, description: 'ค่าออกแบบ', qty: 1, unit: 'งาน', unitPrice: 5000, lineTotal: 5000, sortOrder: 1 })]);
  assert.equal(dealLeadColumns(plain), DEAL_LEAD_COLUMNS, 'ไฟล์ที่ไม่มีเลขแพ็คใช้อาร์เรย์เดิมตัวเดียวกัน');
  const cells = async (rows) => {
    const buffer = await buildForecastReportBuffer(rows, meta);
    const out = {};
    for (const name of ['สรุปรายหมวด', 'รายดีล']) {
      const sheet = await sheetOf(buffer, name);
      out[name] = { header: headerOf(sheet), rows: rowsOf(sheet), widths: sheet.columns.map((c) => c.width), filter: sheet.autoFilter, merges: sheet.model.merges };
    }
    return out;
  };
  const base = await cells(plain);
  assert.deepEqual(base['รายดีล'].header, [...TODAY_DETAIL_HEADER, 'ก.ย. 26', 'รวมทั้งงวด']);
  assert.deepEqual(base['สรุปรายหมวด'].header, [...TODAY_SUMMARY_HEADER, 'ก.ย. 26', 'รวมทั้งงวด']);
  for (const packQty of [null, '', 'abc', 0, 1.5, 10000]) {
    const same = rowsFromBreakdown([quoteLine({ packQty }), quoteLine({ id: 'L2', productId: null, description: 'ค่าออกแบบ', qty: 1, unit: 'งาน', unitPrice: 5000, lineTotal: 5000, sortOrder: 1, packQty })]);
    assert.deepEqual(await cells(same), base, `packQty: ${String(packQty)}`);
  }
});

test('⭐ ไฟล์ที่มีบรรทัดที่มีเลขแพ็ค: ชีตรายดีลได้คอลัมน์ “แพ็ค/เดือน” หนึ่งคอลัมน์หน้า “จำนวน” — 2 · 12 · เดือน · 3,500 · 84,000 อ่านได้ในแถวเดียว', async () => {
  const rows = rowsFromBreakdown([
    quoteLine({ qty: 12, unit: 'เดือน', unitPrice: 3500, lineTotal: 84000, packQty: 2 }),
    quoteLine({ id: 'L2', productId: null, description: 'ค่าออกแบบ', qty: 1, unit: 'งาน', unitPrice: 5000, lineTotal: 5000, sortOrder: 1 }),
  ]);
  const columns = dealLeadColumns(rows);
  assert.equal(columns.length, DEAL_LEAD_COLUMNS.length + 1);
  assert.deepEqual(columns.filter((c) => c.key !== 'packQty'), DEAL_LEAD_COLUMNS, 'คอลัมน์เดิมครบ ลำดับเดิม');
  assert.equal(DEAL_LEAD_COLUMNS.some((c) => c.key === 'packQty'), false, 'ค่าคงที่ที่ส่งออกไม่ถูกแก้');
  const buffer = await buildForecastReportBuffer(rows, { axis: 'close', months: ['2026-09'], periodLabel: 'ก.ย. 2026' });
  const detail = await sheetOf(buffer, 'รายดีล');
  const header = headerOf(detail);
  const expectedHeader = [...TODAY_DETAIL_HEADER];
  expectedHeader.splice(expectedHeader.indexOf('จำนวน'), 0, PACK_COLUMN_LABEL);
  assert.deepEqual(header, [...expectedHeader, 'ก.ย. 26', 'รวมทั้งงวด']);
  const at = (name) => header.indexOf(name);
  const [pack, other, total] = rowsOf(detail);
  assert.deepEqual([pack[at(PACK_COLUMN_LABEL)], pack[at('จำนวน')], pack[at('หน่วยขาย')], pack[at('ราคา/หน่วย')], pack[at('มูลค่าบรรทัด')]], [2, 12, 'เดือน', 3500, 84000]);
  assert.equal(pack[at('ปริมาตรรวม')], 12000, '500 ml × 24 หน่วย');
  assert.equal(other[at(PACK_COLUMN_LABEL)], '—', 'แถวที่ไม่มีเลขแพ็คขึ้นขีด');
  assert.deepEqual([other[at('จำนวน')], other[at('หน่วยขาย')]], [1, 'งาน']);
  assert.equal(total.at(-1), 89000);
  // ช่วงกรองและแถบหัวไฟล์ตามจำนวนคอลัมน์ใหม่ (29 คอลัมน์ = AC) — ไม่ค้างที่ความกว้างเดิม (AB)
  assert.equal(header.length, 29);
  assert.equal(detail.autoFilter, 'A2:AC4');
  assert.deepEqual(detail.model.merges, ['A1:AC1']);
  // ชีตสรุปไม่มีคอลัมน์ใหม่ — แถวของบรรทัดแพ็คอยู่ใต้หน่วย "แพ็ค" จำนวนรวม 24
  const summary = await sheetOf(buffer, 'สรุปรายหมวด');
  const sHeader = headerOf(summary);
  assert.deepEqual(sHeader, [...TODAY_SUMMARY_HEADER, 'ก.ย. 26', 'รวมทั้งงวด']);
  const packRow = rowsOf(summary).find((r) => r[sHeader.indexOf('หน่วยขาย')] === 'แพ็ค');
  assert.ok(packRow, 'แถวสรุปของบรรทัดที่มีเลขแพ็ค');
  assert.deepEqual([packRow[sHeader.indexOf('จำนวนรวม')], packRow[sHeader.indexOf('ปริมาตรรวม')]], [24, 12000]);
});

