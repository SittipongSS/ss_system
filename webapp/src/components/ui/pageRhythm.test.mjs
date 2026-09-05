import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── จังหวะแนวตั้งของหน้าเป็นของเปลือก ไม่ใช่ของลูกแต่ละตัว (2026-09-06) ───────
   🐞 ที่มา: `.ui-workspace` เคยเป็น block เปล่าไม่มี `gap` ⇒ ลูกต้องพกระยะล่างมาเอง
   ซึ่งได้ผลเฉพาะลูกที่เปลือก *รู้จัก* (back-row 14 · header 18 · rail 18 · toolbar 16)
   ส่วนเนื้อหาของหน้าเป็นอะไรก็ได้ จึงไม่มีใครออกระยะให้ · วัดจริง 13 หน้าได้ 4 ค่า
   (0 ×5 · 16 ×2 · 18 ×4 · 20 ×2) โดย 0px คือการ์ดหัวใบชนบล็อกสองคอลัมน์พอดี
   ผู้ใช้ส่งภาพหน้า /service/assets/[id] มา 2026-09-06

   วัดหลังแก้ด้วย stylesheet จริงของแอป: ทุกคู่ = 18px · แถวย้อนกลับ = 14px */

const WEBAPP = process.cwd();
const GLOBALS = fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8");
const blankComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "));
const CSS = blankComments(GLOBALS);

const ruleBody = (source, selector) => {
  const at = source.indexOf(`\n${selector} {`);
  if (at < 0) return null;
  return source.slice(at, source.indexOf("}", at) + 1);
};

test("เปลือกหน้าเป็นเจ้าของจังหวะแนวตั้ง — ไม่ใช่ให้ลูกพกมาเอง", () => {
  const body = ruleBody(CSS, ".ui-workspace");
  assert.ok(body, "หากฎ .ui-workspace ไม่เจอ");
  assert.match(body, /display:\s*flex/, "ต้องเป็น flex ไม่งั้น gap ไม่ทำงาน");
  assert.match(body, /flex-direction:\s*column/);
  assert.match(body, /gap:\s*var\(--space-4-5\)/,
    "จังหวะของหน้าคือ 18px — ค่าเดียวกับที่ .premium-header เคยแจกให้ฟรีอยู่แล้ว");
});

/* 🔴 ความจำเพาะคือหัวใจของกฎนี้ ไม่ใช่รายละเอียดปลีกย่อย
   ลูกบางตัวมาจาก CSS Module (Pager.module.css) ซึ่งบันเดิลวางไว้หลัง globals.css
   ⇒ ที่ (0,1,0) เท่ากันมันชนะด้วยลำดับ · วัดจริงก่อนดันความจำเพาะ: /database/customers
   ได้ `grid → Pager` = 30px (18 gap + 12 margin ของ Pager) ทั้งที่กฎสั่ง 0 ไปแล้ว */
