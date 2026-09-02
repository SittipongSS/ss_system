import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");
const CSS = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = Object.fromEntries(
  [...CSS.matchAll(/--ls-([\w-]+):\s*(-?[0-9.]+)em;/g)].map((m) => [m[1], Number(m[2])]),
);

/* 📅 2026-09-02 เพิ่ม `table-head` — ยกมาจาก `.025em` ที่ Table.module.css ตอนทำ
   หัวตารางเรียงลำดับ (SortTh) เพราะปุ่มในเซลล์ต้อง `letter-spacing: inherit` รับช่วง
   ค่านั้นลงไป (UA ตั้ง `normal` ทับให้ควบคุมฟอร์มทุกตัว สายสืบทอดจึงขาดตรงปุ่ม)
   ⇒ ค่ามีชื่อแล้ว อ่านออกว่าปุ่มกำลังรับอะไรมา ไม่ใช่เลขลอยที่แก้ฝั่งเดียวแล้วอีกฝั่งไม่รู้ */
test("มีขั้นระยะห่างตัวอักษรครบ", () => {
  assert.deepEqual(Object.keys(tokens).sort(), ["heading", "label", "table-head", "tabular"]);
});

/* ⭐ กฎที่สำคัญที่สุดของชั้นนี้ — หน่วยต้องเป็น em
   px ไม่ขยับตามขนาดตัวอักษร ป้ายเดียวกันที่ใช้ --fs-1 กับ --fs-5 จะได้ระยะห่าง
   ต่างกันทันทีถ้าเขียนเป็น px ทำให้ "ป้ายเล็กดูโปร่ง ป้ายใหญ่ดูแน่น" โดยไม่ตั้งใจ */
test("โทเคนทุกตัวเป็นหน่วย em ไม่ใช่ px", () => {
  for (const name of Object.keys(tokens)) {
    assert.match(CSS, new RegExp(`--ls-${name}:\\s*-?[0-9.]+em;`),
      `--ls-${name} ต้องเป็น em — px ไม่ขยับตามขนาดตัวอักษร`);
  }
});

test("ไม่มี letter-spacing หน่วยคงที่หลงเหลือในแอป", () => {
  const offenders = [];
  CSS.split(/\r?\n/).forEach((line, index) => {
    const hit = line.match(/letter-spacing:\s*([^;}]+)/);
    if (hit && /[0-9.]\s*(?:px|pt|rem)\b/.test(hit[1])) {
      offenders.push(`globals.css:${index + 1} → ${hit[1].trim()}`);
    }
  });
  assert.deepEqual(offenders, []);
});

/* ทิศทางต้องถูก: หัวเรื่องบีบเข้า (ติดลบ) · ป้ายเล็กคลี่ออก (บวก)
   ถ้ามีคนสลับค่ากันโดยไม่ตั้งใจ หน้าตาจะเพี้ยนแบบที่หาสาเหตุยาก */
test("ทิศทางของแต่ละขั้นถูกต้อง", () => {
  assert.ok(tokens.heading < 0, "หัวเรื่องใหญ่ต้องบีบเข้า (ค่าติดลบ)");
  assert.ok(tokens.tabular < 0, "ตัวเลขคอลัมน์ตรงต้องบีบเข้าเล็กน้อย");
  assert.ok(tokens.heading < tokens.tabular, "หัวเรื่องบีบแน่นกว่าตัวเลข");
  assert.ok(tokens.label > 0, "ป้ายตัวเล็กพิมพ์ใหญ่ต้องคลี่ออก (ค่าบวก)");
  assert.ok(tokens["table-head"] > 0, "หัวคอลัมน์ต้องคลี่ออก (ตัวหนาตัวเล็ก เกยกันง่าย)");
  assert.ok(tokens["table-head"] < tokens.label,
    "หัวคอลัมน์คลี่ *น้อยกว่า* ป้ายพิมพ์ใหญ่มาก — หัวตารางเป็นตัวพิมพ์ปกติ ไม่ใช่ eyebrow\n"
    + "สลับสองค่านี้เมื่อไหร่ หัวตารางทั้งระบบจะกางออกจนอ่านเป็นป้ายแทนที่จะเป็นหัวคอลัมน์");
});

test("audit:ui บังคับทั้งเพดานและหน่วย", () => {
  assert.match(AUDIT, /RAW_LETTER_SPACING_CAP/);
  assert.match(AUDIT, /rawLetterSpacingCount > RAW_LETTER_SPACING_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawLetterSpacingCount < RAW_LETTER_SPACING_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
  assert.match(AUDIT, /letterSpacingUnitViolations/, "หน่วยคงที่ต้องเป็นข้อห้าม ไม่ใช่เพดาน");
});
