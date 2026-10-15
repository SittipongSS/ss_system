// ── ผู้ดูแลดีลจาก FC สหมิตร = AE / Senior AE ทีม KA ─────────────────────────
//
// 🐞 2026-10-15 Senior AE ทีม KA หาชื่อตัวเองในดรอปดาวน์ "ผู้ดูแล (AE)" ของปุ่มสร้างดีลจาก
//    FC ไม่เจอ — จอกรอง `u.role === "ae"` และ API ตีกลับ `role !== 'ae'` ทั้งที่ Senior AE
//    ถือดีลได้ตามมติ 2026-08-08 (`DEAL_HOLDER_ROLES`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSahamitDealOwner, SAHAMIT_DEAL_TEAM } from './dealOwner.js';
import { DEAL_HOLDER_ROLES, SALES_ROLES } from '../permissions.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('AE และ Senior AE ทีม KA เป็นผู้ดูแลได้', () => {
  assert.equal(SAHAMIT_DEAL_TEAM, 'KA');
  assert.equal(isSahamitDealOwner({ role: 'ae', team: 'KA' }), true);
  assert.equal(isSahamitDealOwner({ role: 'senior_ae', team: 'KA' }), true);
  // แถวจาก /api/pm/assignable-users มีทั้ง team (หลัก) และ teams (ทุกทีม) — KA เป็นทีมรองก็นับ
  assert.equal(isSahamitDealOwner({ role: 'senior_ae', team: 'ODM', teams: ['ODM', 'KA'] }), true);
});

test('ทีมอื่นไม่ได้ — สหมิตรเป็นลูกค้าของ KA ทีมเดียว', () => {
  assert.equal(isSahamitDealOwner({ role: 'ae', team: 'ODM' }), false);
  assert.equal(isSahamitDealOwner({ role: 'senior_ae', team: 'SV' }), false);
  assert.equal(isSahamitDealOwner({ role: 'senior_ae', team: null }), false);
});

test('ตำแหน่งขายที่ไม่ถือดีล ไม่ได้แม้อยู่ KA', () => {
  for (const role of SALES_ROLES.filter((r) => !DEAL_HOLDER_ROLES.includes(r))) {
    assert.equal(isSahamitDealOwner({ role, team: 'KA' }), false, role);
  }
  assert.equal(isSahamitDealOwner({ role: 'admin', team: 'KA' }), false);
  assert.equal(isSahamitDealOwner(null), false);
});

test('จอและ API ถามด่านตัวเดียวกัน ไม่พิมพ์ role เอง', () => {
  const page = codeOnly(read('../../app/sahamit/forecast/page.js'));
  const route = codeOnly(read('../../app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js'));
  assert.match(page, /\.filter\(isSahamitDealOwner\)/);
  assert.match(route, /if \(!isSahamitDealOwner\(owner\.app_metadata\)\)/);
  for (const [name, src] of [['page', page], ['route', route]]) {
    assert.doesNotMatch(src, /role\s*[!=]==\s*["']ae["']/, `${name}: ห้ามเทียบ role กับ 'ae' ตรง ๆ`);
  }
});
