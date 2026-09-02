import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* คอนทราสต์ของ "ชั้นเมนูของระบบ" (แถวที่สองบน header)

   วัดบนแอปจริง 2026-08-02 ที่จอ 1440px ทั้งสองธีม — พื้นแถวเมนูเป็น
   `color-mix(in srgb, var(--navy) 7%, var(--panel))` ซึ่ง**โปร่งแสง** ต้องไล่ composite
   ขึ้นไปตามลำดับพ่อแม่จนทึบก่อนถึงจะได้สีจริง (สว่าง #f0f1f4 · มืด #1b233b)

     สถานะ                      สว่าง    มืด     เกณฑ์
     เมนูปกติ  --text-2         5.52 ✓   8.93 ✓  4.5
     hover     --text           13.84 ✓  12.77 ✓ 4.5
     active    --accent-ink     5.09 ✓   5.59 ✓  4.5
     ขีดชี้3px --accent         2.94 ✗   5.59 ✓  3.0   ← ดูหมายเหตุข้างล่าง
     วางเป้า   --text-3         4.21 ✗   5.40 ✓  4.5   ← แก้แล้วในไฟล์นี้

   🪤 วิธีวัดที่ต้องทำถูก ไม่งั้นได้ตัวเลขมั่ว:
   - Chrome คืนค่าสีเป็น `color(srgb 0.93 0.94 0.95 / 0.94)` = **ทศนิยม 0–1 ไม่ใช่ 0–255**
     ตัวอ่านที่จับตัวเลขดิบจะได้พื้นสีอ่อนกลายเป็นเกือบดำ
   - `<body>` มี `transition-colors duration-300` ถ้า pane ไม่ composite ค่าจะค้างกลางทาง
     ต้องยัด `transition:none !important` ก่อนวัดเสมอ */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector) {
  const css = stripComments(GLOBALS);
  const found = css.split("}").find((chunk) => {
    const open = chunk.indexOf("{");
    if (open === -1) return false;
    return chunk.slice(0, open).split(",").map((s) => s.trim()).includes(selector);
  });
  assert.ok(found, `ไม่พบบล็อก ${selector} ใน globals.css`);
  return found.slice(found.indexOf("{") + 1);
}

test("เมนูอรรถประโยชน์ (วางเป้า) ต้องผ่าน AA — ทำให้ 'เบา' ด้วยน้ำหนัก ไม่ใช่สีจาง", () => {
  const body = block(".topnav-utility-item");
  assert.match(body, /color:\s*var\(--text-2\)/,
    "ต้องใช้ --text-2 (5.52:1) — --text-3 ได้แค่ 4.21:1 บนพื้นแถวเมนูในธีมสว่าง = ตก AA");
  assert.doesNotMatch(body, /color:\s*var\(--text-3\)/,
    "--text-3 จางเกินเกณฑ์บนพื้นแถวเมนู อย่าเอากลับมา");
  assert.match(body, /font-weight:\s*var\(--fw-normal\)/,
    "ความ 'เบา' ย้ายมาอยู่ที่น้ำหนักตัวอักษร ซึ่งไม่กระทบคอนทราสต์");
});

test("⭐ ขีดชี้ของเมนู active ต้องเป็น --accent ห้ามเปลี่ยนเป็นโทเคน *-ink", () => {
  /* ขีดชี้ได้ 2.94:1 ในธีมสว่าง ซึ่ง**ต่ำกว่าเกณฑ์ 3:1 อยู่ 2%** — แต่ตั้งใจปล่อยไว้:

     WCAG 1.4.11 ไม่บังคับกราฟิกที่เป็นแค่ตัว *ย้ำ* สถานะ ถ้าสถานะนั้นถูกสื่อด้วยอย่างอื่น
     ที่ผ่านเกณฑ์อยู่แล้ว — ที่นี่คือ **สีตัวอักษร --accent-ink 5.09:1 (ผ่าน AA) + ตัวหนา
     semibold (ตัวชี้ที่ไม่ใช่สี)** ขีดจึงเป็นตัวที่สาม ไม่ใช่ตัวเดียวที่บอกว่า active

     🔴 ทางแก้ที่ "ดูสะอาด" คือเปลี่ยนเป็น `background: var(--accent-ink)` (จะได้ 5.09:1)
     **ห้ามทำ** — โทเคน `*-ink` ของระบบนี้ใช้กับ `color:` เท่านั้น ตรวจแล้วทั้ง globals.css
     มี --accent-ink 8 จุด เป็น `color:` ทุกจุด คู่กับพื้น --accent-soft เสมอ
     (กฎเดียวกับที่ [[button-tone-variant-gaps]] และ linkVisibility.test.mjs บันทึกไว้)

     ถ้าวันหนึ่งอยากดันขีดให้ผ่าน 3:1 จริง ๆ ทางที่ถูกคือ **ทำพื้นแถวเมนูให้เข้มขึ้น**
     ไม่ใช่เอา ink มาเป็นพื้น — แต่นั่นชนมติ 2026-07-18 ที่ตั้งใจให้ชั้นเมนูไหลต่อจาก
     แถบระบบเป็น header ผืนเดียว จึงต้องให้ผู้ใช้ตัดสินก่อน */
  const body = block(".topnav-item.active::after");
  assert.match(body, /background:\s*var\(--accent\)/,
    "ขีดชี้ใช้ --accent เป็นพื้น");
  assert.doesNotMatch(body, /background:\s*var\(--[\w-]*-ink\)/,
    "โทเคน *-ink ใช้กับ color: เท่านั้น ห้ามเอามาเป็นพื้น แม้จะได้คอนทราสต์สูงกว่า");
});

test("เมนูปกติ/active ยังรับสีจากโทเคนกลาง ไม่ใช่สีดิบ", () => {
  assert.match(block(".topnav-item"), /color:\s*var\(--text-2\)/);
  assert.match(block(".topnav-item.active"), /color:\s*var\(--accent-ink\)/);
});
