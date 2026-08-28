// ── ใครนำเข้าข้อมูลเก่าได้ (F-8) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditService, canImportServiceData } from '../permissions.js';

test('⭐ นำเข้าเป็นก้อน **แคบกว่า** การแก้รายใบ — ช่างที่แก้ไซต์ได้ ยังนำเข้าไม่ได้', () => {
  const ts = { role: 'ts', department: 'TS' };
  const aeSv = { role: 'ae', team: 'SV' };
  assert.equal(canEditService(ts), true);
  assert.equal(canEditService(aeSv), true);
  assert.equal(canImportServiceData(ts), false, 'เขียนทีเดียวหลายร้อยแถว ย้อนกลับไม่ได้');
  assert.equal(canImportServiceData(aeSv), false);
});

test('ผู้ดูแลระบบนำเข้าได้ — เป็นคนตั้งระบบตอนแรก', () => {
  assert.equal(canImportServiceData({ role: 'admin' }), true);
});

test('🔴 หัวหน้าสายขายที่ไม่เกี่ยวกับงานบริการ ห้ามเขียนทะเบียนไซต์ทั้งก้อน', () => {
  // canEditService คืน true ให้ isSuperuser ตั้งแต่บรรทัดแรก ⇒ ถ้าไม่ถามทีม/ฝ่าย
  // ซ้ำที่นี่ หัวหน้าทีม KA จะนำเข้าได้ทั้งที่ไม่มีส่วนกับงานบริการเลย
  assert.equal(canEditService({ role: 'ae_supervisor', team: 'KA' }), true);
  assert.equal(canImportServiceData({ role: 'ae_supervisor', team: 'KA' }), false);
});

test('หัวหน้าที่คุมงานบริการจริงนำเข้าได้ (ทีม SV หรือฝ่าย TS)', () => {
  assert.equal(canImportServiceData({ role: 'ae_supervisor', team: 'SV' }), true);
  assert.equal(canImportServiceData({ role: 'ae_supervisor', teams: ['KA', 'SV'] }), true);
  assert.equal(canImportServiceData({ role: 'ae_supervisor', department: 'TS' }), true);
});

test('คนนอกระบบบริการทั้งหมดไม่ได้', () => {
  assert.equal(canImportServiceData({ role: 'wh', department: 'WH' }), false);
  assert.equal(canImportServiceData({ role: 'viewer' }), false);
  assert.equal(canImportServiceData(null), false);
});
