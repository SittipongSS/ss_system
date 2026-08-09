import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* กริดปฏิทินรายเดือนต้องมาจาก components/ui/MonthGrid ที่เดียว
   (มติผู้ใช้ 2026-08-08 — เลือกแบบ A "ตารางร่วมเส้น" จาก mock 3 แบบ)

   ที่มา: ก่อนหน้านี้ปฏิทินสามหน้าเขียนกริด 7 คอลัมน์เองคนละชุด จังหวะจึงไม่ตรงกัน
   เลย (สูงช่อง 74 / 92 / 104px · มุม 8 / 10px · ช่องไฟ 6px) — เทสต์นี้กันไม่ให้
   หน้าใหม่งอกกริดเดือนของตัวเองอีก ตามกติกาถาวรข้อ 1 ใน docs/design-v2-plan.md

   ⚠️ ไม่ได้ห้าม grid 7 คอลัมน์ทุกกรณี — ห้ามเฉพาะ "กริดเดือน" ที่ดูออกจากการ
   คำนวณช่องเว้นต้นเดือน (getDay ของวันที่ 1) คู่กับ repeat(7, …) ในไฟล์เดียวกัน
   ตารางช่าง×วัน (service/schedule) และบอร์ดผลิตไม่เข้าเงื่อนไขนี้ */

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWED = ["components/ui/MonthGrid.js"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (/\.(js|jsx)$/.test(full)) out.push(full);
  }
  return out;
}

test("กริดปฏิทินรายเดือนมาจาก MonthGrid ที่เดียว", () => {
  const offenders = [];
  for (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file).replaceAll("\\", "/");
    if (ALLOWED.includes(rel)) continue;
    const source = readFileSync(file, "utf8");
    const hasSevenCols = /repeat\(\s*7\s*,/.test(source);
    // ลายเซ็นของ "กริดเดือน": หาช่องเว้นต้นเดือนจากวันที่ 1
    const buildsMonthPad = /new Date\([^)]*,\s*1\s*\)\.getDay\(\)/.test(source);
    if (hasSevenCols && buildsMonthPad) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `ไฟล์เหล่านี้สร้างกริดเดือนเอง — ใช้ MonthGrid แทน: ${offenders.join(", ")}`,
  );
});

test("MonthGrid ถือจังหวะแบบ A: เส้นร่วม ไม่มี gap มุมที่กรอบนอก", () => {
  const css = readFileSync(path.join(srcRoot, "components/ui/MonthGrid.module.css"), "utf8");
  // ห้ามมี gap ใน .grid — เส้นแบ่งมาจาก border ของช่อง (มี gap = เส้นคู่)
  const grid = css.match(/\.grid\s*\{[^}]*\}/)?.[0] ?? "";
  assert.ok(grid, "ไม่พบกฎ .grid");
  assert.ok(!/\bgap\s*:/.test(grid), ".grid ต้องไม่มี gap (แบบ A ใช้เส้นร่วม)");
  // ช่องต้องมีเส้นขวา+บน และไม่มีมุมโค้งของตัวเอง
  const cell = css.match(/\.cell\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(cell, /border-right:/, "ช่องต้องมีเส้นขวา");
  assert.match(cell, /border-top:/, "ช่องต้องมีเส้นบน");
  assert.ok(!/border-radius:/.test(cell), "ช่องต้องไม่มีมุมโค้ง — มุมอยู่ที่ .shell");
  // มุมโค้งอยู่ที่กรอบนอกชั้นเดียว
  const shell = css.match(/\.shell\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(shell, /border-radius:/, ".shell ต้องเป็นตัวถือมุมโค้ง");
});
