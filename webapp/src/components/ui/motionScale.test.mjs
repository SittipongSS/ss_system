import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* จังหวะ (duration + easing) — ตรวจ 2026-07-29: `--motion-fast` / `--motion-standard`
   ประกาศไว้ตั้งแต่ต้นแต่มีคนอ้างจริง **3 จุด** ขณะที่ทั้งระบบเขียนเวลาดิบ 136 จุดใน
   15 ค่า (.06 .08 .1 .12 120ms .14 .15 .16 .18 .2 200ms .22 220ms .24 .3)
   = ปรับจังหวะทั้งระบบทีเดียวไม่ได้ และไม่มีใครรู้ว่า "เร็ว" ของระบบนี้คือกี่ ms */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

const DURATIONS = new Map(
  [...GLOBALS.matchAll(/^\s*(--motion-[\w-]+):\s*(\d+)ms;/gm)].map(([, n, v]) => [n, Number(v)]),
);

function uiFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css)$/.test(entry.name)) out.push(full);
      }
    })(path.join(root, dir));
  }
  /* เดินไฟล์ชุดเดียวกับ `uiFiles` ของ audit-ui.mjs (src/app + src/components) — เอกสาร
     พิมพ์อยู่ใต้ src/lib จึงอยู่นอกขอบเขตโดยโครงสร้าง ไม่ต้องมียามกรองพาธ
     (ลบยามที่ยกเว้น `src/components/documents/` ออก 2026-09-02 · ดูคอมเมนต์หัวลูปที่นั่น) */
  return out;
}

test("ชั้นจังหวะเรียงจากเร็วไปช้า ไม่ซ้ำค่า", () => {
  const ladder = ["--motion-fast", "--motion-medium", "--motion-standard", "--motion-slow"];
  for (const name of ladder) assert.ok(DURATIONS.has(name), `ไม่มี ${name}`);
  for (let i = 1; i < ladder.length; i += 1) {
    assert.ok(DURATIONS.get(ladder[i]) > DURATIONS.get(ladder[i - 1]),
      `${ladder[i]} ต้องช้ากว่า ${ladder[i - 1]}`);
  }
});

test("เส้นโค้งที่ใช้ซ้ำถูกยกเป็นโทเคน", () => {
  for (const name of ["--ease-out", "--ease-standard"]) {
    assert.match(GLOBALS, new RegExp(`${name}:\\s*cubic-bezier`), `ไม่มี ${name}`);
  }
  /* เส้นโค้งเดิมที่ใช้ซ้ำ 11 + 3 จุดต้องไม่มีใครเขียนเองอีก — ที่เหลือเป็น
     `ease`/`linear` ของ CSS เอง กับเส้นโค้งเฉพาะกิจ 3 เส้นที่ใช้ที่ละจุด */
  const offenders = [];
  for (const file of uiFiles()) {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      if (/^\s*--ease-/.test(line)) return;   // บรรทัดที่ประกาศโทเคนเอง
      for (const curve of ["cubic-bezier(0.16, 1, 0.3, 1)", "cubic-bezier(0.2, 0, 0, 1)"]) {
        if (line.includes(curve)) offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "เส้นโค้งนี้มีโทเคนแล้ว — ใช้ var(--ease-…) แทน");
});

test("ไม่เหลือเวลาดิบใน transition/animation", () => {
  /* ⚠️ อ่านทั้ง declaration ไม่ใช่ทีละบรรทัด — `transition:` ยาว ๆ ตัดขึ้นบรรทัดใหม่ได้
     รอบแรกที่ทำทีละบรรทัดปล่อยหลุดไป 5 จุดใน globals.css (.btn / .metric-card) */
  const offenders = [];
  for (const file of uiFiles()) {
    const source = fs.readFileSync(file, "utf8");
    for (const decl of source.matchAll(/(?:transition|animation)[^;{}]*;/g)) {
      if (/prefers-reduced-motion|0\.01ms/.test(decl[0])) continue;
      for (const hit of decl[0].matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
        const ms = hit[2] === "ms" ? Number(hit[1]) : Number(hit[1]) * 1000;
        // ≥500ms = spinner / pulse / progress ที่วนไม่จบ — คนละเรื่องกับเวลาตอบสนอง
        if (ms >= 500) continue;
        const line = source.slice(0, decl.index + hit.index).split(/\r?\n/).length;
        offenders.push(`${path.relative(process.cwd(), file)}:${line} ${hit[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "เขียนเวลาเอง = ปรับจังหวะทั้งระบบทีเดียวไม่ได้อีก");
});

test("สวิตช์ปิดการเคลื่อนไหวยังอยู่", () => {
  /* ผู้ใช้ที่ตั้ง prefers-reduced-motion ต้องได้ระบบที่นิ่ง — บล็อกนี้ต้องไม่ถูก
     ลบทิ้งตอนใครมาไล่จัดจังหวะ และต้องบังคับด้วย !important เพราะทับทุกกฎ */
  assert.match(GLOBALS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(GLOBALS, /transition-duration:\s*0\.01ms\s*!important/);
});
