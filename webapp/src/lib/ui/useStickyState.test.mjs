import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "useStickyState.js"), "utf8");
const scrollSource = readFileSync(join(here, "useScrollTopOnNavigate.js"), "utf8");
const arrivalSource = readFileSync(join(here, "historyArrival.js"), "utf8");

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

/* ⭐ มติผู้ใช้ 2026-08-25: **ตัวกรองกับตำแหน่งไถใช้กติกาเดียวกันแล้ว** — คืนเฉพาะ
   ตอนกดย้อน/เดินหน้า · เข้าจากเมนู = เริ่มใหม่ทั้งคู่
   ⚠️ เดิมจงใจให้ต่างกัน (ตัวกรองจำยาวจนปิดแท็บ) — เปลี่ยนเพราะคนที่กรองไว้แล้ว
   กดเมนูเข้ามาใหม่ เจอตารางที่ยัง "หายไปครึ่ง" โดยไม่รู้ว่าตัวกรองยังติดอยู่ */
test("ทั้งตัวกรองและตำแหน่งไถถามที่เดียวกันว่า 'มาจากการกดย้อนไหม'", () => {
  assert.match(arrivalSource, /popstate/, "ต้องรู้ว่ารอบนี้มาจากปุ่มย้อน/เดินหน้าหรือเปล่า");
  for (const [name, src] of [["useStickyState", source], ["useScrollTopOnNavigate", scrollSource]]) {
    assert.match(src, /import arrivedByHistory from "\.\/historyArrival"/,
      `${name} ต้องใช้ตัวตัดสินกลาง ไม่ใช่ดัก popstate เองอีกชุด`);
  }
  assert.match(scrollSource, /if \(!wasHistoryNavigation\)[\s\S]{0,120}scrollTo/,
    "ไม่ใช่การกดย้อน = เลื่อนขึ้นบนสุดเหมือนเดิม");
});

test("เข้าหน้าจากเมนู = ค่าตั้งต้น และล้างของที่จำไว้ทิ้ง", () => {
  assert.match(source, /if \(arrivedByHistory\(pathname\)\)/, "ต้องแยกสองทางตั้งแต่ตอน mount");
  assert.match(source, /setValue\(initialRef\.current\);\s*\n\s*try \{ window\.sessionStorage\.removeItem\(storageKey\); \} catch \{\}/,
    "ไม่ใช่แค่ไม่อ่าน — ต้องล้างด้วย ไม่งั้นค่าเก่าโผล่กลับตอนกดย้อนเข้าหน้านี้ทีหลัง");
});

/* 🐞 ธงต้องเคลียร์เองเมื่อเปลี่ยนไปหน้าอื่นโดยไม่ได้ย้อน — ไม่งั้น: ย้อนมา /sa/deals
   (ธงติด) → กดเมนูไป /sa/leads → กดเมนูกลับ /sa/deals แล้วตัวกรองเก่ากลับมา */
test("ธง 'มาจากการย้อน' ผูกกับ pathname และเคลียร์เองเมื่อเปลี่ยนหน้า", () => {
  assert.match(arrivalSource, /armedPath = null/, "เปลี่ยนหน้าโดยไม่ได้ย้อน = ธงต้องดับ");
  assert.match(arrivalSource, /return armedPath === pathname/, "ธงตอบเป็นราย pathname");
});

test("รอให้เนื้อหาสูงพอก่อนคืนตำแหน่ง และมีเพดานเวลา", () => {
  assert.match(scrollSource, /scrollHeight < target \+ window\.innerHeight/,
    "หน้ายังเตี้ยแล้ว scrollTo จะไปหยุดผิดที่ แล้วนับว่าสำเร็จ");
  assert.match(scrollSource, /RESTORE_DEADLINE_MS/, "ต้องมีเพดาน ไม่งั้นข้อมูลมาช้าแล้วกระชากจอทีหลัง");
  assert.match(scrollSource, /"wheel"|'wheel'/, "ผู้ใช้ขยับเองแล้วต้องยกเลิกการคืนตำแหน่ง");
});

/* ⚠️ โหลดทั้งหน้าไม่ยิง popstate — ถ้าดูแค่ popstate จะได้ "กด F5 แล้วตัวกรองหาย"
   และ "ย้อนข้ามรอยต่อที่แอปถูกโหลดใหม่แล้วตัวกรองหาย" ทั้งที่ผู้ใช้ไม่ได้สั่ง */
test("โหลดทั้งหน้าแบบย้อน/รีเฟรช ยังนับว่าเป็นการกลับเข้าหน้าเดิม", () => {
  assert.match(arrivalSource, /getEntriesByType\?\.\("navigation"\)/, "ต้องอ่านชนิดการโหลดจาก Navigation Timing");
  assert.match(arrivalSource, /"back_forward"/, "กดย้อนข้ามรอยต่อที่โหลดใหม่");
  assert.match(arrivalSource, /"reload"/, "กด F5 ต้องได้หน้าเดิม ไม่ใช่หน้าที่ถูกล้าง");
});
