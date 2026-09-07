import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── ของเหนือตารางคิวต้องเตี้ย และเตี้ยแบบไม่ตัดข้อมูลทิ้ง (2026-09-07) ──────
   เจ้าของระบบสั่งย่อ StartHereCard กับแถบตัวเลขที่หน้าคิว

   วัดสด /requests 1440×900:
     แถบตัวเลข 5 ช่อง   97px → 66px
     การ์ดสถานะว่าง      50px → 42px
     การ์ดสถานะมีงาน    177px → 58px   (วัดที่ /rd ซึ่งมีใบค้างจริง)
     ของเหนือตารางรวม   562px → 523px  (สถานะว่าง)
                        689px → 539px  (สถานะมีงาน)

   ผลพลอยได้ที่สำคัญกว่าความสูง: หน้าเคยกระโดด 127px ตอนสลับสองสถานะ เหลือ 16px

   ⚠️ กติกาที่ยามนี้ล็อกไว้คือ "เตี้ยโดยไม่เสียอะไร" — ทุกข้อข้างล่างคือทางลัด
   ที่ทำให้เตี้ยกว่านี้ได้อีก แต่แลกด้วยของที่ผู้ใช้ต้องใช้จริง */

const WEBAPP = process.cwd();
const GLOBALS = fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
/* ⚠️ ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์ในไฟล์นั้นอ้างชื่อ attribute อยู่ด้วย
   ถ้าตรวจบนซอร์ซดิบ ลบ attribute จริงทิ้งแล้วยามยังเขียว (เจอตอนทดสอบยามรอบนี้) */
