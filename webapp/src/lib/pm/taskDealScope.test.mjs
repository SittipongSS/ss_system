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

// ⭐ ไม่มีข้อยกเว้นตาม role — รอบแรกยกเว้น admin/เลขาไว้ แล้วกลายเป็นว่าบัญชีที่
// สร้างงานมากที่สุดคือบัญชีเดียวที่กติกาบังคับไม่ถึง (ผู้ใช้เจอเองบนของจริง)
test('ทุกงานต้องผูกดีล — ทุก role ไม่มีข้อยกเว้น', () => {
  for (const role of ['ae', 'ac', 'ae_supervisor', 'senior_ae', 'rd', 'staff', 'marketing', 'admin', 'secretary']) {
    assert.equal(requiresDealLink({ role }), true, `${role} ต้องถูกบังคับผูกดีล`);
  }
  // ไม่มีผู้ใช้ = ไม่มีอะไรให้บังคับ (ด่านสิทธิ์ที่ route จัดการก่อนหน้าอยู่แล้ว)
  assert.equal(requiresDealLink(null), false);
});

test('superusers retain cross-team administration access', () => {
  assert.equal(canLinkTaskToDeal({ role: 'admin' }, { team: 'KA' }), true);
  assert.deepEqual(taskDealScope({ role: 'admin' }), { kind: 'all', team: null });
});
