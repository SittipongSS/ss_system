import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addMonths,
  businessDayKey,
  businessMonthKey,
  dateRangeOfBusinessMonth,
  dateRangeOfBusinessYear,
  clampMonth,
  compareMonths,
  currentMonth,
  displayYear,
  formatMonthLabel,
  isMonthInRange,
  isMonthValue,
  monthsForYear,
  yearOptionsForMonth,
} from "./datePeriods.js";

test("month values remain ISO/Gregorian at the API boundary", () => {
  assert.equal(isMonthValue("2026-07"), true);
  assert.equal(isMonthValue("2569-07"), true);
  assert.equal(isMonthValue("2026-7"), false);
  assert.equal(isMonthValue("2026-13"), false);
  assert.equal(currentMonth(new Date(2026, 6, 26)), "2026-07");
  assert.equal(currentMonth(new Date("2026-06-30T17:30:00Z")), "2026-07");
  assert.equal(currentMonth(new Date("2026-06-30T16:30:00Z")), "2026-06");
});

test("month arithmetic crosses year boundaries without changing the contract", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("invalid", 1), null);
  assert.equal(compareMonths("2026-07", "2026-08"), -1);
});

test("min and max boundaries clamp values and filter year months", () => {
  const range = { min: "2026-03", max: "2026-09" };
  assert.equal(clampMonth("2025-12", range), "2026-03");
  assert.equal(clampMonth("2027-01", range), "2026-09");
  assert.equal(isMonthInRange("2026-06", range), true);
  assert.equal(isMonthInRange("2026-10", range), false);
  assert.deepEqual(monthsForYear(2026, range), [
    "2026-03", "2026-04", "2026-05", "2026-06",
    "2026-07", "2026-08", "2026-09",
  ]);
});

// ⭐ มติผู้ใช้ 2026-08-05: ปีเป็น ค.ศ. ทั้งระบบ — เดิมชั้นแสดงผลของงวดเดือนเป็น พ.ศ.
// อยู่ที่เดียวขณะที่ fmtDate/fmtDateTime และหน้าเป้าหมายเป็น ค.ศ. (ดูหัวเรื่องที่ displayYear)
test("ปีที่แสดงเป็น ค.ศ. ตรงกับค่าที่เก็บ ไม่มีการบวก 543 ที่ไหนอีก", () => {
  assert.equal(displayYear(2026), "2026");
  assert.equal(displayYear("2026"), "2026");
  assert.equal(displayYear("ไม่ใช่ปี"), "");
  assert.equal(formatMonthLabel("2026-07"), "ก.ค. 2026");
  assert.equal(formatMonthLabel("2026-07", { includeYear: false }), "ก.ค.");
});

test("year options include selected outliers and respect explicit boundaries", () => {
  assert.deepEqual(
    yearOptionsForMonth("2030-04", {
      pastYears: 1,
      futureYears: 1,
      now: new Date(2026, 6, 1),
    }),
    [2025, 2026, 2027, 2028, 2029, 2030, 2031],
  );
  assert.deepEqual(
    yearOptionsForMonth("2026-04", { min: "2025-11", max: "2027-02" }),
    [2025, 2026, 2027],
  );
});

/* 🐞 ตรวจตัวเลขลีด 2026-08-08: ขอบเดือนเทียบด้วยสตริงวันเปล่า ๆ Postgres อ่านเป็น
   00:00 UTC = 07:00 กรุงเทพ ⇒ ลีดที่เข้ามาตอนดึกตกไปนับเป็นเดือนก่อนโดยไม่มีอะไรฟ้อง */
test('businessDayKey: วันตามเวลาไทย ไม่ใช่วัน UTC', () => {
  // 00:30 น. วันที่ 1 ส.ค. ตามเวลาไทย = 2026-07-31T17:30Z — slice(0,10) จะได้ 07-31 (ผิด)
  assert.equal(businessDayKey('2026-07-31T17:30:00.000Z'), '2026-08-01');
  // 23:30 น. วันที่ 31 ก.ค. ตามเวลาไทย = 16:30Z วันเดียวกัน
  assert.equal(businessDayKey('2026-07-31T16:30:00.000Z'), '2026-07-31');
  // เที่ยงวันไทย = 05:00Z วันเดียวกัน — ตรงกันทั้งสองแบบ
  assert.equal(businessDayKey('2026-08-12T05:00:00.000Z'), '2026-08-12');
  assert.equal(businessDayKey('ไม่ใช่วันที่'), null);
  assert.equal(businessDayKey(null), null);
  assert.equal(businessMonthKey('2026-07-31T17:30:00.000Z'), '2026-08');
});

test('ขอบเดือน/ปี = ต้นวันตามเวลาไทย ครึ่งเปิด [from, until)', () => {
  assert.deepEqual(dateRangeOfBusinessMonth('2026-08'), {
    from: '2026-08-01T00:00:00+07:00',
    until: '2026-09-01T00:00:00+07:00',
  });
  // ข้ามปีต้องได้เดือน 1 ของปีถัดไป ไม่ใช่เดือน 13
  assert.deepEqual(dateRangeOfBusinessMonth('2026-12'), {
    from: '2026-12-01T00:00:00+07:00',
    until: '2027-01-01T00:00:00+07:00',
  });
  assert.deepEqual(dateRangeOfBusinessYear('2026'), {
    from: '2026-01-01T00:00:00+07:00',
    until: '2027-01-01T00:00:00+07:00',
  });
  assert.equal(dateRangeOfBusinessMonth('2026-13'), null);
  assert.equal(dateRangeOfBusinessYear('26'), null);
});

test('route KPI ต้องเทียบขอบด้วยเวลาไทย และทำกราฟรายวันด้วยวันไทย', () => {
  const src = readFileSync(new URL('../app/api/sales-planning/leads/kpi/route.js', import.meta.url), 'utf8');
  assert.match(src, /dateRangeOfBusinessMonth\(month\)/);
  assert.match(src, /dateRangeOfBusinessYear\(year\)/);
  assert.match(src, /businessDayKey\(l\.createdAt\)/);
  assert.doesNotMatch(src, /String\(l\.createdAt\)\.slice\(0, 10\)/, 'slice = วัน UTC เลื่อนไปวันก่อน');
  // "ค้าง" ต้องนับตอนนี้ ไม่ใช่กรองจากลีดของเดือนที่เลือก
  assert.match(src, /countLeadsByStatus\(supabase, 'new', null\)/);
  assert.match(src, /countLeadsByStatus\(supabase, 'assigned', team\)/);
  assert.doesNotMatch(src, /rows\.filter\(\(l\) => l\.status === 'new'\)/);
});
