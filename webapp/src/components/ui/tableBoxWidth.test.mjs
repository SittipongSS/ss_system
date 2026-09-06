import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── กล่องตารางต้องไม่ยื่นพ้นการ์ดที่ห่อมันอยู่ (2026-09-06) ──────────────────
   🐞 ที่มา: `.scroll` ตั้ง `width: 100%` และ `.scroll[data-surface="embedded"]`
   เติม `margin: 0 var(--panel-inset) var(--panel-inset)` เข้าไปอีกชั้น
   สองอย่างนี้รวมกันคือ **over-constrained**: เบราว์เซอร์ทิ้ง margin-right แล้ว
   กล่องยื่นพ้นขอบขวาของการ์ดออกไปเท่ามาร์จินพอดี

   วัดจริง (headless Chrome · vp 1512 / 1280 / 1100 ได้เท่ากันทุกค่า):
     ก่อนแก้  เว้นซ้าย 17px · ขวา −15px   ⇒ ช่องว่างก่อนถึง Control Panel เหลือ 3px จาก 18px
     หลังแก้  เว้นซ้าย 17px · ขวา 17px    ⇒ สมมาตร
   ผู้ใช้เห็นเป็น "ตารางซ้อนทับพาเนล" และส่งภาพมา 2026-09-06 จาก /database/products
   กับ /database/customers/[id] · กระทบ **ทุกจุดที่ใช้ surface="embedded"** พร้อมกัน
   เพราะเป็นกฎเดียวใน Table.module.css ไม่ใช่ของที่เขียนซ้ำรายหน้า

   🪤 ทำไมด่านที่มีอยู่มองไม่เห็น: ทั้ง `width` และ `margin` **ถูกต้องทีละตัว**
   ความผิดเกิดจากการที่สองประกาศอยู่คนละ selector แล้วมาเจอกันตอน cascade
   ไม่มีด่านไหนในระบบอ่าน cascade ⇒ ต้องผูกเป็นกฎเฉพาะของตระกูล `.scroll` ตรง ๆ */

const WEBAPP = process.cwd();
const CSS_PATH = path.join(WEBAPP, "src", "components", "ui", "Table.module.css");
const CSS = fs.readFileSync(CSS_PATH, "utf8");

/* ตัดคอมเมนต์ทิ้งก่อนอ่านกฎ — คอมเมนต์ในไฟล์นี้ยกตัวอย่าง "ของผิด" ไว้สอนคน
   (`width: 100%` · `calc(100% - …)`) ถ้าตรวจบนซอร์ซดิบจะจับคำสอนของตัวเองแดง */
const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/* แตกเป็น { selector, body } ทีละกฎ — ไฟล์นี้ไม่มี at-rule ซ้อนที่ต้องเดินลึกกว่านี้
   นอกจาก @media ซึ่งเนื้อในยังเป็นกฎแบน ๆ เหมือนกัน */
function rules(source) {
  const out = [];
  for (const hit of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = hit[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    out.push({ selector, body: hit[2] });
  }
  return out;
}

const HORIZONTAL_MARGIN = /(?:^|;)\s*margin(?:-(?:left|right|inline(?:-start|-end)?))?\s*:\s*([^;]+)/g;

/* margin ย่อ 1–4 ค่า: ค่าแนวนอนคือช่องที่ 2 (และ 4) · 1 ค่า = ทุกด้าน */
function horizontalMarginValues(declaration, property) {
  if (property !== "margin") return [declaration.trim()];
  const parts = declaration.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0]];
  return parts.length >= 4 ? [parts[1], parts[3]] : [parts[1]];
}

const isZero = (value) => /^0[a-z%]*$/.test(value.trim());

/* 🐞 ด่านนี้เคยอ่าน **แค่ Table.module.css** ⇒ ผ่าน 6/6 ทั้งที่ globals.css มีกฎพี่น้อง
   ที่พังแบบเดียวกันอยู่: `.glass-panel [data-surface="auto"][data-family]` เติมมาร์จิน
   แนวนอนให้กล่องเดียวกัน (`.scroll` ที่ถือ width:100%) โดยไม่มี width: auto
   ⇒ /database/product-categories ตารางยื่นพ้นการ์ด 15px แล้วถูก `overflow: hidden`
   ของหน้านั้นเฉือนทิ้ง ปุ่มคอลัมน์จัดการหายไป 2px (วัดจริง 2026-09-06)
   ⚠️ กล่องที่กฎพวกนี้ไปโดนคือ `.scroll` ตัวเดียวกันเสมอ — ไม่ว่ากฎจะเขียนอยู่ไฟล์ไหน
   ด่านจึงต้องตามไปดูทุกไฟล์ที่เล็ง `[data-surface]`/`[data-family]` ไม่ใช่แค่ไฟล์ของ primitive */
