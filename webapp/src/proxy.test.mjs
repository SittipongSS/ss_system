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

test('ae_supervisor สามารถเขียน /api/product-types ได้ (จัดการหมวดสินค้า Phase 2) — regression #587', () => {
  const sup = { role: 'ae_supervisor', extraCaps: [] };
  // เดิม /api/product-types ไม่อยู่ใน OPEN_WRITE_APIS → lockedOut คืน true ก่อนถึง
  // apiWriteAllowed ทำให้ ae_supervisor โดน 403 ทั้งที่ canManageProductCategories อนุญาต
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal(lockedOut(sup, '/api/product-types', method, true), false, `product-types ${method}`);
    assert.equal(lockedOut(sup, '/api/product-types/import/commit', method, true), false, `import ${method}`);
  }
  // role ที่ไม่ควรจัดการหมวด: lockdown ปล่อยผ่าน แต่ apiWriteAllowed (ชั้นถัดไป) ยังบล็อก
  // — ตรงนี้ทดสอบแค่ว่า lockdown ไม่ได้บล็อก ae_supervisor อีกต่อไป
});

test('รายงานความพร้อมลายเซ็นเปิดด้วย users:view และเป็นอ่านอย่างเดียว', () => {
  // grant users:view เป็น cap อ่านอย่างเดียว (เหมือนที่ใช้เปิด /users อยู่แล้ว)
  const granted = { role: 'ae_supervisor', extraCaps: ['users:view'] };
  assert.equal(lockedOut(granted, '/settings/signature-coverage', 'GET', false), false);
  assert.equal(lockedOut(granted, '/api/admin/signature-coverage', 'GET', true), false);

  // ไม่มี grant = เข้าไม่ได้ทั้งหน้าและ API
  const plain = { role: 'ae_supervisor', extraCaps: [] };
  assert.equal(lockedOut(plain, '/settings/signature-coverage', 'GET', false), true);
  assert.equal(lockedOut(plain, '/api/admin/signature-coverage', 'GET', true), true);

  // อ่านอย่างเดียวจริง — เขียนไม่หลุดผ่าน lockdown แม้จะมี grant
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal(lockedOut(granted, '/api/admin/signature-coverage', method, true), true, method);
  }
  // และ /api/admin อื่น ๆ ต้องไม่ถูกเปิดตามไปด้วย
  assert.equal(lockedOut(granted, '/api/admin/users', 'GET', true), true);
});
