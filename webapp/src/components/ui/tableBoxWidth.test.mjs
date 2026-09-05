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
