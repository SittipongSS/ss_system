import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/* 🐞 บั๊กที่เทสต์นี้เกิดมาเพื่อกัน (2026-08-01): `Modal` เรนเดอร์อยู่กับที่ในต้นไม้ DOM
   `.overlay` เป็น position:fixed ก็จริง — **แต่สไตล์ที่สืบทอดได้ยังไหลลงมาจาก DOM parent**
   พอกล่อง transition ของแถวตารางไปเกิดใน `<td className="num">` ซึ่งมี `text-align: right`
   ป้ายชื่อช่องทุกอันในกล่องเลยชิดขวา · ผู้ใช้เห็นก่อนจากภาพจริง ไม่มีเทสต์ไหนจับได้ */

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const MODAL = read("src", "components", "Modal.js");

test("Modal ต้อง portal ไป document.body", () => {
  assert.match(MODAL, /createPortal/,
    "ไม่ portal = กล่องรับสไตล์ที่สืบทอดได้จากที่ที่มันไปเกิด (text-align/color/font)");
  assert.match(MODAL, /document\.body/);
});

test("portal ต้องรอ mount ฝั่ง client ก่อน — SSR ไม่มี document", () => {
  assert.match(MODAL, /useState\(false\)/);
  assert.match(MODAL, /!open \|\| !mounted/,
    "ต้องคืน null ทั้งตอนปิดและตอนยังไม่ mount");
});

/* กันคนย้ายกลับไปเรนเดอร์อยู่กับที่โดยไม่รู้ว่าทำไมถึงต้อง portal */
test("ยังคงล็อกโฟกัสและปิดด้วย Escape ได้เหมือนเดิม", () => {
  assert.match(MODAL, /FOCUSABLE_SELECTOR/);
  assert.match(MODAL, /"Escape"/);
  assert.match(MODAL, /document\.body\.style\.overflow = "hidden"/);
});

/* แผงลอยทุกตัวของระบบต้องหนีออกจากที่ที่มันไปเกิด — ไม่งั้นเจอบั๊กเดียวกันซ้ำ */
test("แผงลอยตัวอื่นก็ portal เหมือนกัน", () => {
  for (const file of ["ui/RowActionMenu.js", "ui/FilterPopover.js"]) {
    assert.match(read("src", "components", ...file.split("/")), /createPortal/,
      `${file} ต้อง portal`);
  }
});
