// ── ขอบเขตของโครงการเดินตามผู้ดูแล (AE) ไม่ใช่คนกดสร้าง ─────────────────────
//
// บั๊กจริง (ผู้ใช้เจอเองบนจอ 2026-08-14): Admin สร้างโครงการแล้วเลือก AE ผู้ดูแลให้
// → AE คนนั้นไม่เห็นโครงการในลิสต์ตัวเองเลย เพราะลิสต์กรองด้วย `team` + `ownerId`
// ซึ่งตอนนั้นเขียนจากคนกดสร้าง (admin ไม่มีทีม ⇒ team = null · ownerId = admin)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROJECT_OWNER_ROLES, resolveProjectAcOwner, resolveProjectAeOwner, resolveProjectSupervisor,
} from './projectOwner.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะโค้ดจริง — คอมเมนต์ที่เล่าบั๊กเดิมต้องพูดถึง
// สูตรเก่าได้โดยไม่ทำให้เทสต์แดงเอง (แพตเทิร์นเดียวกับ registrationRoute.test.mjs)
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// stub auth admin: id -> user (รูปเดียวกับ dealOwner.test.mjs / leadAssignee.test.mjs)
const ownerStub = (users) => ({
  auth: {
    admin: {
      async getUserById(id) {
        const user = users[id];
        return user
          ? { data: { user: { id, banned_until: null, ...user } }, error: null }
          : { data: { user: null }, error: { message: 'User not found' } };
      },
    },
  },
});

const AE_ODM = { app_metadata: { role: 'ae', team: 'ODM', teams: ['ODM'] }, user_metadata: { name: 'เอ ทีมโอดีเอ็ม' } };
const AE_DUAL = { app_metadata: { role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] }, user_metadata: { name: 'ดูอัล' } };
const AC_ODM = { app_metadata: { role: 'ac', team: 'ODM' }, user_metadata: { name: 'ซี หลังบ้าน' } };
const AE_NO_TEAM = { app_metadata: { role: 'ae' }, user_metadata: { name: 'ยังไม่จัดทีม' } };
const ADMIN = { id: 'U-ADMIN', role: 'admin', team: null, teams: [] };

test('Admin สร้างให้ AE — ทีม/เจ้าของของแถวเป็นของ AE ไม่ใช่ของ Admin', async () => {
  const got = await resolveProjectAeOwner(ownerStub({ 'U-AE': AE_ODM }), 'U-AE', ADMIN);
  assert.equal(got.ok, true);
  assert.equal(got.team, 'ODM', 'ทีมต้องมาจากผู้ดูแล — team ของ admin เป็น null เสมอ');
  assert.equal(got.ownerId, 'U-AE', 'เจ้าของแถว = ผู้ดูแล ไม่ใช่คนกดสร้าง');
  assert.equal(got.aeOwner, 'เอ ทีมโอดีเอ็ม', 'ชื่อมาจาก server ไม่ใช่จาก client');
});

test('ผู้ดูแลอยู่หลายทีม — ฟอร์มเลือกทีมได้ แต่ต้องเป็นทีมที่เขาสังกัดจริง', async () => {
  const stub = ownerStub({ 'U-D': AE_DUAL });
  assert.equal((await resolveProjectAeOwner(stub, 'U-D', ADMIN, 'SV')).team, 'SV');
  // ทีมที่เขาไม่ได้สังกัด → ถอยเป็นทีมหลักของเขา (ยอดไม่เข้าทีมที่ไม่เกี่ยว)
  assert.equal((await resolveProjectAeOwner(stub, 'U-D', ADMIN, 'KA')).team, 'ODM');
  // ไม่ระบุ → ทีมหลัก
  assert.equal((await resolveProjectAeOwner(stub, 'U-D', ADMIN)).team, 'ODM');
});

test('ผู้ดูแลโครงการ = AE / Senior AE เท่านั้น (ชุดเดียวกับคนถือดีล)', async () => {
  assert.deepEqual(PROJECT_OWNER_ROLES, ['ae', 'senior_ae']);
  const bad = await resolveProjectAeOwner(ownerStub({ 'U-AC': AC_ODM }), 'U-AC', ADMIN);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /AE \/ Senior AE/);
});

