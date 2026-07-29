// สัญญาของ route ทะเบียนสรรพสามิต — ตรรกะอยู่ใน handler ที่ยังไม่มี harness เรียกตรง ๆ
// ได้ จึงล็อกด้วยการอ่าน source (แพตเทิร์นเดียวกับ soFilingRoute.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะโค้ดจริง — ไม่งั้นคอมเมนต์ที่อธิบายบั๊กเดิม
// (ซึ่งต้องพูดถึงชื่อ field/สูตรเก่า) จะทำให้เทสต์แดงเอง
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const detailRoute = read('../../app/api/excise-registrations/[id]/route.js');
const detailCode = codeOnly(detailRoute);
const listRoute = read('../../app/api/excise-registrations/route.js');
const fromProjectRoute = read('../../app/api/excise-registrations/from-project/route.js');
const migration = read('../../../supabase/migrations/0178_excise_registration_unique.sql');
const indexRename = read('../../../supabase/migrations/0179_excise_registration_index_name.sql');
// คอมเมนต์ SQL (`--`) ต้องถูกตัดก่อน assertion แบบ "ต้องไม่มี" — ไม่งั้นบรรทัดที่อธิบายว่า
// "ไม่มี UPDATE/DELETE ข้อมูล" จะทำให้เทสต์ที่ห้ามคำเหล่านั้นแดงเอง
const sqlCodeOnly = (src) => src.replace(/--.*$/gm, '');

// 🐞 บั๊กจริง 2026-07-29: เงื่อนไข recompute เป็น `allowed.has('taxableOverride')` =
// "ผู้ใช้มีสิทธิ์แก้ช่องนี้" ไม่ใช่ "ผู้ใช้สั่งแก้" — taxableOverride อยู่ใน
// LEGAL_REGISTRATION_FIELDS แปลว่าทุกครั้งที่ฝ่ายกฎหมายอนุมัติ/ตีกลับ/ใส่เลขอนุมัติ
// อัตราภาษีจะถูกคิดใหม่จากราคา ณ วินาทีนั้นแล้วเขียนทับเงียบ ๆ โดยไม่มีใครสั่ง
test('อัตราภาษีคิดใหม่เฉพาะเมื่อ LG ส่ง taxableOverride มาจริง ไม่ใช่แค่มีสิทธิ์', () => {
  assert.match(
    detailRoute,
    /if \(body\.taxableOverride !== undefined\) \{/,
    'ต้องผูกกับ body ไม่ใช่ allowed.has',
  );
  assert.doesNotMatch(
    detailCode,
    /if \(allowed\.has\('taxableOverride'\)\) \{/,
    'เงื่อนไขเดิมห้ามกลับมา — ทำให้การอนุมัติเขียนทับ snapshot',
  );
});

// อัตราภาษีคิดจาก **ราคาขายปลีกของ FG** (มติผู้ใช้ 2026-07-29) ซึ่งทะเบียนสินค้าคำนวณ
// เก็บไว้ใน products.exciseTax/localTax อยู่แล้ว — route นี้ต้อง "อ่าน" ไม่ใช่ "คิดเอง"
// เดิมคิดสูตรเอง (retailPriceIncVat / 1.07 * 0.08) = สำเนาที่สองของสูตรที่ products
// PATCH ใช้ (retailPriceExVat * 0.08) คนละฐานราคา เพี้ยนกันได้ทันทีที่สองคอลัมน์ไม่ตรง
test('ทะเบียนอ่านอัตราภาษีจากสินค้า ไม่คิดสูตรเอง (แหล่งเดียว = ราคาขายปลีกของ FG)', () => {
  assert.match(detailRoute, /updated\.exciseTax = product\.exciseTax \|\| 0;/);
  assert.match(detailRoute, /updated\.localTax = product\.localTax \|\| 0;/);
  assert.doesNotMatch(detailCode, /retailPriceIncVat/, 'ห้ามคิดจากราคาขายปลีกเองซ้ำ');
  assert.doesNotMatch(detailCode, /\* 0\.08/, 'อัตรา 8% ห้ามฝังในไฟล์นี้');
  // POST ก็ต้องอ่านจากแหล่งเดียวกัน (เป็นแบบนี้อยู่แล้ว — ตรึงไว้กันเพี้ยนภายหลัง)
  assert.match(listRoute, /exciseTax: isExciseTaxable \? \(product\.exciseTax \|\| 0\) : 0/);
});

// ทะเบียนซ้ำกระทบปลายน้ำจริง: soFiling ทำ Map ที่ key = productId ทะเบียนซ้ำจะทับกัน
// เงียบ ๆ แล้วใบยื่นอ้าง registrationId ของอันสุดท้ายโดยพลการ
test('กันทะเบียนซ้ำครบสองชั้น: ด่านฝั่งแอป (พร้อม error) + unique index ชั้น DB', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS excise_reg_product_customer_uidx/);
  assert.match(migration, /ON public\.excise_registrations \("productId", "customerId"\)/);
  // ด่านฝั่งแอปต้องไม่ทิ้ง error ของ query เช็คซ้ำอีก (เดิม `const { data: dup }`)
  assert.match(listRoute, /const \{ data: dup, error: dupErr \}/);
  assert.match(listRoute, /if \(dupErr\) return/);
  assert.match(fromProjectRoute, /const \{ data: existing, error: existingError \}/);
  assert.match(fromProjectRoute, /if \(existingError\) return fail/);
  // ทั้งสองทางที่สร้างทะเบียนต้องแปลง 23505 เป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง
  assert.match(listRoute, /error\?\.code === '23505'/);
  assert.match(fromProjectRoute, /error\.code === '23505'/);
});

// 0178 ประกาศชื่อ excise_reg_product_customer_uidx แต่ของจริงบน prod ถูกสร้างด้วยชื่อ
// excise_reg_prod_cust_uniq (ยืนยันจาก error ตอน insert ซ้ำ) — ชื่อไม่ตรงแปลว่า
// `CREATE UNIQUE INDEX IF NOT EXISTS` มองไม่เห็นตัวที่มีอยู่ รันซ้ำ/bootstrap ใหม่
// จะได้ unique index ตัวที่สองบนคู่คอลัมน์เดียวกัน
test('0179 รวมชื่อ index ให้เหลือชื่อเดียว และครอบคลุมทุกสถานะของฐาน', () => {
  // มีแต่ชื่อเก่า → เปลี่ยนชื่อ (ไม่ drop แล้วสร้างใหม่ ซึ่งจะเปิดช่วงที่ไม่มี unique คุม)
  assert.match(indexRename, /ALTER INDEX public\.excise_reg_prod_cust_uniq\s+RENAME TO excise_reg_product_customer_uidx/);
  // มีทั้งสองชื่อ → ทิ้งตัวเก่า
  assert.match(indexRename, /DROP INDEX public\.excise_reg_prod_cust_uniq/);
  // ไม่มีสักตัว → ยังต้องได้ตัวกลาง
  assert.match(indexRename, /CREATE UNIQUE INDEX IF NOT EXISTS excise_reg_product_customer_uidx/);
  // ตรวจการมีอยู่จาก catalog จริง ไม่ใช่เดาจาก IF EXISTS ของ ALTER (ซึ่งไม่มีในไวยากรณ์)
  assert.match(indexRename, /FROM pg_class c/);
  assert.match(indexRename, /nspname = 'public'/);
  // ห้ามแตะข้อมูล — ไฟล์นี้จัดการชื่อ index อย่างเดียว
  assert.doesNotMatch(sqlCodeOnly(indexRename), /\b(UPDATE|DELETE|TRUNCATE)\b/);
});
