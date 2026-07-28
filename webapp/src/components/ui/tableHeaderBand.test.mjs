import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const TABLE_CSS = stripComments(src("./Table.module.css"));
const GLOBALS = stripComments(src("../../app/globals.css"));

/* ของจริงที่เคยเกิด (2026-07-27): แถบหัวตารางไม่เต็มความกว้าง มีแถบสีพื้นการ์ดโผล่
   ที่ขอบขวาตลอด เพราะ `scrollbar-gutter: stable` จองพื้นที่กว้างเท่าสกอร์ลบาร์ไว้เสมอ
   แม้ไม่มีสกอร์ลบาร์ ตารางกว้าง 100% ของกล่องเนื้อหาจึงหยุดก่อนถึงขอบ
   วัดจริงตอนนั้น: เว้น 10px · หลังเอาออก เหลือ 1px (ขอบการ์ด) */
test("กล่องตารางต้องไม่จองพื้นที่สกอร์ลบาร์ค้างไว้", () => {
  assert.doesNotMatch(TABLE_CSS, /scrollbar-gutter/);
});

/* มุมมนเป็นหน้าที่ของกล่องที่ครอบ ไม่ใช่ของเซลล์หัวตาราง — ถ้าเซลล์มนเองด้วยจะเกิด
   รอยเว้าตรงมุมบนสองข้าง */
test("เซลล์หัวตารางไม่มีมุมมนของตัวเอง", () => {
  assert.doesNotMatch(GLOBALS, /\.premium-table th:(?:first|last)-child \{\s*border-top-\w+-radius/);
  assert.doesNotMatch(TABLE_CSS, /:global\(th[^)]*\)[^{]*\{[^}]*border-radius/);
});
