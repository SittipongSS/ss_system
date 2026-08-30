// ── ใครนำเข้าข้อมูลเก่าได้ (F-8) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditService, canImportServiceData } from '../permissions.js';

test('⭐ นำเข้าเป็นก้อน **แคบกว่า** การแก้รายใบ — ฝ่าย TS แก้ไซต์ได้ แต่นำเข้าไม่ได้', () => {
  /* เขียนทีเดียวหลายร้อยแถวและย้อนกลับไม่ได้ ⇒ เหลือแอดมินคนเดียว
     ⚠️ ตั้งแต่โมดูลเป็นของฝ่าย TS เท่านั้น (มติ 2026-08-30) คนนอกฝ่ายตกตั้งแต่
        `canEditService` แล้ว — ด่านนี้จึงเหลือหน้าที่กัน *คนในฝ่าย* อย่างเดียว */
  for (const role of ['ts', 'ts_planner', 'ts_senior', 'ts_audit', 'ts_manager']) {
    assert.equal(canImportServiceData({ role, department: 'TS' }), false, role);
  }
  assert.equal(canEditService({ role: 'ts_manager', department: 'TS' }), true);
});

test('ผู้ดูแลระบบนำเข้าได้ — เป็นคนตั้งระบบตอนแรก', () => {
  assert.equal(canImportServiceData({ role: 'admin' }), true);
});

test('🔴 คนนอกฝ่าย TS นำเข้าไม่ได้ — รวมหัวหน้าฝ่ายขายและทีมขาย SV', () => {
  /* ⚠️ ทีม SV เคยนำเข้าได้ตอนที่เขาดูแลงานบริการแทนฝ่ายที่ยังไม่มีคน (มติ 2026-07-30)
     · ปิดพร้อมกับการปิดโมดูลทั้งก้อน (มติ 2026-08-30) */
  assert.equal(canImportServiceData({ role: 'ae_supervisor', team: 'KA' }), false);
  assert.equal(canImportServiceData({ role: 'ae_supervisor', team: 'SV', teams: ['SV'] }), false);
  assert.equal(canImportServiceData({ role: 'ae', team: 'SV', teams: ['SV'] }), false);
  assert.equal(canImportServiceData({ role: 'ae_supervisor', department: 'TS' }), false);
});

test('คนนอกระบบบริการทั้งหมดไม่ได้', () => {
  assert.equal(canImportServiceData({ role: 'wh', department: 'WH' }), false);
  assert.equal(canImportServiceData({ role: 'viewer' }), false);
  assert.equal(canImportServiceData(null), false);
});
