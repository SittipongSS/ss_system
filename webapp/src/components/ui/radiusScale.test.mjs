import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const tokens = Object.fromEntries(
  [...GLOBALS.matchAll(/--radius(-[\w-]+)?:\s*([0-9]+)px;/g)].map((m) => [m[1] || "", Number(m[2])]),
);

test("ขั้นความมนมุมมีครบและเรียงจากคมไปมน", () => {
  assert.deepEqual(Object.keys(tokens).sort(), ["", "-full", "-lg", "-md", "-xl"].sort());
  const order = ["", "-md", "-lg", "-xl", "-full"];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(tokens[order[i - 1]] < tokens[order[i]],
      `--radius${order[i - 1]} ต้องคมกว่า --radius${order[i]}`);
  }
});

/* 🪤 กับดักที่เคยเสียเวลาไปแล้ว — Tailwind v4 อ่าน namespace `--radius-*` เองแล้วเอาไป
   ทำ utility `rounded-*` ครั้งก่อนลบ `--radius-xl` เพราะ "ไม่มีใครเขียน var() เลย"
   แล้วมุมของ 8 จุดหดจาก 16px เหลือ 12px เงียบ ๆ (utility ตกไปใช้ค่าเริ่มต้นของ Tailwind)

   แปลว่าโทเคนพวกนี้ทำงานสองทางพร้อมกัน: `var(--radius-lg)` ใน CSS และ `rounded-lg`
   ใน JSX ชี้ค่าเดียวกัน — ดีเพราะมีแหล่งเดียว แต่ **ห้ามเพิ่ม/ลบ/เปลี่ยนชื่อ**
   โดยไม่วัดผลของ utility ด้วย */
test("โทเคนที่ utility ของ Tailwind ใช้อยู่ ต้องยังประกาศไว้ครบ", () => {
  const used = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(full)) continue;
      for (const m of readFileSync(full, "utf8").matchAll(/(?:^|["'\s`])rounded(-[a-z]+)?(?![\w-])/g)) {
        used.add(m[1] || "");
      }
    }
  };
  walk(srcRoot);

  assert.ok(used.size > 0, "ไม่เจอ utility rounded-* เลย — เช็ค regex ของเทสต์");
  for (const suffix of used) {
    assert.ok(
      suffix in tokens,
      `JSX ใช้ \`rounded${suffix}\` แต่ไม่มี --radius${suffix} ประกาศไว้ — ` +
        "utility จะตกไปใช้ค่าเริ่มต้นของ Tailwind แทนค่าของระบบ (เคยเกิดกับ --radius-xl)",
    );
  }
});

test("audit:ui มีเพดานเลขดิบ และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /RAW_RADIUS_CAP/);
  assert.match(AUDIT, /rawRadiusCount > RAW_RADIUS_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawRadiusCount < RAW_RADIUS_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});

/* ค่าที่ตรงขั้นเป๊ะต้องไม่หลงเหลือเป็นเลขดิบ — พวกนี้ไม่มีเหตุผลให้เขียนเอง */
test("ไม่มีค่าที่ตรงขั้นเป๊ะหลงเหลือเป็นเลขดิบ", () => {
  const exact = new Map(Object.entries(tokens).map(([k, v]) => [`${v}px`, `--radius${k}`]));
  exact.set("999px", "--radius-full"); // ย่อตาม scale factor เท่ากับ 9999px
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!full.endsWith(".css")) continue;
      const rel = path.relative(srcRoot, full).replaceAll("\\", "/");
      if (rel.startsWith("components/documents/")) continue;
      const css = readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const hit of css.matchAll(/border-radius:\s*([^;{}]+)/g)) {
        const value = hit[1].trim();
        if (exact.has(value)) offenders.push(`${rel} → ${value} (ใช้ var(${exact.get(value)}))`);
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(offenders, []);
});