test('บัญชีที่ถูกระงับ / ไม่มีตัวตน รับเป็นผู้ดูแลไม่ได้', async () => {
  const banned = { ...AE_ODM, banned_until: '2999-01-01T00:00:00Z' };
  assert.equal((await resolveProjectAeOwner(ownerStub({ 'U-X': banned }), 'U-X', ADMIN)).ok, false);
  assert.equal((await resolveProjectAeOwner(ownerStub({}), 'U-GHOST', ADMIN)).ok, false);
  assert.equal((await resolveProjectAeOwner(ownerStub({}), '', ADMIN)).ok, false);
});

/* ⭐ เหตุผลที่ไฟล์นี้ไม่เรียก validateDealOwner มาใช้ซ้ำ: ด่านทีมของดีลวัดคนสั่งด้วย
   `salesPlanningEditScope` ซึ่ง AE = 'own' ⇒ ด่านไม่ทำงานเลยเมื่อคนสั่งเป็น AE
   แต่ PM ให้ AE แก้งานได้ทั้งทีม (pmEditScope 'team') ⇒ AE ยกโครงการข้ามทีมได้
   แล้วตัวเองมองไม่เห็นอีกเลย ถ้าไม่กันตรงนี้ */
test('คนสั่งระดับทีม (รวม AE) ยกโครงการข้ามทีมไม่ได้ — ผู้กำกับดูแลข้ามได้', async () => {
  const stub = ownerStub({ 'U-AE': AE_ODM });
  for (const actor of [
    { id: 'A', role: 'ae', team: 'KA', teams: ['KA'] },
    { id: 'B', role: 'ac', team: 'KA', teams: ['KA'] },
    { id: 'C', role: 'senior_ae', team: 'KA', teams: ['KA'] },
  ]) {
    const got = await resolveProjectAeOwner(stub, 'U-AE', actor);
    assert.equal(got.ok, false, `${actor.role} ต้องยกข้ามทีมไม่ได้`);
  }
  // มีทีมร่วมกันก็พอ (คนหนึ่งคนอยู่หลายทีมได้)
  const svLead = { id: 'D', role: 'senior_ae', team: 'SV', teams: ['SV'] };
  assert.equal((await resolveProjectAeOwner(ownerStub({ 'U-D': AE_DUAL }), 'U-D', svLead)).ok, true);
  // admin / หัวหน้าฝ่ายขาย (scope 'all') กำกับข้ามทีมได้ตามเดิม
  assert.equal((await resolveProjectAeOwner(stub, 'U-AE', ADMIN)).ok, true);
  assert.equal((await resolveProjectAeOwner(stub, 'U-AE', { id: 'E', role: 'ae_supervisor' })).ok, true);
});

/* ผู้ดูแลที่บัญชียังไม่ถูกจัดทีม = บัญชีที่ตั้งค่าไม่ครบ ไม่ใช่เหตุให้บล็อกงาน —
   ทีมเดาไม่ได้ (null) แต่ `ownerId` ยังพาให้เขาเห็นงานตัวเองผ่านสาขา ownerId.eq */
test('ผู้ดูแลที่ยังไม่มีทีม — ผ่านได้ ทีมเป็น null แต่ต้องได้เป็นเจ้าของแถว', async () => {
  const got = await resolveProjectAeOwner(ownerStub({ 'U-N': AE_NO_TEAM }), 'U-N', ADMIN);
  assert.equal(got.ok, true);
  assert.equal(got.team, null);
  assert.equal(got.ownerId, 'U-N');
});

/* ── ผู้ประสานงาน (AC) ──────────────────────────────────────────────────────
   🐞 ช่อง "ผู้ประสานงานโครงการ (AC)" บนฟอร์มเคยเขียนลง `preparedBy` (คอลัมน์
   "ผู้จัดทำ" ของหัว ISO) ส่วน `acOwner`/`acOwnerId` ที่ PDR (pdrFields → coordinator)
   และระบบแจ้งเตือน (updateAccess) อ่านจริง ว่างทั้ง 90 ใบบน prod ⇒ ช่องผู้ประสานงาน
   บนใบ PDR ว่างตลอดกาล ไม่ใช่เพราะไม่มีคนกรอก แต่กรอกไปคนละช่อง */
test('AC: ช่องไม่บังคับ — ว่าง = ถอดคนออก ไม่ใช่ error', async () => {
  const got = await resolveProjectAcOwner(ownerStub({}), '', 'ODM');
  assert.equal(got.ok, true);
  assert.equal(got.acOwnerId, null);
  assert.equal(got.acOwner, '');
});

