import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const audit = readFileSync(new URL("../../../scripts/audit-ui.mjs", import.meta.url), "utf8");

const tokens = Object.fromEntries(
  [...css.matchAll(/--fw-([\w-]+):\s*(\d+);/g)].map((m) => [m[1], Number(m[2])]),
);

/** น้ำหนักที่โหลดมาจริง — อ่านจาก `@font-face` ใน globals.css
    ⚠️ ย้ายมาจาก layout.js เมื่อ 2026-08-14 ตอนเลิกใช้ `next/font/google` และประกาศ
    `@font-face` เองเพื่อ override ascent/descent ให้คลุมหมึกไทย (ดูคอมเมนต์ที่หัว
    globals.css) — เจตนาของด่านนี้เท่าเดิม: CSS ห้ามสั่งน้ำหนักที่ไม่ได้โหลด
    เพราะเบราว์เซอร์จะปัดไปน้ำหนักอื่นเงียบ ๆ */
function loadedWeights() {
  const faces = [...css.matchAll(/@font-face \{[^}]*?font-weight:\s*(\d+)/gs)];
  assert.ok(faces.length > 0, "อ่าน @font-face จาก globals.css ไม่ได้ — เช็ค selector ของเทสต์");
  return [...new Set(faces.map((m) => Number(m[1])))];
}

test("มีโทเคนน้ำหนักครบและเป็นตัวเลขล้วน", () => {
  assert.deepEqual(Object.keys(tokens).sort(), ["bold", "medium", "normal", "semibold"]);
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(Number.isInteger(value) && value >= 100 && value <= 900, `--fw-${name} = ${value}`);
  }
});

/* 🔴 หัวใจของชั้นนี้ — บั๊กเดิมคือ CSS สั่ง 650/750/800 ทั้งที่ฟอนต์มีแค่ 4 น้ำหนัก
   เบราว์เซอร์ปัดให้เงียบ ๆ (วัดจริง: 650·750·800 กว้างเท่ากับ 700 เป๊ะ) จึงมี 76 จุด
   ที่เขียนไปแล้วไม่มีผล ถ้าไม่ผูกสองไฟล์นี้ไว้ด้วยกัน เรื่องเดิมจะกลับมาทันที */
test("ทุกโทเคนต้องเป็นน้ำหนักที่ layout.js โหลดมาจริง", () => {
  const loaded = loadedWeights();
  assert.ok(loaded.length > 0, "อ่านน้ำหนักจาก layout.js ไม่ได้ — เช็ค selector ของเทสต์");
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(
      loaded.includes(value),
      `--fw-${name}: ${value} ไม่อยู่ในน้ำหนักที่โหลด (${loaded.join(", ")}) — ` +
        "เบราว์เซอร์จะปัดไปน้ำหนักอื่นเงียบ ๆ ต้องเพิ่ม @font-face ใน globals.css ก่อน",
    );
  }
});

/* ⚠️ บล็อก `@font-face` ยกเว้น — descriptor ของ `@font-face` **ต้องเป็นเลขจริง**
   จะเขียน `var(--fw-…)` ไม่ได้ตามสเปก (custom property ใช้ใน @font-face ไม่ได้)
   นี่คือที่เดียวที่เลขน้ำหนักดิบถูกต้อง และ `loadedWeights()` ก็อ่านจากตรงนี้ */
test("ไม่มีน้ำหนักเลขดิบหลงเหลือใน CSS ของแอป", () => {
  const offenders = [];
  let inFontFace = false;
  css.split(/\r?\n/).forEach((line, index) => {
    if (/@font-face\s*\{/.test(line)) inFontFace = true;
    else if (inFontFace && line.trim() === "}") inFontFace = false;
    if (inFontFace) return;
    const hit = line.match(/font-weight:\s*(\d+)/);
    if (hit) offenders.push(`globals.css:${index + 1} → ${hit[0]}`);
  });
  assert.deepEqual(offenders, [], "น้ำหนักต้องมาจาก var(--fw-…)");
});

test("audit:ui บังคับกฎนี้ ไม่ใช่พึ่งคนรีวิว", () => {
  assert.match(audit, /fontWeightViolations/);
  assert.match(audit, /font-weight:\\s\*\(\\d\+\)/);
  assert.match(audit, /fontWeight:/);
});

/* ชื่อโทเคนต้องเรียงตามน้ำหนักจริง ไม่งั้น "semibold หนากว่า bold" ก็ผ่านได้ */
test("ลำดับความหนาเรียงตามชื่อ", () => {
  assert.ok(tokens.normal < tokens.medium, "normal ต้องเบากว่า medium");
  assert.ok(tokens.medium < tokens.semibold, "medium ต้องเบากว่า semibold");
  assert.ok(tokens.semibold < tokens.bold, "semibold ต้องเบากว่า bold");
});
