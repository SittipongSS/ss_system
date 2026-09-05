import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");
const CSS = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = Object.fromEntries(
  [...CSS.matchAll(/--op-([\w-]+):\s*([0-9.]+);/g)].map((m) => [m[1], Number(m[2])]),
);

const ruleOf = (selector) => {
  const start = CSS.indexOf(`\n${selector} {`) !== -1
    ? CSS.indexOf(`\n${selector} {`)
    : CSS.indexOf(`\n${selector}{`);
  assert.notEqual(start, -1, `หา rule ${selector} ไม่เจอ`);
  return CSS.slice(start, CSS.indexOf("}", start));
};

test("มีขั้นความจางครบและอยู่ในช่วงที่สมเหตุสมผล", () => {
  assert.deepEqual(Object.keys(tokens).sort(), ["disabled", "muted"]);
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(value > 0 && value < 1, `--op-${name} = ${value} ต้องอยู่ระหว่าง 0 กับ 1`);
  }
});

/* ⭐ สองชื่อนี้ต่างกันโดยเจตนา ไม่ใช่ค่าที่ลืมยุบ:
   ปุ่มที่กดไม่ได้จางได้เต็มที่ แต่ช่องกรอกที่ถูกล็อกยังต้องอ่านค่าข้างในออก
   ถ้าวันหนึ่งมีคนยุบสองค่านี้ให้เท่ากัน เทสต์นี้จะบังคับให้ตัดสินใจอย่างตั้งใจ */
test("ปิดใช้งานต้องจางกว่าเนื้อหาที่แค่ลดความเด่น", () => {
  assert.ok(tokens.disabled < tokens.muted,
    `--op-disabled (${tokens.disabled}) ต้องจางกว่า --op-muted (${tokens.muted}) — ` +
      "ช่องที่ล็อกยังต้องอ่านค่าออก ส่วนปุ่มที่กดไม่ได้ไม่ต้อง");
});

test("ตัวควบคุมหลักรับความจางจากโทเคน ไม่เขียนเลขเอง", () => {
  for (const selector of [".btn:disabled", ".btn-icon:disabled"]) {
    assert.match(ruleOf(selector), /opacity:\s*var\(--op-disabled\)/,
      `${selector} ต้องหยิบขั้นจากโทเคน`);
  }
  /* ช่องกรอกที่ถูกล็อกใช้ --op-muted เพราะยังต้องอ่านค่าข้างในออก */
  assert.match(ruleOf(".premium-input:disabled"), /opacity:\s*var\(--op-muted\)/);
});

test("audit:ui มีเพดานความจางเลขดิบ และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /RAW_OPACITY_CAP/);
  assert.match(AUDIT, /rawOpacityCount > RAW_OPACITY_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawOpacityCount < RAW_OPACITY_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
  /* 0 กับ 1 ต้องไม่ถูกนับ ไม่งั้น keyframes ทุกอันกลายเป็นหนี้ */
  assert.match(AUDIT, /number === 0 \|\| number === 1/);
});

/* ── RAW_OPACITY_CAP เป็นของฝั่ง CSS ล้วนตั้งแต่ 2026-09-05 ────────────────────
   ก่อนหน้านี้ regex ตัวเดียวคาบสองผิวแบบนับไม่ครบทั้งคู่ — บรรทัดรายงานของ audit
   เขียนสารภาพไว้เองว่า "อีก 21 จุดของ style object ยังหลุด" · รอบนี้แยกเป็นสองตัวนับ
   (ฝั่ง style object อยู่ที่ inlineScaleSurface.test.mjs · RAW_OPACITY_JSX_CAP)

   🪤 และเพดานตัวนี้ **ไม่เคยมีเทสต์ผูกกับของจริงเลย** — มีแค่ assert ว่ากฎยังอยู่
   ⇒ เลข 12 ที่ค้างมาจึงไม่มีใครรู้ว่าตรงหรือไม่ (ของจริงคือ 9) · เทสต์ข้างล่างปิดช่องนั้น
   ด้วยกติกาเดียวกับ spacingScale/utilityTypeScale: นับเองแล้วเทียบเลขตรง ๆ */
const CSS_OPACITY = /(?:^|[;{])\s*opacity:\s*([^;}]+)/g;

function cssFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".css")) out.push(full);
      }
    })(path.join(process.cwd(), "src", dir));
  }
  return out;
}

function rawCssOpacity() {
  const found = [];
  for (const file of cssFiles()) {
    /* audit ใช้ withoutBlockComments() (ลบทิ้ง ไม่คงเลขบรรทัด) — ที่นี่นับจำนวนอย่างเดียว
       จึงตัดแบบเดียวกันพอ ไม่ต้องคงเลขบรรทัด */
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const hit of source.matchAll(CSS_OPACITY)) {
      const value = hit[1].trim();
      if (value.includes("var(")) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0 || number === 1) continue;
      found.push(`${path.relative(process.cwd(), file)} → ${value}`);
    }
  }
  return found;
}

test("regex นับความจางฝั่ง CSS ต้องเป็นตัวเดียวกับใน audit-ui.mjs", () => {
  assert.ok(AUDIT.includes(CSS_OPACITY.source),
    `audit-ui.mjs ไม่มี regex ตัวนี้แล้ว: ${CSS_OPACITY.source}`);
});

/* ยามนามสกุลไฟล์คือสิ่งเดียวที่แยกสองผิวออกจากกัน (`opacity` สะกดเหมือนกันเป๊ะ
   ทั้ง CSS และ style object ต่างจาก borderRadius/boxShadow/letterSpacing)
   ⇒ ถ้ายามหาย ทั้งสองตัวนับจะทับกันแล้วเพดานโป่งพร้อมกันโดยของจริงไม่ขยับ */
test("ตัวนับฝั่ง CSS ต้องถูกกันไว้ให้เห็นเฉพาะไฟล์ .css", () => {
  const at = AUDIT.indexOf("rawOpacityCount += 1;");
  assert.ok(at > 0, "หาตัวนับ rawOpacityCount ไม่เจอ");
  const before = AUDIT.slice(Math.max(0, at - 900), at);
  assert.match(before, /if \(rel\.endsWith\("\.css"\)\) \{/,
    "ตัวนับฝั่ง CSS หลุดยาม .css แล้ว — จะกวาดผิว style object มานับซ้ำกับ RAW_OPACITY_JSX_CAP");
});

test("เพดาน RAW_OPACITY_CAP ยังผูกกับของจริง (ฝั่ง CSS ล้วน)", () => {
  const cap = Number((AUDIT.match(/const RAW_OPACITY_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา RAW_OPACITY_CAP ไม่เจอ");
  const found = rawCssOpacity();
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)\n${found.join("\n")}`);
});