test('AC: ต้องเป็นตำแหน่ง AC จริง และอยู่ทีมเดียวกับงาน', async () => {
  const stub = ownerStub({ 'U-AC': AC_ODM, 'U-AE': AE_ODM });
  const good = await resolveProjectAcOwner(stub, 'U-AC', 'ODM');
  assert.equal(good.ok, true);
  assert.equal(good.acOwner, 'ซี หลังบ้าน', 'ชื่อมาจาก server');
  // AE ไม่ใช่ผู้ประสานงาน — คนละหน้าที่ (AC เป็นหลังบ้าน ไม่ใช่เจ้าของงาน)
  assert.equal((await resolveProjectAcOwner(stub, 'U-AE', 'ODM')).ok, false);
  // คนละทีมกับงาน = ตีกลับ (แจ้งเตือนจะวิ่งไปหาคนที่ไม่เกี่ยว)
  assert.equal((await resolveProjectAcOwner(stub, 'U-AC', 'KA')).ok, false);
  // งานที่ยังไม่มีทีม = ข้ามด่านทีม
  assert.equal((await resolveProjectAcOwner(stub, 'U-AC', null)).ok, true);
});

test('AC: บัญชีที่ถูกระงับ / ไม่มีตัวตน รับไม่ได้', async () => {
  const banned = { ...AC_ODM, banned_until: '2999-01-01T00:00:00Z' };
  assert.equal((await resolveProjectAcOwner(ownerStub({ 'U-B': banned }), 'U-B', 'ODM')).ok, false);
  assert.equal((await resolveProjectAcOwner(ownerStub({}), 'U-GHOST', 'ODM')).ok, false);
});

test('ฟอร์มเขียนผู้ประสานงานลง acOwner/acOwnerId ไม่ใช่ preparedBy', () => {
  const modal = codeOnly(read('../../components/pm/SalesProjectCreateModal.js'));
  assert.match(modal, /role === "ac" \? "acOwner"/, 'AC สร้างโครงการ = ล็อกเป็นผู้ประสานงาน');
  assert.match(modal, /onChange=\{\(acOwner\) => setForm/);
  assert.match(modal, /acOwnerId: \(lockPeopleField === "acOwner" \? myName : form\.acOwner\)/);
  // preparedBy = "ผู้จัดทำ" ของหัว ISO — server ตั้งเป็นผู้สร้าง ฟอร์มไม่ยุ่งอีก
  assert.doesNotMatch(modal, /form\.preparedBy/, 'ช่อง AC ห้ามกลับไปเขียน preparedBy');
});

/* mig 0255 ย้ายผู้ประสานงานที่เคยไปกองใน preparedBy กลับเข้า acOwner/acOwnerId
   ⚠️ ต้องย้ายเฉพาะชื่อที่เป็นบัญชี role 'ac' จริง — ชื่อ AE/แอดมินใน preparedBy คือ
   ค่า default "ผู้จัดทำ = ผู้สร้าง" ที่ server เติมให้ ไม่ใช่การเลือกผู้ประสานงาน */
test('mig 0255: ย้ายเฉพาะบัญชี AC และไม่ล้างช่องผู้จัดทำ', () => {
  const sql = read('../../../supabase/migrations/0255_project_ac_owner_from_prepared_by.sql')
    .replace(/--.*$/gm, '');
  assert.match(sql, /raw_app_meta_data->>'role', ''\) = 'ac'/, 'ต้องกรองเฉพาะ role ac');
  assert.match(sql, /HAVING count\(DISTINCT uid\) = 1/, 'ชื่อที่ตรงหลายบัญชีต้องไม่เดาแทน');
  assert.match(sql, /WHERE p\."acOwnerId" IS NULL/, 'ห้ามทับค่าที่มีอยู่แล้ว');
  // หัวเอกสารที่พิมพ์ไปแล้วห้ามกลายเป็นช่องว่าง
  assert.doesNotMatch(sql, /SET[\s\S]{0,80}"preparedBy"\s*=/, 'ห้ามล้าง preparedBy');
});

