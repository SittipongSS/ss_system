import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* โทเคนที่ประกาศไว้แล้วไม่มีใครใช้ = ชั้นกลางที่โกหกว่าตัวเองถูกใช้อยู่
   ตรวจ 2026-07-29: 152 โทเคน **ตาย 31 ตัว** รวมทั้งชุด M3 (--surface-* /
   --on-surface*) ที่มีคอมเมนต์สั่งไว้ว่า "ให้ feature CSS ยึดชื่อพวกนี้" แต่ไม่เคยมี
   ใครอ้างสักจุดเดียวตั้งแต่วันที่ประกาศ · ชุด legacy alias อีก 8 ชื่อ ·
   --gantt-line* ที่ประกาศซ้ำ 3 รอบใช้ 0 · --toast-soft ที่ตั้งค่าไว้ 5 ที่แต่ไม่มี
   ใครอ่าน (ตั้งใจให้ toast มีพื้นตามโทน แต่ไม่เคยต่อสาย)

   บทเรียนเดียวกับชั้นพิมพ์: **ห้ามประกาศเผื่อไว้** เพราะคนมาอ่านทีหลังจะเข้าใจผิดว่า
   ชั้นนี้ถูกใช้จริงแล้ว แล้วก็ไปสร้างชื่อของตัวเองขนานกันอีกชุด */

const root = path.join(process.cwd(), "src");

/* หนี้เก่าที่ยังไม่แตะ: เอกสารพิมพ์ประกอบ CSS ของตัวเองใน src/lib/ และธีมของมัน
   ผลิตสตริงโทเคนแบบ generate ทั้งชุด (--doc-accent + -soft + -watermark) แม้จะมี
   สองตัวที่ไม่มีใครอ่าน · แยกเป็นงานของสายเอกสาร ไม่ใช่ design system กลาง
   ⚠️ ห้ามเติมชื่อใหม่เข้าลิสต์นี้เพื่อให้เทสต์ผ่าน */
const KNOWN_DEBT = new Set(["--doc-accent-soft", "--doc-accent-watermark"]);

/* 🪤 โทเคนที่ **Tailwind อ่านเอง** — ไม่มีใครเขียน `var(--x)` แต่ลบไม่ได้
   `--radius-xl` เป็นชื่อในธีมของ Tailwind v4 ที่ขับ utility `rounded-xl` (ใช้ 8 จุด)
   การประกาศทับใน :root คือการตั้งค่าให้ utility นั้น · เคยลบไปแล้วรอบหนึ่งเพราะ
   grep ไม่เจอ แล้วมุมของ 8 จุดหดจาก 16px เหลือ 12px เงียบ ๆ — จับได้ตอนวัดใน
   เบราว์เซอร์เท่านั้น (ค่ายังไม่ว่างหลังลบ = มีอีกชั้นประกาศไว้)
   ⚠️ เติมชื่อเข้าลิสต์นี้ได้เฉพาะเมื่อ **ยืนยันในเบราว์เซอร์แล้ว** ว่าเป็นของ Tailwind */
/* ชื่อที่ **Tailwind อ่านเอง** ไม่มี `var(--x)` ในรีโปให้เจอ — Tailwind ประกอบ utility
   จากชื่อพวกนี้ตอน build ⇒ ตัวตรวจ "โทเคนตายแล้ว" จับไม่ได้ ต้องยกเว้นให้

   `--text-*--line-height` (2026-08-14): ทับค่าตั้งต้นของ Tailwind ที่จูนมาเพื่อละติน
   ทุกขั้นต่ำกว่าเกณฑ์ไทย ⇒ `text-sm` บน `<table>` ส่งอัตรา 1.4286 ให้ลูกทั้งต้นไม้
   สืบทอดแล้วสระบนถูกตัด · ดูเหตุผลเต็มที่บล็อก `@theme` ใน globals.css */
const TAILWIND_CONSUMED = new Set([
  "--radius-xl",
  "--text-xs--line-height",
  "--text-sm--line-height",
  "--text-base--line-height",
  "--text-lg--line-height",
  "--text-xl--line-height",
  "--text-2xl--line-height",
  "--text-3xl--line-height",
  "--text-4xl--line-height",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("ไม่มีโทเคนที่ประกาศไว้แล้วไม่มีใครใช้", () => {
  const sources = walk(root).map((file) => [file, fs.readFileSync(file, "utf8")]);

  const declared = new Map();
  for (const [file, src] of sources) {
    src.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(/^\s*(--[a-z0-9-]+):\s*[^;]+;/i);
      if (m && !declared.has(m[1])) {
        declared.set(m[1], `${path.relative(process.cwd(), file).replaceAll("\\", "/")}:${i + 1}`);
      }
    });
  }

  const dead = [];
  for (const [name, where] of declared) {
    if (KNOWN_DEBT.has(name) || TAILWIND_CONSUMED.has(name)) continue;
    // นับทั้ง var(--x) และการอ้างชื่อผ่านสตริง (getPropertyValue / setProperty)
    const used = sources.some(([, src]) =>
      new RegExp(`var\\(\\s*${name}\\b`).test(src) || new RegExp(`["'\`]${name}["'\`]`).test(src));
    if (!used) dead.push(`${name} (${where})`);
  }

  assert.deepEqual(dead, [],
    "ลบทิ้ง หรือถ้าตั้งใจจะใช้จริงให้ต่อสายในรอบเดียวกัน — โทเคนที่ไม่มีใครใช้ทำให้ชั้นกลางดูใหญ่กว่าที่เป็นจริง");
});

test("หนี้ที่ยกเว้นไว้ต้องยังตายจริง ไม่ใช่ค้างชื่อไว้เกินจริง", () => {
  const sources = walk(root).map((file) => fs.readFileSync(file, "utf8"));
  for (const name of KNOWN_DEBT) {
    const used = sources.some((src) => new RegExp(`var\\(\\s*${name}\\b`).test(src));
    assert.equal(used, false,
      `${name} มีคนใช้แล้ว — เอาออกจาก KNOWN_DEBT (ไม่งั้นลิสต์ยกเว้นจะบวมขึ้นเรื่อย ๆ)`);
  }
});
