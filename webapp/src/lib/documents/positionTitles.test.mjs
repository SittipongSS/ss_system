/* ── ตำแหน่งเต็มบนช่องลงนาม (มติผู้ใช้ 2026-09-22 "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม") ───────────────── */
import assert from 'node:assert/strict';
import test from 'node:test';
import { POSITION_TITLES, positionTitle } from './positionTitles.js';
import { ROLES } from '@/lib/permissions';

test('⭐ role ที่เห็นในหลักฐานการลงนามจริง (ae · senior_ae · ae_supervisor · ac · finance · admin) ได้ตำแหน่งเต็ม', () => {
  assert.equal(positionTitle('ae'), 'Account Executive');
  assert.equal(positionTitle('senior_ae'), 'Senior Account Executive');
  assert.equal(positionTitle('ae_supervisor'), 'Account Executive Supervisor');
  assert.equal(positionTitle('ac'), 'Account Coordinator');
  assert.equal(positionTitle('finance'), 'Finance Officer');
  assert.equal(positionTitle('admin'), 'Administrator');
});

test('🔴 ทุก role ที่เซ็นเอกสารได้มีตำแหน่ง — เพิ่ม role ใหม่แล้วลืมเติม = ช่องลงนามพิมพ์ตำแหน่งของช่องแทนคนที่เซ็น', () => {
  const missing = ROLES.filter((role) => role !== 'viewer' && !POSITION_TITLES[role]);
  assert.deepEqual(missing, []);
  // viewer อ่านอย่างเดียว เซ็นอะไรไม่ได้ ⇒ ไม่มีตำแหน่งโดยตั้งใจ
  assert.equal(POSITION_TITLES.viewer, undefined);
});

test('🔴 ไม่มีคำย่อในตำแหน่ง ("AE" · "AC" · "RD" · "TS" …) — คนนอกบริษัทอ่านไม่ออก', () => {
  for (const [role, title] of Object.entries(POSITION_TITLES)) {
    assert.doesNotMatch(title, /\b[A-Z]{2,}\b/, `${role}: "${title}"`);
    assert.match(title, /^[A-Z][A-Za-z ]+$/, `${role}: ตำแหน่งเป็นอังกฤษล้วน`);
  }
});

test('ไม่รู้จัก/ว่าง = ค่าสำรองที่ผู้เรียกส่ง (ปกติคือตำแหน่งของช่อง) · ตัวพิมพ์ใหญ่/ช่องว่างรอบโค้ดไม่เป็นไร', () => {
  assert.equal(positionTitle(null, 'Account Executive'), 'Account Executive');
  assert.equal(positionTitle('', 'Account Executive'), 'Account Executive');
  assert.equal(positionTitle('viewer', 'Account Coordinator'), 'Account Coordinator');
  assert.equal(positionTitle('ไม่มีตำแหน่งนี้'), '');
  assert.equal(positionTitle(' AE_SUPERVISOR '), 'Account Executive Supervisor');
});
