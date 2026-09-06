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
const CSS = blankComments(fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8"));
const GLOBALS = CSS;

/* ตัดเนื้อในของกฎหนึ่งอันออกมา — รับ selector ที่มีช่องว่างด้วย (`.a b`) */
function ruleBody(source, selector) {
  const hit = source.match(new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  return hit ? hit[1] : null;
}

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

/* ── รางขวาต้องเป็นกล่องที่ครอบความสูงตัวเอง (2026-09-06) ────────────────────
   🐞 `.aside` เป็น sticky ในกล่องที่ไม่ครอบความสูง — ปักได้ก็จริง แต่ถ้าตัวมันสูงกว่าจอ
   มันเลื่อนหายไปพร้อมหน้าเหมือนเนื้อหาธรรมดา ⇒ Control Panel ทั้งใบหลุดสายตา
   และของที่หายก่อนคือสถานะซึ่งอยู่บนสุด · ทรงเดียวกับกล่องตารางที่ซ่อมวันเดียวกัน

   วัดจริง (ราง 330px · ทรงหน้าคำร้อง): การ์ดจัดการ 633.3px · ทั้งราง 901.0px
   เทียบพื้นที่ที่มีที่จอ 900 = 794px ⇒ ล้น 107px · ล้นทั้ง 5 หน้าที่วัด */
test("รางขวาต้องมีเพดานความสูงและเลื่อนในตัวเอง", () => {
  const source = blankComments(fs.readFileSync(
    path.join(WEBAPP, "src", "components", "ui", "DetailPage.module.css"), "utf8"));
  const aside = rules(source).find((r) => r.selector === ".aside");
  assert.ok(aside, "หากฎ .aside ไม่เจอ");
  assert.match(aside.body, /max-height:\s*var\(--pinned-box-max\)/,
    "ถอดเพดานเมื่อไร รางที่สูงกว่าจอจะเลื่อนหายไปพร้อมหน้า ทั้งที่เขียนว่า sticky");
  assert.match(aside.body, /overflow-y:\s*auto/,
    "ต้องเลื่อนในตัวเองได้ ไม่งั้นส่วนที่เกินเพดานถูกตัดทิ้งแทนที่จะเลื่อนดู");
});

/* 🔴 เพดานอย่างเดียวไม่พอ — flex item มี flex-shrink: 1 เป็นค่าตั้งต้น พอกล่องแม่
   มีเพดาน ลูกจะยอมหดลงมาให้พอดีแทนที่จะให้แม่เลื่อน · วัดจับได้ตอนทดสอบ 2026-09-06:
   ราง max-height 770px แล้ว scrollHeight = 770 พอดี (ควรเป็น 800+) = การ์ดถูกอัด
   หลังเติม `flex: none` วัดใหม่ได้ scrollHeight 800 · เลื่อนได้ 30px · การ์ดคงความสูงจริง */
test("การ์ดในรางต้องไม่ยอมหด ไม่งั้นเพดานกลายเป็นตัวบีบแทนตัวเลื่อน", () => {
  const source = blankComments(fs.readFileSync(
    path.join(WEBAPP, "src", "components", "ui", "DetailPage.module.css"), "utf8"));
  const rule = rules(source).find((r) => r.selector === ".aside > *");
  assert.ok(rule, "ต้องมีกฎ `.aside > *` ที่ล็อกไม่ให้การ์ดหด");
  assert.match(rule.body, /flex:\s*none/,
    "ต้องเป็น `flex: none` — `flex-shrink: 0` เฉย ๆ ยังปล่อยให้การ์ดที่มี flex-basis ของตัวเองหดได้");
});

/* เพดานมีเหตุผลเฉพาะตอนรางเป็น sticky — ที่จอแคบรางไหลลงเป็นเนื้อหาปกติ
   ถ้าเพดานยังอยู่ การ์ดจะถูกตัดทิ้งแทนที่จะไหลลงหน้า */
test("ที่จอแคบซึ่งรางเลิกปัก ต้องล้างเพดานทิ้ง", () => {
  const raw = fs.readFileSync(path.join(WEBAPP, "src", "components", "ui", "DetailPage.module.css"), "utf8");
  const at = raw.indexOf("@media (max-width: 1050px)");
  assert.ok(at > 0, "หา media query ที่รางเลิกปักไม่เจอ");
  const block = blankComments(raw.slice(at, raw.indexOf("@media", at + 10)));
  assert.match(block, /position:\s*static/, "สมมติฐาน: ที่ความกว้างนี้รางเลิกเป็น sticky");
  assert.match(block, /max-height:\s*none/, "ต้องล้างเพดาน ไม่งั้นการ์ดถูกตัดทิ้ง");
  assert.match(block, /overflow-y:\s*visible/);
});

/* ── แถบระบุตัวใบ (2026-09-06) ───────────────────────────────────────────────
   คำขอผู้ใช้: เลื่อนหน้ารายละเอียดแล้วลืมว่าดูใบไหน · ตรึงหัวใบทั้งใบทำไม่ได้
   (วัดแล้วกินจอ 41–81% · มือถือเหลือพื้นที่อ่าน 18.9px) จึงตรึงแค่ตัวตนใบ + ทางกลับ

   วัดจริงด้วย stylesheet ของแอป: หน้าไม่มีหัวใบ --detail-pin-h = 0 เพดานกล่อง 770 ·
   หน้ามีหัวใบ = 49px เพดานกล่องหดเป็น 721 เองทั้งสาย · แถบสูง 49.0px เท่ากันทั้ง
   เนื้อสั้นและชื่อสินค้า 70 ตัวอักษร */
test("ความสูงแถบเข้าสูตรจุดจอด ⇒ ของที่ปักอื่นเดินตามเอง", () => {
  const anchor = (GLOBALS.match(/--scroll-anchor-top:\s*([^;]+);/) || [])[1] || "";
  assert.match(anchor, /var\(--detail-pin-h\)/,
    "ถ้าไม่บวกความสูงแถบเข้าไป จุดจอด anchor · .aside · เพดานกล่องตาราง จะไม่รู้จักแถบ\n"
    + "แล้วทุกอย่างที่เพิ่งซ่อมไปจะกลับไปจมใต้แถบอีกรอบ");
  assert.match(CSS, /--detail-pin-h:\s*0px/,
    "ค่าตั้งต้นต้องเป็น 0 — หน้าที่ไม่มีหัวใบต้องไม่เสียพื้นที่แม้แต่พิกเซลเดียว");
});

/* 🔴 กับดักที่ทำให้กฎนี้ตายเงียบ: `.overviewCard` เป็นชื่อจาก CSS module ซึ่งถูกแฮช
   ตอน build ⇒ `:has(.overviewCard)` ไม่มีวันแมตช์ · ต้องจับคลาสสากลที่คอมโพเนนต์
   พ่นออกมาคู่กันเท่านั้น */
test("สวิตช์เปิดแถบต้องจับคลาสสากล ไม่ใช่ชื่อจาก CSS module", () => {
  assert.match(CSS, /:root:has\(\.ui-detail-overview\)\s*\{[^}]*--detail-pin-h:\s*49px/,
    "ต้องเปิดค่าด้วย :root:has(.ui-detail-overview)");
  assert.ok(!/:root:has\(\.overviewCard\)/.test(CSS),
    "`.overviewCard` เป็นคลาส module ที่ถูกแฮช — :has() จะไม่มีวันแมตช์");
  const overview = fs.readFileSync(
    path.join(WEBAPP, "src", "components", "ui", "DetailOverview.js"), "utf8");
  assert.match(overview, /className=\{`ui-detail-overview \$\{styles\.overviewCard\}/,
    "DetailOverview ต้องพ่นคลาสสากลคู่กับคลาส module ไม่งั้นสวิตช์ข้างบนไม่ทำงาน");
});

test("แถบต้องสูงคงที่จาก min-height ไม่ใช่จากเนื้อหา", () => {
  const bar = ruleBody(CSS, ".ui-detail-pin-bar");
  assert.ok(bar, "หากฎ .ui-detail-pin-bar ไม่เจอ");
  assert.match(bar, /min-height:\s*var\(--detail-pin-h\)/,
    "ถ้าความสูงมาจากเนื้อหา ค่าที่จองไว้ใน --detail-pin-h จะไม่ตรงกับของจริง");
  const id = ruleBody(CSS, ".ui-detail-pin-id strong");
  assert.match(id || "", /white-space:\s*nowrap/,
    "ชื่อใบต้องไม่ตกบรรทัดสอง ไม่งั้นแถบสูงขึ้นแล้วเลขที่จองไว้ผิด");
});

/* ที่แขวนต้องไม่กินที่ในโฟลว์ ไม่งั้นทุกหน้ารายละเอียดถูกดันลง 49px ตลอดเวลา
   = กลายเป็นแบบ "ตรึงตลอดเวลา" ที่ตัดทิ้งไปแล้วตอนเลือกแบบ */
test("ที่แขวนสูง 0 และอยู่ในสายที่ sticky ทำงาน", () => {
  const slot = ruleBody(CSS, ".ui-detail-pin");
  assert.ok(slot, "หากฎ .ui-detail-pin ไม่เจอ");
  assert.match(slot, /position:\s*sticky/);
  assert.match(slot, /height:\s*0/,
    "ที่แขวนต้องสูง 0 — ตัวแถบเป็น absolute ข้างใน จึงไม่ดันเนื้อหาลงเลย");
  const layout = fs.readFileSync(path.join(WEBAPP, "src", "components", "AppLayout.js"), "utf8");
  assert.match(layout, /<div className="page">\s*\{\/\*[\s\S]*?\*\/\}\s*<DetailPinBar \/>/,
    "ต้องเป็นลูกตัวแรกของ .page — กล่องแม่ของหัวใบต่างกันทุกหน้า วางที่อื่นแล้วหลุดปัก");
});

test("ตอนพิมพ์ต้องถอดแถบและคืนพื้นที่ที่จองไว้", () => {
  const printBlock = CSS.slice(CSS.indexOf("@media print"));
  assert.match(printBlock, /--detail-pin-h:\s*0px/,
    "ถ้าไม่คืนค่า หัวเอกสารบนกระดาษจะเยื้องลง 49px");
  assert.match(printBlock, /\.ui-detail-pin\s*\{\s*display:\s*none/);
});
