// ── ผู้รับผิดชอบดีล (AE) + AC เปิดดีลได้ ──────────────────────────────────
//
// มติผู้ใช้ 2026-08-05: AC เปิดดีลได้ แต่ต้องเลือกผู้รับผิดชอบ (AE) ในทีมตัวเองเสมอ
//
// ⚠️ กับดักของฟีเจอร์นี้คือ **มอบดีลให้คนที่แตะดีลของตัวเองไม่ได้** — ดีลจะตกไปอยู่กับ
// คนที่เปิดเข้ามาแล้วทำอะไรไม่ได้เลย (แก้ไม่ได้ · ออกใบเสนอราคาไม่ได้ · และ
// `canApproveQuotation` ให้ "เจ้าของดีล" อนุมัติใบ ⇒ ใบค้างถาวร)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROLES } from '../permissions.js';
import { canCreateDeal, salesPlanningEditScope } from '../salesPlanning.js';
import {
  DEAL_HOLDER_ROLES, DEAL_OWNER_ROLES, assignableOwners, canAssignDealOwner, ownerLockedToSelf,
  validateDealOwner,
} from './dealOwner.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// stub auth admin: id -> user (รูปเดียวกับ leadAssignee.test.mjs)
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

test('AC เปิดดีลได้แล้ว — และ AE/Senior AE/ผู้กำกับดูแลยังได้เหมือนเดิม', () => {
  for (const role of ['ac', 'ae', 'senior_ae', 'admin']) {
    assert.ok(canCreateDeal({ role }), role);
  }
});

test('role ที่แก้ดีลไม่ได้ ก็เปิดดีลไม่ได้ (ไม่งั้นสร้างแล้วแตะของตัวเองไม่ได้)', () => {
  for (const role of ROLES) {
    if (salesPlanningEditScope(role) === 'none') {
      assert.ok(!canCreateDeal({ role }), `${role} แก้ดีลไม่ได้ จึงต้องเปิดดีลไม่ได้`);
    }
  }
});

// ⭐ สองชั้น: DEAL_OWNER_ROLES = ใครแก้ดีลได้ (จาก edit scope) · DEAL_HOLDER_ROLES =
// ใคร**ถือ**ดีลได้ (มติผู้ใช้ 2026-08-08: ดีลเป็นหน้าที่ของ AE / Senior AE เท่านั้น
// — "ผู้รับผิดชอบกรองชื่อสิ") · คนถือต้องแก้ของตัวเองได้เสมอ
test('คนถือดีล = AE / Senior AE เท่านั้น และต้องอยู่ในกลุ่มที่แก้ดีลได้', () => {
  assert.deepEqual(DEAL_OWNER_ROLES, ROLES.filter((r) => salesPlanningEditScope(r) !== 'none'));
  assert.deepEqual(DEAL_HOLDER_ROLES, ['ae', 'senior_ae']);
  for (const role of DEAL_HOLDER_ROLES) {
    assert.ok(DEAL_OWNER_ROLES.includes(role), `${role} ต้องแก้ดีลของตัวเองได้`);
  }
  // ผู้ประสาน/ผู้กำกับแก้ได้แต่ถือไม่ได้ — รายชื่อในดรอปดาวน์ต้องไม่มี
  for (const role of ['ac', 'ae_supervisor', 'admin']) {
    assert.ok(!DEAL_HOLDER_ROLES.includes(role), `${role} ถือดีลไม่ได้`);
  }
});

/* AE มี scope 'own' ⇒ ยกดีลให้คนอื่นไม่ได้ (inSalesEditScope ตีกลับ)
   ช่องเลือกต้องไม่โผล่ ไม่งั้นเป็นช่องที่กดแล้วเจอ 403 */
test('เฉพาะคนที่เห็นทั้งทีมขึ้นไปถึงจะมอบดีลให้คนอื่นได้', () => {
  assert.ok(canAssignDealOwner('ac'));
  assert.ok(canAssignDealOwner('senior_ae'));
  assert.ok(canAssignDealOwner('admin'));
  assert.ok(!canAssignDealOwner('ae'), 'AE ยกดีลให้คนอื่นไม่ได้');
  assert.ok(!canAssignDealOwner('rd'));
});

