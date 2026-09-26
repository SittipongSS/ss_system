import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* สัญญาของ `CollapsibleCard` ตรวจจากซอร์ส เพราะสี่ข้อนี้ **พังเงียบ** ทุกข้อ:
   หัวที่ไม่ใช่ปุ่มยังกดได้ด้วยเมาส์ · `aria-expanded` ที่หายไปไม่มี error ·
   เนื้อที่ถูก unmount ยังดูเหมือนพับปกติจนกว่าจะมีคนพิมพ์ค้างแล้วกดพับ ·
   และ `hidden` ที่ถูกคลาสทับก็แค่ "พับแล้วไม่เกิดอะไรขึ้น"
   ⇒ ด่านนี้ล็อกสี่ข้อไว้ที่ตัว primitive ก่อนที่หน้าต่าง ๆ จะลอกท่าไปใช้ */

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CARD = src("./CollapsibleCard.js");
const CSS = src("./CollapsibleCard.module.css");
/* 🔄 §10.5 S7 — การ์ดพื้นที่พับได้ของจอประเมินกลายเป็นหน้าพื้นที่ (`SurveyZonePage`) ที่ไม่พับเลย (แบบ A: หน้าหนึ่งพื้นที่เดียว) */
const ZONE_PAGE = src("../service/SurveyZonePage.js");
const PREVIEW = src("../../app/settings/design-preview/page.js");

test("หัวเป็นปุ่มเดียวทั้งแถว อยู่ใน h3 และประกาศ aria ครบ", () => {
  assert.match(CARD, /<h3[\s\S]*?<button/, "ปุ่มหัวต้องอยู่ใน <h3> — ไม่งั้นผังหัวข้อของหน้าหาย");
  assert.match(CARD, /aria-expanded=\{open\}/);
  assert.match(CARD, /aria-controls=\{bodyId\}/);
  assert.match(CARD, /id=\{bodyId\}/, "ปลายทางของ aria-controls ต้องมีอยู่จริง");
  assert.match(CARD, /aria-labelledby=\{headId\}/, "กล่องต้องมีชื่อ = ชื่อบนหัว");
});

test("เนื้อซ่อนด้วย hidden และไม่ถูกถอดออกจาก DOM", () => {
  assert.match(CARD, /hidden=\{!open\}/,
    "ต้องซ่อนด้วยแอตทริบิวต์ hidden — ค่าที่พิมพ์ค้าง/ไฟล์ที่กำลังอัปจะได้ไม่หาย");
  assert.doesNotMatch(CARD, /open\s*(?:&&|\?)[^\n]*\{children\}/,
    "ห้ามเรนเดอร์ children ตามสถานะเปิด — นั่นคือการถอดทิ้ง ไม่ใช่การพับ");
  assert.match(CSS, /\.body\[hidden\]\s*\{\s*display:\s*none;?\s*\}/,
    "คลาสของเนื้อมี display ของตัวเอง ⇒ ต้องประกาศทับให้ hidden ทำงาน");
});

test("บรรทัดสรุปโผล่เฉพาะตอนพับ · ป้ายอยู่บนหัวทั้งสองสถานะ", () => {
  assert.match(CARD, /\{!open && summary \?/, "summary ต้องหายไปเมื่อกางออก");
  assert.match(CARD, /\{badges \?/);
  assert.doesNotMatch(CARD, /\{!open && badges/, "ป้ายต้องอ่านได้ตอนพับ *และ* ตอนกาง");
});

test("มียามกันปุ่มซ้อนปุ่มในช่องบนหัว (ตรวจของจริงที่ถูกวางลงไป ไม่ใช่ตรวจซอร์ส)", () => {
  /* 🔴 ช่อง lead/eyebrow/title/summary/badges เรนเดอร์อยู่ **ในปุ่มหัว** — เทสต์ไฟล์นี้
     อ่านได้แต่ซอร์สของ primitive กับของผู้เรียกที่มีอยู่วันนี้ · วันที่มีคนใส่ลิงก์
     "ดูรูป" หรือปุ่มลบลงใน `badges` จะไม่มีอะไรดัก (audit:ui มีแต่ด่าน "กดด้วย
     คีย์บอร์ดไม่ได้" ไม่มีกฎ nested-interactive) ⇒ ยามต้องอยู่ตอนรัน */
  assert.match(CARD, /querySelector\("a\[href\], button, input, select, textarea, \[tabindex\]"\)/,
    "ต้องตรวจ DOM จริงของปุ่มหัว");
  assert.match(CARD, /NODE_ENV === "production"/, "ยามนี้เป็นของ dev — อย่าให้ไปกินแรงบน prod");
  assert.match(CARD, /console\.error\(/, "ต้องดังพอให้เห็น ไม่ใช่ warn ที่จมไปกับ log อื่น");
  assert.match(CARD, /ref=\{headRef\}/, "ยามต้องจับปุ่มหัวได้จริง");
});

test("บรรทัดสรุปตกลงมาทั้งบรรทัดเมื่อที่ไม่พอ — ไม่ใช่ถูกบีบจนแตกเป็นคำละบรรทัด", () => {
  /* 🐞 กริดสองคอลัมน์ `max-content 1fr` ให้ชื่อกินได้ไม่จำกัด ⇒ ที่การ์ดกว้าง ~660px
     คอลัมน์สรุปเหลือ 9px แล้วหัวสูงจาก 67 เป็น 202px (วัดจริง) · ตัวที่บีบคือความกว้าง
     ที่เหลือ ไม่ใช่ขนาดจอ ⇒ ต้องแก้ด้วยการห่อของ flex ไม่ใช่จุดตัดจอ */
  assert.doesNotMatch(CSS, /\.ident\s*\{[^}]*max-content/,
    "ชื่อห้ามได้คอลัมน์ max-content — ชื่อพื้นที่พิมพ์เองได้ถึง 150 ตัวอักษร");
  assert.match(CSS, /\.ident\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(CSS, /\.summary\s*\{[^}]*flex:\s*1\s+1\s+\d+px/,
    "บรรทัดสรุปต้องมีความกว้างต่ำสุดของตัวเอง ไม่งั้นมันยอมถูกบีบจนเหลือศูนย์");
});

test("หน้าพื้นที่ของจอประเมินไม่พับ — ไม่ใช้การ์ดพับได้ (แบบ A · มติเจ้าของ 25/09)", () => {
  /* แบบที่ถูกตีกลับ 16/09: พื้นที่พับเองใต้มือช่าง · กติกาพับเปลี่ยนตามขนาดจอ ⇒ หน้าพื้นที่เปิดทีละหน้า ไม่มีอะไรพับ */
  assert.doesNotMatch(ZONE_PAGE, /<CollapsibleCard/);
});

test("มีตัวอย่างที่กดได้จริงบนหน้าต้นแบบ", () => {
  assert.match(PREVIEW, /<CollapsibleCard/);
  assert.match(PREVIEW, /CollapsibleCard —/, "ชื่อต้องเป็นตัวหนังสือที่ Ctrl+F เจอ");
});
