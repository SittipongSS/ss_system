import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ความสูงตัวควบคุม — `--ctl-h` คือมาตรฐานของปุ่ม/ช่องกรอก/ดรอปดาวน์ทุกชนิด
   (ตั้งไว้ตั้งแต่ #791→#793 ตอนที่ช่องกรอกเคยตรึง 32px แล้วเตี้ยกว่าปุ่มแถวเดียวกัน)
   ⭐ 2026-08-14: 36px → **40px** (มติผู้ใช้ จากภาพจริง "ขอเพิ่มความสูง มีปัญหาทั้งระบบ")
   พร้อมโทเคนคู่กัน `--ctl-text-sink` ที่ดันตัวอักษรขึ้นให้กลางที่ตาเห็น — เหตุผลและ
   ตัวเลขที่วัดมาอยู่ในคอมเมนต์ของโทเคนใน globals.css

   ตรวจ 2026-07-29: `.form-action-bar .btn` เขียน `min-height: 38px` ทับไว้ = ปุ่มใน
   แถบท้ายฟอร์มสูงกว่าปุ่มที่อื่น 2px โดยไม่มีเหตุผลด้านดีไซน์รองรับ — drift แบบ
   เดียวกับที่ `.btn.ghost` เคยโดน (#816: บริบทเปลี่ยนได้แค่ *สี* ห้ามเขียนรูปทรงทับ)

   ⚠️ ความสูงที่ **จงใจให้ต่าง** มีจริงและต้องมีชื่อ: `--ctl-h-touch` 44px สำหรับจอ
   สัมผัส (เกณฑ์ ≥44px ของ WCAG 2.5.5) เดิมเลข 44 กระจายอยู่แบบไม่มีชื่อจนแยกไม่ออก
   ว่าอันไหนตั้งใจ อันไหนหลุด */

const GLOBALS = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("มาตรฐานความสูงตัวควบคุมมีสองค่า และทั้งคู่มีชื่อ", () => {
  assert.match(GLOBALS, /--ctl-h:\s*40px;/);
  assert.match(GLOBALS, /--ctl-h-touch:\s*44px;/,
    "ความสูงสำหรับจอสัมผัสต้องมีชื่อ ไม่งั้นเลข 44 จะแยกไม่ออกจากเลขที่หลุดมา");
  assert.match(GLOBALS, /^\.btn \{[^}]*min-height:\s*var\(--ctl-h\)/ms,
    ".btn ต้องรับความสูงจาก --ctl-h");
});

/* ⭐ ตัวอักษรไทยในกล่องความสูงคงที่ต้องกลาง "ที่ตาเห็น" — เบราว์เซอร์จัดกลางตามกล่อง
   ฟอนต์ (Sarabun 13px = ขึ้น 14 / ลง 3) แต่สระล่าง+ขีดล่างของไทยลงจริง 4.49px
   ⇒ ทุกกล่องนั่งต่ำกว่ากลาง 1.5px ถ้าไม่หั่นพื้นล่างออก

   🔴 **รอบสอง (2026-08-14): sink ใช้กับ "กล่องที่ผู้ใช้พิมพ์" เท่านั้น**
   รอบแรกใส่ให้ป้ายคงที่ด้วย (ปุ่ม · แท็บ · segmented · ชิป · พิลแถบบน) แล้ววัดด้วย
   **ป้ายจริง** พบว่าแย่ลง เพราะป้ายไทยในระบบส่วนใหญ่ไม่มีสระล่างให้เผื่อ:
   "ยกเลิก" −0.8 → −3.5 · "อีเมล" −1.8 → −4.7 · "รอคัดกรอง" ~−1.4 → −4.2
   (ลบ = ลอยสูง) ⇒ ถอยออกทั้งชุด เหลือเฉพาะช่องกรอก/ดรอปดาวน์/ช่องค้นหา

   ⚠️ ด่านนี้กันสองทิศ: **หายไปจากช่องที่ผู้ใช้พิมพ์** (อาการเดิมกลับมา) และ
   **งอกใส่ป้ายคงที่/ไอคอน/เลขล้วนอีก** (ลอยสูง) */
const LABEL_CONTROLS = [".btn", ".btn-icon", ".ui-pager-page", ".tab-btn", ".chip", ".ui-badge", ".status-pill"];

test("เฉพาะกล่องที่ผู้ใช้พิมพ์ที่ได้ sink — ป้ายคงที่ต้องไม่ได้", () => {
  assert.match(GLOBALS, /--ctl-text-sink:\s*0\.18em;/,
    "ค่าที่ดันตัวอักษรขึ้นต้องมีชื่อ และต้องเป็น em — ช่องกรอกใช้ 14px ช่องอื่นเล็กกว่า "
    + "ตรึงเป็น px จะดันเกินที่ตัวเล็ก · 0.18em คือจุดที่ค่าผิดสุดต่ำสุด (±3px) — หมึกไทยสูงไม่เท่ากันทุกคำ");

  const css = stripComments(GLOBALS);
  const rule = css.match(/([^{}]*)\{[^{}]*padding-bottom:\s*var\(--ctl-text-sink\)[^{}]*\}/);
  assert.ok(rule, "ไม่มีใครใช้ --ctl-text-sink เลย — ช่องกรอกกลับไปนั่งต่ำ");

  const selector = rule[1].replace(/\s+/g, " ").trim();
  for (const field of [".premium-input:not(textarea)", ".premium-select", ".ui-select",
    ".deal-derived", ".search-glass input", ".ui-select-search input"]) {
    assert.ok(selector.includes(field), `${field} หลุดจากชุดที่ดันตัวอักษรขึ้น`);
  }
  assert.ok(selector.includes(":not(textarea)"),
    "textarea ต้องถูกกัน — มี padding แนวตั้ง 8px ของตัวเองอยู่แล้ว");

  /* ป้ายคงที่ต้องไม่มี sink ที่ไหนเลย — ตัด `:not(...)` ก่อนตรวจ เพราะชื่อที่อยู่ใน
     `:not()` คือการ *กัน* ไม่ใช่การ *เล็ง* */
  for (const block of css.split("}")) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    if (!block.slice(brace + 1).includes("var(--ctl-text-sink)")) continue;
    const targeted = block.slice(0, brace).replace(/:not\([^)]*\)/g, "");
    for (const label of LABEL_CONTROLS) {
      assert.ok(!new RegExp(`\\${label}(?![\\w-])`).test(targeted),
        `${label} เป็นป้ายคงที่ (ข้อความรู้ล่วงหน้า ไม่มีสระล่างให้เผื่อ) — ห้ามใส่ sink`);
    }
  }

  /* ช่องค้นหาเคยเป็น "ความสูงที่สาม" (38px) ทั้งที่เอกสารประกาศว่ามีแค่สองค่า */
  assert.match(css, /\.search-glass \{[^{}]*min-height:\s*var\(--ctl-h\)/,
    "ช่องค้นหาต้องสูงเท่า control อื่น ไม่ใช่ 38px ของตัวเอง");

});

/* ช่องกรอกกับดรอปดาวน์ต้องขนาดเดียวกัน และเท่าช่องค้นหา — ผู้ใช้ชี้เองว่าช่องค้นหา
   "ไม่เป็น" แล้ววัดได้ว่าการจัดกลางเท่ากันเป๊ะ ต่างแค่ขนาดตัวอักษร (14 vs 13px)
   ⇒ มติ 2026-08-14: ยกช่องกรอก/ดรอปดาวน์เป็น `--fs-8` ให้เท่าช่องค้นหา */
test("ช่องกรอก ดรอปดาวน์ และรายการในเมนู ใช้ขนาดตัวอักษรเดียวกับช่องค้นหา", () => {
  const css = stripComments(GLOBALS);
  for (const sel of [".premium-input", ".premium-select", ".ui-select", ".deal-derived", ".ui-select-option"]) {
    const block = css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`));
    assert.ok(block, `หา ${sel} ไม่เจอ`);
    assert.match(block[1], /font-size:\s*var\(--fs-8\)/,
      `${sel} ต้องเป็น --fs-8 (14px) เท่าช่องค้นหา ไม่ใช่ 13px`);
  }
  const search = css.match(/\.search-glass input \{([^}]*)\}/);
  assert.ok(search && /font-size:\s*var\(--fs-8\)/.test(search[1]),
    "ช่องค้นหาคือค่าอ้างอิงของขนาดนี้ — ถ้ามันเปลี่ยน ต้องย้ายทั้งชุดพร้อมกัน");
});

/* 🔴 ขีดล่าง `_` ต้องหนาพอวาดเต็มพิกเซลบนจอ 1x — Sarabun น้ำหนัก 400 หนา 0.86px
   ที่ 13px / 0.93px ที่ 14px ⇒ เบราว์เซอร์เกลี่ยเป็นเทาจางแล้วหายทั้งเส้น (IS-26080022)
   ⚠️ ช่องค้นหาเคยหลุดจากการแก้รอบนั้น (ยังเป็น 400 อยู่จนถึง 2026-08-14) — ทุกกล่องที่
   ผู้ใช้พิมพ์ชื่อที่มี `_` (ดีล/กลิ่น/โครงการ) ต้องอยู่ที่ 600 ทั้งหมด ไม่ใช่บางกล่อง */
test("ทุกกล่องที่ผู้ใช้พิมพ์ใช้น้ำหนัก 600 — ไม่งั้น `_` หายบนจอ 1x", () => {
  const css = stripComments(GLOBALS);
  for (const sel of [".premium-input", ".search-glass input", ".ui-select-search input", ".ui-select"]) {
    const block = css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`));
    assert.ok(block, `หา ${sel} ไม่เจอ`);
    assert.match(block[1], /font-weight:\s*var\(--fw-semibold\)/,
      `${sel} ต้องเป็น --fw-semibold — ที่ 400 ขีดล่างจะหายบนจอ 1x (IS-26080022)`);
  }
});

