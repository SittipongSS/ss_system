import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