test('ทุกทางที่สร้าง/แก้โครงการ ตรวจผู้ประสานงานด้วยตัวกลางตัวเดียว', () => {
  for (const rel of [
    '../../app/api/sa/projects/route.js',
    '../../app/api/sales-planning/deals/[id]/create-project/route.js',
    '../../app/api/pm/projects/[id]/route.js',
  ]) {
    assert.match(read(rel), /resolveProjectAcOwner\(supabase,/, `${rel} ต้องเรียกด่านกลาง`);
  }
  // ชื่อมาจาก server — ไม่รับชื่อลอย ๆ จาก client อีก
  assert.doesNotMatch(codeOnly(read('../../app/api/sa/projects/route.js')), /acOwner: body\.acOwner/);
});

/* ── ผู้ตรวจสอบ (AE Supervisor) = ฝ่ายที่สามของโครงการ ─────────────────────
   ดีลมีเจ้าของคนเดียว (AE/Senior) แต่โครงการมีสามฝ่าย · ฝ่ายที่สามเป็น `text` เปล่า ๆ
   มาตั้งแต่ mig 0008 ⇒ หัวหน้าที่ถูกระบุบนหัวโครงการไม่เคยได้รับแจ้งเตือนเลยสักครั้ง */
const SUPERVISOR = { app_metadata: { role: 'ae_supervisor' }, user_metadata: { name: 'หัวหน้าฝ่ายขาย' } };

test('ผู้ตรวจสอบ: ว่าง = ถอดคนออก · ต้องเป็นตำแหน่ง ae_supervisor เท่านั้น', async () => {
  const stub = ownerStub({ 'U-SUP': SUPERVISOR, 'U-AE': AE_ODM, 'U-AC': AC_ODM });
  const blank = await resolveProjectSupervisor(stub, '');
  assert.equal(blank.ok, true);
  assert.equal(blank.aeSupervisorId, null);

  const good = await resolveProjectSupervisor(stub, 'U-SUP');
  assert.equal(good.ok, true);
  assert.equal(good.aeSupervisor, 'หัวหน้าฝ่ายขาย', 'ชื่อมาจาก server');
  for (const id of ['U-AE', 'U-AC']) {
    assert.equal((await resolveProjectSupervisor(stub, id)).ok, false, `${id} ไม่ใช่ผู้ตรวจสอบ`);
  }
  assert.equal((await resolveProjectSupervisor(ownerStub({}), 'U-GHOST')).ok, false);
});

/* ⚠️ ไม่มีด่านทีมโดยเจตนา — หัวหน้าฝ่ายขายมี viewScope 'all' คุมทุกทีมอยู่แล้ว
   บังคับให้ทีมตรงกับงาน = กันคนที่มีสิทธิ์อยู่แล้วเปล่า ๆ */
test('ผู้ตรวจสอบข้ามทีมได้ — ต่างจาก AE/AC ที่ผูกทีม', async () => {
  const stub = ownerStub({ 'U-SUP': SUPERVISOR });
  assert.equal((await resolveProjectSupervisor(stub, 'U-SUP')).ok, true);
});

test('หัวหน้าที่ระบุบนโครงการต้องได้รับแจ้งเตือนด้วย', () => {
  const access = read('../master/updateAccess.js');
  assert.match(access, /parent\?\.ownerId, parent\?\.aeOwnerId, parent\?\.acOwnerId, parent\?\.aeSupervisorId/);
});

/* ชื่อคนของทั้งสามฝ่ายเขียนจาก server เท่านั้น — รับชื่อจาก client เมื่อไรคือเปิดทาง
   ให้ "ชื่อบนใบบอกว่าเป็นคนหนึ่ง แต่ id ที่ใช้จริงเป็นอีกคน" ซึ่งเป็นกับดักที่ mig 0190
   เกิดมาเพื่อแก้ · ฟอร์มส่งคู่กันอยู่แล้ว การตัดออกจึงไม่กระทบทางใช้งานจริง */
test('PATCH รับเฉพาะ id ของสามฝ่าย ไม่รับชื่อ', () => {
  const patch = read('../../app/api/pm/projects/[id]/route.js');
  const editable = patch.slice(patch.indexOf('const EDITABLE'), patch.indexOf('];', patch.indexOf('const EDITABLE')));
  for (const idField of ["'aeOwnerId'", "'acOwnerId'", "'aeSupervisorId'"]) {
    assert.ok(editable.includes(idField), `${idField} ต้องแก้ได้`);
  }
  for (const nameField of ["'aeOwner'", "'acOwner'", "'aeSupervisor'"]) {
    assert.ok(!editable.includes(nameField), `${nameField} ต้องมาจาก server เท่านั้น`);
  }
  // ช่องที่ไม่มีใครอ่านถูกปลดระวางไปกับ mig 0256
  assert.ok(!editable.includes("'keyAccountExec'"));
  assert.match(patch, /resolveProjectSupervisor\(supabase, updates\.aeSupervisorId\)/);
});

test('mig 0256: เพิ่มตัวตนผู้ตรวจสอบ + ตัดคอลัมน์ที่ไม่มีใครอ่าน', () => {
  const sql = read('../../../supabase/migrations/0256_project_supervisor_id.sql').replace(/--.*$/gm, '');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "aeSupervisorId" text/);
  assert.match(sql, /raw_app_meta_data->>'role', ''\) = 'ae_supervisor'/, 'จับคู่เฉพาะตำแหน่งผู้ตรวจสอบ');
  assert.match(sql, /HAVING count\(DISTINCT uid\) = 1/, 'ชื่อกำกวมต้องไม่เดาแทน');
  assert.match(sql, /DROP COLUMN IF EXISTS "keyAccountExec"/);
  // ชื่อบนเอกสารห้ามถูกลบ — หน้าออกใบเสนอราคาอ่านช่องนี้ไปตั้งต้น
  assert.doesNotMatch(sql, /DROP COLUMN IF EXISTS "aeSupervisor"\s*;/);
});

