import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* `ViewSwitcher` เรียก `Segmented` อยู่แล้ว แต่เคยส่ง className="ui-view-switcher"
   ไปให้ globals.css ประกาศรูปทรง/สีทับอีกชุด ห่างจาก `.segmented > button` 2,360 บรรทัด
   ผลที่วัดได้จริงบนหน้าต้นแบบ 2026-07-29 (ธีมมืด 1280×800) — ปุ่ม active ตัวเดียวกัน:
     ผ่าน .segmented          → 6.44:1 ✅ (ใช้ var(--accent-fg) = #121726 ในธีมมืด)
     ผ่าน .ui-view-switcher   → 2.77:1 ❌ (เขียน `color: #fff` ตายตัว · AA ต้องการ 4.5)
   และความสูงต่างกัน 28 vs 26px ทั้งที่เป็น component เดียวกัน

   `#fff` ตัวนั้นรอดตัวตรวจสีดิบมาตลอดเพราะ globals.css อยู่ใน allowlist (ไฟล์นี้เป็น
   ที่ประกาศโทเคน จึงต้องเขียนค่าสีได้) — เทสต์นี้จึงตรวจ *คู่* background/color แทน */

// normalise CRLF — ไฟล์ในรีโปนี้เป็น CRLF บน Windows แต่เทียบสตริงแบบ \n ง่ายกว่า
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const VIEW_SWITCHER = read("./ViewSwitcher.js");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** คืนบล็อก { selector, body } ทุกอันในสไตล์ชีต (พอสำหรับ CSS แบนของไฟล์นี้) */
function blocks(css) {
  return stripComments(css).split("}").flatMap((chunk) => {
    const open = chunk.indexOf("{");
    if (open === -1) return [];
    return [{
      selector: chunk.slice(0, open).split("\n").filter(Boolean).join(" ").trim(),
      body: chunk.slice(open + 1),
    }];
  });
}

test("ตัวสลับมุมมองไม่มีคลาสหน้าตาของตัวเอง — ใช้ .segmented ตัวเดียว", () => {
  assert.equal(GLOBALS.includes("ui-view-switcher"), false,
    "`.ui-view-switcher` กลับมาใน globals.css แล้ว = ประกาศรูปทรง segmented ชุดที่สอง");
  // คอมเมนต์ในไฟล์อธิบายบั๊กเดิมโดยยกโค้ดเก่ามาแสดง จึงต้องตัดคอมเมนต์ก่อนตรวจ
  assert.equal(stripComments(VIEW_SWITCHER).includes("className"), false,
    "ViewSwitcher ส่ง className ให้ Segmented อีกแล้ว — หน้าตาต้องมาจาก .segmented เท่านั้น");
  assert.match(VIEW_SWITCHER, /<Segmented\b/,
    "ViewSwitcher ต้องเรนเดอร์ผ่าน Segmented ไม่ใช่เขียนปุ่มเอง");
});

test("อะไรก็ตามที่วางบนพื้น --accent ต้องใช้ --accent-fg ไม่ใช่สีขาว/ดำตายตัว", () => {
  /* จับเฉพาะบล็อกที่พื้นเป็น var(--accent) ล้วน — พื้นไล่สี/color-mix (เช่นแถบ topnav
     ที่เป็นกรมท่า) มีกติกาสีของตัวเอง ไม่เกี่ยวกับคู่ accent/accent-fg */
  const offenders = blocks(GLOBALS)
    .filter(({ body }) => /(?:^|;)\s*background:\s*var\(--accent\)\s*(?:;|$)/m.test(body))
    .filter(({ body }) => /(?:^|;)\s*color:\s*(?:#fff\b|#ffffff\b|white\b|#000\b|black\b)/m.test(body))
    .map(({ selector }) => selector);
  assert.deepEqual(offenders, [],
    `พื้นแบรนด์ต้องคู่กับ var(--accent-fg) — ธีมมืด --accent สว่างขึ้น ตัวอักษรขาวจะเหลือ 2.77:1`);
});

test("สถานะ active ของ segmented ใช้โทเคนคู่ accent", () => {
  const active = blocks(GLOBALS).find(({ selector }) => selector.includes(".segmented > button.active"));
  assert.ok(active, "หา .segmented > button.active ไม่เจอ");
  assert.match(active.body, /background:\s*var\(--accent\)/);
  assert.match(active.body, /color:\s*var\(--accent-fg\)/);
});
