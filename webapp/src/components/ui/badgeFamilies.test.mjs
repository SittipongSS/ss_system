import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ระบบเคยมี "ป้ายเล็กมีพื้น" อยู่ 4 ชุดขนานกัน ทำงานเดียวกันหมดแต่คนละหน้าตา:
     Badge.module.css (StatusBadge · Tag · CountBadge) = ตัวกลางของ React
     .ui-badge (137 จุด) · .status-pill (43) · .chip (22) ใน globals.css
   วัดจริง 2026-07-29: padding 4 แบบ · ขนาดตัวอักษร 3 แบบ · มุมโค้ง 3 แบบ
   และ `.ui-badge` ยังตัดสระไทย (ตัวอักษรล้นกล่อง -1.0px)

   ตอนนี้ยุบ **รูปทรง** มาที่นิยามเดียว: สามชื่อใน globals ใช้บล็อกเดียวกัน และค่า
   ต้องตรงกับ Badge.module.css เป๊ะ — เทสต์นี้เทียบสองฝั่งไว้ ไม่ให้ไหลออกจากกันอีก

   ⚠️ ยังไม่ได้ยุบ *ชื่อ* — 189 จุดยังเรียกชื่อเก่าอยู่ แต่ทุกชื่อให้ผลเหมือนกันแล้ว
   การไล่เปลี่ยน JSX เป็น <StatusBadge> เป็นงานแยก */

// normalise CRLF — ไฟล์ในรีโปนี้เป็น CRLF บน Windows แต่เทียบสตริงแบบ \n ง่ายกว่า
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const BADGE_CSS = read("./Badge.module.css");

const blockOf = (css, selector) => {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `หา selector ${selector} ไม่เจอ`);
  const open = css.indexOf("{", start);
  return css.slice(open, css.indexOf("}", open));
};

const declValue = (block, prop) => {
  const hit = new RegExp(`(?:^|;|\\{)\\s*${prop}:\\s*([^;]+)`, "m").exec(block);
  return hit ? hit[1].trim() : null;
};

const SHARED = ".ui-badge,\n.status-pill,\n.chip";

test("ป้ายทั้งสามชื่อใน globals ใช้นิยามเดียวกัน (บล็อกเดียว)", () => {
  assert.ok(GLOBALS.includes(SHARED),
    "ต้องรวม .ui-badge / .status-pill / .chip ไว้ในบล็อกเดียว ไม่ใช่ต่างคนต่างประกาศ");
  /* ฐานแยก = ชื่อนั้นเปิดบล็อกเองโดยบรรทัดก่อนหน้า **ไม่ได้ลงท้ายด้วยจุลภาค**
     (ในบล็อกรวม ชื่อสุดท้ายก็ขึ้นบรรทัดใหม่เหมือนกัน เช็คแค่ชื่อจึงไม่พอ) */
  const lines = GLOBALS.split("\n");
  for (const name of ["ui-badge", "status-pill", "chip"]) {
    const standalone = lines.findIndex((line, i) =>
      line.trim() === `.${name} {` && !(lines[i - 1] || "").trim().endsWith(","));
    assert.equal(standalone, -1,
      `.${name} ประกาศฐานแยกกลับมาแล้ว (บรรทัด ${standalone + 1}) — จะทำให้ 4 ชุดไหลออกจากกันอีก`);
  }
});

test("รูปทรงของป้ายใน globals ตรงกับ Badge.module.css", () => {
  const shared = blockOf(GLOBALS, SHARED);
  const base = blockOf(BADGE_CSS, ".base {");
  for (const prop of ["min-height", "padding", "border-radius", "font-size", "line-height", "font-weight"]) {
    assert.equal(declValue(shared, prop), declValue(base, prop),
      `${prop} ของสองฝั่งไม่ตรงกัน — ป้ายจะหน้าตาต่างกันอีก`);
  }
});

test("ป้ายเว้นที่ให้สระ/วรรณยุกต์ไทยพอ และไม่ตรึงความสูง", () => {
  for (const [label, block] of [
    ["globals (3 ชื่อรวม)", blockOf(GLOBALS, SHARED)],
    ["Badge.module .base", blockOf(BADGE_CSS, ".base {")],
  ]) {
    const lineHeight = declValue(block, "line-height");
    assert.ok(Number(lineHeight) >= 1.4,
      `${label} line-height ${lineHeight} — ต่ำกว่า 1.4 ภาษาไทยจะชนขอบ`);
    assert.equal(declValue(block, "height"), null,
      `${label} ตรึง height ตายตัว — ใช้ min-height เพื่อให้กล่องโตตามตัวอักษรได้`);
  }
});

test("พื้นและขอบของป้ายชื่อเก่าดึงจาก currentColor", () => {
  const shared = blockOf(GLOBALS, SHARED);
  // 99 จุดส่งสีมาเองผ่าน style={{color}} — ถ้าพื้นไม่ผูกกับ currentColor
  // พวกนั้นจะได้พื้นโทนกลางทับสีของตัวเอง
  assert.match(declValue(shared, "background"), /currentColor/);
  assert.match(declValue(shared, "border"), /currentColor/);
});
