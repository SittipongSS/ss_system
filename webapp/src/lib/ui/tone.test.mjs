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

/* 🐞 **โทนที่ StatusNotice ไม่รู้จักไม่พังให้เห็น — มันกลายเป็นฟ้าเงียบ ๆ**
   (`styles[tone] || styles.info`) · ตัวตัดสินของใบประเมินสั่ง `neutral` มาสามกล่อง
   ("เหตุผลที่ยกเลิก" · "ดูได้อย่างเดียว" · "ส่งผลแล้ว แก้ไม่ได้") แล้วทั้งสามขึ้นเป็น
   กล่องฟ้าพร้อมไอคอน ℹ อยู่หลายเดือนโดยไม่มีตัวตรวจไหนเห็น เพราะ fallback ถูกตามโค้ด
   ⇒ กล่องแจ้งต้องรับ **ทุกโทนของระบบ** เท่าที่ `STATUS_TONES` ประกาศไว้ (+ ชื่อพ้อง) */
test("StatusNotice รู้จักทุกโทนของระบบ — ไม่มีตัวไหนตกกลับเป็น info เงียบ ๆ", () => {
  const js = fs.readFileSync(path.join(process.cwd(), "src/components/ui/StatusNotice.js"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "src/components/ui/StatusNotice.module.css"), "utf8");
  const tones = js.match(/const TONES = \{([\s\S]*?)\n\};/);
  const alias = js.match(/const TONE_ALIAS = \{([^}]*)\}/);
  assert.ok(tones, "ต้องมี TONES ประกาศไว้ใน StatusNotice.js");
  const known = new Set([...tones[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]));
  const aliased = new Map([...(alias?.[1] || "").matchAll(/([a-z]+):\s*"([a-z]+)"/g)].map((m) => [m[1], m[2]]));
  for (const tone of STATUS_TONES) {
    const key = aliased.get(tone) || tone;
    assert.ok(known.has(key), `StatusNotice ไม่รู้จักโทน "${tone}" — มันจะกลายเป็น info เงียบ ๆ`);
    assert.ok(css.includes(`.${key} {`), `StatusNotice.module.css ไม่มีคลาส .${key} ให้โทน "${tone}"`);
  }
  // ชื่อพ้องของ tone.js (error ↔ danger) ต้องเข้าถึงคลาสได้ทั้งสองคำ
  for (const alias2 of Object.keys(TONE_ALIASES)) {
    const key = aliased.get(alias2) || alias2;
    assert.ok(known.has(key), `StatusNotice ไม่รู้จักชื่อพ้อง "${alias2}"`);
  }
});
