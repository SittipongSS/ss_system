import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ระยะห่าง — ตรวจ 2026-07-29: ในไฟล์ CSS มี 1,418 จุด กระจายเป็น **37 ค่า**
   (แทบทุกจำนวนเต็ม 1–28) จึงไม่มีจังหวะร่วมให้ยึด และปรับความโปร่งทั้งระบบไม่ได้

   ⚠️ ต่างจากชั้นพิมพ์/ชั้นซ้อน/จังหวะ ตรงที่ **ระยะห่างคือเลย์เอาต์** ขยับแล้วเห็นทันที
   มติผู้ใช้ 2026-07-30: รอบนี้แปลงเฉพาะจุดที่ตรงกริด 4px อยู่แล้ว (หน้าตาไม่ขยับเลย)
   ส่วนค่านอกกริดอีก ~800 จุดเก็บเป็นหนี้ที่มีเพดาน — การดูดเข้ากริดต้องมีคนเปิดหน้าดู */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

/* ⚠️ ต้องจับ **ทั้งขั้นเต็มและครึ่งขั้น** — regex เดิมเป็น `--space-\d+` จึงมองไม่เห็น
   `--space-0-5` ที่มีขีดคั่น ผลคือเทสต์ "ไม่มีค่าที่ตรงขั้นหลงเหลือ" จะปล่อย 10px ดิบผ่าน
   ทั้งที่มีโทเคนรองรับแล้ว (เจอตอนเพิ่มครึ่งขั้น 2026-07-30) */
const STEPS = new Map(
  [...GLOBALS.matchAll(/^\s*(--space-\d+(?:-5)?):\s*(\d+)px;/gm)].map(([, n, v]) => [n, Number(v)]),
);
/* 🪤 อย่าใช้ `name.endsWith("-5")` แยก — `--space-5` (ขั้นเต็ม 20px) ก็ลงท้ายด้วย "-5"
   เหมือนกัน ต้องเทียบทั้งรูปแบบ */
const FULL = new Map([...STEPS].filter(([n]) => /^--space-\d+$/.test(n)));
const HALF = new Map([...STEPS].filter(([n]) => /^--space-\d+-5$/.test(n)));

function cssFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) out.push(full);
    }
  })(root);
  return out;
}

test("ขั้นเต็มอยู่บนกริด 4px และเรียงจากน้อยไปมาก", () => {
  assert.ok(FULL.size >= 7, `เจอขั้นเต็มแค่ ${FULL.size}`);
  const values = [...FULL.values()];
  for (const [name, value] of FULL) {
    assert.equal(value % 4, 0, `${name} = ${value}px หลุดกริด 4px — ขั้นเต็มต้องเป็นตัวคูณของ 4`);
  }
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] > values[i - 1], "ขั้นต้องเรียงจากน้อยไปมาก");
  }
});

/* ครึ่งขั้น (2026-07-30) — 482 จาก 723 จุดที่เคยเป็นเลขดิบคือ 2·6·10·14·18px ซึ่งเป็น
   *จุดกึ่งกลางของกริด 4px เป๊ะ ๆ* = ระบบเดินจังหวะ 2px มาตั้งแต่ต้น จึงตั้งชื่อให้
   แทนการดันเข้ากริด (รอบก่อนลองดันแล้วขยับจริง 113 จาก 126 element)
   กฎ: ต้องอยู่กึ่งกลางระหว่างขั้นเต็มจริง ๆ ไม่ใช่ค่ามั่วที่มาแอบใช้ชื่อครึ่งขั้น */
test("ครึ่งขั้นอยู่กึ่งกลางของกริด 4px พอดี", () => {
  assert.ok(HALF.size > 0, "ไม่เจอครึ่งขั้นเลย");
  for (const [name, value] of HALF) {
    assert.equal(value % 4, 2,
      `${name} = ${value}px ไม่ได้อยู่กึ่งกลางกริด 4px — ครึ่งขั้นต้องลงท้ายด้วย 2 หรือ 6`);
    const n = Number(name.match(/--space-(\d+)-5/)[1]);
    assert.equal(value, n * 4 + 2,
      `${name} ควรเป็น ${n * 4 + 2}px ตามชื่อ (ขั้น ${n} = ${n * 4}px บวกครึ่งขั้น)`);
  }
});

test("ไม่มีค่าที่ตรงกริดอยู่แล้วหลงเหลือเป็นเลขดิบ", () => {
  /* ค่าที่ *ตรงขั้นเป๊ะ* ต้องใช้โทเคนเสมอ — ถ้าปล่อยไว้ ชั้นนี้จะครอบไม่จริง
     (ค่านอกกริดคนละเรื่อง: นับเป็นหนี้ใน RAW_SPACING_CAP ของ audit:ui) */
  const onGrid = new Set(STEPS.values());
  const offenders = [];
  for (const file of cssFiles()) {
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const decl of source.matchAll(/\b(?:gap|row-gap|column-gap|padding|margin)(?:-(?:top|bottom|left|right|inline|block))?:\s*[^;{}]+;/g)) {
      for (const hit of decl[0].matchAll(/(?<![\d.\-])(\d+)px\b/g)) {
        if (!onGrid.has(Number(hit[1]))) continue;
        const line = source.slice(0, decl.index + hit.index).split(/\r?\n/).length;
        offenders.push(`${path.relative(process.cwd(), file)}:${line} ${hit[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "ค่านี้มีขั้นอยู่แล้ว — ใช้ var(--space-N)");
});

test("เพดานหนี้ระยะห่างยังผูกกับของจริง", () => {
  /* กันเลขเพดานค้างอยู่เกินจริง (หรือมีคนแอบขยับขึ้นเพื่อให้ audit ผ่าน) */
  const audit = fs.readFileSync(path.join(process.cwd(), "scripts", "audit-ui.mjs"), "utf8");
  const cap = Number((audit.match(/const RAW_SPACING_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา RAW_SPACING_CAP ไม่เจอ");

  let actual = 0;
  for (const file of cssFiles()) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    if (!rel.startsWith("src/app/") && !rel.startsWith("src/components/")) continue;
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const decl of source.matchAll(/\b(?:gap|row-gap|column-gap|padding|margin)(?:-(?:top|bottom|left|right|inline|block))?:\s*[^;{}]+;/g)) {
      for (const hit of decl[0].matchAll(/(?<![\d.\-])(\d+)px\b/g)) if (Number(hit[1]) > 0) actual += 1;
    }
  }
  assert.equal(actual, cap,
    `ของจริงเหลือ ${actual} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});
