import test from 'node:test';
import assert from 'node:assert/strict';
import { canLinkTaskToDeal, requiresDealLink, taskDealScope } from './taskDealScope.js';

test('task deal linking is limited to the user team', () => {
  const user = { role: 'ae', team: 'KA' };
  assert.equal(canLinkTaskToDeal(user, { team: 'KA' }), true);
  assert.equal(canLinkTaskToDeal(user, { team: 'ODM' }), false);
  assert.equal(canLinkTaskToDeal(user, { team: null }), false);
  assert.deepEqual(taskDealScope(user), { kind: 'team', team: 'KA' });
});

// มติผู้ใช้ 2026-08-06: ฝ่ายที่ไม่มีทีมเห็น "ดีลทั้งหมด" — เดิมเป็น 'none' ซึ่งแปลว่า
// ไม่มีดีลให้เลือกเลย จึงบังคับผูกดีลกับเขาไม่ได้ (บังคับ = สร้างงานไม่ได้ทั้งฝ่าย)
test('ฝ่ายที่ไม่มีทีม (RD/PC/WH/QC/TS/FN) เลือกดีลได้ทุกทีม', () => {
  assert.equal(canLinkTaskToDeal({ role: 'rd', team: null }, { team: 'KA' }), true);
  assert.deepEqual(taskDealScope({ role: 'rd', team: null }), { kind: 'all', team: null });
});

test('ทุกงานต้องผูกดีล — ไม่ใช่เฉพาะฝ่ายขาย', () => {
  assert.equal(requiresDealLink({ role: 'ae', team: 'KA' }), true);
  assert.equal(requiresDealLink({ role: 'ac', team: 'ODM' }), true);
  assert.equal(requiresDealLink({ role: 'ae_supervisor', department: 'SALES' }), true);
  assert.equal(requiresDealLink({ role: 'rd', team: null }), true);
  assert.equal(requiresDealLink({ role: 'staff', department: 'PC' }), true);
});

test('ข้อยกเว้น: ผู้ดูแลระบบ/เลขานุการ เท่านั้น (ไม่ใช่ superuser ทั้งก้อน)', () => {
  assert.equal(requiresDealLink({ role: 'admin' }), false);
  assert.equal(requiresDealLink({ role: 'secretary' }), false);
  // ⚠️ ae_supervisor เป็น superuser แต่เป็นหัวหน้าฝ่ายขาย — ต้องผูกดีลเหมือนลูกทีม
  assert.equal(requiresDealLink({ role: 'ae_supervisor', team: null }), true);
  assert.equal(requiresDealLink(null), false);
});

test('superusers retain cross-team administration access', () => {
  assert.equal(canLinkTaskToDeal({ role: 'admin' }, { team: 'KA' }), true);
  assert.deepEqual(taskDealScope({ role: 'admin' }), { kind: 'all', team: null });
});