/* **variant ของขนาด** — ผู้เรียกเลือกเองว่าจะใช้ปุ่มเล็ก/ปุ่มไอคอน ต่างจาก descendant
   selector ที่ทับความสูงให้โดยไม่มีใครสั่ง จึงไม่ใช่ drift */
const SIZE_VARIANTS = [".btn.sm", ".btn-icon"];

/* ✅ ปิดหนี้ 40px ของหน้าแรกแล้ว (2026-07-30) — เดิมเดาว่า "จงใจ เพราะ launchpad
   ต้องกดง่าย" แต่จำลอง markup แล้ววัดจริงบนจอ 375px: ปุ่มลัดหน้าแรกได้ 40px ขณะที่
   ปุ่มบันทึกในฟอร์มได้ 44px — **launchpad มีเป้าเล็กกว่าฟอร์ม** ตรงข้ามกับเหตุผลที่
   ใช้อ้าง 40px จึงไม่เคยทำหน้าที่ที่ตั้งใจไว้เลย
   ทางออก: จอแคบใช้ --ctl-h-touch (เกณฑ์ "กดง่าย" ที่มีชื่ออยู่แล้ว) · เดสก์ท็อปยุบเข้า
   --ctl-h เพราะเมาส์ไม่ต้องการเป้าใหญ่ = ไม่เหลือเหตุผลให้มีขนาดที่สาม
   (ไม่ตั้ง --ctl-h-lg เพราะจะได้โทเคนที่มีผู้ใช้จุดเดียวและไม่มีกฎว่าใช้เมื่อไหร่)
   ⚠️ ลิสต์นี้ต้องว่างเสมอ — เจอความสูงปุ่มที่ไม่มีชื่อ ให้ตัดสินตอนนั้น อย่าพักไว้ */
