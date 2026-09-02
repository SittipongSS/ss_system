import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ชั้นพิมพ์คุมแค่ไฟล์ CSS มาตั้งแต่ #800 — ฝั่ง JSX (`style={{ fontSize: 12 }}`)
   ไม่เคยมีกฎเลย ตรวจ 2026-07-29 พบ **758 จุด ใช้โทเคน 0 จุด ใน 20 ค่า** รวมค่าที่
   ไม่มีอยู่ในชั้นเลย (9 · 10 · 13.5 · 17 · 19) = ต่อให้ CSS สะอาดหมดก็ยังแก้ขนาด
   ตัวอักษรทีเดียวทั้งระบบไม่ได้ · รอบนี้ยกมาใช้โทเคนครบ

   เทสต์นี้ล็อกสองอย่าง: โทเคนที่ JSX อ้างต้องมีจริง และขั้นที่ *มีคนใช้เฉพาะฝั่ง JSX*
   ต้องไม่ถูกลบทิ้งตอนใครมาเก็บกวาด CSS (typeScale.test.mjs สแกนแค่ไฟล์ .css) */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

const STEPS = new Map(
  [...GLOBALS.matchAll(/^\s*(--fs-\d+):\s*([\d.]+)px;/gm)].map(([, name, px]) => [name, Number(px)]),
);

function jsFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.js$/.test(entry.name)) out.push(full);
      }
    })(path.join(root, dir));
  }
  /* เดินไฟล์ชุดเดียวกับ `uiFiles` ของ audit-ui.mjs (src/app + src/components) — เอกสาร
     พิมพ์อยู่ใต้ src/lib จึงอยู่นอกขอบเขตโดยโครงสร้าง ไม่ต้องมียามกรองพาธ
     (ลบยามที่ยกเว้น `src/components/documents/` ออก 2026-09-02 · ดูคอมเมนต์หัวลูปที่นั่น) */
  return out;
}

const inlineTokens = () => {
  const used = new Map(); // token -> [file:line]
  for (const file of jsFiles()) {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      for (const [, token] of line.matchAll(/fontSize:\s*"var\((--fs-\d+)\)"/g)) {
        if (!used.has(token)) used.set(token, []);
        used.get(token).push(`${path.relative(process.cwd(), file)}:${index + 1}`);
      }
    });
  }
  return used;
};

test("โทเคนที่ JSX อ้างถึงมีประกาศอยู่จริงทุกตัว", () => {
  const missing = [];
  for (const [token, places] of inlineTokens()) {
    if (!STEPS.has(token)) missing.push(`${token} (${places[0]})`);
  }
  assert.deepEqual(missing, [],
    "โทเคนที่ไม่มีประกาศทำให้ font-size ตกไปใช้ค่าที่สืบทอดมาแบบเงียบ ๆ");
});

test("ไม่เหลือขนาดตัวอักษรเป็นเลขดิบใน JSX", () => {
  const offenders = [];
  for (const file of jsFiles()) {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      for (const hit of line.matchAll(/fontSize:\s*(?:"(\d[\d.]*)px"|'(\d[\d.]*)px'|(\d[\d.]*))(?=\s*[,}])/g)) {
        offenders.push(`${path.relative(process.cwd(), file)}:${index + 1} → ${hit[0]}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "เขียนเลขดิบใน JSX = ชั้นพิมพ์คุมไม่ถึงอีกแล้ว");
});

/* ขั้นที่ถูกใช้เฉพาะฝั่ง JSX จะ "ดูเหมือนไม่มีคนใช้" ถ้ามองแค่ไฟล์ CSS —
   typeScale.test.mjs มีกฎ "ห้ามประกาศขั้นทิ้งไว้โดยไม่มีใครใช้" ซึ่งสแกนแค่ .css
   ถ้าไม่นับฝั่งนี้ด้วย วันหนึ่งจะมีคนลบขั้นที่ JSX ใช้อยู่ออกไปตามกฎนั้น */
test("ขั้นที่ใช้เฉพาะใน JSX ต้องถูกนับว่ามีคนใช้", () => {
  const cssFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) cssFiles.push(full);
    }
  })(root);
  const allCss = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  const jsOnly = [...inlineTokens().keys()].filter((token) => !allCss.includes(`var(${token})`));
  for (const token of jsOnly) {
    assert.ok(STEPS.has(token), `${token} ถูกใช้ใน JSX เท่านั้น และหายไปจาก globals แล้ว`);
  }
});