// ── ด่านจริงอยู่ที่ API เสมอ ────────────────────────────────────────────────
test('POST /api/sa/projects เขียนทีม/เจ้าของตามผู้ดูแล และบังคับให้เลือก AE', () => {
  const post = read('../../app/api/sa/projects/route.js');
  assert.match(post, /resolveProjectAeOwner\(supabase, body\.aeOwnerId, user, body\.team\)/);
  assert.match(post, /team: owner\?\.team \|\| attributionTeam\(user, body\.team\)/);
  assert.match(post, /ownerId: owner\?\.ownerId \|\| user\.id/);
  // ac / ae_supervisor / admin ปล่อยว่างไม่ได้ — โครงการจะไม่โผล่ในลิสต์ของ AE คนไหนเลย
  assert.match(post, /else if \(!ownerLockedToSelf\(user\.role\)\)/);
  // 🐞 ของเดิม: สองช่องนี้มาจากคนกดสร้างตรง ๆ
  assert.doesNotMatch(codeOnly(post), /team: user\.team \|\| null/, 'ห้ามกลับไปใช้ทีมของคนกด');
  assert.doesNotMatch(codeOnly(post), /^\s*ownerId: user\.id \|\| null,/m, 'ห้ามกลับไปใช้คนกดเป็นเจ้าของ');
});

/* ด่านฝั่งฟอร์มต้องบอกตั้งแต่ก่อนกดบันทึก (docs/form-design-rules.md §2) — ไม่ใช่
   ปล่อยให้ยิงแล้วเจอ 400 · แต่บังคับเฉพาะตอนสร้าง โครงการเก่าที่ผู้ดูแลยังว่างต้องแก้ได้ */
test('ฟอร์มสร้างโครงการบังคับช่องผู้ดูแล (AE) สำหรับคนที่เลือกชื่อได้', () => {
  const modal = read('../../components/pm/SalesProjectCreateModal.js');
  assert.match(modal, /\[!editingId && !lockPeopleField && !form\.aeOwner, "ผู้ดูแลโครงการ \(AE\)"\]/);
});

test('PATCH โครงการ: เปลี่ยนผู้ดูแลแล้วทีม/เจ้าของย้ายตาม', () => {
  const patch = read('../../app/api/pm/projects/[id]/route.js');
  assert.match(patch, /if \(updates\.aeOwnerId !== undefined && \(updates\.aeOwnerId \|\| null\) !== \(project\.aeOwnerId \|\| null\)\)/);
  assert.match(patch, /resolveProjectAeOwner\(supabase, updates\.aeOwnerId, user, project\.team\)/);
  assert.match(patch, /updates\.ownerId = checked\.ownerId/);
  // ผู้ดูแลใหม่ที่ยังไม่มีทีม ต้องไม่ล้างทีมเดิมของแถวทิ้ง (ทั้งทีมจะมองไม่เห็นงาน)
  assert.match(patch, /updates\.team = checked\.team \|\| project\.team \|\| null/);
  // สองช่องนี้ต้องมาจาก server เท่านั้น — เปิดใน EDITABLE เมื่อไรคือยกโครงการเข้าทีม
  // ที่ตัวเองไม่ได้อยู่ได้ผ่าน body ดิบ ๆ
  const editable = patch.slice(patch.indexOf('const EDITABLE'), patch.indexOf('];', patch.indexOf('const EDITABLE')));
  assert.doesNotMatch(editable, /'team'/);
  assert.doesNotMatch(editable, /'ownerId'/);
});

