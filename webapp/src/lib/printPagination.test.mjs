import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBillPrintHTML, paginateBillLines } from './tax/billPrint.js';
import { buildReportPrintHTML, paginateReportRows, reportRowLines, REPORT_REFLOW_SCRIPT } from './tax/reportPrint.js';
import { reportToXlsxBuffer } from './tax/exportExcel.js';
import { buildGanttPrintHTML, paginateTimelineGroups } from './pm/ganttPrint.js';

test('tax report preview uses explicit landscape pages and keeps summary on the final page', () => {
  const columns = [{ key: 'name', label: 'รายการ', multiline: true }, { key: 'amount', label: 'ยอด', money: true }];
  const rows = Array.from({ length: 37 }, (_, index) => ({ name: `row-${index + 1}\nsub`, amount: index + 1 }));
  assert.equal(paginateReportRows(rows, columns).length, 3);
  const html = buildReportPrintHTML({
    title: 'รายงานทดสอบ',
    columns,
    rows,
    summary: { _label: 'รวม', amount: 703 },
  });
  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/class="sum"/g) || []).length, 1);
});

/* 🐞 03/11/2026 รายงานขึ้นทะเบียนของ RA (เห็นราคาผลิต) — แถวสูงกว่าที่ตัวแบ่งหน้าเดา
   ⇒ `.sheet { overflow: hidden }` ตัดแถวท้ายหน้าทิ้งเงียบ ๆ หน้าละ ~7 แถว
   ยามนี้เช็กด้วย **ค่าที่วัดจากหน้าเรนเดอร์จริง** (ไม่ใช่ค่าคงที่ในโค้ด) ว่าทุกหน้าลงกระดาษ */
const MEASURED = { body: 135.8, row: 5.08, sub: 2.74, summary: 5.99 };
const measuredPageMm = (page, columns, isLast) =>
  page.reduce((mm, row) => mm + MEASURED.row + MEASURED.sub * (reportRowLines(row, columns) - 1), 0)
  + (isLast ? MEASURED.summary : 0);

test('report pages fit the measured sheet whatever the row height — no row clipped by overflow:hidden', () => {
  const columns = [
    { key: 'product', label: 'สินค้า', multiline: true },
    { key: 'factory', label: 'ราคาผลิต / กำไร', multiline: true },
    { key: 'status', label: 'สถานะ' },
  ];
  for (const [lines, count] of [[1, 60], [2, 43], [3, 43], [5, 43], [3, 12], [3, 13]]) {
    const rows = Array.from({ length: count }, (_, i) => ({
      product: `FG-${i}\nชื่อสินค้า`,
      factory: Array.from({ length: lines }, (__, l) => `บรรทัด ${l}`).join('\n'),
      status: 'ขึ้นทะเบียนแล้ว',
    }));
    const pages = paginateReportRows(rows, columns);
    assert.equal(pages.flat().length, count, `${lines} บรรทัด × ${count}: แถวต้องครบทุกแถว`);
    pages.forEach((page, i) => {
      assert.ok(page.length > 0, `${lines} บรรทัด × ${count}: หน้า ${i + 1} ว่าง`);
      const mm = measuredPageMm(page, columns, i === pages.length - 1);
      assert.ok(mm <= MEASURED.body, `${lines} บรรทัด × ${count}: หน้า ${i + 1} สูง ${mm.toFixed(1)}mm เกิน ${MEASURED.body}mm`);
    });
  }
});

test('registration report rows are three lines with cost — 12 per page, not the old fixed 16', () => {
  const columns = [{ key: 'product', label: 'สินค้า', multiline: true }, { key: 'factory', label: 'ต้นทุน', multiline: true }];
  const rows = Array.from({ length: 43 }, () => ({ product: 'FG\nชื่อ', factory: 'ราคาผลิต · กำไร\nวัตถุดิบ · ค่าแรง\nค่าจัดส่ง' }));
  assert.deepEqual(paginateReportRows(rows, columns).map((p) => p.length), [12, 12, 12, 7]);
  // ไม่เห็นราคาผลิต = แถวสองบรรทัด ⇒ ความจุเท่าค่าตายตัวเดิม (16) ไม่ได้ลดลงโดยไม่จำเป็น
  const twoLine = rows.map((r) => ({ product: r.product }));
  assert.equal(paginateReportRows(twoLine, columns)[0].length, 16);
});

test('excise bill preview splits item lines and renders totals once on the final page', () => {
  const lines = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  assert.equal(paginateBillLines(lines).length, 3);
  const html = buildBillPrintHTML({
    id: 'BILL-1',
    items: lines.map((line) => ({
      id: line.id,
      quantity: 1,
      totalTax: 10,
      product: { fgCode: `FG-${line.id}`, productDescription: `สินค้า ${line.id}` },
    })),
  });
  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/ยอดแจ้งชำระสุทธิ/g) || []).length, 1);
});

