import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ลิงก์ที่ฝังกลางข้อความในเธรด (รหัสเอกสาร · URL · รายการที่กดเข้าไปดูได้)

   เคยใช้ `.linklike` ซึ่งเป็น `color: inherit` — วัดบนหน้าจริงแล้วสีของลิงก์
   เท่ากับข้อความธรรมดาเป๊ะ ๆ (rgb(244,246,251) ทั้งคู่) ไม่มีเส้นใต้ ต้องเอาเมาส์
   ไปชี้ถึงจะรู้ว่ากดได้ — บนมือถือไม่มี hover จึงไม่มีทางรู้เลย

   🔴 สีตัวอักษรต้องเป็น `--accent-ink` ไม่ใช่ `--accent` วัดคอนทราสต์บนพื้นจริง:
        ธีมสว่าง  --accent 2.75:1 (ตก AA)  ·  --accent-ink 4.76:1 (ผ่าน)
        ธีมมืด    สองตัวนี้เป็นสีเดียวกัน (~5.7:1 บน --panel) จึงไม่เสียอะไร
      กฎเดียวกับปุ่ม: โทเคน `*-ink` มีไว้ใช้กับ `color:` เท่านั้น */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const RICH_TEXT = read("./RichText.js");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** เนื้อในของบล็อกที่ selector ตรงเป๊ะกับที่ขอ */
function block(selector) {
  const css = stripComments(GLOBALS);
  const found = css.split("}").find((chunk) => {
    const open = chunk.indexOf("{");
    if (open === -1) return false;
    return chunk.slice(0, open).split(",").map((s) => s.trim()).includes(selector);
  });
  assert.ok(found, `ไม่พบบล็อก ${selector} ใน globals.css`);
  return found.slice(found.indexOf("{") + 1);
}

test("ลิงก์ในเนื้อความเห็นได้ตั้งแต่ยังไม่เอาเมาส์ไปชี้", () => {
  const body = block(".rich-link");
  assert.match(body, /text-decoration:\s*underline/,
    "เส้นใต้ต้องอยู่ในสถานะปกติ — ถ้าโผล่ตอน hover อย่างเดียว มือถือจะไม่มีทางรู้ว่ากดได้");
  assert.match(body, /color:\s*var\(--accent-ink\)/,
    "สีตัวอักษรต้องมาจาก --accent-ink");
  assert.doesNotMatch(body, /color:\s*var\(--accent\)/,
    "--accent เป็นสีพื้น/เส้น ใช้เป็นสีตัวอักษรแล้วได้คอนทราสต์ 2.75:1 ในธีมสว่าง");
  // สระล่างของไทย (ุ ู ฺ) กินพื้นที่ใต้บรรทัด เส้นใต้ชิดเกินไปจะทับ
  assert.match(body, /text-underline-offset:\s*[2-9]px/,
    "ต้องเว้นระยะเส้นใต้เผื่อสระล่างของไทย");
});

test("ชิป @ชื่อคน ใช้โทเคนสีตัวอักษรตัวเดียวกัน", () => {
  const body = block(".mention-chip");
  assert.match(body, /color:\s*var\(--accent-ink\)/,
    "--accent บนพื้น --accent-soft ได้แค่ 2.78:1 ในธีมสว่าง");
});

test("ชี้แล้วเน้นที่เส้น ไม่ใช่ที่ตัวอักษร", () => {
  const hover = block(".rich-link:hover");
  assert.doesNotMatch(hover, /font-weight|padding|font-size/,
    "เปลี่ยนความหนา/ระยะตอน hover = ข้อความรอบข้างไหลตามเมาส์");
});

test("ตัวเรนเดอร์ข้อความไม่กลับไปใช้ .linklike กับลิงก์กลางย่อหน้า", () => {
  const linkTags = RICH_TEXT.match(/<(?:a|Link)\b[^>]*>/g) ?? [];
  assert.ok(linkTags.length >= 2, "ควรมีทั้ง <a> (URL ภายนอก) และ <Link> (รหัสเอกสาร)");
  for (const tag of linkTags) {
    assert.match(tag, /className="rich-link/, `${tag} ต้องใช้คลาส rich-link`);
    assert.doesNotMatch(tag, /linklike/, `${tag} ใช้ .linklike ซึ่งเป็น color: inherit`);
  }
});
