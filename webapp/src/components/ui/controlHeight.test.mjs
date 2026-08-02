import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ความสูงตัวควบคุม — `--ctl-h` 36px คือมาตรฐานของปุ่ม/ช่องกรอก/ดรอปดาวน์ทุกชนิด
   (ตั้งไว้ตั้งแต่ #791→#793 ตอนที่ช่องกรอกเคยตรึง 32px แล้วเตี้ยกว่าปุ่มแถวเดียวกัน)

   ตรวจ 2026-07-29: `.form-action-bar .btn` เขียน `min-height: 38px` ทับไว้ = ปุ่มใน
   แถบท้ายฟอร์มสูงกว่าปุ่มที่อื่น 2px โดยไม่มีเหตุผลด้านดีไซน์รองรับ — drift แบบ
   เดียวกับที่ `.btn.ghost` เคยโดน (#816: บริบทเปลี่ยนได้แค่ *สี* ห้ามเขียนรูปทรงทับ)

   ⚠️ ความสูงที่ **จงใจให้ต่าง** มีจริงและต้องมีชื่อ: `--ctl-h-touch` 44px สำหรับจอ
   สัมผัส (เกณฑ์ ≥44px ของ WCAG 2.5.5) เดิมเลข 44 กระจายอยู่แบบไม่มีชื่อจนแยกไม่ออก
   ว่าอันไหนตั้งใจ อันไหนหลุด */

const GLOBALS = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("มาตรฐานความสูงตัวควบคุมมีสองค่า และทั้งคู่มีชื่อ", () => {
  assert.match(GLOBALS, /--ctl-h:\s*36px;/);
  assert.match(GLOBALS, /--ctl-h-touch:\s*44px;/,
    "ความสูงสำหรับจอสัมผัสต้องมีชื่อ ไม่งั้นเลข 44 จะแยกไม่ออกจากเลขที่หลุดมา");
  assert.match(GLOBALS, /^\.btn \{[^}]*min-height:\s*var\(--ctl-h\)/ms,
    ".btn ต้องรับความสูงจาก --ctl-h");
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
