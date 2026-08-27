// ── ฟอร์มลูกค้าส่งครบทุกช่องที่ตัวเองถือหรือยัง ──────────────────────────
//
// 🐞 **ที่มา (2026-08-27, เจอตอน UAT):** เพิ่มช่อง `nameTitle` / `namePerson`
// (mig 0296) ลง `EMPTY_CUSTOMER` และวาดบนฟอร์มครบแล้ว แต่ลืมเติมชื่อลงก้อน
// `payload` ของหน้าสร้าง/หน้าแก้ ซึ่งเป็น **whitelist เขียนมือ** ⇒ กดบันทึกแล้ว
// สองช่องนั้นไม่ถูกส่งไปเลย เซิร์ฟเวอร์เขียน null ลงฐาน โดยไม่มี error สักตัว
// (`name` ยังถูกเพราะฟอร์มประกอบไว้ให้ก่อนแล้ว — บั๊กจึงมองไม่เห็นจากหน้าจอ)
//
// กับดักตัวเดียวกับ `CUSTOMER_PICKER_COLUMNS` ใน route ของ API: ลิสต์ที่ต้องเติมมือ
// ทุกครั้งที่มีคอลัมน์ใหม่ และลืมแล้วเงียบสนิท ⇒ ผูกไว้กับเทสต์แทนความจำ
//
// เทียบกับ `EMPTY_CUSTOMER` เพราะนั่นคือสัญญาว่า "ฟอร์มถือช่องอะไรอยู่บ้าง"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ⚠️ อ่านเป็น **ข้อความ** ไม่ import — CustomerForm.js เป็น JSX ซึ่ง raw Node
   (ที่ `node --test` ใช้) parse ไม่ได้ · เทสต์นี้สนใจแค่ "มีคีย์ชื่อนี้ไหม" อยู่แล้ว */
function block(source, opener, closer) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `หา \`${opener}\` ไม่เจอ`);
  const end = source.indexOf(closer, start);
  assert.notEqual(end, -1, 'หาปลายบล็อกไม่เจอ');
  return source.slice(start, end);
}

const FORM_FILE = 'src/components/database/CustomerForm.js';
const formFields = [...block(readFileSync(FORM_FILE, 'utf8'), 'export const EMPTY_CUSTOMER = {', '\n};')
  .matchAll(/(?:^|[\s{])([a-zA-Z][a-zA-Z0-9]*):/g)].map((m) => m[1]);

const PAGES = {
  'หน้าสร้างลูกค้า': 'src/app/database/customers/page.js',
  'หน้าแก้ลูกค้า': 'src/app/database/customers/[id]/page.js',
};

/* ตัดเอาเฉพาะบล็อก `const payload = { … };` ก้อนแรกของไฟล์ — พอสำหรับเช็ค
   ว่ามีคีย์ครบไหม โดยไม่ต้องลาก parser เข้ามาทั้งตัว */
const payloadBlock = (source) => block(source, 'const payload = {', '\n    };');

for (const [label, file] of Object.entries(PAGES)) {
  test(`${label}: payload ส่งครบทุกช่องที่ฟอร์มถือ`, () => {
    const payload = payloadBlock(readFileSync(file, 'utf8'));
    const missing = formFields.filter((key) => !new RegExp(`(^|\\s)${key}:`, 'm').test(payload));
    assert.deepEqual(
      missing, [],
      `${file} ไม่ได้ส่งช่องเหล่านี้: ${missing.join(', ')} — เติมลง payload ด้วย ไม่งั้นค่าหายเงียบตอนบันทึก`,
    );
  });
}

test('EMPTY_CUSTOMER มีคำนำหน้า/ชื่อเปล่าอยู่จริง (กันเผลอถอดออก)', () => {
  assert.ok(formFields.includes('nameTitle'), 'EMPTY_CUSTOMER ต้องมี nameTitle');
  assert.ok(formFields.includes('namePerson'), 'EMPTY_CUSTOMER ต้องมี namePerson');
  assert.ok(formFields.length >= 10, `อ่านคีย์จาก EMPTY_CUSTOMER ได้แค่ ${formFields.length} ตัว — ตัวอ่านน่าจะพัง`);
});
