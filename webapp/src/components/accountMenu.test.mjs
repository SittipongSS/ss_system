// ── เมนูบัญชี (มุมขวาบน) — ด่านซอร์สของ AccountMenu ─────────────────────────
//
// AccountMenu เป็น client component (JSX) ที่ import มารันใต้ node --test ไม่ได้ ⇒ ล็อกที่ซอร์ส
// (แพตเทิร์นเดียวกับ homeShell.test.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AccountMenu.js", import.meta.url), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const triggerTag = () => {
  const start = code.indexOf('className="account-menu-trigger"');
  assert.notEqual(start, -1, "หาปุ่ม .account-menu-trigger ไม่เจอ");
  const open = code.lastIndexOf("<button", start);
  return code.slice(open, code.indexOf(">\n", start));
};

/* 🐞 2026-10-19 จอ ≤900px CSS ซ่อน `.account-menu-identity` (ชื่อ+บทบาท) ⇒ ในปุ่มเหลือแต่อักษรย่อ
   กับลูกศรที่ aria-hidden ⇒ โปรแกรมอ่านจออ่านปุ่มนี้เป็น "ปุ่ม" เปล่า ๆ (วัดจริง: ชื่อที่คำนวณได้ = "")
   ชื่อต้องมาจาก aria-label ที่ไม่ขึ้นกับ CSS และต้องมีข้อความที่ตาเห็นบนจอกว้างครบตามลำดับ (2.5.3) */
test("ปุ่มเมนูบัญชีมีชื่อจากชื่อผู้ใช้+บทบาท ไม่ขึ้นกับว่า CSS ซ่อนข้อความหรือเปล่า", () => {
  assert.match(triggerTag(), /aria-label=\{triggerLabel\}/);
  assert.match(code, /const triggerLabel = \[userName, roleLabel\]\.filter\(Boolean\)\.join\(", "\);/);
});

test("ข้อความที่ถูกซ่อนบนจอแคบคือชื่อ+บทบาท — ส่วนที่เหลือในปุ่ม aria-hidden ทั้งหมด", () => {
  // ถ้าวันหน้าเลิกซ่อน หรือย้ายข้อความอื่นเข้าปุ่ม ข้อสันนิษฐานของ aria-label ต้องถูกทบทวนใหม่
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.account-menu-identity \{ display: none; \}/);
  const tag = code.slice(code.indexOf('className="account-menu-trigger"'), code.indexOf("</button>"));
  assert.match(tag, /<span className="user-avatar" aria-hidden="true">/);
  assert.match(tag, /<ChevronDown[^>]*aria-hidden="true"/);
});
