import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── อะไรที่ยึดกับ "หน้าต่าง" ต้องเผื่อความสูงแถบเมนู (2026-09-06) ─────────────
   หน้าเลื่อนที่ document — วัดยืนยันแล้วว่าไม่มีชั้นไหนเป็น scroll container
   (`.main-content` จงใจใช้ `overflow-x: clip` ไม่ใช่ `hidden` เพื่อไม่ให้กลายเป็น
   scrollport · มี stickyScrollport.test.mjs เฝ้าไว้)
   ⇒ `position: sticky; top: N` และ `scroll-margin-top: N` ทุกจุดที่อยู่ในสายหน้า
   จะปัก/จอดที่ N พิกเซลจาก **ขอบบนหน้าต่าง** ซึ่งอยู่ใต้แถบเมนู

   ความสูงแถบจริง (วัด ไม่ใช่อ่านโทเคน): 95px ที่จอ >1200 · 53px ที่ ≤1200
   `--scroll-anchor-top` = 106px / 64px ⇒ เหลือช่องหายใจ 11px ทั้งสองชั้น

   🐞 สิ่งที่เจอตอนวัด 2026-09-06:
     `.aside` top 12px          ⇒ หัวรางถูกบัง 83px (23 หน้าที่ใช้ DetailPageLayout)
     `.card` scroll-margin 24px ⇒ หัวการ์ดจมใต้แถบ 70.8px (63 จุดที่ใช้ DetailCard)
     `.dayHead` top 0           ⇒ หัววันอยู่ในแถบทั้งก้อน มองไม่เห็นเลย
     `<div ref={drillRef}>`     ⇒ ไม่มี scroll-margin-top เลย จอดที่ y=0
   ทั้งสี่จุดใช้ค่าคนละตัว (0 / 12 / 24) ขณะที่โทเคนกลางมีอยู่แล้วและ `.previewAside`
   กับ `.ui-section` ใช้ถูกมาตลอด — ปัญหาคือ **ไม่มีใครบังคับให้ไปหยิบมาใช้** */

const WEBAPP = process.cwd();
const blankComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "));

function cssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(full, out);
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(WEBAPP, file).replaceAll("\\", "/");

