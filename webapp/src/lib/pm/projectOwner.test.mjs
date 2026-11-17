// ── ขอบเขตของโครงการเดินตามผู้ดูแล (AE) ไม่ใช่คนกดสร้าง ─────────────────────
//
// บั๊กจริง (ผู้ใช้เจอเองบนจอ 2026-08-14): Admin สร้างโครงการแล้วเลือก AE ผู้ดูแลให้
// → AE คนนั้นไม่เห็นโครงการในลิสต์ตัวเองเลย เพราะลิสต์กรองด้วย `team` + `ownerId`
// ซึ่งตอนนั้นเขียนจากคนกดสร้าง (admin ไม่มีทีม ⇒ team = null · ownerId = admin)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  PROJECT_OWNER_ROLES, resolveProjectAcOwner, resolveProjectAeOwner, resolveProjectSupervisor,
} from './projectOwner.js';
import { projectPeopleFieldForRole } from '@/lib/pm/projectPeople';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

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
/* ⭐ มติผู้ใช้ 2026-08-14: **โครงการมีครบสามฝ่ายตั้งแต่วันเกิด** — ตอนสร้างบังคับ
   (`required: true`) ส่วนตอนแก้ไม่บังคับ เพราะใบเก่าที่ช่องว่างต้องแก้ช่องอื่นได้
   (ล้างของที่มีอยู่แล้วไม่ได้ — ด่านนั้นอยู่ที่ PATCH ไม่ใช่ที่ตัว resolver) */
test('AC/ผู้ตรวจสอบ: ว่างได้เฉพาะตอนแก้ — ตอนสร้างตีกลับ', async () => {
  const stub = ownerStub({});
  const acEdit = await resolveProjectAcOwner(stub, '', 'ODM');
  assert.equal(acEdit.ok, true);
  assert.equal(acEdit.acOwnerId, null);
  assert.equal(acEdit.acOwner, '');
  assert.equal((await resolveProjectAcOwner(stub, '', 'ODM', { required: true })).ok, false);

  const supEdit = await resolveProjectSupervisor(stub, '');
  assert.equal(supEdit.ok, true);
  assert.equal(supEdit.aeSupervisorId, null);
  assert.equal((await resolveProjectSupervisor(stub, '', { required: true })).ok, false);
});

/* ยุบโครงการ P3a (มติ 16/11): ไม่มีทางสร้างโครงการแล้ว — สามเส้นที่เคยบังคับครบสามฝ่ายถูกลบ
   (POST /api/sa/projects · create-project ของดีล · create-project ของ PO สหมิตร) ⇒ ยามเปลี่ยนเป็น "ห้ามกลับมา"
   ⭐ P3b-1 (16/11): เส้นแก้/ลบ/ปิดโครงการ (`api/pm/projects/[id]/**`) ถูกลบตามไปด้วย — โครงการเป็นคลังอ่านอย่างเดียว */
