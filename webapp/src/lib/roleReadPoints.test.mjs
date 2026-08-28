// ── ทุกจุดที่อ่าน role ออกจาก app_metadata ต้องแปลงชื่อเก่าให้ก่อน ─────────
//
// ⭐ ที่มา: `legal` → `ra` (2026-08-28) · role อยู่ใน `app_metadata` ของ Supabase Auth
// **ไม่ใช่ตารางในฐาน** ⇒ ไม่มี migration SQL ให้รันพร้อม deploy · ถ้าโค้ดขึ้น
// production ก่อนบัญชีถูกย้าย คนที่ role ยังเป็น `legal` จะถือ role ที่ไม่มีในระบบ
// = ไม่มี capability สักตัว = เข้าหน้าไหนไม่ได้เลย
//
// ⇒ แปลง **ตอนอ่าน** (`normalizeRole`) ที่ทุกจุดที่ดึง role ออกมาเป็นตัวตนของผู้ใช้
// แล้วลำดับ deploy กับลำดับย้ายข้อมูลก็ไม่สำคัญอีกต่อไป
//
// ⚠️ เทสต์นี้อ่านซอร์สจริง — จุดใหม่ที่ลืมเรียก `normalizeRole` จะแดงตั้งแต่ก่อน merge
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, normalizeRole, can, departmentFor, normalizeDepartment } from './permissions.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(src, rel), 'utf8');

/* ทะเบียนจุดอ่าน — **เพิ่มได้อย่างเดียว** เหมือนทะเบียนสัญญาณ revalidate
   หลุดออกไป = มีคนถอด normalizeRole ทิ้ง */
const READ_POINTS = [
  'lib/authUser.js',
  'lib/usersRepo.js',
  'lib/pm/projectOwner.js',
  'lib/sales/dealOwner.js',
  'lib/sales/leadAssignee.js',
  'components/AppLayout.js',
  'app/home/page.js',
  'app/api/users/route.js',
  'app/api/users/[id]/transfer/route.js',
  'app/api/pm/assignable-users/route.js',
  'app/api/pm/personal-tasks/route.js',
  'app/api/pm/personal-tasks/[id]/route.js',
];

