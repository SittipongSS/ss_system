import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRINT_FONT_STACK, printPlaceholderHtml } from "./printTheme.js";

/* ⭐ ผูกฟอนต์พิมพ์เข้ากับฟอนต์แอป **โดยโครงสร้าง** ไม่ใช่เขียนชื่อซ้ำสองที่ —
   ของเดิม assert คำว่า "IBM Plex Sans Thai" ตรง ๆ ⇒ ตอนเปลี่ยนฟอนต์ระบบเป็น
   Sarabun (2026-08-13) เทสต์นี้ฟ้องโดยไม่ได้บอกว่ากฎจริงคืออะไร · กฎจริงคือ
   "เอกสารพิมพ์ต้องเป็นฟอนต์เดียวกับแอป"
   ⚠️ ย้ายจาก layout.js มาอ่าน `@font-face` ใน globals.css เมื่อ 2026-08-14
   ตอนเลิกใช้ `next/font/google` (ต้อง override ascent/descent ให้คลุมหมึกไทย
   ไม่งั้น `<input>` เฉือนสระ — ดูคอมเมนต์ที่หัว globals.css) */
function appFontFamily() {
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const face = globals.match(/@font-face \{[^}]*?font-family:\s*['"]([^'"]+)['"]/s);
  assert.ok(face, "อ่านชื่อฟอนต์จาก @font-face ใน globals.css ไม่ได้ — เช็ค selector ของเทสต์");
  return face[1];
}

test("ฟอนต์พิมพ์ต้องเป็นตัวเดียวกับที่แอปโหลด และมีตัวสำรองไทย", () => {
  assert.ok(
    PRINT_FONT_STACK.includes(appFontFamily()),
    `PRINT_FONT_STACK ต้องขึ้นต้นด้วย "${appFontFamily()}" ให้ตรงกับ layout.js — `
      + `ตอนนี้เป็น ${PRINT_FONT_STACK}`,
  );
  assert.match(PRINT_FONT_STACK, /Noto Sans Thai/);
});

test("print placeholder escapes content and uses the shared font", () => {
  const html = printPlaceholderHtml({
    title: "<เอกสาร>",
    message: "A & B",
    tone: "error",
    closeButton: true,
  });
  assert.match(html, /&lt;เอกสาร&gt;/);
  assert.match(html, /A &amp; B/);
  assert.ok(html.includes(PRINT_FONT_STACK), "placeholder ต้องใช้สแตกเดียวกับเอกสารอื่น");
  assert.match(html, /window\.close/);
});
