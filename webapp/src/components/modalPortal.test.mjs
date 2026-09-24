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

/* ── สามตัวเลือกของโมดัลจัดคิวแบบ A (มติเจ้าของ 24/09 · `service/ScheduleModalShell`) ────────────
   ⚠️ ไม่ส่ง = หน้าตาเดิมเป๊ะ (โมดัลทั้งระบบใช้ตัวนี้) · ส่งมา = ชิปต่อท้ายชื่อ · คลาสของเปลือก · แผ่นเต็มจอบนมือถือ */
const GLOBALS = read("src", "app", "globals.css");
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("titleAside วางต่อท้ายชื่อใน .drawer-title-row · aria-labelledby ยังชี้ที่ h3 ตัวเดียว", () => {
  const src = live(MODAL);
  assert.match(src, /^\s*titleAside,$/m);
  assert.match(src, /\{titleAside \? \(\s*<div className="drawer-title-row">\s*\{heading\}\s*\{titleAside\}\s*<\/div>\s*\) : heading\}/,
    "ไม่มี titleAside = h3 เดี่ยวตามเดิม (ไม่มีกล่องห่อเพิ่ม)");
  assert.match(src, /const heading = <h3 id=\{titleId\} className="drawer-title">\{title\}<\/h3>;/);
  assert.match(src, /aria-labelledby=\{titleId\}/);
  assert.match(GLOBALS, /\.drawer-title-row \{[^}]*display: flex;[^}]*flex-wrap: wrap;/);
});

test("className ต่อท้าย .drawer · sheetOnPhone ติด phone-sheet ทั้ง overlay และ drawer (ไม่ใช่ลิ้นชักข้าง)", () => {
  const src = live(MODAL);
  assert.match(src, /className = "",/);
  assert.match(src, /sheetOnPhone = false,/);
  assert.match(src, /const sheet = sheetOnPhone && !isSide \? " phone-sheet" : "";/);
  assert.match(src, /className=\{`overlay\$\{isSide \? " to-right" : ""\}\$\{sheet\}`\}/);
  assert.match(src, /className=\{`drawer \$\{size\}\$\{isSide \? " side-right" : ""\}\$\{sheet\}\$\{className \? ` \$\{className\}` : ""\}`\}/);
});

test("แผ่นเต็มจอบนมือถือ: .overlay.phone-sheet / .drawer.phone-sheet อยู่ใน @media (max-width: 640px)", () => {
  const block = GLOBALS.match(/@media \(max-width: 640px\) \{\s*\.overlay\.phone-sheet \{[\s\S]*?\n\}/);
  assert.ok(block, "ต้องมีบล็อก @media 640 ของ phone-sheet");
  assert.match(block[0], /\.overlay\.phone-sheet \{[^}]*padding: 0;[^}]*align-items: stretch;/);
  assert.match(block[0], /\.drawer\.phone-sheet \{[^}]*max-width: 100%;[^}]*height: 100%;[^}]*max-height: 100%;/);
  // ปุ่มท้ายเผื่อแถบโฮมของมือถือ — ปุ่มหลักต้องกดได้เต็มนิ้ว
  assert.match(block[0], /\.drawer\.phone-sheet \.drawer-footer \{[^}]*env\(safe-area-inset-bottom\)/);
  // ⚠️ ห้ามเขียนทับ .overlay / .drawer เปล่า ๆ — โมดัลอื่นทั้งระบบต้องไม่ขยับ
  assert.doesNotMatch(block[0], /^\s*\.(?:overlay|drawer) \{/m);
});