/* แตกเป็นกฎทีละอัน พร้อมเลขบรรทัดที่ตรงกับไฟล์จริง */
function rules(source) {
  const out = [];
  for (const hit of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = hit[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    out.push({ selector, body: hit[2], line: source.slice(0, hit.index).split(/\r?\n/).length });
  }
  return out;
}

/* 🪤 `top: 0` ถูกต้องเสมอเมื่อ sticky อยู่ใน **กล่องที่เลื่อนเอง** (หัวตารางในกล่อง
   ที่ครอบความสูง · แผงในลิ้นชักที่ overflow) — ด่านนี้จึงยกเว้นให้ `top: 0` ทั้งหมด
   และคุมเฉพาะ **ค่าที่ไม่ใช่ 0 และไม่ใช่โทเคน** ซึ่งเป็นสัญญาณชัดว่าคนเขียนตั้งใจ
   "เผื่อระยะจากขอบบน" แต่เผื่อด้วยเลขที่เดาเอง
   ⚠️ ยกเว้น `top: 0` แปลว่าด่านนี้ยังไม่เห็นเคสอย่าง `.dayHead` (top:0 ที่ปักกับหน้า)
   เคสนั้นต้องดูด้วยตาว่ากล่องแม่เลื่อนเองหรือเปล่า ซึ่ง static analysis ตัดสินไม่ได้ —
   จึงล็อกจุดที่แก้ไปแล้วไว้ตรง ๆ ข้างล่างแทน ไม่แกล้งทำเป็นว่าครอบทั้งหมด */
test("sticky ที่เผื่อระยะจากขอบบน ต้องใช้ --scroll-anchor-top ไม่ใช่เลขดิบ", () => {
  const offenders = [];
  for (const file of cssFiles(path.join(WEBAPP, "src"))) {
    const source = blankComments(fs.readFileSync(file, "utf8"));
    for (const rule of rules(source)) {
      if (!/position:\s*sticky/.test(rule.body)) continue;
      const top = (rule.body.match(/(?:^|;)\s*top:\s*([^;]+)/) || [])[1];
      if (!top) continue;
      const value = top.trim();
      if (value === "0" || /^0[a-z%]*$/.test(value)) continue;
      if (value.includes("var(--scroll-anchor-top)") || value.includes("var(--topbar-h)")) continue;
      offenders.push(`${rel(file)}:${rule.line} ${rule.selector} → top: ${value}`);
    }
  }
  assert.deepEqual(offenders, [],
    "เลขดิบตรงนี้แปลว่า 'เผื่อระยะจากขอบบนหน้าต่าง' ซึ่งอยู่ใต้แถบเมนู\n"
    + "แถบสูง 95px (จอ >1200) / 53px (≤1200) — เลขที่เขียนเองจะไม่มีวันตามทันทั้งสองชั้น\n"
    + "ใช้ var(--scroll-anchor-top) หรือ calc(var(--topbar-h) + …) แทน");
});

test("scroll-margin-top ต้องมาจากโทเคนเดียวกันทุกจุด", () => {
  const offenders = [];
  for (const file of cssFiles(path.join(WEBAPP, "src"))) {
    const source = blankComments(fs.readFileSync(file, "utf8"));
    for (const rule of rules(source)) {
      const hit = (rule.body.match(/(?:^|;)\s*scroll-margin-top:\s*([^;]+)/) || [])[1];
      if (!hit) continue;
      const value = hit.trim();
      if (value.includes("var(--scroll-anchor-top)")) continue;
      offenders.push(`${rel(file)}:${rule.line} ${rule.selector} → ${value}`);
    }
  }
  assert.deepEqual(offenders, [],
    "จุดจอดของ scrollIntoView / anchor ต้องเผื่อความสูงแถบเมนู ⇒ var(--scroll-anchor-top)\n"
    + "ค่าอื่นทำให้หัวของสิ่งที่กระโดดไปหาจมอยู่ใต้แถบ (วัดจริง: 24px ⇒ จม 70.8px)");
});

/* จุดที่แก้ไปแล้วในรอบนี้ — ล็อกตรง ๆ เพราะเป็นเคสที่ด่านข้างบนมองไม่เห็น
   (`.dayHead` เคยเป็น top:0 ซึ่งด่านยกเว้นให้ · `drillRef` เป็น JSX ไม่ใช่ CSS) */
test("หัววันของกล่องแจ้งเตือนปักใต้แถบเมนู ไม่ใช่ในแถบ", () => {
  const source = blankComments(fs.readFileSync(path.join(WEBAPP, "src", "app", "notifications", "page.module.css"), "utf8"));
  const rule = rules(source).find((r) => r.selector === ".dayHead");
  assert.ok(rule, "หากฎ .dayHead ไม่เจอ");
  assert.match(rule.body, /top:\s*var\(--scroll-anchor-top\)/,
    "หน้าแจ้งเตือนเลื่อนที่ document ⇒ top:0 คือปักอยู่ในแถบเมนู วัดแล้วมองไม่เห็นเลย");
});

test("เป้าของ scrollIntoView ที่ไม่มีกฎของตัวเอง ต้องติดคลาส .scroll-anchor", () => {
  const globals = blankComments(fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8"));
  assert.match(globals, /\.scroll-anchor\s*\{\s*scroll-margin-top:\s*var\(--scroll-anchor-top\);?\s*\}/,
    "ต้องมีคลาสกลางให้ใช้ ไม่งั้นแต่ละจุดจะเขียนเลขของตัวเอง");

  const perf = fs.readFileSync(
    path.join(WEBAPP, "src", "components", "salesPlanning", "dashboard", "performance", "PerformanceTab.js"), "utf8");
  assert.match(perf, /<div ref=\{drillRef\} className="scroll-anchor">/,
    "เป้าของ drillTo() เคยเป็น div เปล่าที่ไม่มี scroll-margin-top เลย ⇒ จอดที่ y=0 ใต้แถบทั้งใบ");
});

/* โทเคนกลางต้องยังผูกกับความสูงแถบจริง ไม่ใช่เลขที่ใครพิมพ์ทิ้งไว้ */
test("--scroll-anchor-top ยังคำนวณจากความสูงแถบ ไม่ใช่ค่าคงที่", () => {
  const globals = blankComments(fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8"));
  assert.match(globals, /--scroll-anchor-top:\s*calc\(var\(--topbar-h\)\s*\+\s*var\(--sysbar-h\)/,
    "ถ้ากลายเป็นเลขคงที่ ชั้นจอที่ --sysbar-h เป็น 0 จะเผื่อเกินไป 42px");
});
