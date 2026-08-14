import { test } from "node:test";
import assert from "node:assert/strict";
import { displayDateToIso, fmtDateNumeric, fmtMoney, fmtMoneyCompact, fmtNumber, fmtPercent, fmtTime, formatMoneyInput, formatMoneyInputWhileTyping, formatNationalIdInput, formatPhoneInput, isoDateToDisplay, normalizeTime, parseNumberInput, isBlank, naText, NA } from "./format.js";

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

// ── พ.ศ. เป็นเรื่องของ "การกรอก/แสดง" เท่านั้น ที่เก็บยังเป็น ค.ศ. เสมอ ────
// ใช้ที่ช่อง "วันที่มีผล" ของเอกสารควบคุม ซึ่งพิมพ์ลงหัวกระดาษเป็น พ.ศ. อยู่แล้ว
// ⚠️ ถ้าเทสต์ชุดนี้แดงเพราะมีคนเปลี่ยนค่าตั้งต้นเป็น BE = ระบบกำลังจะเขียน พ.ศ.
//    ลงฐาน ซึ่งทำให้แถวที่เขียนคนละยุคเรียงลำดับกันไม่ได้โดยไม่มีอะไรฟ้อง
test("era BE แปลงเฉพาะตอนแสดง/กรอก — ค่าที่เก็บยังเป็น ค.ศ.", () => {
  assert.equal(isoDateToDisplay("2026-08-15", { era: "BE" }), "15/08/2569");
  assert.equal(displayDateToIso("15/08/2569", { era: "BE" }), "2026-08-15");
  // ไป-กลับต้องได้ค่าเดิมเป๊ะ
  assert.equal(displayDateToIso(isoDateToDisplay("2026-02-06", { era: "BE" }), { era: "BE" }), "2026-02-06");
});

test("ค่าตั้งต้นยังเป็น ค.ศ. — ไม่มีใครได้ พ.ศ. โดยไม่ได้ขอ", () => {
  assert.equal(isoDateToDisplay("2026-08-15"), "15/08/2026");
  assert.equal(isoDateToDisplay("2026-08-15", {}), "15/08/2026");
  assert.equal(isoDateToDisplay("2026-08-15", { era: "CE" }), "15/08/2026");
  assert.equal(displayDateToIso("15/08/2026"), "2026-08-15");
});

test("era BE ตรวจวันที่ผิดปฏิทินได้เหมือนเดิม — รวมปีอธิกสุรทิน", () => {
  // 2567 ไม่ใช่ปีอธิกสุรทินถ้าเอาเลข พ.ศ. ไปคำนวณตรง ๆ แต่ 29 ก.พ. 2567 = 2024-02-29
  // ซึ่งมีจริง ⇒ ต้องแปลงปีกลับเป็น ค.ศ. **ก่อน** ตรวจ ไม่ใช่หลัง
  assert.equal(displayDateToIso("29/02/2567", { era: "BE" }), "2024-02-29");
  assert.equal(displayDateToIso("29/02/2569", { era: "BE" }), null); // 2026 ไม่ใช่ปีอธิกสุรทิน
  assert.equal(displayDateToIso("31/02/2569", { era: "BE" }), null);
  assert.equal(displayDateToIso("", { era: "BE" }), null);
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

/* ── ค่าว่างทั้งระบบพูดคำเดียวกัน: N/A (มติผู้ใช้ 2026-08-14) ────────────────── */

test("isBlank: สิ่งที่ระบบเก่าเขียนแทนคำว่า 'ไม่มี' นับเป็นว่างทั้งหมด", () => {
  for (const v of [null, undefined, "", "   ", "-", "–", "—", ".", "N/A", "n/a", " N/A "]) {
    assert.equal(isBlank(v), true, `${JSON.stringify(v)} ควรนับเป็นว่าง`);
  }
  assert.equal(isBlank([]), true, "อาร์เรย์เปล่า = ไม่มีรายการ");
  assert.equal(isBlank(NaN), true, "คำนวณไม่ได้ = ไม่มีคำตอบ");
});

/* 🔴 หัวใจของกฎนี้ — พลาดตรงนี้แล้วยอด 0 บาทจะหายกลายเป็น N/A ทั้งระบบ */
test("isBlank: 0 กับ false ไม่ใช่ค่าว่าง — เป็นคำตอบ ไม่ใช่การไม่มีคำตอบ", () => {
  assert.equal(isBlank(0), false, "ยอด 0 บาท / จำนวน 0 ชิ้น คือคำตอบ");
  assert.equal(isBlank(false), false, "ไม่อนุมัติ คือคำตอบ");
  assert.equal(isBlank("0"), false);
});

test("naText: มีของคืนของเดิม ว่างคืน N/A", () => {
  assert.equal(naText("ประชุมทั้งที่"), "ประชุมทั้งที่");
  assert.equal(naText(0), 0, "ต้องคืนเลข 0 ตัวจริง ไม่ใช่สตริง");
  assert.equal(naText(false), false);
  assert.equal(naText(""), NA);
  assert.equal(naText("-"), NA);
  assert.equal(naText(null), NA);
  assert.equal(NA, "N/A");
});

/* ⚠️ กับดักที่กฎนี้มีไว้กัน: `foo || NA` ดูเหมือนแทน `naText(foo)` ได้ แต่ไม่ใช่ */
test("naText ไม่ใช่ `value || NA` — เลข 0 คือจุดที่ต่างกัน", () => {
  assert.notEqual(naText(0), 0 || NA);
  assert.equal(0 || NA, NA, "`||` กลืน 0 ทิ้ง — นี่คือเหตุผลที่ต้องมี naText");
});
