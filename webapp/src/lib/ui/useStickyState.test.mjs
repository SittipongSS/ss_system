import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "useStickyState.js"), "utf8");
const scrollSource = readFileSync(join(here, "useScrollTopOnNavigate.js"), "utf8");

/* 🐞 คานารีของบั๊กที่เจอจริงตอนสร้างฮุกนี้ (2026-08-22): ใช้ ref เป็นธง "อ่านเสร็จ
   แล้ว" ⇒ effect ตัวเขียนที่วิ่งต่อในคอมมิตเดียวกันเห็นธงเป็น true แต่ `value`
   ยังเป็นค่าตั้งต้นของเรนเดอร์นั้น แล้วเขียนทับค่าที่ผู้ใช้จำไว้ทิ้ง
   อาการที่เห็น: กรองไว้ กดเข้าใบ กดย้อนกลับ แล้วตัวกรองว่างเปล่าเหมือนเดิม */
test("ธง hydrated เป็น state ไม่ใช่ ref — ไม่งั้นค่าที่จำไว้ถูกทับตอน mount", () => {
  assert.match(source, /const \[hydrated, setHydrated\] = useState\(false\)/,
    "ต้องเป็น state เพื่อให้ React รวมกับ setValue เป็นเรนเดอร์เดียว");
  assert.match(source, /if \(!hydrated\) return;/, "effect ตัวเขียนต้องข้ามจนกว่าจะอ่านเสร็จ");
  assert.doesNotMatch(source, /hydratedRef/, "กลับไปใช้ ref = บั๊กเดิมกลับมา");
});

test("ห้ามอ่าน storage ใน initializer ของ useState — hydration จะไม่ตรงกับฝั่ง server", () => {
  assert.doesNotMatch(source, /useState\(\(\) =>[\s\S]{0,80}sessionStorage/,
    "อ่านใน initializer = เรนเดอร์แรกฝั่ง client ไม่ตรงกับ HTML ที่ server ส่งมา");
});

test("อ่าน/เขียน storage ต้องกันพังเสมอ — เป็นความสะดวก ไม่ใช่ข้อมูลจริง", () => {
  const guarded = source.match(/try \{/g) || [];
  assert.ok(guarded.length >= 4, "ทุกจุดที่แตะ sessionStorage ต้องอยู่ใน try — โควตาเต็ม/โหมดส่วนตัวโยน error ได้");
});

/* ⚠️ สองอย่างนี้จงใจต่างกัน ห้ามทำให้เหมือนกัน:
   ตัวกรองจำยาวจนปิดแท็บ · ตำแหน่งไถคืนเฉพาะตอนกดย้อน/เดินหน้า */
test("ตำแหน่งไถคืนเฉพาะตอนกดย้อน ไม่ใช่ทุกครั้งที่กลับเข้าหน้า", () => {
  assert.match(scrollSource, /popstate/, "ต้องรู้ว่ารอบนี้มาจากปุ่มย้อน/เดินหน้าหรือเปล่า");
  assert.match(scrollSource, /if \(!wasHistoryNavigation\)[\s\S]{0,120}scrollTo/,
    "ไม่ใช่การกดย้อน = เลื่อนขึ้นบนสุดเหมือนเดิม");
});

test("รอให้เนื้อหาสูงพอก่อนคืนตำแหน่ง และมีเพดานเวลา", () => {
  assert.match(scrollSource, /scrollHeight < target \+ window\.innerHeight/,
    "หน้ายังเตี้ยแล้ว scrollTo จะไปหยุดผิดที่ แล้วนับว่าสำเร็จ");
  assert.match(scrollSource, /RESTORE_DEADLINE_MS/, "ต้องมีเพดาน ไม่งั้นข้อมูลมาช้าแล้วกระชากจอทีหลัง");
  assert.match(scrollSource, /"wheel"|'wheel'/, "ผู้ใช้ขยับเองแล้วต้องยกเลิกการคืนตำแหน่ง");
});
