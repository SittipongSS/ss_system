import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { STATUS_TONES, TONE_ALIASES, toneColor } from "./tone.js";

test("toneColor คืนตัวแปร CSS สำหรับทุก tone ที่เลือกใช้ได้", () => {
  for (const tone of STATUS_TONES) {
    assert.match(toneColor(tone), /^var\(--[a-z0-9-]+\)$/, `tone ${tone} ต้องคืนตัวแปร CSS`);
  }
});

test("ชื่อพ้องได้สีเดียวกับตัวจริง", () => {
  for (const [alias, real] of Object.entries(TONE_ALIASES)) {
    assert.equal(toneColor(alias), toneColor(real), `${alias} ต้องได้สีเดียวกับ ${real}`);
  }
});

test("tone ที่ไม่รู้จักตกกลับเป็นสีกลาง ไม่คืน undefined", () => {
  assert.equal(toneColor("ไม่มีจริง"), toneColor("neutral"));
  assert.equal(toneColor(undefined), toneColor("neutral"));
  assert.equal(toneColor(null), toneColor("neutral"));
  assert.equal(toneColor(""), toneColor("neutral"));
});

/* กันสองฝั่งเลื่อนออกจากกัน — เพิ่ม tone ใน Badge.module.css แล้วลืมมาเพิ่มที่ tone.js
   คือทางที่สีเพี้ยนกันเงียบ ๆ (จุดสถานะได้สีกลางทั้งที่ป้ายได้สีถูก) */
test("ทุก data-tone ใน Badge.module.css มีสีใน toneColor", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/components/ui/Badge.module.css"), "utf8");
  const declared = [...css.matchAll(/\[data-tone="([a-z]+)"\]/g)].map((match) => match[1]);
  assert.ok(declared.length >= STATUS_TONES.length, "อ่าน Badge.module.css ไม่เจอ data-tone — เทสต์นี้กำลังตรวจของว่าง");
  const known = new Set([...STATUS_TONES, ...Object.keys(TONE_ALIASES)]);
  for (const tone of declared) {
    assert.ok(known.has(tone), `Badge.module.css มี data-tone="${tone}" แต่ tone.js ไม่รู้จัก`);
  }
});

test("ทุก tone ใน tone.js มี selector อยู่จริงใน Badge.module.css (ยกเว้น neutral ที่เป็นค่าตั้งต้น)", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/components/ui/Badge.module.css"), "utf8");
  for (const tone of STATUS_TONES) {
    if (tone === "neutral") continue; // neutral = ค่าตั้งต้นของ .base ไม่มี selector แยก
    assert.ok(css.includes(`[data-tone="${tone}"]`), `tone.js มี ${tone} แต่ Badge.module.css ไม่มี selector`);
  }
});