const UNRESOLVED = [];

/* 🔴 รูที่เพิ่งปิด (2026-07-30): กฎนี้เคยอ่าน **แค่ globals.css** ไฟล์เดียว
   CSS module จึงเขียนความสูงปุ่มทับได้ฟรีมาตลอด และมีของหลุดจริง 3 จุด —
   ทั้งหมดตั้ง 40px ในจอแคบ ทั้งที่ระบบตั้งเกณฑ์จอสัมผัสไว้เอง 44px (WCAG 2.5.5):
   StatusNotice · CommercialPresetPicker ×2 · อีกจุดยังตั้ง 32px ทับ `.btn.sm`
   ที่ผู้เรียกขอมาแล้ว = สู้กับ variant ของตัวเอง
   ตอนนี้ไล่ทุกไฟล์ CSS รวม `:global(.btn)` ของ CSS module ด้วย */
const CSS_FILES = (function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (full.endsWith(".css")) out.push(full);
  }
  return out;
})(path.join(process.cwd(), "src"));

/* เอกสารพิมพ์ประกอบ CSS ของตัวเองและไม่โหลด globals.css โทเคนไม่มีค่าที่นั่น */
const EXEMPT = ["src\\components\\documents\\", "src/components/documents/"];

test("ไม่มีบริบทไหนเขียนความสูงปุ่มทับด้วยเลขดิบ (ทุกไฟล์ CSS)", () => {
  const offenders = [];
  for (const file of CSS_FILES) {
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    if (EXEMPT.some((p) => rel.startsWith(p.replaceAll("\\", "/")))) continue;
    for (const block of stripComments(fs.readFileSync(file, "utf8")).split("}")) {
      const brace = block.indexOf("{");
      if (brace === -1) continue;
      const selector = block.slice(0, brace).split("\n").filter(Boolean).join(" ").trim();
      /* `:global(.btn)` ของ CSS module ก็คือปุ่มตัวเดียวกัน — เดิมหลุดเพราะไม่ได้อ่านไฟล์นี้ */
      if (!/\.btn\b|:global\(\.btn\b/.test(selector)) continue;
      const flat = selector.replace(/\s+/g, " ").trim();
      if (SIZE_VARIANTS.includes(flat) || UNRESOLVED.includes(flat)) continue;
      const body = block.slice(brace + 1);
      const hit = body.match(/(?:^|;)\s*(?:min-)?height:\s*(\d+)px/m);
      if (hit) offenders.push(`${rel} — ${flat} → ${hit[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [],
    "ความสูงปุ่มต้องมาจาก --ctl-h / --ctl-h-touch — บริบทเปลี่ยนได้แค่สี (ดู #816)");
});

test("หนี้ที่ยกเว้นไว้ยังมีอยู่จริง ไม่ใช่ค้างชื่อไว้เกินจริง", () => {
  const css = stripComments(GLOBALS).replace(/\s+/g, " ");
  for (const selector of UNRESOLVED) {
    assert.ok(css.includes(selector),
      `${selector} ไม่มีแล้ว — เอาออกจาก UNRESOLVED (ไม่งั้นลิสต์ยกเว้นจะบวมขึ้นเรื่อย ๆ)`);
  }
});

/* ปุ่มหน้าแรกเคยเป็นข้อยกเว้นเดียวที่ค้างมานาน — ตรึงผลการตัดสินไว้ ไม่ให้ 40px
   กลับมาเงียบ ๆ และให้จอแคบยังได้เป้าตามเกณฑ์ */
test("ปุ่มหน้าแรกใช้ความสูงที่มีชื่อ ไม่ใช่ 40px ลอย ๆ", () => {
  const css = stripComments(GLOBALS);
  assert.doesNotMatch(css, /\.home-(?:hub-shortcuts|continue-card) \.btn \{[^}]*min-height:\s*40px/,
    "40px กลับมาแล้ว — เดสก์ท็อปต้องรับจาก .btn (--ctl-h)");
  assert.match(css, /\.home-hub-shortcuts \.btn,\s*\.home-continue-card \.btn \{[^}]*min-height:\s*var\(--ctl-h-touch\)/,
    "จอแคบต้องได้เป้าขนาดจอสัมผัส ไม่งั้น launchpad จะกดยากกว่าปุ่มในฟอร์ม");
});

test("ค่าจอสัมผัสถูกใช้เฉพาะกับตัวควบคุมจริง", () => {
  /* กันการเหมาแทนเลข 44 ทั้งไฟล์ — ตอนทำรอบนี้ codemod เผลอไปแทนที่ `.prod-gantt-label`
     `.prod-gantt-timeline` และช่องลายเซ็นบนใบพิมพ์ ซึ่งบังเอิญสูง 44px เหมือนกัน
     แต่ไม่ใช่เป้าที่นิ้วต้องกด */
  const uses = [];
  for (const block of stripComments(GLOBALS).split("}")) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    if (!/var\(--ctl-h-touch\)/.test(block.slice(brace + 1))) continue;
    uses.push(block.slice(0, brace).split("\n").filter(Boolean).join(" ").trim());
  }
  /* เป้าที่นิ้วต้องกดจริงแต่ไม่ใช่ `.btn` — ต้องระบุชื่อไว้ตรงนี้ทีละตัวเท่านั้น
     ห้ามผ่อนเป็นแพตเทิร์นกว้าง ๆ ไม่งั้นด่านนี้กลับไปเหมาเลข 44 ทั้งไฟล์เหมือนเดิม */
  const TOUCH_TARGETS_NOT_BTN = [
    ".mbn-item", // ปุ่มเมนูบนแถบล่างมือถือ — เป็น <a> ไม่ใช่ .btn แต่คือเป้ากดหลักของทั้งจอ
  ];
  assert.ok(uses.length > 0, "ไม่มีใครใช้ --ctl-h-touch เลย");
  for (const selector of uses) {
    if (TOUCH_TARGETS_NOT_BTN.some((allowed) => selector.includes(allowed))) continue;
    assert.match(selector, /\.btn\b/,
      `${selector} ไม่ใช่ปุ่ม — --ctl-h-touch มีไว้สำหรับเป้าที่นิ้วต้องกดเท่านั้น`);
  }
});
