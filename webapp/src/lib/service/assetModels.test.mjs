// ── ทะเบียนรุ่นเครื่อง (mig 0344) ─────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_COLOURS_MAX, assetModelError, modelColours, modelOptions, modelUsage,
  normalizeColours, normalizeModelInput,
} from './assetModels.js';

const base = { kind: 'diffuser', name: 'OV-08', modelCode: 'OV08', colours: ['ขาว', 'ดำ'] };

test('เส้นปกติ — ตัด/ล้างค่าให้เรียบร้อย', () => {
  const { value, error } = normalizeModelInput({ ...base, name: '  OV-08  ', modelCode: 'ov08' });
  assert.equal(error, null);
  assert.equal(value.name, 'OV-08');
  assert.equal(value.modelCode, 'OV08');
  assert.deepEqual(value.colours, ['ขาว', 'ดำ']);
  assert.equal(value.isActive, true);
});

/* ⚠️ `"ขาว "` กับ `"ขาว"` เป็นสีเดียวกันในสายตาคน แต่เป็นสองตัวเลือกในดรอปดาวน์ */
test('สีซ้ำแบบไม่สนตัวพิมพ์/ช่องว่างต้องยุบเหลือตัวเดียว', () => {
  assert.deepEqual(normalizeColours(['ขาว', ' ขาว ', 'ดำ', '']).value, ['ขาว', 'ดำ']);
  assert.deepEqual(normalizeColours('ขาว, ดำ , ขาว').value, ['ขาว', 'ดำ'], 'รับสตริงคั่นจุลภาคด้วย');
  assert.deepEqual(normalizeColours(null).value, []);
  assert.ok(normalizeColours(Array.from({ length: MODEL_COLOURS_MAX + 1 }, (_, i) => `สี${i}`)).error);
});

test('ชนิด/ชื่อ/รหัสบังคับครบ', () => {
  assert.match(normalizeModelInput({ ...base, kind: 'x' }).error, /ชนิด/);
  assert.match(normalizeModelInput({ ...base, name: '' }).error, /ชื่อรุ่น/);
  assert.match(normalizeModelInput({ ...base, modelCode: 'OV' }).error, /4 ตัวพอดี/);
});

test('fail-closed — ไม่มีสิทธิ์ = ปฏิเสธก่อนตรวจอย่างอื่น', () => {
  assert.match(assetModelError('create', base, {}), /ไม่มีสิทธิ์/);
});

/* ⭐ รุ่นที่ใช้อยู่ลบไม่ได้ — ปิดใช้งานได้อย่างเดียว (กติกาเดียวกับโซนที่มีประวัติการขาย)
   เครื่องที่ออกรหัสไปแล้วถือ modelCode ของรุ่นนี้ไว้ในรหัสตัวเอง */
test('⭐ รุ่นที่มีเครื่องใช้อยู่: ลบไม่ได้ · แก้รหัส 4 ตัวไม่ได้ · ย้ายชนิดไม่ได้', () => {
  const before = { id: 'M1', ...base };
  const ctx = { canEdit: true, before, usedBy: 48 };

  assert.match(assetModelError('delete', {}, ctx), /มีเครื่องใช้อยู่ 48 ตัว.*ปิดใช้งานแทน/);
  assert.match(assetModelError('update', { ...base, modelCode: 'OV88' }, ctx), /แก้รหัส 4 ตัวไม่ได้/);
  assert.match(assetModelError('update', { ...base, kind: 'soap' }, ctx), /ย้ายชนิดไม่ได้/);

  // แต่แก้ชื่อ/สี/ปิดใช้งาน ยังทำได้เสมอ
  assert.equal(assetModelError('update', { ...base, name: 'OV-08 (ใหม่)' }, ctx), null);
  assert.equal(assetModelError('update', { ...base, colours: ['ขาว'] }, ctx), null);
  assert.equal(assetModelError('update', { ...base, isActive: false }, ctx), null);
});

test('รุ่นที่ยังไม่มีเครื่อง: ลบได้ · แก้รหัสได้', () => {
  const ctx = { canEdit: true, before: { id: 'M1', ...base }, usedBy: 0 };
  assert.equal(assetModelError('delete', {}, ctx), null);
  assert.equal(assetModelError('update', { ...base, modelCode: 'OV88' }, ctx), null);
});

/* ⚠️ ปิดใช้งาน = "ไม่ให้เลือกเพิ่ม" ไม่ใช่ "ลบ" — เครื่องเก่ายังอ่านชื่อรุ่นได้ปกติ */
test('ตัวเลือกกรองรุ่นที่ปิดใช้งานออก และกรองตามชนิด', () => {
  const models = [
    { id: 'A', kind: 'diffuser', name: 'OV-10', modelCode: 'OV10', isActive: true },
    { id: 'B', kind: 'diffuser', name: 'OV-05', modelCode: 'OV05', isActive: true },
    { id: 'C', kind: 'diffuser', name: 'เลิกใช้', modelCode: 'OLDX', isActive: false },
    { id: 'D', kind: 'soap', name: 'เครื่องกดสบู่', modelCode: 'SOAP', isActive: true },
  ];
  assert.deepEqual(modelOptions(models, 'diffuser').map((o) => o.value), ['B', 'A'], 'เรียงตามชื่อไทย');
  assert.deepEqual(modelOptions(models, 'soap').map((o) => o.value), ['D']);
  assert.equal(modelOptions(models).length, 3, 'ไม่ระบุชนิด = ทุกชนิดที่เปิดใช้งาน');
});

test('สีที่รุ่นมี — รุ่นที่ไม่แยกสีคืนอาร์เรย์ว่าง', () => {
  const models = [{ id: 'A', colours: ['ขาว'] }, { id: 'B' }];
  assert.deepEqual(modelColours(models, 'A'), ['ขาว']);
  assert.deepEqual(modelColours(models, 'B'), []);
  assert.deepEqual(modelColours(models, 'ไม่มี'), []);
});

test('นับเครื่องต่อรุ่น — เครื่องที่ไม่ผูกรุ่นไม่ถูกนับ', () => {
  assert.deepEqual(modelUsage([
    { modelId: 'A' }, { modelId: 'A' }, { modelId: 'B' }, { modelId: null }, {},
  ]), { A: 2, B: 1 });
});
