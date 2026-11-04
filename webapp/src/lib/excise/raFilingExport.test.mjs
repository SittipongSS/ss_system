import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { RA_FILING_EXPORT_TITLE, raFilingExcelReport, raFilingExportRows, raFilingMonthBuckets, raFilingPrintReport } from "./raFilingExport.js";
import { buildReportPrintHTML, paginateReportRows, reportRowLines } from "../tax/reportPrint.js";
import { fillReportWorkbook } from "../tax/reportWorkbook.js";

/* ไฟล์ของตาราง "รายการชำระภาษีสรรพสามิต" ของ RA (มติเจ้าของ 04/11: "Excel แบน · พิมพ์ตามจอ") — ประกอบจากแถวที่จอวาดอยู่ */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const line = (over = {}) => ({
  fgCode: "FG-108-01-002-0326", brand: "Scent Studio", description: "Rosé Rose Eau De Parfum", volume: "50 ML",
  quantity: 600, retailPriceIncVat: 1190, retailPriceExVat: 1112.15, taxPerUnit: 97.87, taxCheck: { ok: true, expected: 97.87 }, totalTax: 58722,
  ...over,
});
// แถวงานรูปเดียวกับหน้า /tax/filings (queueWorkRow / recordWorkRow + detail จาก /api/tax/orders/table)
const rows = [
  { key: "upcoming:Q2", status: "upcoming", salesOrderNumber: "SO-26080010-0", customerName: "เซนท์ สตูดิโอ", subtitle: "QT-26100568-2 · รอลูกค้าตอบรับ",
    detail: { month: "2026-11", deliveryDate: null, lines: [line(), line({ volume: "5 ML", quantity: 2750, taxPerUnit: 9.05, totalTax: 24887.5 })], blockers: [] } },
  { key: "excise:SX1", status: "queued", salesOrderNumber: "SO-26080009-0", customerName: "เซนท์ สตูดิโอ", subtitle: "ใบสั่งขายค่าสรรพสามิต SO-X1 อนุมัติแล้ว",
    detail: { month: "2026-11", deliveryDate: "2026-11-10", lines: [line({ taxPerUnit: 95, taxCheck: { ok: false, expected: 97.87 }, totalTax: 57000 })], blockers: ["ยังไม่มีทะเบียน 1 รายการ — เริ่มยื่นไม่ได้"] } },
  { key: "order:ORD-1", status: "paid", salesOrderNumber: "SO-26070001-0", customerName: "ลูกค้า B", subtitle: "ใบเสร็จกรม R-1",
    detail: { month: "2026-10", deliveryDate: "2026-10-05", lines: [line({ quantity: 10, totalTax: 978.7 })], blockers: [] } },
  { key: "upcoming:Q9", status: "upcoming", salesOrderNumber: "SO-26090189-0", customerName: "โปรเจคต์ เอ็ม", subtitle: "", detail: null },
];

test("แถวที่ลงไฟล์: ติ๊กไว้ = เฉพาะที่ติ๊ก (ลำดับเดียวกับจอ) · ไม่ติ๊ก = ทุกแถวบนจอ รวมงานกำลังมา/รอ RA", () => {
  assert.equal(raFilingExportRows(rows, new Set()).length, 4);
  assert.equal(raFilingExportRows(rows, null).length, 4);
  assert.deepEqual(raFilingExportRows(rows, new Set(["order:ORD-1", "excise:SX1"])).map((r) => r.key), ["excise:SX1", "order:ORD-1"]);
});

test("ลำดับเดียวกับจอ: เดือนใหม่สุดก่อน → วันที่ส่งของ (ไม่มีวันไปท้าย) → เลข SO · ตารางบนจอใช้ตัวเดียวกัน", () => {
  const buckets = raFilingMonthBuckets(rows);
  assert.deepEqual(buckets.map((b) => b.month), ["2026-11", "2026-10", null]);
  assert.deepEqual(buckets[0].rows.map((r) => r.key), ["excise:SX1", "upcoming:Q2"], "มีวันส่งก่อน · ยังไม่ส่งไปท้าย");
  assert.match(read("../../components/excise/FilingLinesTable.js"), /const monthBuckets = raFilingMonthBuckets;/);
});

