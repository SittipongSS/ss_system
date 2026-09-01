import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ชั้นพิมพ์รูที่สาม: `className="text-[13px]"` (Tailwind arbitrary value)

   typeScale.test.mjs คุมไฟล์ .css · inlineTypeScale.test.mjs คุม `style={{ fontSize }}`
   ฝั่ง JSX · แต่ขนาดที่เขียนลง className ไม่เคยมีด่านไหนเห็นเลย ⇒ `npm run audit:ui`
   พิมพ์ "Type-scale violations: 0" มาตลอดทั้งที่ตรวจ 2026-09-01 พบ **152 จุด 27 ไฟล์**
   (11px ×92 · 10px ×42 · 12px ×10 · 13px ×7 · 22px ×1)

   ⚠️ แยกไฟล์ตามที่เคยทำตอนขยายจาก CSS ไป JSX — ไม่แก้เทสต์เดิมให้กว้างขึ้น เพราะ
   สามรูปนี้เขียนคนละภาษา ตัดคอมเมนต์คนละแบบ และยกเข้าโทเคนคนละงบประมาณ
   ถ้ายัดรวมไฟล์เดียว วันที่รูใดรูหนึ่งปิดหมด อีกสองรูจะพลอยถูกลบกฎไปด้วย */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
const AUDIT = fs.readFileSync(path.join(process.cwd(), "scripts", "audit-ui.mjs"), "utf8");

const STEPS = new Map(
  [...GLOBALS.matchAll(/^\s*(--fs-\d+):\s*([\d.]+)px;/gm)].map(([, name, px]) => [name, Number(px)]),
);

/* ต้องเดินไฟล์ชุดเดียวกับ `uiFiles` ของ audit-ui.mjs เป๊ะ ๆ (.js และ .css ใต้
   src/app + src/components) ไม่งั้นเลขที่นับได้จะไม่มีวันตรงกับเพดาน */
function uiFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:js|css)$/.test(entry.name)) out.push(full);
      }
    })(path.join(root, dir));
  }
  return out;
}

const rel = (file) => path.relative(process.cwd(), file).replaceAll("\\", "/");
/* audit-ui.mjs เรียก withoutBlockComments() ตัดคอมเมนต์บล็อกทิ้งก่อนนับเสมอ — ที่นี่
   ต้องตัดแบบเดียวกัน ไม่งั้นจะเกินไป 1 เพราะ src/components/ui/Input.js มีคอมเมนต์
   ที่เขียนอธิบายรูนี้ไว้ล่วงหน้าแล้วหนึ่งจุด (นับเป็นคำอธิบาย ไม่ใช่โค้ดจริง) */
const withoutBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
/* ⚠️ ต้องเป็น regex ตัวเดียวกับใน audit-ui.mjs เป๊ะ ๆ ไม่งั้นเลขที่นับได้จะไม่ตรงเพดาน
   `(?:length:)?` ไม่ใช่ของแถม — `text-[length:13px]` คอมไพล์เป็น font-size: 13px
   เหมือน `text-[13px]` ทุกประการ ถ้าไม่รับไว้ ด่านจะมีประตูหลังที่เติมคำเดียวก็ผ่าน */
const RAW_UNIT = /\btext-\[\s*(?:length:\s*)?[0-9.]+\s*(?:px|pt|rem|em|ch|ex|cm|mm|in|pc|%)\s*\]/g;

function offenders() {
  const found = [];
  for (const file of uiFiles()) {
    const name = rel(file);
    if (name.startsWith("src/components/documents/")) continue;
    withoutBlockComments(fs.readFileSync(file, "utf8")).split(/\r?\n/).forEach((line, index) => {
      for (const hit of line.matchAll(RAW_UNIT)) found.push(`${name}:${index + 1} → ${hit[0]}`);
    });
  }
  return found;
}

test("audit:ui มีเพดานขนาดตัวอักษรดิบใน className และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /RAW_TAILWIND_TYPE_CAP/);
  assert.match(AUDIT, /rawTailwindTypeCount > RAW_TAILWIND_TYPE_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawTailwindTypeCount < RAW_TAILWIND_TYPE_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});

/* สองแหล่งต้องพูดตรงกัน — ถ้า regex สองฝั่งหลุดจากกัน เลขที่นับได้จะไม่ตรงเพดานแล้ว
   เทสต์ข้างล่างจะตกด้วยข้อความ "รูดเพดานลง" ซึ่ง *ชี้ผิดที่* คนแก้จะไปรูดเพดานตาม
   แล้วรูที่แท้จริงถูกกลบ ⇒ ผูกตัว regex ไว้ตรง ๆ ให้ข้อความฟ้องตรงกับสาเหตุ */
test("regex นับขนาดดิบต้องเป็นตัวเดียวกับใน audit-ui.mjs", () => {
  assert.ok(AUDIT.includes(RAW_UNIT.source),
    `audit-ui.mjs ไม่มี regex ตัวนี้แล้ว: ${RAW_UNIT.source}`);
});

