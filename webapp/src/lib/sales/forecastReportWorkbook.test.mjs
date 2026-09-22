import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { STATUS_OPEN, STATUS_WON, buildForecastReportBuffer } from './forecastReportWorkbook.js';

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
