import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const audit = readFileSync(new URL("../../../scripts/audit-ui.mjs", import.meta.url), "utf8");

const ruleOf = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `หา rule ${selector} ไม่เจอ`);
  return css.slice(start, css.indexOf("}", start));
};

// แผงลอยทับเนื้อหาอื่น ถ้าใช้ --panel (พื้นกระจก alpha .92) โดยไม่มี backdrop-filter
// ตัวอักษรข้างหลังจะลอดขึ้นมาปนกับรายการในแผง — เจอจริงที่ dropdown เลือกลูกค้าใน
// หน้าสร้างใบเสนอราคา 2026-07-26 (ผู้ใช้ส่งภาพมา). มติ: ทำเป็นดีไซน์กลางทั้งระบบ
test("--panel-float ทึบ 100% ทุกธีม (รวมธีมกระดาษตอน export)", () => {
  const values = [...css.matchAll(/--panel-float:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(values.length >= 3, "ต้องมีธีมสว่าง / มืด / .exporting-mode");
  for (const value of values) assert.match(value, /^#[0-9a-f]{6}$/i, `ต้องเป็นสีทึบ ไม่ใช่ ${value}`);
});

// ทุกแผงลอยของระบบต้องชี้มาที่โทเคนเดียว — ไม่ใช่แก้เฉพาะที่ผู้ใช้เห็นปัญหา
for (const selector of [
  ".ui-select-menu",      // Select / SearchableSelect / PersonSelect / ProductCategorySelect
  ".ui-time-menu",        // TimeInput
  ".date-calendar",       // DateInput
  ".ui-filter-popover",   // FilterPopover
  ".timeline-save-bar",   // แถบบันทึกลอยของไทม์ไลน์
]) {
  test(`${selector} ใช้พื้นแผงลอยกลาง`, () => {
    const rule = ruleOf(selector);
    assert.match(rule, /background:\s*var\(--panel-float\)/);
    assert.doesNotMatch(rule, /background[^;]*var\(--panel\)/);
  });
}

test("โทเคนเดียวจริง — ไม่มี --date-calendar-bg แยกอีกชุด", () => {
  assert.doesNotMatch(css, /--date-calendar-bg/);
});

test("audit:ui บังคับกฎแผงลอย ไม่ใช่พึ่งคนรีวิว", () => {
  assert.match(audit, /floatingSurfaceViolations/);
  assert.match(audit, /position:\\s\*fixed/);
  assert.match(audit, /backdrop-filter/);
  assert.match(audit, /panel-float/);
});
