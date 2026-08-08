import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* กล่องที่ครอบทั้งหน้า (.main-content) ห้ามกลายเป็น scroll container
   ─────────────────────────────────────────────────────────────────
   🐞 ของจริงที่เกิด (วัด 2026-08-08): `.main-content` ตั้ง `overflow-x: hidden`
   ไว้กันเนื้อหาล้นออกข้าง แต่ตามสเปก CSS ถ้าแกนหนึ่งเป็น hidden อีกแกนที่เป็น
   visible จะถูกบังคับเป็น auto ทันที กล่องนี้จึงกลายเป็น scroll container ทั้งที่
   ไม่เคยเลื่อนเอง (scrollHeight === clientHeight เป๊ะ เพราะมันยืดตามเนื้อหา)

   ผลคือ `position: sticky` ของลูก **ทุกตัว** ไปยึดกับกล่องที่นิ่งสนิท แทนที่จะยึด
   กับหน้าต่าง — getComputedStyle ตอบว่า `sticky` ครบทุกค่า (position, bottom,
   z-index) เลยดูเหมือนทำงาน แต่พอไถหน้าจอจริงแถบหลุดออกนอกจอ ตรวจไม่เจอถ้าดู
   แค่ computed style ต้องวัดตำแหน่งจริงตอนเลื่อนเท่านั้น

   `overflow-x: clip` ตัดแนวนอนเหมือน hidden ทุกอย่าง ต่างกันที่ไม่สร้าง scroll
   container ปล่อยให้ overflow-y คงเป็น visible ลูกจึงยึดกับหน้าต่างได้ */

const GLOBALS = fs.readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

const mainContentBlock = () => {
  const start = GLOBALS.indexOf("\n.main-content {");
  assert.ok(start > -1, "หา .main-content ใน globals.css ไม่เจอ");
  // ตัดคอมเมนต์ทิ้งก่อน — คอมเมนต์เตือนในบล็อกนั้นพูดคำว่า hidden อยู่ด้วย
  return GLOBALS.slice(start, GLOBALS.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
};

test("⭐ .main-content ตัดแนวนอนด้วย clip ห้าม hidden", () => {
  const block = mainContentBlock();
  assert.match(
    block,
    /overflow-x:\s*clip;/,
    ".main-content ต้องใช้ overflow-x: clip",
  );
  assert.doesNotMatch(
    block,
    /overflow(-x|-y)?:\s*(hidden|auto|scroll)/,
    "hidden/auto/scroll ทำให้กล่องนี้เป็น scroll container แล้ว sticky ของลูกทุกตัวตาย",
  );
});

test("แถบก้าวถัดไปยังปักหมุดด้วย sticky ไม่ใช่ fixed", () => {
  /* fixed จะหลุดจากความกว้างของคอลัมน์เนื้อหา แล้วต้องไล่คำนวณ left/right เอง
     ตามการมีอยู่ของแถบเมนู — sticky ได้ความกว้างมาฟรีจาก flow */
  const css = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "requests", "NextStepBar.module.css"),
    "utf8",
  );
  assert.match(css, /position:\s*sticky;/);
  assert.doesNotMatch(css, /position:\s*fixed;/);
});
