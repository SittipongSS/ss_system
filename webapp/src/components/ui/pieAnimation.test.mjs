import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ของจริงที่เคยเกิด (เจอ 2026-08-12 ตอนทำการ์ดช่องทางของลีด): Recharts 3.9.2 เรนเดอร์
   `<Pie>` ที่เปิดอนิเมชัน (ค่าเริ่มต้น) ออกมาเป็น sector เปล่าไม่มี `path` = วงกลมหาย
   ทั้งวง และ **ไม่มี error อะไรฟ้อง** — พังเงียบอยู่ 3 หน้าพร้อมกัน (สหมิตร ·
   ภาษีสรรพสามิต · ฐานข้อมูล) โดยไม่มีใครสังเกต เพราะการ์ดยังมีหัวข้อกับคำอธิบายสีอยู่ครบ

   ⚠️ เทสต์นี้อ่าน JSX ด้วยข้อความ ไม่ได้เรนเดอร์จริง — จับได้แค่ prop ที่เขียนตรง ๆ
   ในแท็ก ซึ่งพอสำหรับกฎ "ห้ามลืมใส่" · กราฟแท่ง/เส้นไม่มีอาการนี้ จึงไม่บังคับ */

const SRC = new URL("../../", import.meta.url).pathname;

const jsFiles = (function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
})(SRC);

/** แท็ก `<Pie ...>` ทั้งอัน (ไม่เอา `<PieChart>` ที่ขึ้นต้นเหมือนกัน)
 *
 * ⚠️ ต้องตัดคอมเมนต์ทิ้งก่อน — คอมเมนต์ที่อธิบายกฎนี้เองเขียนคำว่า `<Pie>` อยู่ในตัว
 * (เจอตอนเขียนเทสต์: ทั้งสามไฟล์ที่ *แก้แล้ว* ถูกฟ้องเพราะคอมเมนต์ของตัวเอง)
 */
function pieTags(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...code.matchAll(/<Pie(?![A-Za-z])[^>]*>/g)].map((m) => m[0]);
}

test("<Pie> ทุกตัวปิดอนิเมชัน — ไม่งั้นวงกลมหายทั้งวงแบบเงียบ ๆ", () => {
  const offenders = [];
  for (const file of jsFiles) {
    if (file.endsWith(".test.mjs")) continue;
    for (const tag of pieTags(fs.readFileSync(file, "utf8"))) {
      if (!/isAnimationActive=\{false\}/.test(tag)) {
        offenders.push(path.relative(SRC, file));
      }
    }
  }
  assert.deepEqual(offenders, [],
    "ไฟล์พวกนี้มี <Pie> ที่ยังไม่ใส่ isAnimationActive={false} — Recharts 3.9.2 จะไม่วาดวงกลมเลย");
});

/* กันเคสที่เทสต์ข้างบนผ่านเพราะ **ไม่มี `<Pie>` เหลือในระบบแล้ว** (เช่นมีคนย้ายไปเขียน
   ผ่าน wrapper) — เจอแบบนั้นคือกฎนี้ต้องถูกเขียนใหม่ ไม่ใช่ปล่อยให้ผ่านฟรี */
test("ยังมี <Pie> ให้กฎนี้คุ้มครองอยู่จริง", () => {
  const total = jsFiles
    .filter((f) => !f.endsWith(".test.mjs"))
    .reduce((n, f) => n + pieTags(fs.readFileSync(f, "utf8")).length, 0);
  assert.ok(total > 0, "ไม่เหลือ <Pie> ในระบบแล้ว — ทบทวนว่ากฎนี้ยังต้องมีไหม");
});
