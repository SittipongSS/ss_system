import test from 'node:test';
import assert from 'node:assert/strict';
import { lockedOut } from './proxy.js';

test('every signed-in role can open its own account page', () => {
  const roles = ['ae', 'ac', 'rd', 'legal', 'staff', 'viewer', 'secretary'];

  for (const role of roles) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/account', 'GET', false),
      false,
      `${role} should reach /account`,
    );
  }
});

test('account and central settings hub are open without broadening restricted child pages', () => {
  const viewer = { role: 'viewer', extraCaps: [] };

  assert.equal(lockedOut(viewer, '/account', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings/document-standards', 'GET', false), true);
  assert.equal(lockedOut(viewer, '/api/account/signature', 'POST', true), false);
});

test('holidays and chat-webhooks keep their open-page access after moving under /settings', () => {
  // เดิมสองหน้านี้อยู่ /database/* ซึ่งเปิดผ่าน OPEN_PAGES ให้ทุก role ที่ล็อกอิน —
  // ย้าย URL แล้วสิทธิ์ต้องเท่าเดิม (ปฏิทินวันหยุดเป็นข้อมูลอ้างอิงของไทม์ไลน์)
  for (const role of ['ae', 'ac', 'rd', 'legal', 'staff', 'viewer', 'secretary', 'ae_supervisor']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/settings/holidays', 'GET', false), false, `${role} /settings/holidays`);
    assert.equal(lockedOut({ role, extraCaps: [] }, '/settings/chat-webhooks', 'GET', false), false, `${role} /settings/chat-webhooks`);
  }
  // เปิดเฉพาะสอง path นี้ ไม่ใช่ /settings/* ทั้งชุด
  assert.equal(lockedOut({ role: 'viewer', extraCaps: [] }, '/settings/company', 'GET', false), true);
});

test('AE Supervisor can open document standards while other business roles cannot', () => {
  assert.equal(
    lockedOut({ role: 'ae_supervisor', extraCaps: [] }, '/settings/document-standards', 'GET', false),
    false,
  );
  for (const role of ['senior_ae', 'ae', 'ac', 'legal', 'viewer', 'staff']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/settings/document-standards', 'GET', false),
      true,
      role,
    );
  }
});

test('AE Supervisor can open commercial presets while other business roles cannot', () => {
  assert.equal(
    lockedOut({ role: 'ae_supervisor', extraCaps: [] }, '/settings/commercial-presets', 'GET', false),
    false,
  );
  for (const role of ['senior_ae', 'ae', 'ac', 'legal', 'viewer', 'staff']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/settings/commercial-presets', 'GET', false),
      true,
      role,
    );
  }
});
