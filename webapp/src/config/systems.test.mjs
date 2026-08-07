import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recentSystemForUser,
  SYSTEM_ORDER,
  systemLandingForUser,
  systemsForUser,
} from './systems.js';

const keysFor = (user) => systemsForUser(user).map((system) => system.key);

// ⚠️ `support` (แจ้งปัญหาระบบ mig 0219) อยู่ท้ายลิสต์ของ **ทุก** เคสโดยเจตนา —
// เป็นระบบเดียวที่ `isVisible: () => true` เพราะคนที่เจอบั๊กบ่อยที่สุดคือคนที่สิทธิ์
// น้อยที่สุด (มติ Q2) · ถ้าวันหนึ่งมันหายจากเคสไหน แปลว่ามีคนไปใส่เงื่อนไข cap ให้มัน
test('system catalog keeps the agreed global order and role visibility', () => {
  assert.deepEqual(SYSTEM_ORDER, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'mgmt', 'support']);
  assert.deepEqual(keysFor({ role: 'admin', team: null, extraCaps: [] }), SYSTEM_ORDER);
  assert.deepEqual(keysFor({ role: 'ae', team: 'ODM', extraCaps: [] }), ['salesplan', 'production', 'service', 'tax', 'master', 'support']);
  assert.deepEqual(keysFor({ role: 'ae', team: 'KA', extraCaps: [] }), ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']);
  // secretary/marketing ได้ products:view อ่านอย่างเดียว (มติ 2026-07-20) → เห็นการ์ด "ฐานข้อมูล" ด้วย
  assert.deepEqual(keysFor({ role: 'secretary', team: null, extraCaps: [] }), ['master', 'mgmt', 'support']);
  assert.deepEqual(keysFor({ role: 'legal', team: null, extraCaps: [] }), ['tax', 'master', 'support']);
});