test("Excel แบน: แถวละสินค้า มีเดือน/SO/ลูกค้า/สถานะทุกแถว · งานไม่มีรายการยังขึ้น · ตรวจสูตรเป็นคอลัมน์ · ยอดรวมไม่นับงานที่ไม่มีรายการ", () => {
  const report = raFilingExcelReport(rows);
  assert.equal(report.title, RA_FILING_EXPORT_TITLE);
  assert.deepEqual(report.excel, { freezeHeader: true, autoFilter: true });
  assert.deepEqual(report.columns.map((c) => c.key), [
    "month", "salesOrder", "customer", "stage", "status", "deliveryDate", "brand", "description", "fgCode", "volume", "quantity",
    "retailPriceIncVat", "retailPriceExVat", "taxPerUnit", "taxCheck", "totalTax",
  ]);
  assert.equal(report.rows.length, 5, "2 + 1 + 1 สินค้า + 1 งานที่ยังไม่มีรายการ");
  const [first] = report.rows;
  assert.equal(first.month, "M.11/69");
  assert.equal(first.salesOrder, "SO-26080009-0");
  assert.equal(first.status, "รอ RA");
  assert.equal(first.deliveryDate, "2026-11-10");
  assert.equal(first.taxCheck, "ไม่ตรงสูตร · 8.8% = 97.87");
  const upcoming = report.rows.filter((r) => r.salesOrder === "SO-26080010-0");
  assert.deepEqual(upcoming.map((r) => [r.status, r.deliveryDate, r.volume, r.quantity, r.taxCheck]), [
    ["กำลังมา", null, "50 ML", 600, "ตรงสูตร"], ["กำลังมา", null, "5 ML", 2750, "ตรงสูตร"],
  ]);
  const empty = report.rows.find((r) => r.salesOrder === "SO-26090189-0");
  assert.equal(empty.description, "ยังไม่มีรายการสินค้า");
  assert.equal(empty.totalTax, undefined, "ไม่มีตัวเลขปลอม");
  assert.equal(report.summary.totalTax, 141588.2);
  assert.equal(report.summary._label, "รวม 4 งาน · 4 รายการ (ไม่รวม 1 งานที่ยังไม่มีรายการ)");
  assert.equal(report.summary.quantity, undefined, "ไม่รวมจำนวนชิ้น (หลายขนาดปนกัน · V28)");
});

test("Excel: แผ่นงานจริงตรึงหัวตาราง + ปุ่มกรอง · วันที่เป็นวันจริง · เงินเป็นตัวเลข · รายงานที่ไม่ขอยังไม่มีสองอย่างนั้น", async () => {
  const wb = fillReportWorkbook(new ExcelJS.Workbook(), raFilingExcelReport(rows));
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = loaded.worksheets[0];
  assert.equal(ws.getCell(3, 1).value, "เดือนที่ยื่น");
  assert.equal(ws.views[0].state, "frozen");
  assert.equal(ws.views[0].ySplit, 3);
  assert.ok(ws.autoFilter, "มีปุ่มกรอง");
  assert.ok(ws.getCell(4, 6).value instanceof Date, "วันที่ส่งของเป็นวันจริง");
  assert.equal(ws.getCell(4, 16).value, 57000);
  assert.equal(ws.getCell(4, 16).numFmt, "#,##0.00");
  assert.equal(ws.getCell(ws.rowCount, 16).value, 141588.2, "แถวสรุป");

  const plain = fillReportWorkbook(new ExcelJS.Workbook(), { title: "x", columns: [{ key: "a", label: "A" }], rows: [{ a: 1 }] });
  assert.deepEqual(plain.worksheets[0].views, [], "รายงานเดิม (ทะเบียน · บัญชี · สหมิตร) หน้าตาเท่าเดิม");
  assert.ok(!plain.worksheets[0].autoFilter, "ไม่มีปุ่มกรอง");
});

test("พิมพ์ตามจอ: หัวเดือน (ยอดเดือน) → หัวงาน (เลข SO · ลูกค้า · สถานะ · ยอดงาน · ขั้น · ด่าน) → แถวละสินค้า · คอลัมน์เดียวกับจอ", () => {
  const report = raFilingPrintReport(rows);
  assert.deepEqual(report.columns.map((c) => c.label), [
    "วันที่ส่งของ", "แบรนด์", "รายการ", "ปริมาณ", "จำนวน", "ราคาขายปลีก (รวม VAT)", "ราคาขายปลีกก่อน VAT", "ภาษี/หน่วย (8.8%)", "ภาษีรวม",
  ]);
  const sections = report.rows.filter((r) => r._kind === "section");
  assert.deepEqual(sections.map((r) => r._level), [1, 2, 2, 1, 2, 1, 2]);
  assert.equal(sections[0]._label, "รายการชำระภาษีสรรพสามิต M.11/69 · พ.ย. 2569 · 2 งาน · 3 รายการ · ภาษีรวม ฿140,609.50", "ยอดเดือนอยู่บรรทัดหลัก");
  assert.equal(sections[1]._label, "SO-26080009-0 · เซนท์ สตูดิโอ · รอ RA · 1 รายการ · ภาษีรวม ฿57,000.00\nใบสั่งขายค่าสรรพสามิต SO-X1 อนุมัติแล้ว · ยังไม่มีทะเบียน 1 รายการ — เริ่มยื่นไม่ได้");
  assert.match(sections[5]._label, /^รายการชำระภาษีสรรพสามิต \(ยังไม่รู้เดือน\) · ยังโหลดรายการสินค้าไม่ได้ · 1 งาน · 0 รายการ · ภาษีรวม ฿0\.00 \(ไม่รวม 1 งานที่ยังไม่มีรายการ\)$/);
  const lines = report.rows.filter((r) => !r._kind);
  assert.equal(lines[0].date, "10/11/2026");
  assert.equal(lines[0].taxPerUnit, "95.00\nไม่ตรงสูตร · 8.8% = 97.87", "คำเตือนเดียวกับจอ (บรรทัดรองในช่อง)");
  assert.equal(lines[1].date, "—", "ยังไม่ส่ง = ขีด (V26)");
  assert.equal(lines[1].taxPerUnit, 97.87);
  assert.equal(lines.at(-1).description, "ยังไม่มีรายการสินค้า");
  assert.equal(report.summary.totalTax, 141588.2);
});

