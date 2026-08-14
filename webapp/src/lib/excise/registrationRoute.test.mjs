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

// อัตราภาษีคิดจาก **ราคาขายปลีกของ FG** ซึ่งอัปเดตได้ (มติผู้ใช้ 2026-07-29) จึงมีแหล่ง
// เดียวคือ products — ทะเบียนสรรพสามิตห้ามคิดสูตรเอง และ (ตั้งแต่ mig 0180) ห้ามเก็บ
// สำเนาด้วย · เดิมคิดสูตรเอง (retailPriceIncVat / 1.07 * 0.08) = สำเนาที่สองของสูตรที่
// products PATCH ใช้ (retailPriceExVat * 0.08) คนละฐานราคา เพี้ยนกันได้ทันที
test('ทะเบียนไม่คิดสูตรภาษีเอง — อัตรามาจากทะเบียนสินค้าที่เดียว', () => {
  assert.doesNotMatch(detailCode, /retailPriceIncVat/, 'ห้ามคิดจากราคาขายปลีกเองซ้ำ');
  assert.doesNotMatch(detailCode, /\* 0\.08/, 'อัตรา 8% ห้ามฝังในไฟล์นี้');
  assert.doesNotMatch(detailCode, /\* 0\.1\b/, 'อัตราท้องถิ่น 10% ห้ามฝังในไฟล์นี้');
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

// มติผู้ใช้ 2026-07-29: อัตราภาษีคิดจากราคาขายปลีกของ FG ซึ่ง**อัปเดตได้** (เหมือนราคา
// ผลิต) จึงต้องมีแหล่งเดียว = products · สำเนาบนทะเบียนถูกปลดระวางที่ mig 0180 เพราะ
// ไม่มีใครอัปเดตตามเมื่อราคาขยับ → หน้าทะเบียนโชว์เลขหนึ่ง ใบยื่นคิดอีกเลข ไม่มี error เตือน
test('ทะเบียนเลิกเก็บสำเนาอัตราภาษี — เขียนคอลัมน์นั้นไม่ได้อีก', () => {
  const dropSnapshot = read('../../../supabase/migrations/0180_excise_registration_drop_tax_snapshot.sql');
  assert.match(dropSnapshot, /DROP COLUMN IF EXISTS "exciseTax"/);
  assert.match(dropSnapshot, /DROP COLUMN IF EXISTS "localTax"/);
  // ทั้งสองทางที่สร้างทะเบียนต้องไม่ส่งค่าลงคอลัมน์ที่ถูกตัดแล้ว (ไม่งั้น insert พัง)
  for (const [name, src] of [['POST', listRoute], ['from-project', fromProjectRoute]]) {
    assert.doesNotMatch(codeOnly(src), /^\s*exciseTax:/m, `${name} ห้ามเขียนคอลัมน์ที่ถูกตัดแล้ว`);
    assert.doesNotMatch(codeOnly(src), /^\s*localTax:/m, `${name} ห้ามเขียนคอลัมน์ที่ถูกตัดแล้ว`);
  }
  // PATCH ก็เช่นกัน — เหลือแค่ธง isExciseTaxable ซึ่งเป็นคำตัดสินของฝ่ายกฎหมาย
  assert.doesNotMatch(detailCode, /updated\.exciseTax/);
  assert.doesNotMatch(detailCode, /updated\.localTax/);
  assert.match(detailCode, /updated\.isExciseTaxable = typeof ovr === 'boolean'/);
});

// จอทุกจอที่โชว์ "ภาษี/ชิ้น" ต้องคิดด้วยตัวกลางตัวเดียวกับที่ API ใช้ตอนออกใบยื่น
// ไม่งั้นเลขบนจอกับเลขบนใบจะเดินหนีกันอีกรอบ (จอ LG สำคัญสุด — ใช้ตัดสินใจอนุมัติ)
test('ทุกจอที่โชว์ภาษี/ชิ้น อ่านอัตราจากสินค้าผ่านตัวคิดกลาง', () => {
  for (const path of [
    '../../app/tax/registrations/page.js',
    '../../app/tax/registrations/[id]/page.js',
    '../../components/excise/ApproveDialog.js',
  ]) {
    const code = codeOnly(read(path));
    assert.match(code, /exciseTaxLineForRegistration\(\{/, `${path} ต้องเรียกตัวคิดกลาง`);
    assert.doesNotMatch(code, /r\.exciseTax|registration\.exciseTax/, `${path} ห้ามอ่านสำเนาบนทะเบียน`);
  }
  // หน้าลูกค้า (API) ก็ต้องส่งอัตราของสินค้า ไม่ใช่ของทะเบียน
  const customersRoute = codeOnly(read('../../app/api/customers/[id]/route.js'));
  assert.doesNotMatch(customersRoute, /r\.exciseTax|r\.localTax/);
  assert.match(customersRoute, /\? p\.exciseTax : 0/);
});

/* ทะเบียนไร้ทีม = "ของกลาง" — `canViewRecord` ถือแบบนั้นมาตั้งแต่ TEAMLESS_SHARED_RESOURCES
   แต่ตัวกรองของลิสต์ยังเป็น `.in('team', ทีมของฉัน)` เฉย ๆ ซึ่งไม่มีวันแมตช์ NULL ⇒
   ทะเบียนที่คนไม่มีทีม (admin/legal/staff) สร้าง หายจากลิสต์ของทุกทีม ทั้งที่เปิดรายตัวได้
   — เคสจริงที่คอมเมนต์ของ canViewRecord เล่าไว้ (ค้าง "รออนุมัติ" 6 วันโดยไม่มีใครเห็น) */
test('ลิสต์ทะเบียนโชว์แถวไร้ทีมให้ทุกทีม — กฎเดียวกับใบยื่น (/api/orders)', () => {
  assert.match(listRoute, /team\.is\.null/, 'ต้องมีสาขาแถวไร้ทีม');
  assert.match(listRoute, /viewScopeUser\(user\) === 'team' && userTeams\(user\)\.length/,
    'คนที่ scope ทีมแต่ยังไม่มีทีม = ไม่กรอง (เหมือน /api/orders) ไม่ใช่ได้ลิสต์ว่าง');
  assert.doesNotMatch(codeOnly(listRoute), /whereTeamIn\(query, user\)/, 'ตัวกรองที่ตัดแถวไร้ทีมห้ามกลับมา');
});