test('system visibility covers every supported role and sales team', () => {
  const cases = [
    ['admin', null, SYSTEM_ORDER],
    ['secretary', null, ['master', 'mgmt', 'support']],
    ['ae_supervisor', null, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['marketing', null, ['salesplan', 'master', 'support']],
    ['legal', null, ['tax', 'master', 'support']],
    ['rd', null, ['salesplan', 'master', 'support']],
    // ⭐ viewer/executive อ่านได้ทุกระบบ แต่ **ยังไม่เห็น "วางแผนผลิต"** ตอนนี้ —
    // PR-1 มีแต่หน้าตั้งค่าไลน์ซึ่งผู้สังเกตการณ์ทำอะไรไม่ได้ · เปิดตอน PR-3 (บอร์ด)
    ['viewer', null, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'mgmt', 'support']],
    // staff ที่ไม่ระบุฝ่าย = ไม่ใช่ PC/PD → ไม่เห็นระบบผลิต (ดูเคส PC/PD ข้างล่าง)
    ['staff', null, ['salesplan', 'master', 'support']],
    ['senior_ae', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['senior_ae', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['senior_ae', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ac', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ac', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['ac', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ae', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ae', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['ae', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
  ];

  for (const [role, team, expected] of cases) {
    assert.deepEqual(keysFor({ role, team, extraCaps: [] }), expected, `${role}:${team || '-'}`);
  }
});

test('⭐ ระบบของฝ่ายขึ้นกับ *ฝ่าย* ไม่ใช่ role — cap ของ staff ใช้ร่วมกันทั้ง 5 ฝ่าย', () => {
  // `staff` ถือ production:* / service:* ทั้งก้อน ฝ่ายคือตัวกั้นจริง
  // ถ้าวันไหนกฎนี้หลุด คลัง/QC จะได้ระบบโรงงาน + ระบบธุรกิจบริการมาโดยไม่มีใครสังเกต
  const at = (department) => keysFor({ role: 'staff', team: null, department, extraCaps: [] });

  // ⭐ สายงานโรงงาน (PC/PD/WH/QC) เห็นระบบวางแผนผลิต — WH/QC อ่านบอร์ดเพื่อวางแผน
  // งานตัวเอง (มติผู้ใช้ 2026-07-31) · **TS เป็นฝ่ายเดียวที่ถูกกันออก** เพราะคนละทีม
  for (const dept of ['PC', 'PD', 'WH', 'QC']) {
    assert.ok(at(dept).includes('production'), dept);
  }
  assert.ok(!at('TS').includes('production'));

  // ฝ่ายเทคนิคบริการเห็นระบบธุรกิจบริการ · ฝ่ายโรงงานไม่เห็น
  assert.ok(at('TS').includes('service'));
  for (const dept of ['PC', 'PD', 'WH', 'QC']) {
    assert.ok(!at(dept).includes('service'), dept);
  }
});

test('specialized users land on the one workspace they can use', () => {
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  const staff = { role: 'staff', team: null, extraCaps: [] };

  assert.deepEqual(keysFor(marketing), ['salesplan', 'master', 'support']);
  assert.equal(systemLandingForUser('salesplan', marketing), '/sa/leads');
  assert.deepEqual(keysFor(staff), ['salesplan', 'master', 'support']);
  assert.equal(systemLandingForUser('salesplan', staff), '/sa/tasks');

  // ช่างฝ่าย TS ลงที่ **ภาพรวมของธุรกิจบริการ** (X-1) — ไม่ใช่ปฏิทินรวมสองระบบ
  const tech = { role: 'staff', team: null, department: 'TS', extraCaps: [] };
  assert.deepEqual(keysFor(tech), ['salesplan', 'service', 'master', 'support']);
  assert.equal(systemLandingForUser('service', tech), '/service');
});

test('X-1: สองระบบลงที่หน้าภาพรวมของตัวเอง — ไม่มีปลายทางร่วม', () => {
  // ⚠️ มติผู้ใช้ 2026-08-01: เลิกทำปฏิทินรวม · ถ้าวันหนึ่งมีคนทำ landing ของสอง
  // ระบบให้ชี้ที่เดียวกัน เทสต์นี้จะดับ — นั่นคือการกลับไปรวมสองทีมเข้าด้วยกันอีก
  const planner = { role: 'staff', team: null, department: 'PC', extraCaps: [] };
  const tech = { role: 'staff', team: null, department: 'TS', extraCaps: [] };
  const admin = { role: 'admin', team: null, extraCaps: [] };

  assert.equal(systemLandingForUser('production', planner), '/production');
  assert.equal(systemLandingForUser('service', tech), '/service');
  assert.notEqual(
    systemLandingForUser('production', admin),
    systemLandingForUser('service', admin),
  );
});

test('ฐานข้อมูล lands on the product list when the user has no customers:view', () => {
  // หน้าภาพรวม /database ผสมสถิติลูกค้า — บทบาทที่มีแค่ products:view ต้องข้ามไปหน้าสินค้า
  const secretary = { role: 'secretary', team: null, extraCaps: [] };
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  assert.equal(systemLandingForUser('master', secretary), '/database/products');
  assert.equal(systemLandingForUser('master', marketing), '/database/products');

  // ส่วนบทบาทที่ดูลูกค้าได้ ยังลงหน้าภาพรวมเหมือนเดิม
  for (const role of ['admin', 'ae_supervisor', 'ae', 'legal', 'viewer', 'staff', 'rd']) {
    assert.equal(systemLandingForUser('master', { role, team: 'ODM', extraCaps: [] }), '/database', role);
  }
});

test('recent system is accepted only while the current user can access it', () => {
  const secretary = { role: 'secretary', team: null, extraCaps: [] };
  const grantedSales = { role: 'ae', team: 'ODM', extraCaps: ['mgmt:view'] };

  assert.equal(recentSystemForUser(secretary, 'salesplan'), null);
  assert.equal(recentSystemForUser(secretary, 'mgmt')?.key, 'mgmt');
  assert.equal(recentSystemForUser(grantedSales, 'mgmt')?.key, 'mgmt');
  assert.equal(recentSystemForUser(grantedSales, 'unknown'), null);
});
