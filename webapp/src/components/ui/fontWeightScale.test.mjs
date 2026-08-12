import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../app/layout.js", import.meta.url), "utf8");
const audit = readFileSync(new URL("../../../scripts/audit-ui.mjs", import.meta.url), "utf8");

const tokens = Object.fromEntries(
  [...css.matchAll(/--fw-([\w-]+):\s*(\d+);/g)].map((m) => [m[1], Number(m[2])]),
);

/** น้ำหนักที่ next/font โหลดมาจริง — อ่านชื่อฟอนต์จาก import ไม่ผูกกับชื่อใดชื่อหนึ่ง
    (ของเดิมฮาร์ดโค้ด `IBM_Plex_Sans_Thai(` แล้วพังตอนเปลี่ยนเป็น Sarabun 2026-08-13) */
function loadedWeights() {
  const imported = layout.match(/import\s*\{\s*([\w]+)\s*\}\s*from\s*["']next\/font\/google["']/);
  assert.ok(imported, "อ่านชื่อฟอนต์จาก layout.js ไม่ได้ — เช็ค selector ของเทสต์");
  const block = layout.slice(layout.indexOf(`${imported[1]}(`));
  const list = block.slice(block.indexOf("weight:"), block.indexOf("]", block.indexOf("weight:")));
  return [...list.matchAll(/'(\d+)'|"(\d+)"/g)].map((m) => Number(m[1] ?? m[2]));
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
        "เบราว์เซอร์จะปัดไปน้ำหนักอื่นเงียบ ๆ ต้องเพิ่มใน layout.js ก่อน",
    );
  }
});

test("ไม่มีน้ำหนักเลขดิบหลงเหลือใน CSS ของแอป", () => {
  const offenders = [];
  css.split(/\r?\n/).forEach((line, index) => {
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