/* 🐞 พบตอนเอาไปรันจริง: `projects."ownerId"` เป็น **uuid** (mig 0008 — ตารางเดียวใน
   ระบบที่เป็น uuid ที่เหลือเป็น text) ส่วน `"aeOwnerId"` เป็น **text** (mig 0190)
   ⇒ เทียบ/เขียนตรง ๆ ได้ `42883: operator does not exist: uuid = text` แล้ว DO block
   ล้มทั้งก้อน · เทสต์ตรงนี้ตรึงว่าทุกจุดที่สองช่องนี้มาเจอกันต้องมี cast */
test('mig 0253: uuid ↔ text ต้อง cast ทุกจุดที่ ownerId เจอ aeOwnerId', () => {
  const sql = read('../../../supabase/migrations/0253_project_scope_follows_ae.sql')
    .replace(/--.*$/gm, '');
  // เขียนลงคอลัมน์ uuid ต้อง ::uuid
  for (const line of sql.split('\n').filter((l) => /"ownerId"\s*=/.test(l))) {
    assert.match(line, /::uuid/, `เขียน ownerId ต้อง cast: ${line.trim()}`);
  }
  // เทียบสองช่องต้องดึงมาเป็น text ก่อน (บรรทัด SET เป็นการ **เขียน** — กฎข้างบนคุมแล้ว)
  const compares = sql.split('\n')
    .filter((l) => /"ownerId"/.test(l) && /"aeOwnerId"/.test(l) && !/\bSET\b/.test(l));
  for (const line of compares) {
    assert.match(line, /"ownerId"::text/, `เทียบ ownerId กับ aeOwnerId ต้อง cast: ${line.trim()}`);
  }
});

/* mig 0254 ตามเก็บใบที่เกิดหลัง 0190 แล้ว `aeOwnerId` ว่าง (ฟอร์มเก่าเขียนชื่อย่อ)
   ⚠️ กติกาจับคู่ต้องแคบเท่า 0190 เสมอ — หลวมเมื่อไรคือแจ้งเตือนไปผิดคน ซึ่งแย่กว่าไม่แจ้ง */
test('mig 0254: เติม aeOwnerId เฉพาะแถวที่ว่างและจับคู่ได้บัญชีเดียว', () => {
  const sql = read('../../../supabase/migrations/0254_project_ae_owner_id_backfill_2.sql')
    .replace(/--.*$/gm, '');
  assert.match(sql, /SET "aeOwnerId" = uniq\.uid/);
  assert.match(sql, /HAVING count\(DISTINCT uid\) = 1/, 'ชื่อที่ตรงหลายบัญชีต้องไม่ถูกเดาแทน');
  assert.match(sql, /WHERE p\."aeOwnerId" IS NULL/, 'ห้ามทับค่าที่คนแก้ไว้ทีหลัง');
  // ชื่อบนใบเป็น snapshot ของเอกสารที่พิมพ์ไปแล้ว — backfill ตัวตน ไม่ใช่แก้ชื่อ
  assert.doesNotMatch(sql, /SET "aeOwner"\s*=/, 'ห้ามแตะชื่อบนเอกสาร');
});

/* กับดักประจำของระบบนี้: แถวที่ **เห็นในลิสต์** แต่กดเข้าไปแล้ว 403 — ลิสต์ยอมรับสอง
   สาขา (ทีม หรือ เป็นเจ้าของ) ส่วนด่านรายตัวเคยดูแค่ทีม */
test('ด่านเปิดโครงการรายตัว ใช้เงื่อนไขเดียวกับตัวกรองของลิสต์', () => {
  const list = read('../../app/api/pm/projects/route.js');
  assert.match(list, /\.or\(`\$\{teamInClause\(user\)\},ownerId\.eq\.\$\{own\}`\)/);
  const detail = read('../../app/api/pm/projects/[id]/route.js');
  assert.match(detail, /viewScope\(user\?\.role\) === 'team' && !inPmProjectScope\(user, project\)/);
  assert.doesNotMatch(codeOnly(detail), /!inScope\('team', user, project\)/, 'ด่านที่ดูแค่ทีมห้ามกลับมา');
});
