import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { plainPx, cssLengthPx } from "./cssLength.js";

/* ── โทเคนที่เป็น calc() อ่านด้วย parseFloat ไม่ได้ (2026-09-07) ──────────────
   🐞 พบตอน UAT แถบตรึงหัวใบ · `getPropertyValue('--scroll-anchor-top')` คืน
   สตริง `"calc(52px + 0px + 49px + 12px)"` ตรง ๆ — เบราว์เซอร์ **ไม่คลี่ calc()
   ให้ตอนอ่านค่าคัสตอมพรอเพอร์ตี้** ⇒ `Number.parseFloat` ได้ NaN ทุกครั้ง

   ผลที่เกิดจริง: โค้ดตกไปใช้ค่าคงที่ 106 ตลอดกาล · วัดที่จอกว้าง 1100px ค่าจริง
   คือ 113px ⇒ เพี้ยน 7px · และตัว re-attach ตอน resize ที่เขียนไว้เพื่อให้เส้นตัด
   เปลี่ยนตามความกว้างจอ **ไม่เคยทำงาน** เพราะค่าที่อ่านได้ไม่เคยเปลี่ยน

   ⚠️ ทางแก้ที่ห้ามใช้: บวกโทเคนย่อยเองใน JS — สูตรจะมีสองที่ที่ต้องแก้พร้อมกัน */

const WEBAPP = process.cwd();

test("plainPx อ่านค่า px ตรง ๆ ได้", () => {
  assert.equal(plainPx("52px"), 52);
  assert.equal(plainPx("  12.5px "), 12.5);
  assert.equal(plainPx("0px"), 0);
});

test("plainPx ต้องคืน null สำหรับทุกอย่างที่ parseFloat จะตอบผิด", () => {
  /* 🪤 นี่คือหัวใจของบั๊ก — parseFloat("calc(52px…") ได้ NaN
     ส่วน parseFloat("1.5rem") ได้ 1.5 ซึ่ง **แย่กว่า NaN** เพราะมันดูเหมือนสำเร็จ */
  assert.equal(plainPx("calc(52px + 0px + 49px + 12px)"), null);
  assert.equal(plainPx("1.5rem"), null, "rem ไม่ใช่ px — 1.5 ที่ parseFloat คืนมาคือคำตอบผิด");
  assert.equal(plainPx("100%"), null);
  assert.equal(plainPx("max(360px, 50vh)"), null);
  assert.equal(plainPx(""), null);
  assert.equal(plainPx(null), null);
  assert.equal(plainPx(undefined), null);
});

test("ไม่มี DOM ต้องคืนค่าสำรอง ไม่ใช่โยน (โค้ดนี้ถูก import ฝั่ง server ด้วย)", () => {
  assert.equal(typeof document, "undefined", "เทสต์ชุดนี้รันบน node ล้วน");
  assert.equal(cssLengthPx("--scroll-anchor-top", 106), 106);
  assert.equal(cssLengthPx("--ไม่มีจริง", 7), 7);
});

/* ── สัญญาข้ามไฟล์: จุดที่เคยพังต้องไม่ไหลกลับ ────────────────────────────── */
test("DetailOverview ต้องไม่กลับไป parseFloat โทเคนที่เป็น calc()", () => {
  const source = fs.readFileSync(path.join(WEBAPP, "src", "components", "ui", "DetailOverview.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(source, /cssLengthPx\(\s*"--scroll-anchor-top"/,
    "ต้องอ่านผ่าน cssLengthPx ซึ่งให้เบราว์เซอร์คำนวณ calc() ให้");
  assert.doesNotMatch(source, /parseFloat[\s\S]{0,80}scroll-anchor-top/,
    "parseFloat บน calc() ได้ NaN เสมอ แล้วเงียบไปใช้ค่าสำรองแทน");
});

test("โทเคน --scroll-anchor-top ยังเป็น calc() จริง — ถ้าไม่ใช่แล้ว ด่านนี้หมดเหตุผล", () => {
  const globals = fs.readFileSync(path.join(WEBAPP, "src", "app", "globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const decl = globals.match(/--scroll-anchor-top:\s*([^;]+);/);
  assert.ok(decl, "หาโทเคน --scroll-anchor-top ไม่เจอ");
  assert.match(decl[1], /calc\(/,
    "ถ้าเปลี่ยนเป็นค่าเดี่ยวแล้ว ให้ทบทวนว่ายังต้องใช้ cssLengthPx ไหม");
});
