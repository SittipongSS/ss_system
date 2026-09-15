import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* กล่องที่ครอบทั้งหน้า (.main-content) ห้ามกลายเป็น scroll container
   ─────────────────────────────────────────────────────────────────
   🐞 ของจริงที่เกิด (วัด 2026-08-08): `.main-content` ตั้ง `overflow-x: hidden`
   ไว้กันเนื้อหาล้นออกข้าง แต่ตามสเปก CSS ถ้าแกนหนึ่งเป็น hidden อีกแกนที่เป็น
   visible จะถูกบังคับเป็น auto ทันที กล่องนี้จึงกลายเป็น scroll container ทั้งที่
   ไม่เคยเลื่อนเอง (scrollHeight === clientHeight เป๊ะ เพราะมันยืดตามเนื้อหา)

   ผลคือ `position: sticky` ของลูก **ทุกตัว** ไปยึดกับกล่องที่นิ่งสนิท แทนที่จะยึด
   กับหน้าต่าง — getComputedStyle ตอบว่า `sticky` ครบทุกค่า (position, bottom,
   z-index) เลยดูเหมือนทำงาน แต่พอไถหน้าจอจริงแถบหลุดออกนอกจอ ตรวจไม่เจอถ้าดู
   แค่ computed style ต้องวัดตำแหน่งจริงตอนเลื่อนเท่านั้น

   `overflow-x: clip` ตัดแนวนอนเหมือน hidden ทุกอย่าง ต่างกันที่ไม่สร้าง scroll
   container ปล่อยให้ overflow-y คงเป็น visible ลูกจึงยึดกับหน้าต่างได้ */

const GLOBALS = fs.readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

const mainContentBlock = () => {
  const start = GLOBALS.indexOf("\n.main-content {");
  assert.ok(start > -1, "หา .main-content ใน globals.css ไม่เจอ");
  // ตัดคอมเมนต์ทิ้งก่อน — คอมเมนต์เตือนในบล็อกนั้นพูดคำว่า hidden อยู่ด้วย
  return GLOBALS.slice(start, GLOBALS.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
};

test("⭐ .main-content ตัดแนวนอนด้วย clip ห้าม hidden", () => {
  const block = mainContentBlock();
  assert.match(
    block,
    /overflow-x:\s*clip;/,
    ".main-content ต้องใช้ overflow-x: clip",
  );
  assert.doesNotMatch(
    block,
    /overflow(-x|-y)?:\s*(hidden|auto|scroll)/,
    "hidden/auto/scroll ทำให้กล่องนี้เป็น scroll container แล้ว sticky ของลูกทุกตัวตาย",
  );
});

test("แถบก้าวถัดไปยังปักหมุดด้วย sticky ไม่ใช่ fixed", () => {
  /* fixed จะหลุดจากความกว้างของคอลัมน์เนื้อหา แล้วต้องไล่คำนวณ left/right เอง
     ตามการมีอยู่ของแถบเมนู — sticky ได้ความกว้างมาฟรีจาก flow */
  const css = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "requests", "NextStepBar.module.css"),
    "utf8",
  );
  assert.match(css, /position:\s*sticky;/);
  assert.doesNotMatch(css, /position:\s*fixed;/);
});

/* ── แผงรายการ ListPanel ใช้ clip ไม่ใช่ hidden (มติผู้ใช้ 2026-09-15) ─────────────
   `.ui-section` ตัวแม่ยังเป็น `overflow: hidden` (ตัดพื้นหัวตามมุมมน) ซึ่งทำให้การ์ด
   เป็น scroll container ของ sticky ข้างใน · แผงรายการมีหัววันแบบ sticky อยู่ข้างใน
   (/notifications) ⇒ ต้อง `clip` — ตัดพื้นหัวตามมุมมนได้เหมือนกัน แต่ไม่สร้าง scroll
   container · ถ้าวันไหนมีคนเปลี่ยนกลับเป็น hidden หัววันจะหลุดจอเงียบ ๆ อีก */
test("⭐ .ui-section.ui-list-panel ตัดด้วย clip ห้าม hidden/auto/scroll", () => {
  const start = GLOBALS.indexOf("\n.ui-section.ui-list-panel {");
  assert.ok(start > -1, "หา .ui-section.ui-list-panel ใน globals.css ไม่เจอ");
  const block = GLOBALS.slice(start, GLOBALS.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(block, /overflow:\s*clip/, "แผงรายการต้องใช้ overflow: clip");
  assert.doesNotMatch(block, /overflow(-x|-y)?:\s*(hidden|auto|scroll)/,
    "hidden/auto/scroll ทำให้แผงรายการเป็น scroll container แล้ว sticky ข้างใน (หัววัน) ตาย");
});

/* ── คู่ของ clip: แถวชิปในแถบเครื่องมือของแผงต้องเลื่อนเองบนมือถือ (2026-09-16) ─────────
   clip ตัดของที่ล้นแผงทิ้งโดยไม่มีทางเลื่อน · วัดจริง /tax/filings จอ 390: ชิปสถานะ 8 อัน 423px ในแถบ 332px
   "ส่งเอกสารแล้ว" ขาดครึ่ง "ตีกลับ" กดไม่ได้ · /tax/registrations ปุ่มถูกบีบจนป้ายตัดกลางคำ ("ตี/กลับ")
   ⇒ ใน @media (max-width: 640px) แถว .segmented ที่เป็นลูกตรงของแถบต้องเลื่อนแนวนอนในตัวเอง และป้ายห้ามตัดบรรทัด
   อ่านด้วย postcss (ไม่ใช่ regex) — กฎต้องอยู่ในบล็อก 640 จริง ไม่ใช่แค่มีข้อความนี้ที่ไหนสักแห่ง */
test("⭐ ≤640: .segmented ในแถบเครื่องมือของแผงเลื่อนแนวนอนในตัวเอง · ป้ายชิปไม่ตัดบรรทัด", async () => {
  const { default: postcss } = await import("postcss");
  const decls = (selector) => {
    const out = {};
    postcss.parse(GLOBALS).walkRules((rule) => {
      const media = rule.parent?.type === "atrule" && rule.parent.name === "media" ? rule.parent.params.replace(/\s+/g, " ") : null;
      if (media !== "(max-width: 640px)") return;
      if (!rule.selectors.map((s) => s.replace(/\s+/g, " ").trim()).includes(selector)) return;
      rule.walkDecls((d) => { out[d.prop] = d.value; });
    });
    return out;
  };
  const row = decls(".ui-list-panel-toolbar > .segmented");
  assert.equal(row["overflow-x"], "auto", "แถวชิปต้อง overflow-x: auto — ไม่งั้น clip ของแผงตัดชิปท้ายทิ้งกดไม่ได้");
  assert.equal(row["max-width"], "100%", "แถวชิปต้อง max-width: 100% ของแถบ ไม่งั้นกว้างตามเนื้อแล้วไม่มีอะไรให้เลื่อน");
  const chip = decls(".ui-list-panel-toolbar > .segmented > button");
  assert.equal(chip["white-space"], "nowrap", "ป้ายชิปห้ามตัดบรรทัด (\"ตี/กลับ\")");
  assert.equal(chip.flex, "none", "ชิปห้ามหด — หดแล้วป้ายถูกบีบตัดกลางคำแทนที่แถวจะเลื่อน");
});
