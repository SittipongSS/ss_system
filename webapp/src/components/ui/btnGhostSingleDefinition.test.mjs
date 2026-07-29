import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* `.btn.ghost` เคยถูกนิยามซ้อน 3 ที่ (ตรวจ 2026-07-29):
     globals:781  ตัวจริง — ไม่มีขอบ ไม่มีพื้น ไม่มีเงา
     globals:515  `.form-action-bar .btn.ghost` **คืนขอบ+พื้น+เงาให้หมด** = ยกเลิก variant ทิ้ง
     globals:722  `.topnav-system .btn.ghost` เปลี่ยนสีตัวอักษรให้อ่านออกบนพื้นกรมท่า
   วัดจริงบนหน้าต้นแบบ: ปุ่มคลาสเดียวกัน ในแถบท้ายฟอร์มได้ขอบ rgba(225,230,241,.12)
   พื้นการ์ด และมีเงา ส่วนนอกแถบโปร่งใสหมด — คนเขียนหน้าใหม่จึงเดาไม่ออกว่าจะได้อะไร
   และเป็นเหตุผลที่คำถาม "quiet vs ghost" ตัดสินไม่ได้สักที เพราะ ghost ไม่มีหน้าตาเดียว

   กติกาที่ล็อกไว้: **รูปทรง** ของ ghost มาจากที่เดียว · บริบทเปลี่ยนได้แค่ *สี*
   ถ้าปุ่มในบริบทไหนต้องหน้าตาต่าง ให้เปลี่ยน tone/variant ที่ผู้เรียก ไม่ใช่ทับปลายทาง */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const FORM_ACTIONS = read("./FormActions.js");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** ทุกบล็อกที่ selector แตะ `.btn` + `ghost` พร้อมกัน */
function ghostBlocks() {
  return stripComments(GLOBALS).split("}").flatMap((chunk) => {
    const open = chunk.indexOf("{");
    if (open === -1) return [];
    const selector = chunk.slice(0, open).split("\n").filter(Boolean).join(" ").trim();
    if (!/\.btn\.ghost\b/.test(selector)) return [];
    return [{ selector, body: chunk.slice(open + 1) }];
  });
}

test("รูปทรงของ ghost ถูกนิยามที่เดียว — บริบทอื่นเปลี่ยนได้แค่สี", () => {
  const BOX = ["background", "border", "border-color", "border-width", "box-shadow", "padding", "min-height", "height"];
  const offenders = [];
  for (const { selector, body } of ghostBlocks()) {
    // `.btn.ghost` / `.btn.ghost:hover` ล้วน ๆ คือตัวจริง — เขียนรูปทรงได้
    if (/^\.btn\.ghost(:[a-z-]+)?$/.test(selector.replace(/\s+/g, ""))) continue;
    for (const prop of BOX) {
      /* `background` ของ :hover เป็นการเน้นสีตอนชี้ ไม่ใช่รูปทรง — ตัวจริงก็ทำแบบเดียวกัน */
      if (prop === "background" && /:hover/.test(selector)) continue;
      if (new RegExp(`(?:^|;)\\s*${prop}\\s*:`, "m").test(body)) {
        offenders.push(`${selector} → ${prop}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    "บริบทกำลังเขียนรูปทรงของ ghost ทับ — เปลี่ยน tone/variant ที่ผู้เรียกแทน");
});

test("ไม่มีกฎที่ผูก ghost กับแถบปุ่มท้ายฟอร์มอีก", () => {
  assert.equal(/\.form-action-bar[^{}]*\.btn\.ghost/.test(stripComments(GLOBALS)), false,
    "`.form-action-bar .btn.ghost` กลับมาแล้ว = ยกเลิก variant ทิ้งอีกรอบ");
});

test("ปุ่มยกเลิกในแถบท้ายฟอร์มเป็นการกระทำรอง ไม่ใช่ปุ่มเงียบ", () => {
  assert.match(FORM_ACTIONS, /<Button tone="neutral"[^>]*>ยกเลิก<\/Button>/,
    "ถ้ากลับไปใช้ variant=\"quiet\" ปุ่มจะไม่มีขอบ/พื้น แล้วจะมีคนไปเขียนกฎทับที่ globals อีก");
});

test("สีตัวอักษรบนแถบกรมท่ามาจากโทเคน ไม่ใช่ขาวตายตัว", () => {
  for (const { selector, body } of ghostBlocks()) {
    if (!/topnav/.test(selector)) continue;
    assert.doesNotMatch(body, /#fff\b|#ffffff\b|\brgba?\(\s*255\s*,\s*255\s*,\s*255/,
      `${selector} เขียนสีขาวตายตัว — ใช้ var(--navy-fg) ที่เป็นสีตัวอักษรของพื้นกรมท่า`);
  }
});