test('ทุกจุดที่อ่าน app_metadata.role ต้องผ่าน normalizeRole', () => {
  for (const rel of READ_POINTS) {
    const text = read(rel);
    assert.match(text, /normalizeRole/, `${rel}: ไม่ได้เรียก normalizeRole`);
    // 🪤 อ่านดิบแล้วค่อย normalize ทีหลังไม่นับ — ต้องห่อตั้งแต่จุดที่ดึงออกมา
    const raw = [...text.matchAll(/app_metadata\??\.\??\[?['"]?role/g)].length;
    const wrapped = [...text.matchAll(/normalizeRole\(\s*\w+(\.\w+)*\.app_metadata\??\.role/g)].length;
    assert.ok(wrapped > 0, `${rel}: มีการอ่าน role ${raw} จุด แต่ไม่มีจุดไหนห่อ normalizeRole`);
  }
});

/* ── `staff` เก่าต้องแปลงด้วย "ฝ่าย" ⇒ จุดอ่านต้องส่ง department เข้าไปด้วย ────────
   🐞 ถ้าจุดไหนเรียก `normalizeRole(role)` เฉย ๆ คนที่ยังถือโทเคน `staff` จะได้ role
   ที่ระบบไม่รู้จัก = อ่านทะเบียนได้อย่างเดียว ทั้งที่ยังไม่ได้ทำอะไรผิด (2026-08-28) */
test('ทุกจุดอ่านต้องส่ง department เป็นอาร์กิวเมนต์ที่สองของ normalizeRole', () => {
  for (const rel of READ_POINTS) {
    const text = read(rel);
    const withDept = /normalizeRole\(\s*\w+(\.\w+)*\.app_metadata\??\.role\s*,\s*\w+(\.\w+)*\.app_metadata\??\.department/;
    assert.match(text, withDept, `${rel}: เรียก normalizeRole โดยไม่ส่ง department`);
  }
});

test('normalizeRole แปลง staff เก่าเป็น role ของฝ่ายนั้น', () => {
  assert.equal(normalizeRole('staff', 'PC'), 'pc');
  assert.equal(normalizeRole('staff', 'TS'), 'ts');
  assert.equal(normalizeRole('staff', 'RD'), 'rd');
  assert.equal(normalizeRole('staff', 'FN'), 'finance');
  // ⚠️ ไม่มีฝ่าย = ไม่เดา — คืน staff ตามเดิม (role ที่ไม่รู้จัก = อ่านอย่างเดียว)
  assert.equal(normalizeRole('staff'), 'staff');
  assert.equal(normalizeRole('staff', 'SA'), 'staff');
});

test('normalizeRole คืน role ปัจจุบันตามเดิม ไม่แตะของที่ไม่ได้อยู่ในทะเบียน', () => {
  for (const role of ROLES) assert.equal(normalizeRole(role), role, role);
  // ค่าว่างต้องคืนตามเดิม ไม่แปลงเป็นอะไรลอย ๆ
  assert.equal(normalizeRole(null), null);
  assert.equal(normalizeRole(undefined), undefined);
  assert.equal(normalizeRole(''), '');
});

/* ⚠️ ทะเบียนว่างตอนนี้เพราะย้าย `legal` → `ra` ครบแล้ว (2026-08-28) — **ตะเข็บยังอยู่
   โดยตั้งใจ** ไม่ใช่ลืมลบ · เทสต์นี้ยืนยันว่าตะเข็บยังทำงานถ้ามีคนเติมทะเบียนวันหน้า
   ไม่ใช่กลายเป็นฟังก์ชันที่ถูกลดรูปจนแปลงอะไรไม่ได้อีก */
test('ตะเข็บยังทำงาน — เติมทะเบียนแล้วต้องแปลงได้ทันที', () => {
  const src = readFileSync(new URL('./permissions.js', import.meta.url), 'utf8');
  assert.match(src, /const LEGACY_ROLE = \{/, 'ทะเบียน role เก่าหายไปจากไฟล์');
  assert.match(src, /return LEGACY_ROLE\[role\] \|\| role;/,
    'normalizeRole ต้องยังอ่านจากทะเบียน ไม่ใช่คืนค่าเดิมตรง ๆ');
});

test('role ra ถือสิทธิ์ครบตามที่ฝ่ายนี้ต้องใช้', () => {
  for (const cap of ['ra:approve', 'ra:view', 'products:view', 'products:margin', 'history:view']) {
    assert.equal(can('ra', cap), true, `ra ต้องได้ ${cap}`);
  }
  // และต้องไม่ได้สิทธิ์ที่ไม่เคยมี
  assert.equal(can('ra', 'users:manage'), false);
  assert.equal(can('ra', 'products:edit'), false);
});

test('ra อยู่ในทะเบียน role และผูกกับฝ่าย RA', () => {
  assert.ok(ROLES.includes('ra'), 'ra ต้องอยู่ใน ROLES');
  assert.equal(ROLES.includes('legal'), false, 'legal ถูกเปลี่ยนเป็น ra แล้ว ห้ามเหลือค้าง');
  assert.equal(departmentFor('ra'), 'RA');
});

/* รหัสฝ่ายที่เก็บไว้แล้วเป็น `LG` — ต้องอ่านเป็น RA โดยไม่ต้องย้ายข้อมูล
   (กลไกเดียวกับที่ `SALES`/`LEGAL` ใช้มาตั้งแต่ก่อนหน้านี้) */
test('รหัสฝ่ายเก่า LG/LEGAL อ่านเป็น RA', () => {
  assert.equal(normalizeDepartment('LG'), 'RA');
  assert.equal(normalizeDepartment('LEGAL'), 'RA');
  assert.equal(normalizeDepartment('RA'), 'RA');
  assert.equal(normalizeDepartment('SA'), 'SA');
  assert.equal(normalizeDepartment(null), null);
});

test('accountProfile อ่านรหัสฝ่ายเก่าได้เหมือนกัน — สองไฟล์ต้องไม่ดริฟต์', () => {
  const text = read('lib/accountProfile.js');
  assert.match(text, /LEGAL: "RA"/, 'accountProfile ยังแปลง LEGAL เป็นค่าเก่า');
  assert.match(text, /LG: "RA"/, 'accountProfile ยังไม่รู้จัก LG');
});
