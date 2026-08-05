import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSettingsPathname, sortSystems, systemForPathname } from './navigation.js';

test('systemForPathname keeps public and legacy sales routes in one system', () => {
  assert.equal(systemForPathname('/sa/quotations/1'), 'salesplan');
  assert.equal(systemForPathname('/sales-planning/deals'), 'salesplan');
  assert.equal(systemForPathname('/pm/projects/1'), 'salesplan');
  assert.equal(systemForPathname('/sahamit/po'), 'sahamit');
});

test('⭐ วางแผนผลิตเป็นระบบของตัวเอง ไม่ถูกดูดเข้าบริหารงานขาย', () => {
  // มติผู้ใช้ 2026-07-30: แยกโมดูล · เส้นทางจึงต้องไม่อยู่ใต้ /pm ซึ่งเป็นของฝ่ายขาย
  assert.equal(systemForPathname('/production/lines'), 'production');
  assert.equal(systemForPathname('/production'), 'production');
});

test('sortSystems follows the global navigation order', () => {
  const groups = ['mgmt', 'master', 'tax', 'salesplan', 'sahamit'].map((system) => ({ system }));
  assert.deepEqual(sortSystems(groups).map((group) => group.system), ['salesplan', 'tax', 'sahamit', 'master', 'mgmt']);
});

test('settings surfaces use the global settings context instead of a business system', () => {
  const settingsRoutes = [
    '/settings',
    '/settings/company',
    '/settings/workflow-templates',
    '/settings/holidays',
    '/settings/chat-webhooks',
    '/users',
    '/audit',
  ];

  for (const route of settingsRoutes) {
    assert.equal(isSettingsPathname(route), true);
    assert.equal(systemForPathname(route), 'settings');
  }

  assert.equal(isSettingsPathname('/settings-extra'), false);
  assert.equal(systemForPathname('/database/products'), 'master');
});

// 🐞 คำร้องย้ายออกจาก `/sa` ตั้งแต่ P0b แต่กฎ systemForPathname ไม่ได้ตามไป
// ⇒ ตกไปที่ `return 'tax'` ท้ายฟังก์ชัน ⇒ **ทั้งโมดูลขึ้นเมนูของระบบภาษีสรรพสามิต**
// และเมนู "คำร้อง" (อยู่ในกลุ่ม salesplan) กดเข้าไม่ได้จากเปลือกนั้นเลย
//
// ⚠️ build/เทสต์เดิมจับไม่ได้ เพราะหน้าเรนเดอร์ปกติทุกอย่าง — ผิดแค่เปลือกที่ครอบมัน
test('ทุกเส้นทางของคำร้องอยู่ระบบสายงานขาย ไม่ใช่ระบบภาษี', () => {
  for (const p of ['/requests', '/requests/new', '/requests/DR-1']) {
    assert.equal(systemForPathname(p), 'salesplan', p);
  }
});

test('เส้นทางที่ไม่ได้ประกาศไว้ยังตกไปที่ระบบภาษีตามเดิม', () => {
  // ค่าตั้งต้นนี้คือสิ่งที่ทำให้บั๊กข้างบน "เงียบ" — เก็บไว้แต่ต้องรู้ว่ามันมีอยู่
  assert.equal(systemForPathname('/'), 'tax');
  assert.equal(systemForPathname('/excise-registrations'), 'tax');
});
