// ── ใครนำเข้าข้อมูลเก่าได้ (F-8) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canEditService, canImportServiceData } from '../permissions.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

/* 🐞 **ข้อความที่กว้างกว่าด่าน = คนอ่านว่าตัวเองมีสิทธิ์ แล้วโดนปฏิเสธ**
   ทั้งสี่จุดเคยเขียนว่า "หัวหน้าฝ่ายบริการขึ้นไป" ทั้งที่โค้ดให้แค่แอดมินมาตั้งแต่มติ
   2026-08-30 ⇒ อาการที่คนจะรายงานว่า "ระบบพัง" ไม่ใช่ "ไม่มีสิทธิ์"
   ⚠️ ยามนี้ผูกข้อความเข้ากับด่าน — ใครเปลี่ยนด่านต้องมาเปลี่ยนข้อความพร้อมกัน */
test('🔴 ข้อความบอกสิทธิ์ต้องตรงกับด่านจริง — ห้ามกว้างกว่า', () => {
  const files = [
    '../../app/api/service/import/preview/route.js',
    '../../app/api/service/import/commit/route.js',
    '../../app/service/import/page.js',
  ];
  for (const f of files) {
    const text = code(f);
    assert.doesNotMatch(text, /หัวหน้าฝ่ายบริการขึ้นไป/, f);
    assert.match(text, /เฉพาะผู้ดูแลระบบ/, f);
  }
});

/* ⚠️ ไม่มีสิทธิ์แล้วต้องบอก **ทางที่เหลือจริง** ไม่ใช่ปิดประตูเฉย ๆ
   (กติกาเดียวกับ closeRequestError ที่โยนคนไปหาปุ่มที่ใช้แทนได้) */
test('จอที่ปฏิเสธต้องบอกทางที่เหลือ — เพิ่มไซต์ทีละใบยังทำได้', () => {
  const page = code('../../app/service/import/page.js');
  assert.match(page, /ทีละใบ/);
});
