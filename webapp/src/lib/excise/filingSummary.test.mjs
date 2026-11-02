import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILING_SUMMARY_MAX_KEYS, FILING_SUMMARY_TITLE, filingSummaryReport, parseFilingSummaryKey } from "./filingSummary.js";
import { buildReportPrintHTML } from "../tax/reportPrint.js";

/* ใบสรุปรายการยื่น (v3 · มติเจ้าของ 02/11 ข้อ V9) — เลือกหลายงานรวมใบเดียว · รูปรายงานกลางของ /tax */

test("คีย์งาน: excise / not_billed / order เท่านั้น · คีย์ผิดรูป = null (route ตอบ 400)", () => {
  assert.deepEqual(parseFilingSummaryKey("excise:SX1"), { kind: "excise", id: "SX1" });
  assert.deepEqual(parseFilingSummaryKey("not_billed:S2"), { kind: "not_billed", id: "S2" });
  assert.deepEqual(parseFilingSummaryKey(" order:TAX-9 "), { kind: "order", id: "TAX-9" });
  for (const bad of ["", "upcoming:QX1", "excise:", ":SX1", "SX1", null, undefined]) {
    assert.equal(parseFilingSummaryKey(bad), null, String(bad));
  }
  assert.ok(FILING_SUMMARY_MAX_KEYS >= 50, "พิมพ์รวมครั้งละหลายสิบงานได้");
});

const line = (over) => ({
  fgCode: "FG-108-01-002-0326", description: "โรเซ่ โรส · 50 ml", registrationNumber: "ทบ-1",
  quantity: 100, exciseRatePerUnit: 8.56, localTaxRatePerUnit: 0.86, totalExciseTax: 856, totalLocalTax: 86, totalTax: 942, ...over,
});

test("หลายงานรวมใบเดียว: หัวงานพิมพ์แถวแรกของงาน · รวมยอดทุกบรรทัด · งานรอ RA บอกว่ายังไม่เริ่มยื่น", () => {
  const report = filingSummaryReport([
    {
      statusLabel: "กำลังยื่น", salesOrderNumber: "SO-26080010-0", exciseOrderNumber: "SO-26110001-0",
      customerName: "เซนท์ สตูดิโอ", customerTaxId: "0105555000000",
      lines: [line(), line({ fgCode: "FG-2", registrationNumber: "", quantity: 10, totalExciseTax: 85.6, totalLocalTax: 8.6, totalTax: 94.2 })],
    },
    {
      statusLabel: "รอ RA — ยังไม่เริ่มยื่น (ข้อมูลสดจากใบสั่งขาย)", salesOrderNumber: "SO-2", notBilledLabel: "เก็บนอกระบบแล้ว",
      customerName: "ลูกค้า B", customerTaxId: null, lines: [line({ quantity: 1, totalExciseTax: 8.56, totalLocalTax: 0.86, totalTax: 9.42 })],
    },
  ]);
  assert.equal(report.title, FILING_SUMMARY_TITLE);
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows[0].doc, "SO-26080010-0\nค่าสรรพสามิต SO-26110001-0\nกำลังยื่น");
  assert.equal(report.rows[0].customer, "เซนท์ สตูดิโอ\nเลขผู้เสียภาษี 0105555000000");
  assert.equal(report.rows[1].doc, "", "แถวที่สองของงานเดียวกันไม่พิมพ์หัวงานซ้ำ");
  assert.equal(report.rows[1].registration, "ยังไม่มีทะเบียนอนุมัติ");
  assert.match(report.rows[2].doc, /ไม่เรียกเก็บในระบบ — เก็บนอกระบบแล้ว\nรอ RA — ยังไม่เริ่มยื่น/);
  assert.equal(report.rows[2].customer, "ลูกค้า B");
  assert.equal(report.summary._label, "รวม 2 งาน · 3 รายการ");
  assert.equal(report.summary.quantity, 111);
  assert.equal(report.summary.totalTax, 1045.62);
  assert.equal(report.summary.totalExciseTax, 950.16);
});

test("งานที่ไม่มีบรรทัดยังขึ้นหัวงาน (ไม่หายเงียบจากใบสรุป) · ไม่นับเข้ายอด", () => {
  const report = filingSummaryReport([{ statusLabel: "กำลังยื่น", salesOrderNumber: "SO-9", customerName: "C", lines: [] }]);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].product, "ไม่มีรายการสรรพสามิต");
  assert.equal(report.summary._label, "รวม 1 งาน · 0 รายการ");
  assert.equal(report.summary.totalTax, 0);
});

test("วาดด้วยเปลือกรายงานกลางได้ — คอลัมน์เงินชิดขวา · หัวงานหลายบรรทัด", () => {
  const report = filingSummaryReport([{ statusLabel: "ชำระแล้ว", salesOrderNumber: "SO-1", customerName: "C", lines: [line()] }]);
  const html = buildReportPrintHTML(report, {}, {}, { toolbar: false });
  assert.match(html, /ใบสรุปรายการยื่นชำระภาษีสรรพสามิต/);
  assert.match(html, /FG-108-01-002-0326/);
  assert.match(html, /<td style="text-align:right">942\.00<\/td>/);
});

test("ทางเข้าทั้งสามจุดใช้ตัวพิมพ์ตัวเดียว — รายการ (ติ๊กหลายงาน) · โมดัลงานรอ RA · หน้าบันทึก", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../../app/tax/filings/page.js"), /await printFilingSummary\(printKeys\)/);
  assert.match(read("../../components/excise/SalesOrderFilingModal.js"), /await printFilingSummary\(\[row\.key\]\)/);
  assert.match(read("../../app/tax/filings/[id]/page.js"), /await printFilingSummary\(\[`order:\$\{o\.id\}`\]\)/);
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const route = codeOnly(read("../../app/api/tax/orders/summary/route.js"));
  assert.match(route, /if \(!can\(user\.role, "ra:view"\) && !can\(user\.role, "ra:approve"\)\) return forbidden\(\);/);
  assert.doesNotMatch(route, /canViewSalesPlanning/, "RA ไม่มีสิทธิ์หน้าขาย — ใบสรุปต้องไม่ผ่านด่านนั้น");
});