const SURFACE_TARGETING = /\[data-surface[^\]]*\]|\[data-family[^\]]*\]/;

test("กฎที่เล็งกล่องตารางจากไฟล์อื่นก็ต้องคืน width: auto เมื่อเติมมาร์จิน", () => {
  const offenders = [];
  const files = [
    ["src/app/globals.css", path.join(WEBAPP, "src", "app", "globals.css")],
  ];
  for (const [label, file] of files) {
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of rules(source)) {
      if (!SURFACE_TARGETING.test(rule.selector)) continue;
      let horizontal = false;
      for (const hit of rule.body.matchAll(HORIZONTAL_MARGIN)) {
        const property = /margin-(left|right|inline)/.test(hit[0])
          ? hit[0].slice(hit[0].indexOf("margin"), hit[0].indexOf(":")).trim()
          : "margin";
        if (horizontalMarginValues(hit[1], property).some((value) => !isZero(value))) horizontal = true;
      }
      if (!horizontal) continue;
      if (!/(?:^|;)\s*width\s*:\s*auto\b/.test(rule.body)) offenders.push(`${label} → ${rule.selector}`);
    }
  }
  assert.deepEqual(offenders, [],
    "กฎนี้เติมมาร์จินแนวนอนให้กล่องตารางที่ยังถือ width: 100% = over-constrained\n"
    + "กล่องจะยื่นพ้นขอบการ์ด และถ้าการ์ดนั้น overflow: hidden เนื้อที่ยื่นจะถูกตัดทิ้งเลย\n"
    + "ทางแก้: เติม `width: auto;` ในกฎเดียวกัน");
});

test(".scroll ตั้ง width: 100% ไว้ — กฎที่เติมมาร์จินแนวนอนต้องคืน width: auto ด้วย", () => {
  assert.match(withoutComments, /\.scroll\s*\{[^}]*width:\s*100%/,
    "เทสต์นี้ตั้งอยู่บนสมมติฐานว่า `.scroll` ยังตั้ง width: 100% — ถ้าเลิกตั้งแล้วให้ปรับเทสต์ตาม");

  const offenders = [];
  for (const { selector, body } of rules(withoutComments)) {
    if (!/(?:^|[\s,>])\.scroll\b/.test(selector) && !selector.includes(".scroll")) continue;

    let hasHorizontalMargin = false;
    for (const hit of body.matchAll(HORIZONTAL_MARGIN)) {
      const property = /margin-(left|right|inline)/.test(hit[0])
        ? hit[0].slice(hit[0].indexOf("margin"), hit[0].indexOf(":")).trim()
        : "margin";
      if (horizontalMarginValues(hit[1], property).some((value) => !isZero(value))) {
        hasHorizontalMargin = true;
      }
    }
    if (!hasHorizontalMargin) continue;
    if (!/(?:^|;)\s*width\s*:\s*auto\b/.test(body)) offenders.push(selector);
  }

  assert.deepEqual(offenders, [],
    "กฎนี้เติมมาร์จินแนวนอนให้กล่องที่ยังถือ width: 100% อยู่ = over-constrained\n"
    + "กล่องจะยื่นพ้นขอบขวาของการ์ดออกไปเท่ามาร์จิน (เบราว์เซอร์ทิ้ง margin-right ใน LTR)\n"
    + "ทางแก้: เติม `width: auto;` ในกฎเดียวกัน — ห้ามใช้ calc(100% - …) เพราะจะพัง\n"
    + "ทันทีที่ --panel-inset เปลี่ยน และห้ามลบมาร์จิน (มติผู้ใช้ 2026-08-20)");
});

/* ล็อกท่าที่ถูกไว้ตรง ๆ ด้วย — ถ้ามีคนลบ width: auto ออกจากกฎ embedded
   เทสต์บนจะจับได้อยู่แล้ว แต่ข้อความจะพูดกว้าง ๆ ข้อนี้ชี้จุดให้ทันที */
test("กล่องตารางที่ฝังในการ์ดยังเว้นขอบเท่ากันสองข้าง", () => {
  const embedded = rules(withoutComments).find((r) => r.selector === '.scroll[data-surface="embedded"]');
  assert.ok(embedded, 'หากฎ .scroll[data-surface="embedded"] ไม่เจอ');
  assert.match(embedded.body, /margin:\s*0 var\(--panel-inset\) var\(--panel-inset\)/,
    "มาร์จินคือสิ่งที่ทำให้กรอบตารางไม่แปะขอบการ์ด (มติผู้ใช้ 2026-08-20) ห้ามถอด");
  assert.match(embedded.body, /width:\s*auto/,
    "ขาด width: auto ⇒ กล่องยื่นพ้นการ์ดไปทางขวา 15px และไปชิด Control Panel เหลือ 3px");
});

