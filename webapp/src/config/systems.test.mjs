import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recentSystemForUser,
  SYSTEM_ORDER,
  systemLandingForUser,
  systemsForUser,
} from './systems.js';

const keysFor = (user) => systemsForUser(user).map((system) => system.key);

test('system catalog keeps the agreed global order and role visibility', () => {
  assert.deepEqual(SYSTEM_ORDER, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'mgmt']);
  assert.deepEqual(keysFor({ role: 'admin', team: null, extraCaps: [] }), SYSTEM_ORDER);
  assert.deepEqual(keysFor({ role: 'ae', team: 'ODM', extraCaps: [] }), ['salesplan', 'service', 'tax', 'master']);
  assert.deepEqual(keysFor({ role: 'ae', team: 'KA', extraCaps: [] }), ['salesplan', 'service', 'tax', 'sahamit', 'master']);
  // secretary/marketing ได้ products:view อ่านอย่างเดียว (มติ 2026-07-20) → เห็นการ์ด "ฐานข้อมูล" ด้วย
  assert.deepEqual(keysFor({ role: 'secretary', team: null, extraCaps: [] }), ['master', 'mgmt']);
  assert.deepEqual(keysFor({ role: 'legal', team: null, extraCaps: [] }), ['tax', 'master']);
});

test('system visibility covers every supported role and sales team', () => {
  const cases = [
    ['admin', null, SYSTEM_ORDER],
    ['secretary', null, ['master', 'mgmt']],
    ['ae_supervisor', null, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master']],
    ['marketing', null, ['salesplan', 'master']],
    ['legal', null, ['tax', 'master']],
    ['rd', null, ['salesplan', 'master']],
    // ⭐ viewer/executive อ่านได้ทุกระบบ แต่ **ยังไม่เห็น "วางแผนผลิต"** ตอนนี้ —
    // PR-1 มีแต่หน้าตั้งค่าไลน์ซึ่งผู้สังเกตการณ์ทำอะไรไม่ได้ · เปิดตอน PR-3 (บอร์ด)
    ['viewer', null, ['salesplan', 'service', 'tax', 'sahamit', 'master', 'mgmt']],
    // staff ที่ไม่ระบุฝ่าย = ไม่ใช่ PC/PD → ไม่เห็นระบบผลิต (ดูเคส PC/PD ข้างล่าง)
    ['staff', null, ['salesplan', 'master']],
    ['senior_ae', 'ODM', ['salesplan', 'service', 'tax', 'master']],
    ['senior_ae', 'KA', ['salesplan', 'service', 'tax', 'sahamit', 'master']],
    ['senior_ae', 'SV', ['salesplan', 'service', 'tax', 'master']],
    ['ac', 'ODM', ['salesplan', 'service', 'tax', 'master']],
    ['ac', 'KA', ['salesplan', 'service', 'tax', 'sahamit', 'master']],
    ['ac', 'SV', ['salesplan', 'service', 'tax', 'master']],
    ['ae', 'ODM', ['salesplan', 'service', 'tax', 'master']],
    ['ae', 'KA', ['salesplan', 'service', 'tax', 'sahamit', 'master']],
    ['ae', 'SV', ['salesplan', 'service', 'tax', 'master']],
  ];

  for (const [role, team, expected] of cases) {
    assert.deepEqual(keysFor({ role, team, extraCaps: [] }), expected, `${role}:${team || '-'}`);
  }
});

test('⭐ ระบบของฝ่ายขึ้นกับ *ฝ่าย* ไม่ใช่ role — cap ของ staff ใช้ร่วมกันทั้ง 5 ฝ่าย', () => {
  // `staff` ถือ production:* / service:* ทั้งก้อน ฝ่ายคือตัวกั้นจริง
  // ถ้าวันไหนกฎนี้หลุด คลัง/QC จะได้ระบบโรงงาน + ระบบงานบริการมาโดยไม่มีใครสังเกต
  const at = (department) => keysFor({ role: 'staff', team: null, department, extraCaps: [] });

  assert.ok(at('PC').includes('production'));
  assert.ok(at('PD').includes('production'));
  for (const dept of ['WH', 'QC', 'TS']) {
    assert.ok(!at(dept).includes('production'), dept);
  }

  // ฝ่ายเทคนิคบริการเห็นระบบงานบริการ · ฝ่ายโรงงานไม่เห็น
  assert.ok(at('TS').includes('service'));
  for (const dept of ['PC', 'PD', 'WH', 'QC']) {
    assert.ok(!at(dept).includes('service'), dept);
  }
});

test('specialized users land on the one workspace they can use', () => {
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  const staff = { role: 'staff', team: null, extraCaps: [] };

  assert.deepEqual(keysFor(marketing), ['salesplan', 'master']);
  assert.equal(systemLandingForUser('salesplan', marketing), '/sa/leads');
  assert.deepEqual(keysFor(staff), ['salesplan', 'master']);
  assert.equal(systemLandingForUser('salesplan', staff), '/sa/tasks');

  // ช่างฝ่าย TS ลงที่ **ตาราง** ซึ่งเป็นหน้าที่เขาเปิดทุกเช้า
  const tech = { role: 'staff', team: null, department: 'TS', extraCaps: [] };
  assert.deepEqual(keysFor(tech), ['salesplan', 'service', 'master']);
  assert.equal(systemLandingForUser('service', tech), '/service/schedule');
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
