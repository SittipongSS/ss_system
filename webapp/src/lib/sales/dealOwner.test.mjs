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
  DEAL_OWNER_ROLES, assignableOwners, canAssignDealOwner, ownsDealsByDefault,
} from './dealOwner.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

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

// ⭐ หัวใจ: เจ้าของต้องเป็นคนที่ inSalesEditScope ยอมให้แก้ดีลใบนั้นได้
test('รายชื่อเจ้าของดีล = role ที่มี edit scope กับดีล ไม่ใช่ลิสต์ที่พิมพ์ทิ้งไว้', () => {
  assert.deepEqual(DEAL_OWNER_ROLES, ROLES.filter((r) => salesPlanningEditScope(r) !== 'none'));
  for (const role of ['ae', 'ac', 'senior_ae', 'admin']) {
    assert.ok(DEAL_OWNER_ROLES.includes(role), role);
  }
  for (const role of ROLES.filter((r) => salesPlanningEditScope(r) === 'none')) {
    assert.ok(!DEAL_OWNER_ROLES.includes(role), `${role} ถือดีลไม่ได้`);
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

test('AC ทีม ODM เห็นเฉพาะคนในทีมตัวเอง (+ คนที่ไม่มีทีม)', () => {
  const ids = assignableOwners(DIRECTORY, 'ODM').map((u) => u.id);
  assert.ok(ids.includes('U-AE-ODM'));
  assert.ok(!ids.includes('U-AE-KA'), 'ห้ามเห็น AE ทีมอื่น');
  assert.ok(ids.includes('U-ADMIN'), 'คนที่ไม่มีทีม (ผู้กำกับดูแล) ติดมาด้วยเสมอ');
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

/* AC เป็นผู้ประสานงาน ไม่ใช่เจ้าของงาน — ถ้าค่าตั้งต้นเป็นตัวเอง ฟีเจอร์นี้ก็ไร้ความหมาย
   (กดผ่านแล้วดีลตกเป็นของ AC เหมือนเดิม) */
test('AC ไม่มีค่าตั้งต้นเป็นตัวเอง — ต้องเลือกชื่อ AE ทุกครั้ง', () => {
  assert.ok(!ownsDealsByDefault('ac'));
  assert.ok(ownsDealsByDefault('ae'));
  assert.ok(ownsDealsByDefault('senior_ae'));
});

// ── ด่านจริงอยู่ที่ API เสมอ ────────────────────────────────────────────────
test('POST/PATCH ตรวจ ownerId ที่ server ไม่รับชื่อจาก client', () => {
  const post = read('src/app/api/sales-planning/deals/route.js');
  assert.match(post, /validateDealOwner\(supabase, body\.ownerId, user\)/);
  assert.doesNotMatch(post, /ownerName: body\.ownerName/, 'ชื่อต้องมาจาก server');
  assert.match(post, /if \(!body\.ownerId && !ownsDealsByDefault\(user\.role\)\)/,
    'AC ต้องระบุ AE — ปล่อยว่างแล้วดีลตกเป็นของ AC เงียบ ๆ');

  const patch = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(patch, /if \('ownerId' in body\) \{[\s\S]*validateDealOwner/);
  // 🐞 ของเดิม ownerId/ownerName ไหลจาก body ตรงเข้า patch ผ่านลูปคีย์
  assert.doesNotMatch(patch, /'ownerId', 'ownerName'/, 'ห้ามกลับไปก๊อปจาก body ดิบ ๆ');
});

test('ทีมของดีลตามเจ้าของ ไม่ใช่ตามคนกดสร้าง', () => {
  assert.match(read('src/app/api/sales-planning/deals/route.js'),
    /team: owner\?\.team \|\| body\.team \|\| user\.team/);
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