test("audit:ui กัน text-[var(--fs-…)] ที่ลืม length: ไว้เป็น hard-zero", () => {
  assert.match(AUDIT, /tailwindTypeFormViolations/,
    "รูปที่ลืม length: คอมไพล์เป็น color ⇒ ขนาดหายเงียบ ๆ ต้องมีด่านจับ ไม่ใช่เพดาน");
});

/* กันเลขเพดานค้างเกินจริง (หรือมีคนแอบขยับขึ้นเพื่อให้ audit ผ่าน) — กติกาเดียวกับ
   spacingScale.test.mjs ที่ผูกเพดานไว้กับของจริง ไม่ใช่แค่ match ว่ากฎยังอยู่ */
test("เพดาน RAW_TAILWIND_TYPE_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const RAW_TAILWIND_TYPE_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา RAW_TAILWIND_TYPE_CAP ไม่เจอ");
  assert.equal(offenders().length, cap,
    `ของจริงเหลือ ${offenders().length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

/* เป้าหมายปลายทาง: วันที่ทั้ง 152 จุดถูกยกเข้าโทเคนครบ ให้ลบ RAW_TAILWIND_TYPE_CAP
   ทิ้ง แล้วเปลี่ยนเทสต์เพดานข้างบนเป็น `assert.deepEqual(offenders(), [])` แทน
   ⚠️ ไม่ใช่งานเก็บกวาด: 11px = --fs-3 · 12px = --fs-5 · 13px = --fs-7 · 22px = --fs-13
   ⇒ 110 จุดยกได้โดยขนาดไม่ขยับเลย แต่ 10px อีก 42 จุด **ไม่มีขั้นตรง**
   (--fs-1 = 9.5px / --fs-2 = 10.5px) ⇒ ต้องมีคนเปิดหน้าดูก่อนตัดสินว่าจะขึ้นหรือลง
   ⚠️ รูปที่ยกไปต้องเป็น `text-[length:var(--fs-3)]` — ถ้าเขียน `text-[var(--fs-3)]`
   Tailwind ตีเป็น *สี* แล้วขนาดหายเงียบ ๆ (audit จับไว้เป็น hard-zero แล้ว) */

/* ⚠️ ต้องรับ **สามรูป** ไม่ใช่รูปเดียว — วัดด้วย compile() ของ tailwindcss 4.3.0:
     text-[length:var(--fs-7)]  -> font-size: var(--fs-7)   ✓ รูปที่ควรใช้
     text-(length:--fs-7)       -> font-size: var(--fs-7)   ✓ รูปย่อของ v4
     text-[var(--fs-7)]         -> **color: var(--fs-7)**   ✗ ขนาดหาย (audit จับเป็น
                                                              hard-zero แล้ว แต่ยังนับ
                                                              ว่า "อ้างขั้นนี้อยู่")
   ถ้า regex จับแค่รูปที่สาม (รูปผิด) เทสต์ข้างล่างจะมองไม่เห็นคนที่ยกเข้าโทเคน
   *ถูกวิธี* แล้ว typeScale.test.mjs จะลบขั้นนั้นทิ้งเพราะดูเหมือนไม่มีใครใช้
   = กับดักที่เทสต์นี้เขียนมากันเอง */
function classNameTokens() {
  const used = new Map(); // token -> ["rel:line", ...]
  for (const file of uiFiles()) {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      for (const [, token] of line.matchAll(/\btext-[[(](?:length:)?(?:var\()?\s*(--fs-[\w-]+)/g)) {
        if (!used.has(token)) used.set(token, []);
        used.get(token).push(`${rel(file)}:${index + 1}`);
      }
    });
  }
  return used;
}

test("โทเคนที่ className อ้างถึงมีประกาศอยู่จริงทุกตัว", () => {
  const declared = new Set([...GLOBALS.matchAll(/^\s*(--fs-[a-z0-9-]+):/gm)].map(([, name]) => name));
  const missing = [];
  for (const [token, places] of classNameTokens()) {
    if (!declared.has(token)) missing.push(`${token} (${places[0]})`);
  }
  assert.deepEqual(missing, [],
    "โทเคนที่ไม่มีประกาศทำให้ font-size ตกไปใช้ค่าที่สืบทอดมาแบบเงียบ ๆ");
});

/* 🪤 typeScale.test.mjs มีกฎ "ห้ามประกาศขั้นทิ้งไว้โดยไม่มีใครใช้" ซึ่งสแกนแค่ไฟล์ .css
   ขั้นที่ถูกใช้เฉพาะจาก className จึงดูเหมือนไม่มีคนใช้ แล้ววันหนึ่งจะมีคนลบทิ้งตามกฎนั้น
   (inlineTypeScale.test.mjs กันเรื่องเดียวกันไว้ให้ฝั่ง `style={{ fontSize }}` แล้ว) */
test("ขั้นที่ใช้เฉพาะใน className ต้องถูกนับว่ามีคนใช้", () => {
  const cssFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) cssFiles.push(full);
    }
  })(root);
  const allCss = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  for (const [token, places] of classNameTokens()) {
    if (allCss.includes(`var(${token})`)) continue;
    assert.ok(STEPS.has(token) || GLOBALS.includes(`${token}:`),
      `${token} ถูกใช้ใน className เท่านั้น (${places[0]}) และหายไปจาก globals แล้ว`);
  }
});
