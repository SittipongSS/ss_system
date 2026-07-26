import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const ruleOf = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `หา rule ${selector} ไม่เจอ`);
  return css.slice(start, css.indexOf("}", start));
};

// dropdown/เมนู/ปฏิทิน ลอยทับเนื้อหาอื่น ถ้าใช้ --panel (กระจก alpha .92) โดยไม่มี
// backdrop-filter ตัวอักษรข้างหลังจะทะลุขึ้นมาปนกับรายการในเมนู — เจอจริงที่ dropdown
// เลือกลูกค้าในหน้าสร้างใบเสนอราคา 2026-07-26 (ผู้ใช้ส่งภาพมา)
test("--panel-float ทึบ 100% ทั้งสองธีม", () => {
  const opaque = /^#[0-9a-f]{6}$/i;
  const values = [...css.matchAll(/--panel-float:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(values.length >= 2, "ต้องนิยามทั้งธีมสว่างและธีมมืด");
  for (const value of values) assert.match(value, opaque, `--panel-float ต้องเป็นสีทึบ ไม่ใช่ ${value}`);
});

for (const selector of [".ui-select-menu", ".ui-time-menu"]) {
  test(`${selector} ใช้พื้นทึบ ไม่ใช่ --panel`, () => {
    const rule = ruleOf(selector);
    assert.match(rule, /background:\s*var\(--panel-float\)/);
    assert.doesNotMatch(rule, /background:\s*var\(--panel\)/);
  });
}

test("ปฏิทินของ DateInput ยังใช้ค่าเดียวกัน (แหล่งเดียว)", () => {
  assert.match(css, /--date-calendar-bg:\s*var\(--panel-float\)/);
});
