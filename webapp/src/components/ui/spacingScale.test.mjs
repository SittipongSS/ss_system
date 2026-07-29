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

const STEPS = new Map(
  [...GLOBALS.matchAll(/^\s*(--space-\d+):\s*(\d+)px;/gm)].map(([, n, v]) => [n, Number(v)]),
);

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

test("ขั้นระยะห่างอยู่บนกริด 4px เรียงจากน้อยไปมาก", () => {
  assert.ok(STEPS.size >= 7, `เจอขั้นแค่ ${STEPS.size}`);
  const values = [...STEPS.values()];
  for (const [name, value] of STEPS) {
    assert.equal(value % 4, 0, `${name} = ${value}px หลุดกริด 4px — ขั้นต้องเป็นตัวคูณของ 4`);
  }
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] > values[i - 1], "ขั้นต้องเรียงจากน้อยไปมาก");
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
