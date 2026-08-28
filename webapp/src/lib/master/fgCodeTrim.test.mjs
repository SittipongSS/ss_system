// ── กฎ "รหัส FG ห้ามมีช่องว่างหัวท้าย" ต้องเป็นกฎเดียวกันทั้งสามชั้น ──────
//
// 🐞 **บทเรียนจาก mig 0307 (2026-08-28)** — ใบนั้นรันผ่านบน production **สองรอบ**
// แต่แก้ได้ **0 แถว** เพราะเขียน `btrim("fgCode")` แบบอาร์กิวเมนต์เดียว ซึ่ง Postgres
// นิยามว่าตัดเฉพาะ **ช่องว่าง (U+0020) เป็นค่าเริ่มต้น** — ไม่ตัดแท็บ
// ของสกปรกจริงบนฐานเป็นแท็บล้วน (U+0009) ⇒ ทั้ง `WHERE` และ `CHECK` เป็นจริงหมด
// ⇒ migration เงียบสนิท ไม่มี error ไม่มีแถวเปลี่ยน และ CHECK ที่ตั้งใจกันของใหม่
// ก็กันอะไรไม่ได้เลย · mig 0309 แก้ด้วยการ **ระบุชุดอักขระตรง ๆ**
//
// 🪤 กับดักที่ทำให้ไม่มีใครจับได้: ฝั่งแอปใช้ `String.prototype.trim()` ของ JS ซึ่ง
// **ตัดแท็บ** ⇒ สองฝั่งนิยาม "ช่องว่าง" ไม่ตรงกัน และตัวตรวจที่เขียนด้วย JS จะรายงาน
// ว่า "ยังสกปรก" ทั้งที่ SQL คิดว่าสะอาดแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const migration = read('../../../supabase/migrations/0309_trim_fg_code_all_whitespace.sql');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะ SQL จริง — คอมเมนต์ของใบนี้ยกโค้ดที่ผิดมาอธิบาย
// จึงมี btrim อาร์กิวเมนต์เดียวอยู่ในนั้นโดยเจตนา (ท่าเดียวกับ sqlCodeOnly ในเทสต์อื่น)
const sqlOnly = migration.replace(/--.*$/gm, '');

/* ⚠️ ห้ามใช้ btrim อาร์กิวเมนต์เดียวกับ fgCode อีก — นั่นคือบั๊กของ 0307 เป๊ะ ๆ */
test('0309: ไม่ใช้ btrim ค่าเริ่มต้น — ต้องระบุชุดอักขระเสมอ', () => {
  const singleArg = [...sqlOnly.matchAll(/btrim\(\s*"fgCode"\s*\)/g)];
  assert.equal(singleArg.length, 0,
    'btrim("fgCode") อาร์กิวเมนต์เดียวตัดแค่ช่องว่าง ไม่ตัดแท็บ — นี่คือบั๊กของ 0307');
});

test('0309: ทุกจุดที่ตัดช่องว่างใช้ชุดอักขระชุดเดียวกัน', () => {
  const calls = [...sqlOnly.matchAll(/btrim\(\s*"fgCode"\s*,\s*(E'[^']*')\s*\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 5, `เจอ btrim แค่ ${calls.length} จุด — น้อยกว่าที่ใบนี้ควรมี`);
  assert.equal(new Set(calls).size, 1,
    `ชุดอักขระไม่ตรงกันทุกจุด: ${[...new Set(calls)].join(' vs ')} — การล้างกับ CHECK ต้องใช้กฎเดียวกัน`);
  const [charset] = calls;
  for (const ch of ['\\t', '\\n', '\\r']) {
    assert.ok(charset.includes(ch), `ชุดอักขระขาด ${ch}`);
  }
  assert.ok(charset.includes(' '), 'ชุดอักขระขาดช่องว่างปกติ');
});

/* CHECK ของ 0307 ใช้กฎผิด ⇒ ต้องถูกถอดทิ้งก่อน ไม่ใช่ปล่อยค้างคู่กับตัวใหม่ */
test('0309: ถอด CHECK เดิมที่ใช้กฎผิดออกก่อนใส่ตัวใหม่', () => {
  const flat = sqlOnly.replace(/\s+/g, ' ');
  const drop = flat.indexOf('DROP CONSTRAINT IF EXISTS products_fg_code_trimmed');
  const add = flat.indexOf('ADD CONSTRAINT products_fg_code_trimmed');
  assert.ok(drop >= 0, 'ไม่ได้ถอด CHECK เดิมของ 0307');
  assert.ok(add > drop, 'ต้องถอดก่อนใส่ตัวใหม่');
  // ล้างข้อมูลต้องอยู่ระหว่างถอดกับใส่ — ไม่งั้น VALIDATE จะล้มเพราะแถวยังสกปรก
  const update = flat.indexOf('UPDATE public.products SET "fgCode"');
  assert.ok(drop < update && update < add, 'ลำดับต้องเป็น DROP → UPDATE → ADD');
});

test('0309: ล้างทั้งสองตาราง — สำเนาบนทะเบียนไม่ได้อ่านจาก products', () => {
  assert.match(sqlOnly, /UPDATE public\.products\s+SET "fgCode"/);
  assert.match(sqlOnly, /UPDATE public\.excise_registrations\s+SET "fgCode"/);
});

/* ⚠️ ฝั่งแอปใช้ `.trim()` ของ JS ซึ่งตัดช่องว่างทุกชนิดอยู่แล้ว — กว้างกว่าหรือเท่ากับ
   ฝั่ง SQL เสมอ ⇒ ไม่มีทางที่แอปจะเขียนค่าที่ CHECK ปฏิเสธ */
test('ด่านฝั่งแอปยังใช้ .trim() ซึ่งครอบคลุมช่องว่างทุกชนิด', () => {
  const patch = read('../../app/api/products/[id]/route.js');
  const post = read('../../app/api/products/route.js');
  assert.match(patch, /body\.fgCode = body\.fgCode\.trim\(\)/, 'ทางแก้ไขต้อง trim');
  assert.match(post, /String\(body\.fgCode \|\| ''\)\.trim\(\)/, 'ทางสร้างต้อง trim');
});