test('ไม่มีทางสร้าง/แก้/ลบโครงการเหลือ (P3a · P3b-1)', () => {
  for (const rel of [
    '../../app/api/sa/projects/route.js',
    '../../app/api/sales-planning/deals/[id]/create-project/route.js',
    '../../app/api/sahamit/po/[id]/create-project/route.js',
    '../../app/api/pm/projects/[id]/route.js',
    '../../app/api/pm/projects/[id]/close/route.js',
    '../../app/api/pm/projects/next-code/route.js',
  ]) {
    assert.equal(existsSync(new URL(rel, import.meta.url)), false, `${rel} กลับมาแล้ว — โครงการปลดระวาง ห้ามสร้าง/แก้ใหม่`);
  }
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

// (ยาม "ฟอร์มเขียนผู้ประสานงานลง acOwner/acOwnerId" ถอดใน P3a พร้อม SalesProjectCreateModal)

test('ผังตำแหน่ง 2026-09-24: ช่องผู้รับผิดชอบของโครงการรับตำแหน่งตามกลุ่ม · ช่องที่ล็อกเป็นตัวเองตามตำแหน่งคนกด', () => {
  assert.equal(projectPeopleFieldForRole('ae'), 'aeOwner');
  assert.equal(projectPeopleFieldForRole('senior_ae'), 'aeOwner');
  // สาย AC ทุกระดับเป็นผู้ประสานงาน
  assert.equal(projectPeopleFieldForRole('ac'), 'acOwner');
  assert.equal(projectPeopleFieldForRole('senior_ac'), 'acOwner');
  assert.equal(projectPeopleFieldForRole('ac_supervisor'), 'acOwner');
  // ผู้มีอำนาจตัดสินเป็นผู้ตรวจสอบ
  for (const role of ['commercial_director', 'commercial_manager', 'ae_supervisor']) assert.equal(projectPeopleFieldForRole(role), 'aeSupervisor', role);
  assert.equal(projectPeopleFieldForRole('admin'), null);
  assert.equal(projectPeopleFieldForRole('rd'), null);
});

test('ผังตำแหน่ง 2026-09-24: ผู้ตรวจสอบ = CD/CM/AE Sup · ผู้ประสานงาน = สาย AC (ตรวจฝั่ง server)', async () => {
  const cd = { id: 'U-CD', email: 'cd@x', user_metadata: { name: 'ผอ.ฝ่ายขาย' }, app_metadata: { role: 'commercial_director' } };
  const acSup = { id: 'U-ACS', email: 'acs@x', user_metadata: { name: 'หัวหน้าเอซี' }, app_metadata: { role: 'ac_supervisor' } };
  const seniorAc = { id: 'U-SAC', email: 'sac@x', user_metadata: { name: 'ซีเนียร์เอซี' }, app_metadata: { role: 'senior_ac', team: 'ODM', teams: ['ODM'] } };
  const stub = ownerStub({ 'U-CD': cd, 'U-ACS': acSup, 'U-SAC': seniorAc });
  assert.equal((await resolveProjectSupervisor(stub, 'U-CD')).ok, true, 'Commercial Director เป็นผู้ตรวจสอบได้');
  assert.equal((await resolveProjectSupervisor(stub, 'U-ACS')).ok, false, 'AC Supervisor ไม่ใช่ผู้ตรวจสอบ (ไม่อนุมัติ)');
  assert.equal((await resolveProjectAcOwner(stub, 'U-ACS', 'ODM')).ok, true, 'AC Supervisor ไม่มีทีม = ข้ามด่านทีม');
  assert.equal((await resolveProjectAcOwner(stub, 'U-SAC', 'ODM')).ok, true);
  assert.equal((await resolveProjectAcOwner(stub, 'U-SAC', 'KA')).ok, false, 'Senior AC คนละทีมกับงาน = ตีกลับ');
  assert.equal((await resolveProjectAcOwner(stub, 'U-CD', 'ODM')).ok, false, 'Commercial Director ไม่ใช่สาย AC');
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

// (ยาม "ทางแก้โครงการตรวจผู้ประสานงานด้วยตัวกลาง" ถอดใน P3b-1 พร้อม `api/pm/projects/[id]` — ไม่มีเส้นแก้โครงการแล้ว)

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

// (ยาม "PATCH รับเฉพาะ id ของสามฝ่าย ไม่รับชื่อ" ถอดใน P3b-1 พร้อม `api/pm/projects/[id]`)

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
// (ยาม POST /api/sa/projects + ฟอร์มสร้างโครงการบังคับครบสามฝ่าย ถอดใน P3a — ยุบโครงการ 16/11 ลบทั้งสองไฟล์)

// (ยาม "PATCH โครงการ: เปลี่ยนผู้ดูแลแล้วทีม/เจ้าของย้ายตาม" ถอดใน P3b-1 พร้อม `api/pm/projects/[id]`)

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
test('ลิสต์โครงการ (ตัวเลือกของ /pm/tasks) กรองด้วยทีม หรือ เป็นเจ้าของ', () => {
  const list = read('../../app/api/pm/projects/route.js');
  assert.match(list, /\.or\(`\$\{teamInClause\(user\)\},ownerId\.eq\.\$\{own\}`\)/);
  // (ด่านรายตัว GET /api/pm/projects/[id] ถอดใน P3b-1 — ไม่มีหน้ารายละเอียดโครงการให้เปิดแล้ว · เหลือลิสต์ของ /pm/tasks)
});
