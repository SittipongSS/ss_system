import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const MONTH_PICKER = source("./MonthPicker.js");
const MONTH_PICKER_CSS = source("./MonthPicker.module.css");
const TABS = source("./Tabs.js");
const SEGMENTED = source("./Segmented.js");
const PAGER = source("./Pager.js");
const EXCISE_STATUS = source("../excise/StatusBadge.js");

test("MonthPicker keeps an ISO value and provides range, calendar, and keyboard contracts", () => {
  assert.match(MONTH_PICKER, /min,/);
  assert.match(MONTH_PICKER, /max,/);
  // ปีเป็น ค.ศ. ทั้งระบบ (2026-08-05) — MonthPicker ไม่มีพารามิเตอร์ปฏิทินอีกแล้ว
  assert.doesNotMatch(MONTH_PICKER, /buddhist/);
  assert.match(MONTH_PICKER, /event\.key !== "PageUp"/);
  assert.match(MONTH_PICKER, /currentShortcutLabel/);
  assert.match(MONTH_PICKER, /onAllMonths/);
  assert.match(MONTH_PICKER_CSS, /@media \(max-width: 640px\)/);
});

test("Tabs and Segmented share roving keyboard navigation", () => {
  assert.match(TABS, /nextEnabledIndex/);
  assert.match(TABS, /role="tablist"/);
  assert.match(TABS, /aria-controls=\{tab\.panelId\}/);
  assert.match(SEGMENTED, /nextEnabledIndex/);
  assert.match(SEGMENTED, /aria-pressed=\{active\}/);
});

test("Pager and Excise status use shared UI foundations", () => {
  assert.match(PAGER, /@\/components\/ui\/Segmented/);
  assert.match(PAGER, /Math\.min\(safePageCount/);
  assert.match(EXCISE_STATUS, /@\/components\/ui\/StatusBadge/);
});