test("เปลือกพิมพ์: หัวกลุ่มเป็นแถวเต็มความกว้าง · เงินในช่อง multiline ยังจัดรูป · หัวกลุ่มไม่ห้อยท้ายหน้า · หัวใบบอกตัวกรองเพิ่ม", () => {
  const report = raFilingPrintReport(rows);
  const html = buildReportPrintHTML(report, { extraRows: [{ label: "เดือนที่ยื่น", value: "ทุกเดือน" }, { label: "สถานะ", value: "" }] }, {}, { toolbar: false });
  assert.match(html, /<tr class="sec sec1"><td colspan="9">รายการชำระภาษีสรรพสามิต M\.11\/69/);
  assert.match(html, /<tr class="sec sec2"><td colspan="9">SO-26080009-0/);
  assert.match(html, /<td style="text-align:right">97\.87<\/td>/, "ตัวเลขในคอลัมน์ multiline = รูปเงินของกระดาษ");
  assert.match(html, /95\.00<div class="sub">ไม่ตรงสูตร · 8\.8% = 97\.87<\/div>/);
  assert.match(html, /เดือนที่ยื่น/);
  assert.equal(reportRowLines(report.rows[0], report.columns), 1, "หัวเดือนบรรทัดเดียว");
  assert.equal(reportRowLines(report.rows[1], report.columns), 2, "หัวงาน = บรรทัดหลัก + ขั้น/ด่าน");
  // หัวกลุ่มต้องไปเปิดหน้าใหม่พร้อมแถวถัดไป — เติมแถวบรรทัดเดียวจนเกือบเต็มหน้า แล้ววางหัวกลุ่ม + แถว
  const filler = Array.from({ length: 25 }, () => ({ description: "x" }));
  const pages = paginateReportRows([...filler, { _kind: "section", _level: 2, _label: "SO-9\nขั้น" }, { description: "y" }], report.columns);
  const last = pages.at(-1);
  assert.equal(last[0]._kind, "section", "หัวกลุ่มย้ายไปหน้าถัดไปพร้อมรายการ");
  assert.equal(last[1].description, "y");
});

test("ใบสรุปรายการยื่นถอดแล้ว (เจ้าของ 04/11: ยื่นกรมผ่านระบบของกรม) · ทุกงานติ๊กได้ (รวมกำลังมา) · ค้นหาครอบรายการสินค้า", () => {
  const page = read("../../app/tax/filings/page.js");
  for (const [rel, src] of [["page", page], ["record", read("../../app/tax/filings/[id]/page.js")], ["modal", read("../../components/excise/SalesOrderFilingModal.js")]]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /printFilingSummary|พิมพ์ใบสรุป/, `${rel}: ไม่มีปุ่มใบสรุปแล้ว`);
  }
  assert.doesNotMatch(page, /printKey:/);
  assert.match(page, /const selectableKeys = useMemo\(\(\) => rows\.map\(\(r\) => r\.key\), \[rows\]\);/);
  assert.match(page, /search: \[\.\.\.row\.search, row\.subtitle, \.\.\.lineText\]/);
  assert.match(page, /\[line\.fgCode, line\.brand, line\.description\]/);
  const table = read("../../components/excise/FilingLinesTable.js");
  assert.doesNotMatch(table, /row\.printKey/, "ช่องติ๊กทุกแถว");
  // เดือนว่าง = งานที่ยังโหลดรายการไม่ได้ (ไม่ใช่ "ยังไม่มีวันที่ส่งของ" ของรุ่นก่อน V24)
  assert.match(read("./raFilingMonth.js"), /ยังโหลดรายการสินค้าไม่ได้/);
});

test("หน้า /tax/filings: ปุ่มพิมพ์/Excel ประกอบจากแถวบนจอ — ไม่ใช่รายงานบันทึกการยื่นของ server อีกแล้ว", () => {
  const page = read("../../app/tax/filings/page.js");
  assert.doesNotMatch(page, /<ReportExportActions|import ReportExportActions/);
  assert.match(page, /await openReportPrintWindow\(raFilingPrintReport\(exportRows\), exportMeta\(\)\);/);
  assert.match(page, /await downloadReportXlsx\(raFilingExcelReport\(exportRows\), reportXlsxFileName\("filing"\)\);/);
  assert.match(page, /disabled=\{!exportRows\.length \|\| !!exporting\}/, "กดได้เมื่อมีงานบนจอ (เดิมนับเฉพาะบันทึก ⇒ ดับทั้งที่ตารางมีงาน)");
  const reports = read("../tax/reports.js");
  assert.doesNotMatch(reports, /filing: filingReport/, "?type=filing ถอดแล้ว");
  assert.doesNotMatch(read("../tax/reportXlsxDownload.js"), /^import .*exceljs/m, "exceljs โหลดตอนกด ไม่ลากเข้า bundle หน้า");
});
