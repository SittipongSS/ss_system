import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUDIT = readFileSync(path.join(root, "scripts", "audit-ui.mjs"), "utf8");
const TABLE_CSS = readFileSync(path.join(srcRoot, "components", "ui", "Table.module.css"), "utf8");

/* `family="matrix"` ไม่ใช่แค่ป้ายชื่อ — มันตรึงคอลัมน์แรกไว้ (sticky + พื้นทึบ)
   ตารางธรรมดาที่เผลอใส่จะได้คอลัมน์แรกแช่แข็งโดยไม่มีใครสั่ง และเห็นเฉพาะตอน
   เลื่อนแนวนอนเท่านั้น = บั๊กที่หาสาเหตุยาก
   (กฎนี้ Codex เขียนไว้ในสาขา table-visual-parity ยกมาเขียนใหม่บนฐานปัจจุบัน) */

function allowlist() {
  const block = AUDIT.slice(
    AUDIT.indexOf("const MATRIX_FAMILY_ALLOWLIST"),
    AUDIT.indexOf("]);", AUDIT.indexOf("const MATRIX_FAMILY_ALLOWLIST")),
  );
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function filesUsingMatrix() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(full) || /\.test\./.test(full)) continue;
      const text = readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const hits = [...text.matchAll(/<Table(?:Scroll|Shell)\b[^>]*\bfamily=["']matrix["']/g)];
      if (hits.length) out.push({ rel: path.relative(root, full).replaceAll("\\", "/"), count: hits.length });
    }
  };
  walk(srcRoot);
  return out;
}

test("matrix ยังหมายถึงคอลัมน์แรกแช่แข็งจริง ไม่ใช่ชื่อลอย ๆ", () => {
  /* ถ้าวันหนึ่งมีคนถอด sticky ออก กฎทั้งข้อจะไม่มีความหมาย — ตรึงไว้ก่อน */
  assert.match(TABLE_CSS, /\.scroll\[data-family="matrix"\][\s\S]{0,200}position: sticky/,
    "matrix ไม่ได้ตรึงคอลัมน์แรกแล้ว — ทบทวนว่ากฎนี้ยังจำเป็นไหม");
});

test("audit:ui บังคับลิสต์ ไม่ใช่พึ่งคนรีวิว", () => {
  assert.match(AUDIT, /MATRIX_FAMILY_ALLOWLIST/);
  assert.match(AUDIT, /matrixFamilyViolations/);
});

test("ทุกไฟล์ที่ใช้ matrix อยู่ในลิสต์", () => {
  const allowed = new Set(allowlist());
  const offenders = filesUsingMatrix().filter((f) => !allowed.has(f.rel));
  assert.deepEqual(offenders.map((f) => `${f.rel} (${f.count} จุด)`), [],
    "ตารางใหม่ขอคอลัมน์แรกแช่แข็ง — ถ้าตั้งใจจริงให้เพิ่มเข้าลิสต์พร้อมเหตุผล");
});

/* ลิสต์ยกเว้นต้องไม่บวมและไม่เน่า — แพตเทิร์นเดียวกับ UNRESOLVED ของ controlHeight
   และ OFF_SCALE ของ breakpointScale */
test("ลิสต์ไม่ค้างชื่อไฟล์ที่เลิกใช้ matrix แล้ว", () => {
  const using = new Set(filesUsingMatrix().map((f) => f.rel));
  const stale = allowlist().filter((rel) => !using.has(rel));
  assert.deepEqual(stale, [],
    "ไฟล์พวกนี้ไม่ได้ใช้ matrix แล้ว — เอาออกจากลิสต์ ไม่งั้นลิสต์จะบวมขึ้นเรื่อย ๆ");
});
