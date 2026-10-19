import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
/* เดิมนับ 3 ธีม (สว่าง / มืด / `.exporting-mode` = ธีมกระดาษตอน export เป็น PNG/PDF)
   2026-07-30: ไม่มีโค้ดไหนใส่คลาส `.exporting-mode` ให้ element เลย และไม่มี
   html2canvas/toPng ในโปรเจกต์แล้ว — ฟีเจอร์ export ถูกถอดไปนานแล้ว เหลือแต่ CSS
   จึงลบทิ้งพร้อมรอบเก็บกวาด "CSS ที่ไม่มีใครเรียก" · เลขจึงเป็น 2 ไม่ใช่ 3
   ⚠️ ถ้าจะทำ export กลับมา ต้องเพิ่มธีมกระดาษใหม่พร้อมโค้ดที่ใส่คลาสจริง */
test("--panel-float ทึบ 100% ทุกธีม", () => {
  const values = [...css.matchAll(/--panel-float:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(values.length >= 2, "ต้องมีทั้งธีมสว่างและธีมมืด");
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

/* 🐞 2026-10-19 เมนูบัญชี (มุมขวาบน) โปร่ง 6% บนทุกหน้า **ยกเว้น /home** — ตัวหนังสือของแถบระบบ
   ปุ่ม "+ เพิ่มลูกค้า" และการ์ดตัวเลขข้างหลังทะลุขึ้นมาปนกับรายการในเมนู (ภาพก่อน/หลังที่
   mockups/small-bugs-20261019/account-menu) · กฎตัวหลักเป็น var(--panel) มาตลอด แล้ว #1731 แปะ
   --panel-float ให้เฉพาะ `.home-context` ⇒ หน้าที่เหลือโปร่งต่อ ⇒ พื้นทึบต้องมาจากกฎตัวหลัก
   ห้ามมีกฎรายหน้ามาทับ (มีทีไรแปลว่ามีหน้าอื่นที่ยังโปร่งอยู่) */
test("เมนูบัญชีทึบจากกฎตัวหลัก ไม่มีกฎรายหน้าทับพื้น", () => {
  const rule = ruleOf(".account-menu-popover");
  assert.match(rule, /background:\s*var\(--panel-float\)/);
  assert.doesNotMatch(rule, /background[^;]*var\(--panel\)/);
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const scoped = [...code.matchAll(/([^\n{}]*\S[ \t>~+]+\.account-menu-popover\s*\{[^}]*\})/g)]
    .map((m) => m[1].trim())
    .filter((block) => /background/.test(block));
  assert.deepEqual(scoped, []);
});

/* ต้นเหตุจริงของบั๊กข้างบน: ตัวจับ "แผงลอย" ของ audit:ui เห็นแค่ position fixed/sticky หรือ z-index
   เป็น **เลข** ≥ 1000 — เมนูที่ position:absolute บนชั้นต่ำกว่า 1000 (เมนูบัญชี 125 · รายชื่อ @mention 40)
   หลุดมาตั้งแต่ต้น และตั้งแต่ z-index ย้ายไปใช้ชื่อ --z-* (2026-07-29 · ห้ามเลขดิบ ≥30 แล้ว) เงื่อนไข
   "เลข ≥ 1000" ก็ไม่มีวันจริงอีก · กฎที่หยิบชั้นจากสเกลกลางคือของที่ลอยระดับหน้า (เลข 0–10 ของตาราง
   ไม่อยู่ในสเกลโดยเจตนา) ⇒ นับเป็นแผงลอยทั้งหมด
   เทสต์นี้เดินทุกไฟล์ CSS เองโดยไม่พึ่ง audit — ถ้าใครถอดเงื่อนไขชั้นซ้อนออกจาก audit ข้างล่างจะแดง
   และถ้ามีเมนู absolute ตัวใหม่ใช้ --panel เปล่า ข้อนี้แดงใน npm test ก่อนถึง CI */
test("แผง absolute ที่หยิบชั้นจาก --z-* ทุกไฟล์ CSS ไม่ใช้ --panel เปล่า", () => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  })(fileURLToPath(new URL("../../", import.meta.url)));
  const leaks = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const block of source.split("}")) {
      const brace = block.indexOf("{");
      if (brace === -1) continue;
      const body = block.slice(brace + 1);
      if (!/position:\s*absolute/.test(body) || !/z-index:\s*var\(--z-/.test(body)) continue;
      if (!/background[^;]*var\(--panel\)/.test(body) || /backdrop-filter/.test(body)) continue;
      const selector = block.slice(0, brace).split(/\r?\n/).filter(Boolean).pop()?.trim();
      leaks.push(`${path.basename(file)} ${selector}`);
    }
  }
  assert.deepEqual(leaks, [], "แผงที่ลอยทับเนื้อหาใช้ var(--panel-float)");
});

test("audit:ui นับ z-index จากสเกลกลางเป็นแผงลอย", () => {
  assert.match(audit, /z-index:\\s\*var\\\(--z-/);
});

test("โทเคนเดียวจริง — ไม่มี --date-calendar-bg แยกอีกชุด", () => {
  assert.doesNotMatch(css, /--date-calendar-bg/);
});

test("audit:ui บังคับกฎแผงลอย ไม่ใช่พึ่งคนรีวิว", () => {
  assert.match(audit, /floatingSurfaceViolations/);
  assert.match(audit, /position:\\s\*fixed/);
  assert.match(audit, /backdrop-filter/);
  assert.match(audit, /panel-float/);
});