test("กฎล้าง margin ของลูกต้องมีความจำเพาะพอจะชนะ CSS Module", () => {
  assert.match(CSS, /\.ui-workspace\.ui-workspace\s*>\s*\*\s*\{\s*margin-block:\s*0;?\s*\}/,
    "ต้องเขียนชื่อคลาสซ้ำเพื่อดันความจำเพาะเป็น (0,2,0)\n"
    + "ถ้าลดเหลือ .ui-workspace > * เมื่อไร ลูกที่เป็น CSS Module จะพก margin กลับมาได้ทันที");
  assert.ok(!/\.ui-workspace[^\n{]*margin-block:\s*0\s*!important/.test(CSS),
    "ห้ามใช้ !important — หน้าที่จำเป็นต้องเว้นต่างจริง ๆ จะแก้ทางไม่ได้เลย");
});

/* แถวย้อนกลับเป็นข้อยกเว้นเดียวและต้องยังเป็นข้อยกเว้นอยู่ — 14px คือค่าเดียวใน
   เรื่องนี้ที่สม่ำเสมอทั้งระบบมาแต่เดิม และ 19 หน้าจาก 109 อยู่นอกเปลือกซึ่งยังได้ 14px
   ⇒ ถ้าปล่อยให้ในเปลือกเป็น 18 จะเป็นการสร้างรอยแยกใหม่ 4px ระหว่างสองกลุ่มหน้า */
test("แถวย้อนกลับยังแคบกว่าจังหวะของก้อนเนื้อหา (14px ไม่ใช่ 18px)", () => {
  assert.match(CSS,
    /\.ui-workspace\.ui-workspace\s*>\s*\.ui-workspace-back-row\s*\{[^}]*margin-bottom:\s*calc\(var\(--space-3-5\)\s*-\s*var\(--space-4-5\)\)/,
    "ต้องหักส่วนต่างออกจาก gap ให้เหลือ 14px — เขียนเป็นสองโทเคนลบกัน ไม่ใช่ -4px ดิบ");
});

/* ลูกสองตัวนี้ประกาศ *หลัง* กฎล้าง และใช้เฉพาะในเปลือกนี้ ⇒ ถ้าพก margin เองจะชนะกลับ
   วัดจริงตอนยังไม่ถอด: rail → toolbar = 36px · toolbar → tabs = 34px */
test("rail กับ toolbar ต้องไม่พก margin แนวตั้งของตัวเอง", () => {
  for (const selector of [".ui-workspace-rail", ".ui-workspace-toolbar"]) {
    const body = ruleBody(CSS, selector) || "";
    assert.ok(!/margin(-top|-bottom|-block)?:\s*(?!0)/.test(body),
      `${selector} พก margin แนวตั้งกลับมาแล้ว — มันประกาศหลังกฎล้าง จึงชนะกลับ`);
  }
});

/* ── ขอบในแนวนอน: มติผู้ใช้ 2026-08-20 ───────────────────────────────────────
   "หัวการ์ด เนื้อการ์ด ตารางที่ฝังในการ์ด และแถบแบ่งหน้า ต้องเริ่มที่เส้นเดียวกันทุกใบ"
   🐞 `DetailPage.module.css` **ไม่เคยอ่าน --panel-inset เลยสักครั้ง** (grep = 0 hit)
   และ `DetailOverview.module.css` ใช้ `22px` ดิบ ⇒ วัดจริงบน /service/assets/[id]
   ใบเดียว ข้อความเริ่มที่ 3 เส้น: 23 / 17 / 19px จากขอบการ์ด */
const CARD_MODULES = [
  ["DetailPage.module.css", [".cardHeader", ".cardBody"]],
  ["DetailOverview.module.css", [".overviewHeading"]],
];

test("หัวการ์ดและเนื้อการ์ดทุกตระกูลเริ่มที่ --panel-inset เส้นเดียว", () => {
  const offenders = [];
  for (const [file, selectors] of CARD_MODULES) {
    const source = blankComments(fs.readFileSync(path.join(WEBAPP, "src", "components", "ui", file), "utf8"));
    for (const selector of selectors) {
      const body = ruleBody(source, selector);
      assert.ok(body, `หากฎ ${selector} ใน ${file} ไม่เจอ`);
      const padding = (body.match(/padding:\s*([^;]+);/) || [])[1];
      assert.ok(padding, `${file} ${selector} ไม่มี padding`);
      /* ค่าแนวนอนคือช่องที่ 2 ของ shorthand (1 ค่า = ทุกด้าน) */
      const parts = padding.trim().split(/\s+(?![^(]*\))/);
      const horizontal = parts.length === 1 ? parts[0] : parts[1];
      if (horizontal !== "var(--panel-inset)") offenders.push(`${file} ${selector} → ${horizontal}`);
    }
  }
  assert.deepEqual(offenders, [],
    "ขอบในแนวนอนของการ์ดต้องเป็น var(--panel-inset) ทุกตระกูล (มติผู้ใช้ 2026-08-20)\n"
    + "ค่าอื่นทำให้ข้อความบนหน้าเดียวกันเริ่มคนละเส้น");
});

/* ── แถวย้อนกลับ: ทรงเดียวทั้งระบบ ──────────────────────────────────────────── */

test("กฎ .topbar-back-btn ที่เป็นโค้ดตายต้องไม่กลับมา", () => {
  assert.ok(!/^\.topbar-back-btn\s*\{/m.test(CSS),
    "กฎนี้ถูกลบเพราะ **ไม่เคยทำงาน**: อยู่บรรทัด 1775 ส่วน .btn อยู่ 4033 และ 6089\n"
    + "ความจำเพาะเท่ากัน (0,1,0) ตัวหลังจึงชนะทุกพร็อพที่ชนกัน ⇒ ปุ่มจริงสูง 40px\n"
    + "ตัวอักษร 12px (ของกลาง 32px/13px) และลูกศรเยื้องขวา 14px\n"
    + "ถ้าต้องการปุ่มย้อนกลับที่เป็น <button> ให้ใช้ class=\"ui-workspace-back\"");
});

test("<button> ใช้เป็นตัวย้อนกลับได้ และคืนค่า UA ทีละพร็อพ", () => {
  const body = ruleBody(CSS, "button.ui-workspace-back");
  assert.ok(body, "หน้าที่ต้องใช้ router.back() ไม่มี href ให้ใส่ จึงต้องรองรับ <button>");
  for (const prop of ["border", "padding", "background", "font-family"]) {
    assert.match(body, new RegExp(`${prop}:`), `ต้องคืน ${prop} ของ UA`);
  }
  assert.ok(!/(?<![\w-])font:\s/.test(body),
    "ห้าม shorthand `font:` — มันล้าง font-variant-numeric ทิ้งด้วย (บทเรียนของ .linklike)");
});

function jsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/* 🪤 ทรงที่เคยหลุด: `<Link className="linklike" style={{…}}><ArrowLeft/> กลับ…</Link>`
   ได้สีเทอราคอตต้าขีดเส้นใต้ ต่างจากอีก 33 หน้าที่เป็นเทาไม่มีเส้นใต้ และไม่มีแถวครอบ
   จึงชนเนื้อหาที่ 2.8px (วัดที่ sa/projects/[id]/shipment-prep ก่อนแก้) */
test("ลิงก์ย้อนกลับห้ามใช้ .linklike — ต้องเป็น .ui-workspace-back", () => {
  const offenders = [];
  for (const file of jsFiles(path.join(WEBAPP, "src", "app")).concat(jsFiles(path.join(WEBAPP, "src", "components")))) {
    const source = blankComments(fs.readFileSync(file, "utf8"));
    for (const hit of source.matchAll(/<Link\b[^>]*className="[^"]*\blinklike\b[^"]*"[^>]*>([\s\S]{0,120}?)<\/Link>/g)) {
      if (/<ArrowLeft\b/.test(hit[0]) || /^\s*←/.test(hit[1])) {
        offenders.push(`${path.relative(WEBAPP, file).replaceAll("\\", "/")}:${source.slice(0, hit.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    "ลิงก์ย้อนกลับมีทรงเดียวทั้งระบบ: แถว .ui-workspace-back-row + ลิงก์ .ui-workspace-back\n"
    + "หน้าที่อยู่ในเปลือก Workspace ส่ง prop `back={{ href, label }}` ได้เลย ไม่ต้องเขียนเอง");
});
