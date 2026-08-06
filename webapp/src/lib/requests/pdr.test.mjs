// ── ส่วนหัวของแบบฟอร์ม PDR (mig 0214) ──────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdr } from './pdr.js';

test('ชื่อช่องในฟอร์มถูกแปลงเป็นชื่อคอลัมน์ที่ prefix แล้ว', () => {
  const { columns, error } = normalizePdr({ customerBrand: 'แบรนด์ ก', moodTone: 'อบอุ่น' });
  assert.equal(error, null);
  assert.equal(columns.pdrCustomerBrand, 'แบรนด์ ก');
  assert.equal(columns.pdrMoodTone, 'อบอุ่น');
  // ช่องที่ไม่ได้กรอกเป็น null ไม่ใช่หายไป — update ต้องล้างค่าเก่าได้ด้วย
  assert.equal(columns.pdrMoq, null);
});

test('ไม่มีช่องไหนบังคับ — ใบเปล่ายังบันทึกได้', () => {
  const { columns, error } = normalizePdr({});
  assert.equal(error, null);
  // ⚠️ ช่องติ๊กหลายตัวคืน `[]` ไม่ใช่ null — คอลัมน์เป็น NOT NULL DEFAULT '{}' (0217)
  // ส่ง null ไปจะโดน constraint ตีกลับด้วย error ดิบจาก Postgres
  for (const [column, v] of Object.entries(columns)) {
    assert.equal(Array.isArray(v) ? v.length === 0 : v === null, true, column);
  }
  assert.equal(normalizePdr(null).error, null);
});

test('ช่องติ๊กหลายตัว: ตัดค่าซ้ำ · กันจำนวนเกิน · ไม่ตรวจว่าอยู่ในชุดตัวเลือกไหม', () => {
  const ok = normalizePdr({ documents: ['coa', 'coa', ' msds ', ''] });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.columns.pdrDocuments, ['coa', 'msds']);
  assert.deepEqual(normalizePdr({ packagingForms: 'ไม่ใช่ array' }).columns.pdrPackagingForms, []);
  assert.match(normalizePdr({ documents: Array(21).fill(0).map((_, i) => `d${i}`) }).error, /ไม่เกิน 20/);
});

test('ตัวเลขติดลบหรืออ่านไม่ออกต้องตีกลับ ไม่ใช่กลืนเป็น null เงียบ ๆ', () => {
  assert.match(normalizePdr({ targetCost: '-1' }).error, /ไม่ติดลบ/);
  assert.match(normalizePdr({ projectValue: 'หนึ่งล้าน' }).error, /ตัวเลข/);
  // คั่นหลักพันด้วยลูกน้ำเป็นเรื่องปกติที่คนพิมพ์ — รับได้
  assert.equal(normalizePdr({ projectValue: '1,250,000' }).columns.pdrProjectValue, 1250000);
  assert.equal(normalizePdr({ targetCost: '420.50' }).columns.pdrTargetCost, 420.5);
  assert.equal(normalizePdr({ targetCost: '' }).columns.pdrTargetCost, null);
});

test('วันที่ต้องเป็น ISO · เว้นว่างได้', () => {
  assert.equal(normalizePdr({ wantedAt: '2569-08-06' }).columns.pdrWantedAt, '2569-08-06');
  assert.equal(normalizePdr({ sellFrom: '' }).columns.pdrSellFrom, null);
  assert.match(normalizePdr({ wantedAt: '06/08/2569' }).error, /วันที่/);
});

test('ความยาวต้องไม่หลวมกว่า CHECK ของ 0214', () => {
  assert.match(normalizePdr({ specialRequirements: 'ก'.repeat(2001) }).error, /ยาวเกิน 2000/);
  assert.match(normalizePdr({ customerBrand: 'ก'.repeat(201) }).error, /ยาวเกิน 200/);
  assert.match(normalizePdr({ moq: 'ก'.repeat(101) }).error, /ยาวเกิน 100/);
});