const STRIP = fs.readFileSync(path.join(WEBAPP, "src", "components", "requests", "QueueCountStrip.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const CARD_CSS = fs.readFileSync(path.join(WEBAPP, "src", "components", "requests", "StartHereCard.module.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const compactRules = GLOBALS.match(/\.ui-metric-strip\[data-density="compact"\][^{]*\{[^}]*\}/g) || [];

/* อ่านกฎทีละก้อนจาก CSS Module — ไฟล์นี้ไม่มี at-rule ซ้อนที่ลึกกว่า @media */
function rule(source, selector) {
  for (const hit of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (hit[1].trim().replace(/\s+/g, " ") === selector) return hit[2];
  }
  return null;
}

/* ── สัญญาข้ามไฟล์ — หายไปข้างเดียวแล้วแถบเด้งกลับเป็น 97px โดย CI เขียว ───── */
test("แถบตัวเลขคิวต้องขอทรงเตี้ย และ globals ต้องมีกฎรองรับ", () => {
  assert.match(STRIP, /<MetricStrip\b[^>]*data-density="compact"/,
    'QueueCountStrip ต้องส่ง data-density="compact" ให้ <MetricStrip> เอง ไม่ใช่แค่พูดถึงในคอมเมนต์');
  assert.ok(compactRules.length >= 4,
    `globals ต้องมีกฎ [data-density="compact"] อย่างน้อย 4 ก้อน (เจอ ${compactRules.length})`);
});

/* ── 🪤 กับดักที่แพงที่สุดของงานนี้ ────────────────────────────────────────
   `Metric` วางกรอบไอคอนเป็น <span class="ui-metric-icon"> ซึ่งเป็นลูกตรงอีกใบ
   กฎ `> span` เฉย ๆ จะไปทับ display:grid + place-items:center ของกรอบไอคอน
   แล้ว svg 16px หลุดไปชิดซ้ายในกรอบ 32px ทุกช่องของ 4 หน้าคิว
   ⚠️ audit:ui ให้ผลเหมือนเดิมทุกไบต์ — ไม่มีด่านไหนจับได้นอกจากตัวนี้
   (วัดหลังแก้: svg อยู่ที่ dx 8 dy 4 ในกรอบ 32×32 = กลางพอดี) */
test("กฎทรงเตี้ยห้ามแตะกรอบไอคอน", () => {
  assert.doesNotMatch(GLOBALS, /\[data-density="compact"\][^{]*\.ui-metric > span \{/,
    "`> span` เฉย ๆ จะทับ .ui-metric-icon — ต้องเขียน :not(.ui-metric-icon)");
  assert.match(GLOBALS, /\[data-density="compact"\][^{]*\.ui-metric > span:not\(\.ui-metric-icon\)/,
    "ต้องกันกรอบไอคอนออกอย่างชัดเจน");
});

/* ── ห้ามประหยัดความสูงด้วยการบีบกล่องบรรทัด ───────────────────────────────
   มติ 2026-08-14 กลับมติเรื่องนี้ไปแล้วรอบหนึ่ง: line-height 1.25em ที่ 18px
   ให้กล่อง 22.5px แต่หมึกไทยที่แย่สุดกิน 1.58em = 28.4px ⇒ สระโดนเฉือนจริง */
test("ทรงเตี้ยห้ามลด line-height", () => {
  for (const body of compactRules) {
    assert.doesNotMatch(body, /line-height/,
      "ความสูงต้องมาจากการยุบบรรทัดกับ padding ไม่ใช่จากกล่องบรรทัด (มติ 2026-08-14)");
  }
});

/* ── ป้ายของช่องคือ "ชื่อของปุ่มกรอง" ห้ามโดน … ตัด ────────────────────────
   "ยังไม่รับเรื่อง" กับ "ยังไม่ได้ให้วัน" ขึ้นต้นเหมือนกัน ตัดแล้วแยกไม่ออกว่ากดอันไหน
   ยอมให้ตกบรรทัด (แถบสูงขึ้น ~18px แต่ยังเตี้ยกว่าเดิม) ดีกว่าอ่านไม่ออก */
test("ป้ายของช่องในทรงเตี้ยห้ามถูกตัดด้วย …", () => {
  const smallRule = compactRules.find((r) => /\.ui-metric small/.test(r)) || "";
  assert.ok(smallRule, "ต้องมีกฎของ small ในชุดทรงเตี้ย");
  assert.doesNotMatch(smallRule, /white-space:\s*nowrap|text-overflow/,
    "ป้ายคือชื่อปุ่มกรอง ตัดไม่ได้");
});

/* ── หมายเหตุต้องยังอยู่บนจอ ห้ามซ่อน ─────────────────────────────────────
   `button.ui-metric:hover` กับ `.ui-metric.is-active` ใช้พื้นสีเดียวกัน
   (ประกาศเดียวกันใน globals) ⇒ หมายเหตุ "กำลังใช้ตัวกรองนี้" เป็นสิ่งเดียว
   ที่บอกว่าตัวกรองไหนเปิดอยู่ · บนจอสัมผัสไม่มี hover ให้เทียบด้วย */
test("หมายเหตุของช่องห้ามถูกซ่อนในทรงเตี้ย", () => {
  const emRule = compactRules.find((r) => /\.ui-metric em/.test(r)) || "";
  assert.ok(emRule, "ต้องมีกฎของ em ในชุดทรงเตี้ย");
  assert.doesNotMatch(emRule, /display:\s*none|visibility:\s*hidden|clip-path/,
    "หมายเหตุคือตัวบอกสถานะตัวกรอง ซ่อนไม่ได้");
  assert.match(STRIP, /note=\{on \? "กำลังใช้ตัวกรองนี้"/,
    "ช่องที่กดค้างอยู่ต้องเปลี่ยนหมายเหตุ — ไม่งั้นแยกจาก hover ไม่ออก");
});

/* ── การ์ด "เริ่มที่นี่" ─────────────────────────────────────────────────── */

test("สองสถานะของการ์ดต้องมีระยะในเท่ากัน ไม่งั้นหน้ากระโดด", () => {
  const card = rule(CARD_CSS, ".card");
  const clear = rule(CARD_CSS, ".clear");
  assert.ok(card && clear, "หากฎ .card / .clear ไม่เจอ");
  const pad = (body) => (body.match(/padding:\s*([^;]+)/) || [])[1]?.trim();
  assert.equal(pad(card), pad(clear),
    "สองสถานะสลับกันเองตามข้อมูล ระยะในไม่เท่ากันเมื่อไรหน้ากระโดดทุกครั้งที่งานเข้า/หมด");
});

test("เนื้อการ์ดต้องตกบรรทัดได้ ไม่ใช่ล้นไปทับปุ่ม", () => {
  const body = rule(CARD_CSS, ".body");
  assert.ok(body, "หากฎ .body ไม่เจอ");
  assert.match(body, /flex-wrap:\s*wrap/,
    "ทรงแถวเดียวจะปลอดภัยก็ต่อเมื่อของตกบรรทัดเองได้เมื่อที่ไม่พอ");
});

test("ชื่อเรื่องบนการ์ดห้ามถูกตัด — ที่ /rd ใบนี้ไม่อยู่ในตาราง", () => {
  const doc = rule(CARD_CSS, ".doc");
  assert.ok(doc, "หากฎ .doc ไม่เจอ");
  assert.match(doc, /overflow-wrap:\s*anywhere/, "ต้องขึ้นบรรทัดใหม่ได้ทุกที่");
  assert.doesNotMatch(doc, /text-overflow|white-space:\s*nowrap/,
    "การ์ดคือที่เดียวที่เห็นชื่อเรื่องของใบนั้นที่ /rd (ตารางตัดใบนี้ออกไปแล้ว)");
});

test("จอแคบต้องกลับไปเป็นกองซ้อน — แถวเดียวบนจอแคบคือของตกบรรทัดทุกชิ้น", () => {
  const narrow = CARD_CSS.slice(CARD_CSS.indexOf("@media (max-width: 640px)"));
  assert.ok(narrow.startsWith("@media"), "ต้องมีบล็อกจอแคบ");
  assert.match(narrow, /\.body\s*\{[^}]*flex-direction:\s*column/,
    "จอแคบให้ .body กลับเป็นคอลัมน์");
  assert.match(narrow, /\.actions > \*\s*\{[^}]*flex:\s*1/,
    "ปุ่มยังต้องเต็มความกว้างบนจอแคบ (เป้ากดที่พลาดง่ายที่สุดในหน้า)");
});
