import { test } from "node:test";
import assert from "node:assert/strict";
import { displayDateToIso, fmtDateNumeric, fmtMoney, fmtMoneyCompact, fmtNumber, fmtPercent, fmtTime, formatMoneyInput, formatMoneyInputWhileTyping, formatNationalIdInput, formatPhoneInput, isoDateToDisplay, normalizeTime, parseNumberInput } from "./format.js";

test("money input accepts raw and grouped values", () => {
  assert.equal(parseNumberInput("1,000,000.50"), 1000000.5);
  assert.equal(formatMoneyInput("1000000"), "1,000,000.00");
  assert.equal(formatMoneyInputWhileTyping("1000000"), "1,000,000");
  assert.equal(formatMoneyInputWhileTyping("1000000.5"), "1,000,000.5");
});

test("date input converts display format and ISO payload without timezone", () => {
  assert.equal(isoDateToDisplay("2026-07-12"), "12/07/2026");
  assert.equal(displayDateToIso("12/07/2026"), "2026-07-12");
  assert.equal(displayDateToIso("31/02/2026"), null);
});

test("phone and national ID inputs format progressively", () => {
  assert.equal(formatPhoneInput("0812345678"), "081-234-5678");
  assert.equal(formatPhoneInput("021234567"), "02-123-4567");
  assert.equal(formatPhoneInput("08123"), "081-23");
  assert.equal(formatNationalIdInput("1234567890123"), "1-2345-67890-12-3");
  assert.equal(formatNationalIdInput("123456"), "1-2345-6");
});

test("number input preserves valid zero and rejects incomplete input", () => {
  assert.equal(parseNumberInput("0"), 0);
  assert.equal(parseNumberInput("-"), null);
  assert.equal(parseNumberInput("abc"), null);
});

test("shared number and percent formatting is deterministic", () => {
  assert.equal(fmtNumber(25056), "25,056");
  assert.equal(fmtPercent(80), "80.00%");
});

// ── ขอบหน่วยของ fmtMoneyCompact ────────────────────────────────────────
// 🐞 เดิมเทียบขอบ **ก่อนปัด** ⇒ 999,999 ตกอยู่ชั้น K แล้วปัดขึ้นเป็น "฿1000.00K"
// ซึ่งอ่านว่าล้านไม่ได้และอ่านว่าแสนก็ไม่ได้ · ช่วง 9xx,xxx เป็นยอดเป้า/ยอด Won
// ที่เกิดจริงทุกเดือน และ formatter ตัวนี้อยู่บน KPI card + หน้าตั้งเป้า + แดชบอร์ด
// เทสต์ชุดนี้ตรึง "ทุกขอบที่ปัดแล้วข้ามหน่วย" ไม่ใช่แค่เคสกลม ๆ
test("fmtMoneyCompact ข้ามหน่วยตอนปัด ไม่ใช่ตอนเทียบ", () => {
  assert.equal(fmtMoneyCompact(999_999), "฿1.00M");   // 🐞 เคยได้ "฿1000.00K"
  assert.equal(fmtMoneyCompact(999_995), "฿1.00M");   // ขอบพอดี — ปัดแล้วได้ 1.00
  assert.equal(fmtMoneyCompact(999_994), "฿999.99K"); // ต่ำกว่าขอบ 1 บาท ยังอยู่ชั้น K
  assert.equal(fmtMoneyCompact(999.995), "฿1.00K");   // ขอบเดียวกันที่ชั้นพัน
  assert.equal(fmtMoneyCompact(999.99), "฿999.99");   // ต่ำกว่าพัน = เต็มจำนวน
});

test("fmtMoneyCompact หน่วยปกติและเลขติดลบ", () => {
  assert.equal(fmtMoneyCompact(1_000), "฿1.00K");
  assert.equal(fmtMoneyCompact(1_500_000), "฿1.50M");
  assert.equal(fmtMoneyCompact(-1_500_000), "-฿1.50M");
  assert.equal(fmtMoneyCompact(-999_999), "-฿1.00M");
  assert.equal(fmtMoneyCompact(0), fmtMoney(0));
  assert.equal(fmtMoneyCompact(null), fmtMoney(0));
});

test("fmtMoneyCompact เกินพันล้านต้องคั่นหลักพัน ไม่ใช่ '฿1000.00M'", () => {
  // ไม่มีหน่วยเหนือ M — ถ้าไม่คั่นหลัก "1000.00M" อ่านผิดเป็นหลักหมื่นล้านได้ง่าย
  assert.equal(fmtMoneyCompact(999_999_999), "฿1,000.00M");
  assert.equal(fmtMoneyCompact(12_345_000_000), "฿12,345.00M");
});

test("date-only formatting preserves the calendar date without timezone parsing", () => {
  assert.equal(fmtDateNumeric("2026-07-12"), "12/07/2026");
  assert.equal(fmtDateNumeric("2026-07-12", { short: true }), "12/07/26");
  assert.equal(fmtDateNumeric("2026-07-12T00:00:00.000Z"), "12/07/2026");
});

test("time helpers enforce the system-wide 24-hour HH:mm rule", () => {
  assert.equal(normalizeTime("9"), "09:00");
  assert.equal(normalizeTime("930"), "09:30");
  assert.equal(normalizeTime("23:59"), "23:59");
  assert.equal(normalizeTime("24:00"), null);
  assert.equal(normalizeTime("09:60"), null);
  assert.equal(fmtTime("7:05"), "07:05");
});
