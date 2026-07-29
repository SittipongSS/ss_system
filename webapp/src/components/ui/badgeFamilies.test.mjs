import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ระบบมี "ป้ายเล็กมีพื้น" อยู่ 4 ชุดขนานกัน — ยังไม่ได้ยุบรวม แต่ทุกชุดต้องเว้นที่
   เหนือตัวอักษรพอสำหรับสระบน/วรรณยุกต์ไทย (ั ิ ่ ้) ไม่งั้นตัวหนังสือชนขอบหรือโดนตัด

   ของจริงที่วัดได้ก่อนแก้ (2026-07-29): `.ui-badge` ซึ่งใช้มากที่สุด 133 จุด
   ตัวอักษร **ล้นออกนอกกล่อง -1.0px** เพราะ `line-height: 1`
   ดู [[thai-text-vertical-space]] — ตอนนั้นแก้เฉพาะ Badge.module.css ตัวกลาง */

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const BADGE_CSS = readFileSync(new URL("./Badge.module.css", import.meta.url), "utf8");

const blockOf = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `หา selector ${selector} ไม่เจอ`);
  return css.slice(start, css.indexOf("}", start));
};

for (const [label, css, selector] of [
  ["Badge.module .base", BADGE_CSS, ".base"],
  ["globals .ui-badge", GLOBALS, ".ui-badge"],
  ["globals .chip", GLOBALS, ".chip"],
  ["globals .status-pill", GLOBALS, ".status-pill"],
]) {
  test(`${label} เว้นที่ให้สระ/วรรณยุกต์ไทยพอ`, () => {
    const block = blockOf(css, selector);
    const lineHeight = block.match(/line-height:\s*([\d.]+)/);
    if (lineHeight) {
      assert.ok(Number(lineHeight[1]) >= 1.4,
        `${selector} line-height ${lineHeight[1]} — ต่ำกว่า 1.4 ภาษาไทยจะชนขอบ`);
    }
    // ความสูงต้องยืดตามเนื้อหาได้ ห้ามตรึง height ตายตัว
    assert.doesNotMatch(block, /\n\s*height:\s*\d/,
      `${selector} ตรึง height ตายตัว — ใช้ min-height แทนเพื่อให้กล่องโตตามตัวอักษรได้`);
  });
}
