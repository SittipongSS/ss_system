// ── หัวของหน้าและหัวของใบต้องเรียบ — ไม่มีแสง accent ที่มุม ───────────────────
//
// มติเจ้าของ 2026-09-16: ถอดแสงส้มที่มุมขวาบนของหัวออก **ทั้งระบบ**
//
// 🐞 ทำไมถึงเป็นบั๊ก ไม่ใช่รสนิยม — `body` ทาไล่สีไว้สี่มุมของหน้าอยู่แล้ว
//   (globals.css ~838) แล้วหัวยังทา radial ของ `--accent` ทับลงไปอีกชั้นที่มุมขวาบน
//   ⇒ ได้จุดขุ่นที่ไม่ได้หมายถึงอะไร บนหน้าที่ไล่สีอยู่แล้ว · ที่แย่กว่าคือมันอยู่บน
//   **หัว** ซึ่งเป็นที่แรกที่สายตาตก แล้วแข่งกับชื่อหน้าและป้ายสถานะจริง ๆ ที่นั่น
//
// 🔑 ด่านนี้คุม **หัว** เท่านั้น ไม่ได้ห้าม radial ทั้งไฟล์ — พื้นหน้า (`body`),
//   หน้าล็อกอิน และการ์ดบริบท (`.contextCard`) ยังมีไล่สีของตัวเองตามเดิม
//   ⚠️ ถ้ามีหัวตัวใหม่เกิดขึ้น ให้เติมชื่อมันลง HEADERS ที่นี่ ไม่ใช่ปล่อยผ่าน
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** บล็อกแรกของ selector นั้น (ถึงปีกกาปิด) */
const blockOf = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `หา selector ${selector} ไม่เจอ`);
  const end = css.indexOf("\n}", start);
  assert.notEqual(end, -1, `บล็อกของ ${selector} ไม่มีปีกกาปิด`);
  return css.slice(start, end);
};

const HEADERS = [
  { file: "หัวหน้า (globals)", css: read("../../app/globals.css"), selector: ".premium-header" },
  { file: "หัวใบ (DetailOverview)", css: read("./DetailOverview.module.css"), selector: ".overviewCard" },
  /* จอหน้างาน (`/service/surveys/[id]`) ถอด `DetailOverview` ใน §10.5 S9 — หัวของจอนั้นคือหัวงานตัวนี้ (S10 ลงทะเบียน) */
  { file: "หัวงานจอหน้างาน (SurveyJobHeader)", css: read("../service/SurveyJobHeader.module.css"), selector: ".job" },
];

for (const { file, css, selector } of HEADERS) {
  test(`${file} — พื้นเป็นโทเคนเดียว ไม่มี radial ที่มุม`, () => {
    const block = blockOf(css, selector);
    assert.doesNotMatch(block, /radial-gradient/, `${selector} ยังทาแสงที่มุมอยู่`);
    /* ⚠️ ต้องเป็น `background:` ทั้งช็อต ไม่ใช่ `background-color:` หรือ
       `background-image: none` ทับทีหลัง — shorthand กับ longhand เป็นคนละคุณสมบัติ
       แล้วคนอ่านสไตล์ชีตจะหาไม่เจอว่าพื้นมาจากไหน (บทเรียนของรอบจอประเมินพื้นที่) */
    assert.match(block, /\n\s+background: var\(--panel\);/,
      `${selector} ต้องประกาศ background ทั้งช็อตเป็น --panel`);
  });
}

test("ไม่มีคลาส/prop ขอ “หัวเรียบ” หลงเหลือ — เรียบเป็นค่าตั้งต้นแล้ว", () => {
  /* ของเดิมจอประเมินพื้นที่ขอเรียบทีละจอด้วย `.flat` · พอถอดทั้งระบบแล้ว สวิตช์ที่
     ไม่มีอะไรให้ปิดคือสวิตช์ที่หลอกคนอ่านโค้ดรอบหน้าว่ายังมีสองแบบให้เลือก */
  const css = read("./DetailOverview.module.css");
  const js = read("./DetailOverview.js");
  assert.doesNotMatch(css, /^\.flat\b/m, "คลาส .flat ต้องถูกลบ");
  assert.doesNotMatch(js, /\bflat\b/, "prop flat ต้องถูกลบ");
});

test("พื้นหน้าและการ์ดบริบทยังมีไล่สีของตัวเอง — ด่านนี้ไม่ได้กวาดทั้งไฟล์", () => {
  /* กันด่านบานปลายไปลบไล่สีที่ตั้งใจให้มี · ถ้าวันหนึ่งมีมติให้ถอดพวกนี้ด้วย
     ให้แก้เทสต์นี้พร้อมโค้ด ไม่ใช่ลบเทสต์ทิ้งเงียบ ๆ */
  const globals = read("../../app/globals.css");
  assert.match(blockOf(globals, ".login-page"), /radial-gradient/);
  assert.match(read("./DetailPage.module.css"), /\.contextCard \{[\s\S]*?radial-gradient/);
});
