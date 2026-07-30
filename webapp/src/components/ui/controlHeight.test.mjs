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

/* หนี้ที่ยังไม่ตัดสิน: หน้าแรกทำปุ่มลัดสูง 40px (ระหว่างมาตรฐาน 36 กับจอสัมผัส 44)
   น่าจะจงใจ — หน้าแรกเป็น launchpad ที่ตั้งใจให้กดง่าย — แต่ยังไม่มีชื่อรองรับ
   ผมยืนยันด้วยตาไม่ได้จากที่นี่ (หน้าแรกต้องมีเซสชัน) จึงยังไม่แตะ
   ⚠️ ทางออกคือ *ตั้งชื่อ* ให้มัน (เช่น --ctl-h-lg) หรือยุบเข้ามาตรฐาน — ไม่ใช่ปล่อยไว้
   ห้ามเติมชื่อใหม่เข้าลิสต์นี้เพื่อให้เทสต์ผ่าน */
const UNRESOLVED = [".home-hub-shortcuts .btn", ".home-continue-card .btn"];

test("ไม่มีบริบทไหนเขียนความสูงปุ่มทับด้วยเลขดิบ", () => {
  const offenders = [];
  for (const block of stripComments(GLOBALS).split("}")) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    const selector = block.slice(0, brace).split("\n").filter(Boolean).join(" ").trim();
    if (!/\.btn\b/.test(selector)) continue;
    const flat = selector.replace(/\s+/g, " ").trim();
    if (SIZE_VARIANTS.includes(flat) || UNRESOLVED.includes(flat)) continue;
    const body = block.slice(brace + 1);
    const hit = body.match(/(?:^|;)\s*(?:min-)?height:\s*(\d+)px/m);
    if (hit) offenders.push(`${selector} → ${hit[0].trim()}`);
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
  assert.ok(uses.length > 0, "ไม่มีใครใช้ --ctl-h-touch เลย");
  for (const selector of uses) {
    assert.match(selector, /\.btn\b/,
      `${selector} ไม่ใช่ปุ่ม — --ctl-h-touch มีไว้สำหรับเป้าที่นิ้วต้องกดเท่านั้น`);
  }
});
