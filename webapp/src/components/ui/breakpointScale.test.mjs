import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* จุดตัดจอ — ตรวจ 2026-07-29: ทั้งระบบมี **24 ค่า** รวมคู่ที่ห่างกัน 1–8px
   (760 / 767 / 768) ซึ่งเป็นการพิมพ์ต่างกันมากกว่าเป็นการตัดสินใจ

   🪤 **ชั้นนี้ทำเป็นโทเคนไม่ได้** ต่างจาก --fs-* / --z-* / --motion-* / --space-*
   สเปก CSS ไม่ให้ใช้ custom property ใน media query — `@media (max-width:
   var(--bp-md))` ไม่ทำงาน เพราะ media query ถูกประเมินก่อนที่ตัวแปรจะ resolve
   จึงล็อกที่ **จำนวนค่าที่ต่างกัน** แทนการบังคับให้อ้างตัวแปร */

const root = path.join(process.cwd(), "src");

function cssFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) out.push(full);
    }
  })(root);
  return out.filter((f) => {
    const rel = path.relative(process.cwd(), f).replaceAll("\\", "/");
    return rel.startsWith("src/app/") || rel.startsWith("src/components/");
  });
}

function breakpoints() {
  const values = new Map(); // value -> [file:line]
  for (const file of cssFiles()) {
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    source.split(/\r?\n/).forEach((line, index) => {
      for (const hit of line.matchAll(/@media[^{]*?(?:max|min)-width:\s*(\d+)px/g)) {
        const value = Number(hit[1]);
        if (!values.has(value)) values.set(value, []);
        values.get(value).push(`${path.relative(process.cwd(), file)}:${index + 1}`);
      }
    });
  }
  return values;
}

test("จำนวนค่าจุดตัดจอไม่เกินเพดาน และเพดานผูกกับของจริง", () => {
  const audit = fs.readFileSync(path.join(process.cwd(), "scripts", "audit-ui.mjs"), "utf8");
  const cap = Number((audit.match(/const BREAKPOINT_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา BREAKPOINT_CAP ไม่เจอ");
  const actual = breakpoints().size;
  assert.equal(actual, cap,
    `ของจริงมี ${actual} ค่า แต่เพดานเขียน ${cap} — เพิ่มค่าใหม่ห้าม · ยุบได้แล้วให้รูดเพดานลง`);
});

test("ไม่มีคู่จุดตัดจอที่ห่างกันไม่เกิน 8px", () => {
  /* ค่าที่ห่างกัน ≤8px แทบไม่มีทางเป็นการตัดสินใจคนละครั้งโดยตั้งใจ — ของจริงที่เจอ
     คือ 760 / 767 / 768 ปนกันอยู่ในระบบเดียว (ยุบเหลือ 768 แล้ว) */
  const values = [...breakpoints().keys()].sort((a, b) => a - b);
  const tooClose = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] - values[i - 1] <= 8) tooClose.push(`${values[i - 1]}px กับ ${values[i]}px`);
  }
  assert.deepEqual(tooClose, [],
    "ห่างกันเท่านี้คือพิมพ์ต่างกัน ไม่ใช่ตั้งใจ — เลือกค่าเดียว");
});

test("ค่าที่ระบบใช้เยอะสุดยังอยู่ครบ", () => {
  /* แปดค่านี้คือชุดที่คอมเมนต์ใน globals.css บอกให้ของใหม่หยิบไปใช้ —
     ถ้าตัวใดหายไปแปลว่ามีคนย้ายจุดตัดโดยไม่ได้อัปเดตคำแนะนำตรงนั้น */
    const values = breakpoints();
  for (const value of [480, 560, 640, 680, 768, 900, 1000, 1200]) {
    assert.ok(values.has(value), `${value}px หายไปจากระบบ — อัปเดตรายการแนะนำใน globals.css ด้วย`);
  }
});
