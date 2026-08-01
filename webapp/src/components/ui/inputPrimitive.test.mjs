import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEAD_CLASSES } from "../../../scripts/uiDeadClasses.mjs";
import { METRICS, PATTERNS } from "../../../scripts/uiLegacyBudget.mjs";

/* ปุ่มมี primitive + ratchet มาตั้งแต่ #761/#762 แต่ช่องกรอกไม่เคยมีทั้งสองอย่าง
   ทั้งที่ใช้พอกัน — ตรวจ 2026-07-29 พบคลาสดิบ `premium-input` 224 จุด + `premium-select`
   43 จุด และไม่มีอะไรกันไม่ให้เพิ่ม เทสต์นี้ล็อกโครงไว้ทั้งสามด้าน:
   ตัว primitive · ตัวนับที่กันของใหม่ · สถานะที่เคยเป็นคลาสตาย */

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const INPUT = src("./Input.js");
const GLOBALS = src("../../app/globals.css");

test("Input เป็นที่เดียวที่ประกอบคลาส premium-input", () => {
  assert.match(INPUT, /"premium-input"/);
  for (const [prop, cls] of [["mono", "mono"], ["combo", "combo"], ["invalid", "is-invalid"]]) {
    assert.match(INPUT, new RegExp(`${prop} \\? "${cls}"`), `Input ต้องรู้จัก ${prop}`);
  }
  // <select> มี primitive ของตัวเอง (Select.js) ที่ไม่ใช่ <select> จริงด้วยซ้ำ
  assert.doesNotMatch(INPUT, /premium-select/,
    "Input ห้ามรู้จักคลาสของดรอปดาวน์ — ของนั้นอยู่ที่ Select.js");
  // ต้องส่ง ref ต่อได้ ไม่งั้นฟอร์มที่ต้อง focus ช่องแรกใช้ไม่ได้
  assert.match(INPUT, /forwardRef/);
});

test("สถานะกรอกผิดมี selector อยู่จริงใน globals", () => {
  /* เดิมหน้าต้นแบบเขียน `premium-input error` โชว์ "ช่องที่ผิดพลาด" แต่ `.error`
     ไม่มี selector เลย = ช่องนั้นหน้าตาเหมือนช่องปกติเป๊ะมาตลอด */
  assert.match(GLOBALS, /\.premium-input\.is-invalid\s*\{/,
    "ไม่มีนิยามของสถานะกรอกผิด — <Input invalid> จะไม่เปลี่ยนหน้าตาอะไรเลย");
  assert.match(GLOBALS, /\.premium-input\.is-invalid:focus\s*\{/,
    "ตอนโฟกัสต้องคงสีแดงไว้ ไม่งั้นวงโฟกัสสีแบรนด์จะกลบสถานะผิดพลาด");
  assert.equal(/(^|[^-\w])\.error\s*[,{]/m.test(GLOBALS), false,
    "อย่าเพิ่ม `.error` กลับมา — modifier ของระบบนี้ขึ้นต้นด้วย `is-` เสมอ");
});

test("audit:ui จับ premium-input+error ได้ทุกลำดับคลาส", () => {
  const flags = (code) => DEAD_CLASSES.some(({ pattern }) => pattern.test(code));
  for (const dead of [
    'className="premium-input error"',
    'className="error premium-input"',
    'className="premium-input w-full error"',
  ]) {
    assert.ok(flags(dead), `ต้องจับ ${dead} ได้`);
  }
  for (const alive of [
    'className="premium-input is-invalid"',
    'className="premium-input w-full"',
    'className="premium-input mono"',
  ]) {
    assert.equal(flags(alive), false, `${alive} มี selector จริง ห้ามฟ้อง`);
  }
});

test("ratchet มีตัวนับช่องกรอก และไม่นับคลาสที่ไม่มีปลายทาง", () => {
  assert.ok(METRICS.includes("rawInputClass"),
    "ไม่มี metric = เขียน premium-input เพิ่มได้เรื่อย ๆ โดยไม่มีอะไรฟ้อง (ปุ่มมีมาตั้งแต่ #761)");
  const count = (code) => (code.match(new RegExp(PATTERNS.rawInputClass.source, "g")) || []).length;
  assert.equal(count('className="premium-input w-full"'), 1);
  assert.equal(count('className="premium-select compact"'), 1);
  /* .textarea-premium เคยยกเว้นไว้เพราะไม่มี primitive ให้ย้ายไป — ตั้งแต่มี
     Textarea.js (variant="data") จึงนับได้แล้ว ไม่งั้นคลาสนั้นเขียนเพิ่มได้ฟรี */
  assert.equal(count('className="textarea-premium"'), 1);
});