// C1 (2026-07-26): เดิมกันที่หน้าสุดท้ายไว้ก่อน เศษเลยไปกองหน้าแรก/หน้ากลาง —
// 9 แถวได้ [1, 8] · 13 แถวได้ [5, 8] · 21 แถวได้ [12, 1, 8] (หน้ากลางบรรทัดเดียว)
// จึงเปลี่ยนเป็นเติมจากหน้าแรกแล้วให้เศษตกหน้าสุดท้าย
//
// 2026-08-05: ความจุลดจาก 12/8 เป็น 9/11/7/6 ตอนใบภาษีย้ายมาใช้เปลือกเอกสารกลาง
// (ชุดเดียวกับใบเสนอราคา) — แถวสูงขึ้นเป็น 3 บรรทัดต่อแถว วัดจริงได้ 17.5mm ของเดิม
// 12 แถวจึงล้นกระดาษแล้วโดน overflow:hidden ตัดทิ้งเงียบ ๆ · หน้าแรกรับได้น้อยกว่า
// หน้ากลางเพราะเสียที่ให้กล่องข้อมูลลูกค้า และหน้าที่ถือท้ายเอกสารรับได้น้อยที่สุด
const BILL_FIRST = 9;
const BILL_MIDDLE = 11;
const BILL_LAST = 7;
const BILL_SINGLE = 6;

test('excise bill pages fill from the front — no orphan single-line page before the last', () => {
  const pageSizes = (count) => paginateBillLines(Array.from({ length: count }, (_, i) => i)).map((p) => p.length);

  assert.deepEqual(pageSizes(7), [6, 1]);
  assert.deepEqual(pageSizes(9), [8, 1]);
  assert.deepEqual(pageSizes(13), [9, 4]);
  assert.deepEqual(pageSizes(20), [9, 10, 1]);
  assert.deepEqual(pageSizes(21), [9, 11, 1]);
  assert.deepEqual(pageSizes(29), [9, 11, 8, 1]);

  // ≤ 6 แถวจบในหน้าเดียวพร้อมยอดรวม + ลายเซ็น
  for (const count of [1, 5, 6]) assert.deepEqual(pageSizes(count), [count]);
  assert.deepEqual(paginateBillLines([]), [[]]);

  // ค่าคงที่ของเลย์เอาต์ — เกินเมื่อไรแถวจะถูกตัดทิ้งโดยไม่มีใครเห็น
  // (หน้าสุดท้ายว่างเปล่า = ยอดรวมกับลายเซ็นลอยอยู่หน้าเดียว ห้ามเกิดเช่นกัน)
  for (let count = 1; count <= 200; count += 1) {
    const sizes = pageSizes(count);
    const last = sizes[sizes.length - 1];
    assert.equal(sizes.reduce((a, b) => a + b, 0), count, `รวมแถวไม่ครบที่ ${count}`);
    assert.ok(last >= 1, `หน้าสุดท้ายของ ${count} แถวว่างเปล่า`);
    assert.ok(last <= (sizes.length === 1 ? BILL_SINGLE : BILL_LAST), `หน้าสุดท้ายของ ${count} แถวมี ${last} แถว`);
    sizes.slice(0, -1).forEach((size, index) => {
      const capacity = index === 0 ? BILL_FIRST : BILL_MIDDLE;
      assert.ok(size <= capacity, `หน้า ${index + 1} ของ ${count} แถวมี ${size} > ${capacity}`);
    });
  }
});

test('excise payment notice uses its pinned controlled form and document number', () => {
  const html = buildBillPrintHTML({
    id: 'TAX-1',
    taxNoticeNumber: 'ET-26070001-0',
    taxNoticeStandardSnapshot: {
      titleTh: 'ใบแจ้งชำระค่าภาษีทดสอบ',
      titleEn: 'TEST EXCISE PAYMENT NOTICE',
      formCode: 'FM-TAX-99',
      revision: '02',
      effectiveDate: '2026-07-26',
      accentKey: 'amber',
    },
    items: [],
  });
  assert.match(html, /ET-26070001-0/);
  assert.match(html, /FM-TAX-99: Rev\. No\.02\. 26\/07\/2569/);
  // หัวเอกสารภาษาเดียวทีละภาษา (มติผู้ใช้ 2026-08-21) — เอกสารไทยขึ้นชื่อไทยอย่างเดียว
  assert.match(html, /ใบแจ้งชำระค่าภาษีทดสอบ/);
  assert.doesNotMatch(html, /TEST EXCISE PAYMENT NOTICE/);
  assert.doesNotMatch(html, /ใบวางบิล/);
});

