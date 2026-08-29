// ── ตรวจ payload ใบประเมินพื้นที่ (mig 0314) — รูปร่างล้วน ไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSurveyRequest, normalizeSurveySite, normalizeSurveyTime,
  normalizeSurveyZones, surveyZoneNameClash, zoneNameKey,
} from './surveyRequest.js';

// ── สถานที่: หนึ่งใบ หนึ่งไซต์ ──────────────────────────────────────────
test('ต้องเลือกสถานที่ — ไม่เลือกเลยไม่ได้', () => {
  assert.match(normalizeSurveySite({}).error, /ต้องเลือกสถานที่/);
});

test('⭐ เลือกของเดิมหรือสร้างใหม่ อย่างใดอย่างหนึ่ง — ส่งมาทั้งคู่ต้องตีกลับ', () => {
  const both = normalizeSurveySite({ siteId: 'SVS-1', newSite: { name: 'ใหม่' } });
  assert.match(both.error, /อย่างใดอย่างหนึ่ง/);
  // ⚠️ ห้ามเดาว่าอันไหนคือของจริง — เดาผิดคือใบไปผูกคนละสถานที่กับที่คนกรอกเห็น
  assert.equal(both.value, null);
});

test('สถานที่ใหม่ต้องมีชื่อ', () => {
  assert.match(normalizeSurveySite({ newSite: { name: '   ' } }).error, /ต้องมีชื่อ/);
  assert.equal(normalizeSurveySite({ newSite: { name: '  ดิ เอ็มควอเทียร์ ' } }).value.newSite.name,
    'ดิ เอ็มควอเทียร์');
});

// ── พื้นที่ ─────────────────────────────────────────────────────────────
test('ต้องมีพื้นที่อย่างน้อยหนึ่งรายการ', () => {
  assert.match(normalizeSurveyZones([]).error, /อย่างน้อย 1 รายการ/);
  assert.match(normalizeSurveyZones(null).error, /อย่างน้อย 1 รายการ/);
});

test('พื้นที่ใหม่ต้องมีชื่อ · พื้นที่เดิมใช้ชื่อจากทะเบียน', () => {
  assert.match(normalizeSurveyZones([{ note: 'ตรงบันไดเลื่อน' }]).error, /ต้องระบุชื่อพื้นที่/);
  const { value } = normalizeSurveyZones([{ zoneId: 'ZN-1', name: 'ชื่อที่ client ส่งมา' }]);
  // ⚠️ ชื่อของโซนเดิมต้องมาจากทะเบียน ไม่ใช่จาก client (ชื่อที่ส่งมาอาจเก่า)
  assert.equal(value[0].name, null);
  assert.equal(value[0].zoneId, 'ZN-1');
});

test('🔴 ชื่อพื้นที่ใหม่ซ้ำกันเองในใบเดียว — ต้องตีกลับก่อนถึง DB', () => {
  // เทียบแบบเดียวกับ UNIQUE (siteId, lower(btrim(name))) ของ mig 0297 เป๊ะ ๆ
  const dup = normalizeSurveyZones([{ name: 'ล็อบบี้ ชั้น G' }, { name: '  ล็อบบี้   ชั้น g  ' }]);
  assert.match(dup.error, /ซ้ำกับรายการที่ 1/);
  assert.equal(zoneNameKey('  ล็อบบี้   ชั้น G '), zoneNameKey('ล็อบบี้ ชั้น g'));
});

test('เลือกพื้นที่เดิมซ้ำสองรายการไม่ได้', () => {
  assert.match(normalizeSurveyZones([{ zoneId: 'ZN-1' }, { zoneId: 'ZN-1' }]).error, /ซ้ำกับรายการก่อนหน้า/);
});

test('เพดานกันใบที่ใหญ่เกินจริง', () => {
  const many = Array.from({ length: 61 }, (_, i) => ({ name: `พื้นที่ ${i}` }));
  assert.match(normalizeSurveyZones(many).error, /แยกเป็นหลายใบ/);
});

// ── ชนกับโซนที่มีอยู่แล้วในไซต์ ─────────────────────────────────────────
test('🔴 ชื่อใหม่ชนกับโซนเดิมของไซต์ — ข้อความต้องบอกรหัส ZN ของตัวที่ชน', () => {
  const zones = normalizeSurveyZones([{ zoneId: 'ZN-9' }, { name: 'ล็อบบี้ชั้น G' }]).value;
  const clash = surveyZoneNameClash(zones, [{ id: 'ZN-1', code: 'ZN-26030021', name: 'ล็อบบี้ชั้น G' }]);
  assert.match(clash, /ZN-26030021/);
  assert.match(clash, /เลือกจากพื้นที่เดิมแทน/);
  // โซนเดิมที่เลือกมาไม่นับเป็นการชน (ไม่มีชื่อให้ชน)
  assert.equal(surveyZoneNameClash(zones, [{ id: 'ZN-9', code: 'ZN-9', name: 'อะไรก็ได้' }]), null);
});

// ── เวลา ────────────────────────────────────────────────────────────────
test('เวลาว่างได้ · รูปแบบผิดต้องตีกลับ · ตัดวินาทีทิ้ง', () => {
  assert.deepEqual(normalizeSurveyTime(''), { value: null, error: null });
  assert.equal(normalizeSurveyTime('13:00:00').value, '13:00');
  assert.match(normalizeSurveyTime('25:00').error, /ไม่ถูกต้อง/);
});

// ── ทั้ง payload ────────────────────────────────────────────────────────
test('payload ที่ถูกต้องผ่านครบ', () => {
  const { value, error } = normalizeSurveyRequest({
    siteId: 'SVS-1',
    requestedDueTime: '13:00',
    zones: [{ zoneId: 'ZN-1' }, { name: 'โซนอาหารชั้น 4' }],
  });
  assert.equal(error, null);
  assert.equal(value.siteId, 'SVS-1');
  assert.equal(value.zones.length, 2);
  // อาคาร/ชั้นไม่อยู่บนใบ — TS กรอกลงทะเบียนตอนอยู่หน้างาน
  assert.equal(value.zones[1].building, undefined);
  assert.equal(value.requestedDueTime, '13:00');
});
