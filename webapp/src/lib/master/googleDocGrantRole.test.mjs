// ── role ที่ให้ไปบน Drive ต้องเดินตามสิทธิ์ในระบบ ไม่ใช่ค้างที่ค่าครั้งแรก ────
//
// 🐞 เดิม `accessGranted` จำแค่อีเมล ⇒ ตัวกรองใน `ensureGoogleDocAccess` ตัดคนที่
// "เคยให้แล้ว" ออกก่อนถึง `grantFileRole` เสมอ ไม่ว่าคราวนี้เขาควรได้ role ไหน
// ⇒ คนที่เคยแก้ดีลได้ (writer) แล้วต่อมาหลุดขอบเขต ยังแก้เอกสารจริงบน Drive ได้ตลอดไป
// ทั้งที่หน้าจอในระบบเป็นแบบอ่านอย่างเดียวไปแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsGrant } from './googleDocAccess.js';

const doc = (granted, roles) => ({
  metadata: { googleFileId: 'F1', accessGranted: granted, ...(roles ? { accessRoles: roles } : {}) },
});

test('ยังไม่เคยให้ = ต้องยิง', () => {
  assert.equal(needsGrant(doc([]), 'a@x.co', 'reader'), true);
});

test('เคยให้ด้วย role เดิม = ไม่ต้องยิงซ้ำ (นี่คือเหตุผลที่จดไว้ตั้งแต่แรก)', () => {
  assert.equal(needsGrant(doc(['a@x.co'], { 'a@x.co': 'reader' }), 'a@x.co', 'reader'), false);
});

test('⭐ เคยเป็น writer แล้วคราวนี้ควรเป็น reader = ต้องยิงเพื่อ **ลด** สิทธิ์', () => {
  assert.equal(needsGrant(doc(['a@x.co'], { 'a@x.co': 'writer' }), 'a@x.co', 'reader'), true);
});

test('เคยเป็น reader แล้วได้สิทธิ์แก้เพิ่ม = ต้องยิงเพื่อเลื่อนเป็น writer', () => {
  assert.equal(needsGrant(doc(['a@x.co'], { 'a@x.co': 'reader' }), 'a@x.co', 'writer'), true);
});

test('แถวเก่าที่จดแต่อีเมล (ยังไม่มีแมป role) = ให้ซ้ำหนึ่งครั้งด้วย role ที่ถูก', () => {
  assert.equal(needsGrant(doc(['a@x.co']), 'a@x.co', 'reader'), true);
  assert.equal(needsGrant(doc(['a@x.co']), 'a@x.co', 'writer'), true);
});

test('คนอื่นในไฟล์เดียวกันไม่กวนกัน', () => {
  const att = doc(['a@x.co'], { 'a@x.co': 'writer' });
  assert.equal(needsGrant(att, 'b@x.co', 'reader'), true);
  assert.equal(needsGrant(att, 'a@x.co', 'writer'), false);
});