// ⭐ "เลือกได้เฉพาะทีมตัวเอง"
const DIRECTORY = [
  { id: 'U-AE-ODM', name: 'เอ', role: 'ae', team: 'ODM' },
  { id: 'U-AE-KA', name: 'บี', role: 'ae', team: 'KA' },
  { id: 'U-AC-ODM', name: 'ซี', role: 'ac', team: 'ODM' },
  { id: 'U-ADMIN', name: 'ดี', role: 'admin', team: null },
  { id: 'U-RD', name: 'อี', role: 'rd', team: 'ODM' },
  { id: 'U-OLD', name: 'เอฟ', role: 'ae', team: 'ODM', disabled: true },
];

test('AC ทีม ODM เห็นเฉพาะ AE/Senior AE ในทีมตัวเอง', () => {
  const ids = assignableOwners(DIRECTORY, 'ODM').map((u) => u.id);
  assert.ok(ids.includes('U-AE-ODM'));
  assert.ok(!ids.includes('U-AE-KA'), 'ห้ามเห็น AE ทีมอื่น');
  // มติ 2026-08-08 ("ผู้รับผิดชอบกรองชื่อสิ"): admin ถือดีลไม่ได้แล้ว —
  // ของเดิมคนไม่มีทีมติดมาเสมอ ทำให้ Admin โผล่ในลิสต์ทั้งที่ไม่ใช่ AE
  assert.ok(!ids.includes('U-ADMIN'), 'admin ไม่ใช่คนถือดีล ต้องไม่อยู่ในรายชื่อ');
});

test('ตำแหน่งที่ถือดีลไม่ได้ และบัญชีที่ปิดแล้ว ต้องไม่อยู่ในรายชื่อ', () => {
  const ids = assignableOwners(DIRECTORY, 'ODM').map((u) => u.id);
  assert.ok(!ids.includes('U-RD'), 'rd แก้ดีลไม่ได้');
  assert.ok(!ids.includes('U-OLD'), 'บัญชีที่ปิดแล้วต้องหลุดออก');
});

test('ผู้กำกับดูแลที่ไม่มีทีม เห็นทุกคน', () => {
  const ids = assignableOwners(DIRECTORY, null).map((u) => u.id);
  assert.ok(ids.includes('U-AE-ODM') && ids.includes('U-AE-KA'));
});

/* มติผู้ใช้ 2026-08-08: ดีลเป็นหน้าที่ของ AE / Senior AE — สองตำแหน่งนี้ล็อกชื่อ
   ตัวเองตอนสร้าง ส่วนผู้ประสาน/กำกับ (ac / ae_supervisor / admin) ต้องเลือกชื่อ
   คนถือดีลจริงทุกครั้ง — default ตัวเองของ senior/admin แบบเดิมถูกยกเลิก:
   ดีลที่ตกเป็นของ admin เงียบ ๆ ไม่มี AE คนไหนเห็นในคิว "ของฉัน" */
test('ae/senior_ae ล็อกชื่อตัวเอง — ac/ae_supervisor/admin ต้องเลือกเสมอ', () => {
  assert.ok(ownerLockedToSelf('ae'));
  assert.ok(ownerLockedToSelf('senior_ae'));
  for (const role of ['ac', 'ae_supervisor', 'admin', 'secretary']) {
    assert.ok(!ownerLockedToSelf(role), role);
  }
});