test('Project Timeline preview has explicit work pages and a final approval page', () => {
  const taskEntries = Array.from({ length: 30 }, (_, taskIndex) => ({ task: { id: taskIndex }, taskIndex }));
  assert.equal(paginateTimelineGroups([{ phase: 'งานหลัก', phaseNum: 1, tasks: taskEntries }]).length, 2);
  const html = buildGanttPrintHTML({
    code: 'PJ-001',
    name: 'โครงการทดสอบ',
    customerName: 'ลูกค้าทดสอบ',
    aeOwner: 'ผู้ดูแลทดสอบ',
    preparedBy: 'ผู้จัดทำทดสอบ',
    aeSupervisor: 'ผู้ตรวจสอบทดสอบ',
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      phase: 'งานหลัก',
      name: `งาน ${index + 1}`,
      startDate: '2026-07-01',
      finishDate: '2026-07-02',
      durationDays: 2,
      status: 'Pending',
    })),
  });
  assert.equal((html.match(/class="sheet explicit-page/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/การรับรองเอกสาร Project Timeline/g) || []).length, 1);
  assert.match(html, /ผู้ดูแล \(AE\).*ผู้ดูแลทดสอบ/s);
  assert.match(html, /ผู้ประสานงาน \(AC\).*ผู้จัดทำทดสอบ/s);
  assert.match(html, /ผู้ตรวจสอบ.*ผู้ตรวจสอบทดสอบ/s);
});

/* 03/11/2026 รายงานขึ้นทะเบียนได้ ภาษี/ชิ้น + เลขทะเบียน — Excel แยกคอลัมน์ · กระดาษรวมสถานะกับเลขไว้ช่องเดียว
   (เลข 28 ตัวอักษรไม่มีช่องว่าง เป็นคอลัมน์ของตัวเองบนกระดาษแล้วบีบคอลัมน์อื่นจนแถวตัดบรรทัดและหน้าล้น) */
const SPLIT_REPORT = {
  title: 'รายงานทดสอบ',
  columns: [
    { key: 'name', label: 'รายการ' },
    { key: 'tax', label: 'ภาษี/ชิ้น', money: true },
    { key: 'status', label: 'สถานะ', only: 'excel' },
    { key: 'approvalNumber', label: 'เลขทะเบียน', only: 'excel' },
    { key: 'statusNumber', label: 'สถานะ / เลขทะเบียน', multiline: true, only: 'print' },
  ],
  rows: [
    { name: 'ก', tax: 97.87, status: 'ขึ้นทะเบียนแล้ว', approvalNumber: 'NO-1', statusNumber: 'ขึ้นทะเบียนแล้ว\nNO-1' },
    { name: 'ข', tax: 'ยกเว้น', status: 'รออนุมัติ', approvalNumber: '-', statusNumber: 'รออนุมัติ' },
  ],
};

test('print skips excel-only columns and prints a worded money cell as the word, not 0.00', () => {
  const html = buildReportPrintHTML(SPLIT_REPORT, {}, undefined, { toolbar: false });
  const head = html.match(/<thead><tr>(.*?)<\/tr><\/thead>/s)[1];
  assert.match(head, /สถานะ \/ เลขทะเบียน/);
  assert.doesNotMatch(head, />สถานะ</);
  assert.doesNotMatch(head, />เลขทะเบียน</);
  assert.match(html, /<div class="sub">NO-1<\/div>/);
  assert.match(html, />ยกเว้น</);
  assert.match(html, />97\.87</);
});

test('excel skips print-only columns — status and registration number stay separate, tax stays a number', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await reportToXlsxBuffer(SPLIT_REPORT));
  const ws = wb.worksheets[0];
  assert.deepEqual(ws.getRow(3).values.slice(1), ['รายการ', 'ภาษี/ชิ้น', 'สถานะ', 'เลขทะเบียน']);
  assert.equal(ws.getRow(4).getCell(2).value, 97.87);
  assert.equal(ws.getRow(4).getCell(4).value, 'NO-1');
  assert.equal(ws.getRow(5).getCell(2).value, 'ยกเว้น');
});

/* ตาข่ายตัดหน้าซ้ำเป็นสตริงที่กลายเป็น <script> ของหน้าต่างพิมพ์ — ไม่มี module scope
   ⇒ ต้องอยู่ใน HTML จริง · คอมไพล์ผ่าน · และไม่อ้างชื่อที่ import ไว้ในไฟล์ต้นทาง (AGENTS.md: บั๊ก langSwitchScript) */
test('report print carries the reflow safety net as a self-contained script', () => {
  const html = buildReportPrintHTML(SPLIT_REPORT, {}, undefined, { toolbar: false });
  assert.ok(html.includes(REPORT_REFLOW_SCRIPT.trim().slice(0, 40)), 'สคริปต์ต้องอยู่ในเอกสาร');
  assert.doesNotThrow(() => new Function(REPORT_REFLOW_SCRIPT));
  for (const name of ['apiFetch', 'notifyToast', 'esc(', 'money(', 'fmtNumber', 'documentFooter']) {
    assert.ok(!REPORT_REFLOW_SCRIPT.includes(name), `สคริปต์อ้าง ${name} ซึ่งไม่มีในหน้าต่างพิมพ์`);
  }
  assert.match(REPORT_REFLOW_SCRIPT, /document\.fonts\.ready/);
});
