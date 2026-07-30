import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/* ค่าโทเคนแยกตามธีม — ธีมสว่างอยู่ใน :root ธีมมืดอยู่ใน [data-theme="dark"] { … }
   ⚠️ ต้องตัดคอมเมนต์ก่อนค้น ไม่งั้นไปเจอสตริง `[data-theme="dark"]` ที่เขียนอยู่ใน
   คอมเมนต์อธิบาย แล้วตัดบล็อกผิดที่ (เจอจริงตอนเขียนเทสต์นี้)
   และต้องหา `{` ที่เป็น *ตัวเปิดบล็อกกฎ* คือ `[data-theme="dark"] {` ตรง ๆ */
const CSS = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

function shadowTokens(scope) {
  const start = scope === "dark" ? CSS.indexOf('[data-theme="dark"] {') : CSS.indexOf(":root");
  assert.notEqual(start, -1, `หาบล็อกของธีม ${scope} ไม่เจอ`);
  const block = CSS.slice(start, CSS.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--shadow-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const light = shadowTokens("light");
const dark = shadowTokens("dark");

test("ขั้นเงามีครบทั้งสองธีม", () => {
  for (const name of ["sm", "md", "lg", "float"]) {
    assert.ok(light[name], `ธีมสว่างไม่มี --shadow-${name}`);
    assert.ok(dark[name], `ธีมมืดไม่มี --shadow-${name}`);
  }
});

/* 🐛 ที่มาของ --shadow-float (2026-07-30): แผงลอยสามตัวอยู่ในสัญญาเดียวกัน
   (audit บังคับ --panel-float เหมือนกันหมด) แต่เขียนเงาเองคนละแบบ —
   .ui-filter-popover กับ .ui-time-menu ไม่มีเงาสำหรับธีมมืด ทำให้บนพื้นเข้ม
   เงาเกือบดำมองไม่เห็น = แผงแบนราบ ขณะที่ .ui-select-menu ถูกแก้ไปแล้วตัวเดียว */
test("ธีมมืดต้องมีเงาของตัวเอง ไม่ใช้ค่าธีมสว่าง", () => {
  for (const name of ["sm", "md", "lg", "float"]) {
    assert.notEqual(dark[name], light[name],
      `--shadow-${name} ธีมมืดเท่ากับธีมสว่าง — เงาสีเข้มบนพื้นเข้มจะมองไม่เห็น`);
  }
});

test("แผงลอยทุกตัวใช้ --shadow-float ตัวเดียวกัน ไม่เขียนเงาเอง", () => {
  const css = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const selector of [".ui-select-menu", ".ui-filter-popover", ".ui-time-menu"]) {
    const start = css.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `หา rule ${selector} ไม่เจอ`);
    const rule = css.slice(start, css.indexOf("}", start));
    assert.match(rule, /box-shadow:\s*var\(--shadow-float\)/,
      `${selector} ต้องรับเงาจากโทเคนกลาง`);
  }
  /* override ธีมมืดรายตัวต้องไม่กลับมา — โทเคนรู้จักธีมเองแล้ว */
  assert.doesNotMatch(css, /\[data-theme="dark"\]\s*\.ui-select-menu\s*\{[^}]*box-shadow/,
    "โทเคนคุมธีมให้แล้ว ไม่ต้องเขียน [data-theme] ทับรายตัว");
});

/* 🪤 เหมือน --radius-*: Tailwind v4 อ่าน namespace นี้เองแล้วทำ utility shadow-* */
test("โทเคนที่ utility shadow-* ใช้อยู่ ต้องยังประกาศไว้ครบ", () => {
  const used = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(full)) continue;
      for (const m of readFileSync(full, "utf8").matchAll(/(?:^|["'\s`])shadow-([a-z]+)(?![\w-])/g)) {
        used.add(m[1]);
      }
    }
  };
  walk(srcRoot);
  for (const suffix of used) {
    assert.ok(suffix in light,
      `JSX ใช้ \`shadow-${suffix}\` แต่ไม่มี --shadow-${suffix} — utility จะตกไปใช้ค่าเริ่มต้นของ Tailwind`);
  }
});

test("audit:ui มีเพดานเงาที่เขียนเอง และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /RAW_SHADOW_CAP/);
  assert.match(AUDIT, /rawShadowCount > RAW_SHADOW_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawShadowCount < RAW_SHADOW_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});
