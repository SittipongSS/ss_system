import test from "node:test";
import assert from "node:assert/strict";
import {
  classNamesIn,
  dynamicPatternsIn,
  orphanRulesIn,
  stripComments,
  templateLiteralsIn,
} from "../../../scripts/uiOrphanCss.mjs";

const src = (text, file = "x.js") => [{ file, text }];
const orphans = (css, aliveNames, sources = []) =>
  orphanRulesIn(css, {
    isAlive: (n) => aliveNames.includes(n),
    dynamic: dynamicPatternsIn(sources),
  }).map((o) => o.selector);

test("ฟ้อง rule ที่ไม่มีใครเรียก และปล่อย rule ที่ยังใช้อยู่", () => {
  const css = `.alive { color: red; } .dead { color: blue; }`;
  assert.deepEqual(orphans(css, ["alive"]), [".dead"]);
});

/* ตัวเลือกที่มีคลาสเป็น ๆ ปนอยู่ = ยังมีชีวิต การจะลบลูกที่ตายต้องดูบริบท
   ไม่ใช่งานของ ratchet (กันไม่ให้กฎนี้ไปลบ `.การ์ด .ลูก` ทิ้งทั้งอัน) */
test("ตัวเลือกที่มีคลาสยังใช้อยู่แม้แต่ตัวเดียว ไม่นับเป็นกำพร้า", () => {
  assert.deepEqual(orphans(`.alive .dead { color: red; }`, ["alive"]), []);
  assert.deepEqual(orphans(`.dead1 .dead2 { color: red; }`, []), [".dead1 .dead2"]);
});

test("เข้าไปตรวจข้างใน @media และ @supports ด้วย", () => {
  const css = `@media (max-width: 768px) { .dead { color: red; } .alive { color: blue; } }`;
  assert.deepEqual(orphans(css, ["alive"]), [".dead"]);
});

test("ข้าม :root และ at-rule ที่ไม่มีคลาส", () => {
  assert.deepEqual(orphans(`:root { --x: 1px; } @keyframes spin { from { opacity: 0; } }`, []), []);
});

/* ---- ตัวกันชื่อที่ประกอบตอนรันไทม์ ----
   ทั้งสองเคสนี้เกือบถูกลบจริงตอนเก็บกวาด 2026-07-30 */

test("template literal: `save-status-${status}` ต้องกัน save-status-dirty ไว้", () => {
  const js = src("<span className={`save-status save-status-${status}`} />");
  assert.deepEqual(orphans(`.save-status-dirty { color: red; }`, [], js), []);
});

test("styles[`kind_${x}`] ของ CSS module ต้องกัน kind_install ไว้", () => {
  const js = src("className={styles[`kind_${visit.kind}`]}");
  assert.deepEqual(orphans(`.kind_install { background: red; }`, [], js), []);
});

/* 🪤 ของจริงที่หลุดรอบแรก (service/schedule/page.js) — template literal ซ้อนกัน
   regex ตัวเดียวจะจับ backtick นอกคู่กับ backtick ใน แล้วชิ้น kind_* หายไปทั้งชุด */
test("template literal ซ้อนกัน ต้องดึงตัวในสุดออกมาได้ด้วย", () => {
  const nested = '`${styles.visitChip} ${styles[`kind_${visit.kind}`] || ""} ${muted}`';
  /* interpolation ถูกยุบเป็นตัวยึด `${}` — เราสนแค่ "ตรงนี้เปลี่ยนค่าได้" ไม่สนว่าเป็นตัวแปรอะไร */
  assert.deepEqual(templateLiteralsIn(nested), ["kind_${}", "${} ${} ${}"]);
  assert.deepEqual(orphans(`.kind_refill { background: red; }`, [], src(nested)), []);
});

test("string concat ทั้งสองทิศทาง", () => {
  assert.deepEqual(orphans(`.tone-warm { color: red; }`, [], src('"tone-" + tone')), []);
  assert.deepEqual(orphans(`.card-lg { color: red; }`, [], src('size + "-lg"')), []);
});

/* 🪤 บั๊กที่ทำให้รอบแรกมองไม่เห็นชื่อ dynamic เลย: ใช้ "ช่องว่าง" เป็นตัวแทน `${…}`
   ทั้งที่ช่องว่างคือตัวคั่นคลาส → ชิ้นที่ได้ไม่มีตัวแทนหลงเหลือ เทสต์นี้ตรึงไว้ว่า
   ตัวแทนต้องรอดข้ามการหั่นด้วยช่องว่าง */
test("ตัวแทน ${…} ต้องไม่ถูกกลืนตอนหั่น template literal ด้วยช่องว่าง", () => {
  const patterns = dynamicPatternsIn(src("`base ${a} kind_${b} tail`"));
  assert.ok(patterns.some((p) => p.re.test("kind_install")), "ไม่เห็นชิ้น kind_*");
  assert.ok(!patterns.some((p) => p.re.test("ชื่ออะไรก็ได้")), "แพตเทิร์นกว้างเกินไป");
});

/* ถ้าปล่อยให้ `${x}` ล้วน ๆ กลายเป็นแพตเทิร์น จะแมตช์ทุกชื่อ = กฎนี้ตายสนิท */
test("interpolation ล้วนที่ไม่มีตัวอักษรจริง ต้องไม่กลายเป็นแพตเทิร์น", () => {
  assert.equal(dynamicPatternsIn(src("`${a} ${b}`")).length, 0);
  assert.deepEqual(orphans(`.dead { color: red; }`, [], src("`${a}`")), [".dead"]);
});

test("คอมเมนต์ไม่ทำให้เลขบรรทัดเพี้ยน และไม่ถูกอ่านเป็นตัวเลือก", () => {
  const css = `/* .fake-class\n   ยังอยู่ */\n.dead { color: red; }`;
  assert.equal(stripComments(css).split("\n").length, css.split("\n").length);
  assert.deepEqual(orphans(css, []), [".dead"]);
});

test("classNamesIn เก็บชื่อจากตัวเลือกจริงเท่านั้น", () => {
  const names = classNamesIn(`/* .in-comment */ .a, .b-c { color: red; }`);
  assert.deepEqual([...names].sort(), ["a", "b-c"]);
});
