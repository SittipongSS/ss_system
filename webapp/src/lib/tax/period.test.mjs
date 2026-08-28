import test from "node:test";
import assert from "node:assert/strict";
import { monthOf, quarterOf, withinPeriod } from "./period.js";

test("เดือน/ไตรมาสของวันไทย", () => {
  assert.equal(monthOf("2026-08-28"), "2026-08");
  assert.equal(quarterOf("2026-01-05"), "2026-Q1");
  assert.equal(quarterOf("2026-03-31"), "2026-Q1");
  assert.equal(quarterOf("2026-04-01"), "2026-Q2");
  assert.equal(quarterOf("2026-08-28"), "2026-Q3");
  assert.equal(quarterOf("2026-12-31"), "2026-Q4");
  assert.equal(quarterOf(null), null);
});

test("'ทั้งหมด' ไม่กรองอะไรเลย", () => {
  assert.equal(withinPeriod("2020-01-01", "all", "2026-08-28"), true);
  assert.equal(withinPeriod(null, "all", "2026-08-28"), true);
});

/* 🪤 กับดักเดิมของตัวกรองปีหน้าผู้บริหาร: แถวที่ไม่มีวันที่ถูกกลืนหายทั้งหมด
   ⇒ ตัวเลขบนจอน้อยกว่าของจริงโดยไม่มีอะไรฟ้อง */
test("แถวที่ไม่มีวันที่ต้องไม่หายจากจอ", () => {
  assert.equal(withinPeriod(null, "month", "2026-08-28"), true);
  assert.equal(withinPeriod("", "quarter", "2026-08-28"), true);
  assert.equal(withinPeriod("ไม่ใช่วันที่", "month", "2026-08-28"), true);
});

test("เดือนนี้/ไตรมาสนี้เทียบกับวันไทยที่ส่งเข้ามา", () => {
  assert.equal(withinPeriod("2026-08-01", "month", "2026-08-28"), true);
  assert.equal(withinPeriod("2026-07-31", "month", "2026-08-28"), false);
  assert.equal(withinPeriod("2026-07-31", "quarter", "2026-08-28"), true);  // Q3 = ก.ค.–ก.ย.
  assert.equal(withinPeriod("2026-06-30", "quarter", "2026-08-28"), false);
  // ปีต่างกันต้องไม่ชนกันแม้ไตรมาสเดียวกัน
  assert.equal(withinPeriod("2025-08-15", "quarter", "2026-08-28"), false);
});

/* ⭐ ของจริงที่พัง: `2026-08-01T02:00:00Z` = 1 ส.ค. **ตามเวลาไทย** (09:00 น.)
   แต่ถ้าตัดสตริงดิบจะได้ 2026-08-01 พอดี — เคสที่กัดคือฝั่งตรงข้าม:
   `2026-07-31T18:00:00Z` = 1 ส.ค. 01:00 น. ตามไทย ต้องนับเป็นเดือนสิงหาคม */
test("timestamp UTC ต้องถูกแปลงเป็นวันไทยก่อนเทียบเดือน", () => {
  assert.equal(withinPeriod("2026-07-31T18:00:00Z", "month", "2026-08-28"), true);
  // และวันสุดท้ายของเดือนตามไทยต้องไม่ถูกดันไปเดือนถัดไป
  assert.equal(withinPeriod("2026-08-31T16:59:00Z", "month", "2026-08-28"), true);
  assert.equal(withinPeriod("2026-08-31T17:00:00Z", "month", "2026-08-28"), false); // = 1 ก.ย. ไทย
});