/* ── ฝั่ง JSX: รางกริดที่ถือตารางต้องเป็น minmax(0, …) ────────────────────────
   🐞 `gridTemplateColumns: "2fr 1fr"` แปลว่า `minmax(auto, 2fr) minmax(auto, 1fr)`
   ⇒ min track sizing function เป็น `auto` ⇒ automatic minimum size ของ grid item
   มีผล (CSS Grid §6.6) · ตารางที่มี `white-space: nowrap` จึงยกฐานรางจนดันรางข้าง ๆ
   หลุดออกนอกกล่อง (วัดที่ sahamit/page.js — vp 375 ล้น 96px · vp 347 ล้น 124px)
   ⚠️ ตรวจเฉพาะไฟล์ที่มีตารางอยู่จริง — รางที่ถือแต่ข้อความห่อบรรทัดได้ไม่มีอาการนี้ */
function jsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("รางกริดในไฟล์ที่มีตาราง ต้องใช้ minmax(0, …) ไม่ใช่ fr เปล่า", () => {
  const offenders = [];
  for (const file of jsFiles(path.join(WEBAPP, "src", "app")).concat(jsFiles(path.join(WEBAPP, "src", "components")))) {
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "));
    if (!source.includes("<TableScroll") && !source.includes("<TableShell")) continue;
    source.split(/\r?\n/).forEach((line, index) => {
      const hit = line.match(/gridTemplateColumns:\s*"([^"]+)"/);
      if (!hit) return;
      const value = hit[1];
      /* `fr` ที่ไม่ได้ห่อ minmax( — ตัวที่ห่อแล้วมี "minmax(" นำหน้าเสมอ */
      const bare = value.split(/\s+/).filter((track) => /fr$/.test(track) && !value.includes(`minmax(0, ${track}`) && !value.includes(`minmax(0,${track}`));
      if (bare.length) {
        offenders.push(`${path.relative(WEBAPP, file).replaceAll("\\", "/")}:${index + 1} → ${value}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    "รางที่เขียน `1fr` เปล่ามี min track เป็น auto ⇒ ตารางข้างในดันรางให้กว้างเกินกล่อง\n"
    + "เขียนเป็น minmax(0, 1fr) แทน — ผลต่างเห็นชัดที่จอแคบ (วัดที่ 375px ล้น 96px)");
});

/* ── ความสูง: หัวตารางจะปักได้ก็ต่อเมื่อกล่องมีเพดานความสูง (2026-09-06) ────────
   🐞 `.premium-table th { position: sticky; top: 0 }` **ไม่เคยทำงานเลยสักจุด**
   ก่อนรอบนี้ — `.scroll` มี `overflow: auto` จึงเป็น *scrollport ของ sticky* แต่ไม่มี
   `max-height` ⇒ สูงเท่าเนื้อ ไม่มีช่วงเลื่อนแนวตั้ง หัวตารางจึงปักกับกล่องที่เลื่อน
   ตามหน้าไปด้วย · วัดสดที่ /users: เลื่อนหน้า 600px แล้ว th ขยับตาม **600.0px เต็ม**
   หลังแก้: เลื่อนในกล่อง 400px แล้ว th ยังห่างขอบบนกล่อง 1px เท่าเดิม = ปักจริง

   ⚠️ ถอด overflow แทนไม่ได้ — CSS บังคับว่าเมื่อ overflow-x ไม่ใช่ visible แล้ว
   overflow-y: visible จะถูกคำนวณเป็น auto ตาม ⇒ เลือกได้อย่างเดียวระหว่าง
   "หัวปักกับหน้า" กับ "เลื่อนแนวนอนในกล่อง" */
test("กล่องตารางต้องมีเพดานความสูง ไม่งั้นหัวตารางปักไม่ได้", () => {
  const scroll = rules(withoutComments).find((r) => r.selector === ".scroll");
  assert.ok(scroll, "หากฎ .scroll ไม่เจอ");
  assert.match(scroll.body, /max-height:\s*var\(--pinned-box-max\)/,
    "ถอด max-height เมื่อไร sticky ของ th กลับไปเป็นของตายทันที (ไม่มี error ให้เห็น)");
  assert.match(scroll.body, /overflow:\s*auto/,
    "ต้องยังเลื่อนได้ทั้งสองแกน — แนวนอนสำหรับตารางกว้าง แนวตั้งสำหรับหัวที่ปัก");
});

/* 🔴 พื้นกันยุบไม่ใช่ของแถม: `100dvh` คำนวณได้ **0** ในบริบทที่ยังไม่มีความสูงจริง
   (พาเนลพรีวิว/เว็บวิวฝัง) วัดเจอตอนทดสอบ: innerHeight = 0 ⇒ กล่องเหลือสูง 2px
   = ตารางหายทั้งใบโดยไม่มี error · `max()` ทำให้ตกมาที่พื้นแทนที่จะยุบ */
test("เพดานความสูงต้องมีพื้นกันยุบ และผูกกับความสูงแถบเมนู", () => {
  const globals = fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(globals, /--pinned-box-min:\s*\d/, "ต้องมีพื้นกันยุบเป็นโทเคนของตัวเอง");
  const token = (globals.match(/--pinned-box-max:\s*([^;]+);/) || [])[1] || "";
  assert.match(token, /max\(/, "ต้องห่อด้วย max() ไม่งั้น dvh = 0 จะยุบตารางหายทั้งใบ");
  assert.match(token, /var\(--pinned-box-min\)/);
  assert.match(token, /100dvh/, "ต้องเป็น dvh ไม่ใช่ vh — แถบเบราว์เซอร์บนมือถือทำให้ vh เพี้ยน");
  assert.match(token, /var\(--scroll-anchor-top\)/,
    "ต้องหักความสูงแถบเมนูออก และต้องเป็นโทเคนเพราะแถบหดจาก 95 เหลือ 53px ที่จอ ≤1200");
});

test("ตอนพิมพ์ต้องไม่มีกล่องเลื่อน ไม่งั้นเนื้อที่เกินหายไปเลย", () => {
  const printBlock = withoutComments.slice(withoutComments.indexOf("@media print"));
  assert.ok(printBlock.startsWith("@media print"), "Table.module.css ต้องมีบล็อก @media print");
  assert.match(printBlock, /max-height:\s*none/);
  assert.match(printBlock, /overflow:\s*visible/);
});

/* ── หัวตารางเป็นของ primitive ไม่ใช่ของคลาสเก่า (2026-09-06) ────────────────
   🐞 สองโมดูลเคยดูไม่เหมือนกันเพราะ /database ใช้ `.premium-table` (มี sticky)
   ส่วน /sales-planning ใช้ `w-full text-sm` (ไม่มี) · ความต่างโผล่ให้เห็นตอน #1627
   ทำให้ sticky ทำงานได้จริงเป็นครั้งแรก
   ✅ แก้โดยย้าย sticky เข้า primitive **ไม่ใช่เติมคลาสเก่าให้ฝั่งขาย** — `.premium-table`
   ถูกนับเป็นชั้นเก่าใน uiLegacyBudget ซึ่ง ratchet ลงได้อย่างเดียว */
test("หัวตารางปักได้จาก primitive โดยไม่ต้องพึ่งคลาสเก่า", () => {
  const rule = rules(withoutComments).find((r) => r.selector.includes('[data-family] :global(thead th)'));
  assert.ok(rule, "primitive ต้องมีกฎ sticky ให้ thead th เอง");
  assert.match(rule.body, /position:\s*sticky/);
  assert.match(rule.body, /top:\s*0/);
  /* ต้องสูงกว่าคอลัมน์แรกของ matrix (z-index 2) ไม่งั้นเซลล์มุมถูกทับ */
  const z = Number((rule.body.match(/z-index:\s*(\d+)/) || [])[1]);
  assert.ok(z > 2, `z-index ต้องมากกว่า 2 (คอลัมน์ตรึงของ matrix) — ได้ ${z}`);
});

/* `.premium-table` เป็นชั้นเก่าที่ ratchet คุมอยู่แล้ว (scripts/ui-legacy-budget.json)
   ด่านนี้เสริมอีกชั้น: ห้ามแก้ปัญหา "ตารางดูไม่เหมือนกัน" ด้วยการโรยคลาสเก่าเพิ่ม */
test("ห้ามยกหน้าตาตารางด้วยการเติมคลาสเก่า — ต้องย้ายเข้า primitive", () => {
  const budget = JSON.parse(fs.readFileSync(path.join(WEBAPP, "scripts", "ui-legacy-budget.json"), "utf8"));
  const rules_ = fs.readFileSync(path.join(WEBAPP, "scripts", "uiLegacyBudget.mjs"), "utf8");
  assert.match(rules_, /legacyTable:\s*\/[^/]*premium-table/,
    "ตัวนับชั้นเก่าต้องยังจับ premium-table อยู่ ไม่งั้นด่านนี้ไม่มีความหมาย");
  assert.ok(budget.modules.sales.legacyTable <= 41,
    `เพดาน legacyTable ของงานขายขึ้นไม่ได้ — ได้ ${budget.modules.sales.legacyTable}`);
  assert.ok(budget.modules.database.legacyTable <= 7,
    `เพดาน legacyTable ของฐานข้อมูลขึ้นไม่ได้ — ได้ ${budget.modules.database.legacyTable}`);
});

/* ── กรอบซ้อนกรอบ: ห้ามเอาการ์ดเก่าห่อ TableScroll (2026-09-07) ───────────────
   🐞 หน้าทะเบียนฝั่งงานขาย 6 จุดห่อ `<TableScroll surface="embedded">` ด้วย
   `<div className="premium-glass-table table-responsive">` อีกชั้น ⇒ ได้สองอย่างพร้อมกัน:
     1. **สองวง** — การ์ดนอกมีขอบ+เงา+มุมมน ส่วน embedded วาดกรอบ 1px ของตัวเองอีกวง
     2. **สองสกอร์ล** — `.table-responsive` ใส่ `overflow-x: auto` ให้การ์ดนอก
        ขณะที่ `.scroll` ก็เลื่อนแนวนอนได้อยู่แล้ว
   ✅ แก้โดยถอดกรอบนอกแล้วให้ `surface="auto"` วาดการ์ดเอง — ratchet legacyTable
   ของโมดูลงานขายลง 41 → 35 · ตรงกับที่ ProjectDealsHub.js กับ DealValueLines.js
   เคยบันทึกไว้ว่า "TableScroll วาดพื้นให้เองแล้ว" */
test("ห้ามห่อ TableScroll ด้วยการ์ดเก่า premium-glass-table", () => {
  const offenders = [];
  for (const file of jsFiles(path.join(WEBAPP, "src", "app")).concat(jsFiles(path.join(WEBAPP, "src", "components")))) {
    const lines = fs.readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "))
      .split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/className="[^"]*\bpremium-glass-table\b/.test(line)) return;
      /* ดูสองบรรทัดถัดไป — TableScroll มักอยู่บรรทัดถัดจากกรอบพอดี */
      const near = lines.slice(index + 1, index + 3).join(" ");
      if (/<TableScroll\b/.test(near)) {
        offenders.push(`${path.relative(WEBAPP, file).replaceAll("\\", "/")}:${index + 1}`);
      }
    });
  }
  /* 🪤 **ไม่ใช่ hard-zero และไม่มีลิสต์ยกเว้น** — รอบนี้ถอดได้ 6 จุด (หน้าทะเบียน
     ฝั่งงานขาย ซึ่งเป็นที่ที่เจ้าของงานทักมา) เหลืออีก 12 จุดในหน้ารายละเอียดกับ
     แดชบอร์ด ที่ทรงต่างกันพอจะต้องดูทีละจุด (บางตัวเป็น `fz-box premium-glass-table`
     ที่กรอบนอกทำงานอื่นอยู่ด้วย)
     ⇒ ใช้เพดานสองทางแบบเดียวกับ ratchet ตัวอื่นในรีโป: มากกว่านี้ = เพิ่มของใหม่ ⇒ ตก ·
     น้อยกว่านี้ = ถอดได้แล้ว ⇒ ให้รูดเลขลง ห้ามทิ้งไว้เกินจริง
     ⚠️ ห้ามเปลี่ยนเป็นลิสต์ยกเว้นรายไฟล์ — ทะเบียนยกเว้นคือทะเบียนที่หมดอายุเงียบ */
  const CAP = 12;
  assert.ok(offenders.length <= CAP,
    `การ์ดเก่าห่อ TableScroll เพิ่มขึ้น: ${offenders.length} > เพดาน ${CAP}\n`
    + "= สองวงซ้อนกัน + สกอร์ลแนวนอนสองชั้น\n"
    + "ถอดกรอบนอกออกแล้วใช้ `surface=\"auto\"` ให้ TableScroll วาดการ์ดเอง\n"
    + offenders.join("\n"));
  assert.equal(offenders.length, CAP,
    `ถอดได้แล้ว เหลือ ${offenders.length} แต่เพดานยังเขียน ${CAP} — รูดเพดานลง (ขึ้นไม่ได้)`);
});