// ── ด่านจริงอยู่ที่ API เสมอ ────────────────────────────────────────────────
test('POST/PATCH ตรวจ ownerId ที่ server ไม่รับชื่อจาก client', () => {
  const post = read('src/app/api/sales-planning/deals/route.js');
  // อาร์กิวเมนต์ที่ 4 = ทีมที่ฟอร์มเลือก — ต้องส่งเข้าไปตรวจกับทีมของ **เจ้าของ**
  // ไม่ใช่เอา body.team ไปเขียนตรง ๆ (มติ 2026-08-11 รอบสาม)
  assert.match(post, /validateDealOwner\(supabase, body\.ownerId, user, body\.team\)/);
  assert.doesNotMatch(post, /ownerName: body\.ownerName/, 'ชื่อต้องมาจาก server');
  assert.match(post, /if \(!body\.ownerId && !ownerLockedToSelf\(user\.role\)\)/,
    'ac/ae_supervisor/admin ต้องระบุ AE — ปล่อยว่างแล้วดีลตกเป็นของผู้ประสาน/ผู้กำกับเงียบ ๆ');

  const patch = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(patch, /if \('ownerId' in body\) \{[\s\S]*validateDealOwner/);
  // 🐞 ของเดิม ownerId/ownerName ไหลจาก body ตรงเข้า patch ผ่านลูปคีย์
  assert.doesNotMatch(patch, /'ownerId', 'ownerName'/, 'ห้ามกลับไปก๊อปจาก body ดิบ ๆ');
});

test('ทีมของดีลตามเจ้าของ ไม่ใช่ตามคนกดสร้าง', () => {
  // เจ้าของอยู่หลายทีมได้ ⇒ ทีมที่ได้มาจาก validateDealOwner ซึ่งกรอง body.team
  // ด้วยทีมของเจ้าของแล้ว · ไม่มีเจ้าของ = ทีมของคนกด (ผ่าน attributionTeam เช่นกัน)
  assert.match(read('src/app/api/sales-planning/deals/route.js'),
    /team: owner\?\.team \|\| attributionTeam\(user, body\.team\)/);
});

/* กติกาต้องอยู่ที่เดียว — 3 หน้าเปิดฟอร์มดีลได้ ถ้าแต่ละหน้ากรองเอง "เฉพาะทีมตัวเอง"
   จะเพี้ยนหากัน (เคยเกิดกับดรอปดาวน์ผู้รับผิดชอบลีดมาแล้ว) */
test('ทุกหน้าดึงรายชื่อจาก hook ตัวเดียวกัน', () => {
  for (const rel of [
    'src/app/sales-planning/deals/page.js',
    'src/app/sales-planning/leads/page.js',
    'src/app/sales-planning/leads/[id]/page.js',
  ]) {
    assert.match(read(rel), /useDealOwners\(meId\)/, `${rel} ต้องใช้ hook กลาง`);
  }
});

test('หน้ารวมดีลเลิกเขียนรายชื่อ role ของปุ่มเพิ่มดีลเอง — ใช้ตัวเดียวกับ API', () => {
  const page = read('src/app/sales-planning/deals/page.js');
  assert.match(page, /const canCreateDeals = canCreateDeal\(\{ role \}\)/);
  assert.doesNotMatch(page, /role === "senior_ae"/, 'ห้ามคำนวณสิทธิ์สร้างดีลเองอีก');
});

test('ฟอร์มแก้ดีลโหลดเจ้าของเดิมมาด้วย — ไม่งั้นบันทึกแล้วช่องว่างทับของเดิม', () => {
  assert.match(read('src/app/sales-planning/deals/page.js'), /ownerId: deal\.ownerId \|\| ""/);
});

/* ── คนสั่งและคนรับอยู่หลายทีม (มติ 2026-08-11) ────────────────────────────
   ด่านนี้เคยเทียบทีมหลักต่อทีมหลัก ⇒ ปฏิเสธคู่ที่ทำงานทีมเดียวกันจริง
   (หัวหน้าดูแล SV · AE อยู่ ODM+SV ทีมหลัก ODM) ซึ่งเป็นเคสหลักของฟีเจอร์นี้ */
test('มอบดีลได้เมื่อมีทีมร่วมกัน แม้ทีมหลักคนละทีม', async () => {
  const dualOwner = { app_metadata: { role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] }, user_metadata: { name: 'ดูอัล' } };
  const svLead = { role: 'senior_ae', id: 'A', team: 'SV', teams: ['SV'] };
  const ok = await validateDealOwner(ownerStub({ 'U-D': dualOwner }), 'U-D', svLead);
  assert.equal(ok.ok, true);
  // ดีลยังถูกบันทึกเข้า **ทีมหลัก** ของเจ้าของ — ยอดไม่ถูกนับสองทีม
  assert.equal(ok.team, 'ODM');
  // ไม่มีทีมร่วมกันเลย = ยังกันเหมือนเดิม
  const kaLead = { role: 'senior_ae', id: 'B', team: 'KA', teams: ['KA'] };
  assert.equal((await validateDealOwner(ownerStub({ 'U-D': dualOwner }), 'U-D', kaLead)).ok, false);
});
