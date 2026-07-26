import test from "node:test";
import assert from "node:assert/strict";

import {
  addMonths,
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

test("display uses Buddhist years while stored values stay Gregorian", () => {
  assert.equal(displayYear(2026), "2569");
  assert.equal(displayYear(2026, "gregorian"), "2026");
  assert.equal(formatMonthLabel("2026-07"), "ก.ค. 2569");
  assert.equal(formatMonthLabel("2026-07", { calendar: "gregorian" }), "ก.ค. 2026");
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
