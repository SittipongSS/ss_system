import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ชั้นซ้อน (z-index) — ตรวจ 2026-07-29: 82 จุด กระจายเป็น 22 ค่า ตั้งแต่ 1 ถึง 10050
   โดยไม่มีที่ไหนบอกว่าอะไรควรอยู่เหนืออะไร คนเขียนของใหม่จึงเดาเลขเอง แล้วก็ได้
   9000 / 9999 / 10050 แบบ "ใหญ่ไว้ก่อน" ซึ่งพอมีสองคนทำเหมือนกันก็ทับกันอยู่ดี

   เทสต์นี้ล็อก **ลำดับ** ไม่ใช่ตัวเลข — ตัวเลขปรับได้ตราบใดที่ลำดับยังถูก */

const root = path.join(process.cwd(), "src");
const GLOBALS = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

const TOKENS = new Map(
  [...GLOBALS.matchAll(/^\s*(--z-[\w-]+):\s*(\d+);/gm)].map(([, name, value]) => [name, Number(value)]),
);

/* ลำดับที่ระบบต้องรักษาไว้ — อ่านจากพฤติกรรมจริงที่มีอยู่ก่อนตั้งโทเคน
   (แผงลอยต้องทับแถบตรึง · โมดัลต้องทับแผงลอยในหน้า · เมนูที่ portal ต้องทับทุกอย่าง
   เพราะเปิดจากในโมดัลได้) */
const LADDER = [
  "--z-sticky",
  "--z-inline-menu",
  "--z-topnav",
  "--z-topnav-menu",
  "--z-account-menu",
  "--z-mobile-bar",
  "--z-mobile-nav",
  "--z-dropdown",
  "--z-modal",
  "--z-fullscreen",
  "--z-toast",
  "--z-calendar",
  "--z-save-bar",
  "--z-drilldown",
  "--z-portal-menu",
];

test("โทเคนชั้นซ้อนประกาศครบและเรียงจากล่างขึ้นบน", () => {
  for (const name of LADDER) {
    assert.ok(TOKENS.has(name), `ไม่มี ${name} — ของที่อ้างถึงจะไม่มีค่าและตกไปเป็น auto`);
  }
  for (let i = 1; i < LADDER.length; i += 1) {
    const below = TOKENS.get(LADDER[i - 1]);
    const above = TOKENS.get(LADDER[i]);
    assert.ok(above >= below,
      `${LADDER[i]} (${above}) ต้องไม่ต่ำกว่า ${LADDER[i - 1]} (${below}) — สลับลำดับแล้วของจะโผล่ผิดชั้น`);
  }
});

test("⭐ แถบเมนูล่างมือถือต้องอยู่ **ใต้** แผ่นเมนู ห้ามเท่ากัน", () => {
  /* แผ่นเมนูกางเต็มจอทับแถบล่าง · ถ้าสองค่านี้เท่ากัน ใครอยู่บนจะขึ้นกับลำดับใน DOM
     ล้วน ๆ แล้ววันหนึ่งที่มีคนสลับลำดับ JSX แถบล่างจะโผล่ทับแผ่นเมนูเงียบ ๆ
     (บทเรียนเดียวกับ --z-toast ที่เคยเท่ากับ --z-modal เป๊ะ) */
  assert.ok(TOKENS.get("--z-mobile-bar") < TOKENS.get("--z-mobile-nav"),
    "--z-mobile-bar ต้องน้อยกว่า --z-mobile-nav (ไม่ใช่แค่ไม่เกิน)");
});

test("เมนูที่ portal ออกไป body อยู่บนสุดเสมอ", () => {
  /* select / time / filter popover ถูก portal ไปที่ body จึงหลุดจาก stacking context
     ของโมดัล — ถ้าไม่สูงกว่าโมดัล เมนูที่เปิดจากในโมดัลจะจมหายไปข้างหลัง */
  const top = Math.max(...LADDER.map((name) => TOKENS.get(name)));
  assert.equal(TOKENS.get("--z-portal-menu"), top,
    "--z-portal-menu ต้องเป็นค่าสูงสุด ไม่งั้นดรอปดาวน์ในโมดัลจะจมหาย");
});

test("แจ้งเตือนอยู่เหนือพื้นผิวที่ลอยทับหน้าทุกชนิด", () => {
  /* **ต้องมากกว่า ไม่ใช่เท่ากับ** — ค่าที่เท่ากันเป๊ะแปลว่าใครอยู่บนขึ้นกับลำดับใน DOM
     ล้วน ๆ ทดสอบจริง 2026-07-30: วางกล่อง z-index 1100 ที่ mount ทีหลัง toast แล้ว
     toast ถูกบังทั้งใบทันที · ก่อนหน้านี้รอดมาได้เพราะ portal ของ toast บังเอิญอยู่
     หลัง overlay ใน body เฉย ๆ */
  for (const below of ["--z-modal", "--z-fullscreen"]) {
    assert.ok(TOKENS.get("--z-toast") > TOKENS.get(below),
      `--z-toast (${TOKENS.get("--z-toast")}) ต้อง**มากกว่า** ${below} (${TOKENS.get(below)}) — เท่ากันคือปล่อยให้ลำดับ DOM ตัดสิน`);
  }
});

test("ไม่มีใครเขียนเลขชั้นซ้อนระดับหน้าเองนอก globals", () => {
  const files = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css)$/.test(entry.name)) files.push(full);
      }
    })(path.join(root, dir));
  }

  const offenders = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    if (rel.includes("src/components/documents/")) continue; // เอกสารพิมพ์ไม่โหลด globals.css
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      if (/^\s*--z-[\w-]+:/.test(line)) return;
      for (const hit of line.matchAll(/z-?[Ii]ndex:\s*"?(\d+)"?/g)) {
        // 0–10 = เรียงกันเองภายใน stacking context ของตัวเอง ไม่ได้แข่งกับแผงลอยระดับหน้า
        if (Number(hit[1]) < 30) continue;
        offenders.push(`${rel}:${index + 1} ${hit[0]}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "เลขที่เดาเองคือต้นเหตุของ 9000/9999/10050 — หยิบชื่อจาก --z-* แทน");
});
