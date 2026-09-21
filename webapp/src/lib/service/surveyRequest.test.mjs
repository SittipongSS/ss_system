// ── ตรวจ payload ใบประเมินพื้นที่ (mig 0314) — รูปร่างล้วน ไม่แตะ DB
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { requestShapeError } from '@/lib/master/requestTypes';
import {
  normalizeSurveyCommittedResult, normalizeSurveyRequest, normalizeSurveyRequestedResult,
  normalizeSurveySite, normalizeSurveyTime,
  normalizeSurveyZones, surveyZoneNameClash, zoneNameKey,
} from './surveyRequest.js';

// ── สถานที่: หนึ่งใบ หนึ่งไซต์ ──────────────────────────────────────────
test('ต้องเลือกสถานที่ — ไม่เลือกเลยไม่ได้ และบอกทางออกที่ทำได้จริง', () => {
  const err = normalizeSurveySite({}).error;
  assert.match(err, /ต้องเลือกสถานที่/);
  /* 🔴 ข้อความต้องชี้ปุ่มในฟอร์มนี้ ไม่ใช่ทะเบียนไซต์ — ตั้งแต่มติ 2026-08-30
     ทะเบียนไม่มีฟอร์มสร้างแล้ว ⇒ ข้อความเก่าสั่งให้ทำสิ่งที่ทำไม่ได้ */
  assert.match(err, /ในฟอร์มนี้/);
  assert.doesNotMatch(err, /ทะเบียนไซต์/);
  /* 🐞 ข้อความต้องเรียกปุ่มด้วย **ชื่อที่อยู่บนปุ่มจริง** — เคยเขียนว่า "เพิ่มสถานที่ใหม่"
     ทั้งที่ปุ่มเขียน "สร้างสถานที่ใหม่" ⇒ คนกวาดตาหาคำที่ไม่มีอยู่บนจอ */
  const field = readFileSync(
    new URL('../../components/requests/SurveySiteFields.js', import.meta.url), 'utf8',
  );
  const label = err.match(/“(.+?)”/)?.[1];
  assert.ok(label, 'ข้อความต้องอ้างชื่อปุ่มในเครื่องหมายคำพูด');
  assert.ok(field.includes(label), `ไม่มีปุ่มชื่อ “${label}” ในฟอร์ม`);
});

test('ใบถือแต่ siteId — ร่างสถานที่แนบมากับใบไม่ใช่ทางที่มีอยู่', () => {
  assert.deepEqual(normalizeSurveySite({ siteId: ' SVS-1 ' }).value, { siteId: 'SVS-1' });
  // ส่ง newSite มาเฉย ๆ ไม่ทำให้ผ่าน — ไซต์ต้องมีแถวจริงก่อนใบจะอ้างได้
  assert.match(normalizeSurveySite({ newSite: { name: 'ดิ เอ็มควอเทียร์' } }).error, /ต้องเลือกสถานที่/);
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
  const dup = normalizeSurveyZones([{ name: 'ล็อบบี้ ชั้น G', floor: 'G' }, { name: '  ล็อบบี้   ชั้น g  ', floor: 'G' }]);
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
  const zones = normalizeSurveyZones([{ zoneId: 'ZN-9' }, { name: 'ล็อบบี้ชั้น G', floor: 'G' }]).value;
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

/* ── วันส่งผล — คนละวันกับวันเข้าพื้นที่ (มติผู้ใช้ 2026-09-21 · mig 0368) ──────
   🔴 ของเดิมมีวันเดียว ⇒ ตัวเลขบนใบตอบไม่ได้ว่า "12/09" คือวันที่ช่างไปถึงหน้างาน
      หรือวันที่ฝ่ายขายจะได้ตัวเลขไปเสนอราคา */
test('🔴 วันส่งผลบังคับทั้งสองฝั่ง และมาก่อนวันเข้าพื้นที่ไม่ได้', () => {
  assert.match(normalizeSurveyRequestedResult('', '2026-09-08').error, /ต้องระบุ/);
  assert.match(normalizeSurveyRequestedResult('2026-09-07', '2026-09-08').error, /ไม่มาก่อน/);
  // เท่ากันได้ — ไปเช้า ส่งเย็น เป็นเรื่องปกติของงานจริง
  assert.deepEqual(
    normalizeSurveyRequestedResult('2026-09-08', '2026-09-08'),
    { value: '2026-09-08', error: null },
  );
  // ยังไม่มีวันเข้าพื้นที่ให้เทียบ = ตรวจแค่รูปแบบ (ด่าน "ต้องมีวัน" อยู่ที่ requestShapeError)
  assert.equal(normalizeSurveyRequestedResult('2026-09-08', '').error, null);
  assert.match(normalizeSurveyRequestedResult('8/9/2026', '').error, /ไม่ถูกต้อง/);
  // ฝั่งฝ่าย TS พูดคนละคำกับฝั่งผู้ขอ — คนอ่านต้องรู้ว่าตกด่านของช่องไหน
  assert.match(normalizeSurveyCommittedResult('', '2026-09-08').error, /จะส่งผล/);
  assert.match(normalizeSurveyCommittedResult('2026-09-07', '2026-09-08').error, /วันนัดเข้าพื้นที่/);
});

/* ── รายละเอียดบังคับของหัวข้อนี้ (มติผู้ใช้ 2026-09-21) ───────────────────
   🔴 ใบนี้ไม่มีตารางรายการและไม่มีแบบฟอร์ม PDR ⇒ ช่อง "รายละเอียดเพิ่มเติม" คือที่เดียว
      ที่บริบทของงานอยู่ · ฝ่าย TS ต้องอ่านก่อนจัดคนและลำดับงาน
   ⚠️ บังคับเฉพาะหัวข้อที่ทะเบียนสั่ง — หัวข้ออื่นยังเป็นช่องเสริมเหมือนเดิม */
test('🔴 ประเมินพื้นที่ต้องกรอกรายละเอียด — หัวข้ออื่นยังไม่บังคับ', () => {
  const base = {
    title: 'ประเมินพื้นที่สาขา A', dealId: 'D-1', siteId: 'SVS-1',
    zones: [{ name: 'โซนล็อบบี้', floor: 'G' }],
    requestedDueDate: '2026-09-20',
  };
  assert.match(requestShapeError('site_survey', base), /รายละเอียดเพิ่มเติม/);
  assert.equal(requestShapeError('site_survey', { ...base, body: 'ลูกค้าเปิดโซนใหม่ต้นเดือนหน้า' }), null);
  // หัวข้อที่ไม่ได้ประกาศ `bodyRequired` ต้องไม่ถูกด่านนี้แตะ
  assert.equal(
    requestShapeError('info', { title: 'สอบถาม', dealId: 'D-1', requestedDueDate: '2026-09-20' }),
    null,
  );
});

// ── ทั้ง payload ────────────────────────────────────────────────────────
test('payload ที่ถูกต้องผ่านครบ', () => {
  const { value, error } = normalizeSurveyRequest({
    siteId: 'SVS-1',
    requestedDueTime: '13:00',
    requestedDueDate: '2026-09-08',
    requestedResultDate: '2026-09-11',
    zones: [{ zoneId: 'ZN-1' }, { name: 'โซนอาหารชั้น 4', floor: '4' }],
  });
  assert.equal(error, null);
  assert.equal(value.siteId, 'SVS-1');
  assert.equal(value.zones.length, 2);
  // ชั้นของพื้นที่ใหม่เก็บเป็นค่ามาตรฐาน — เป็นท่อน FF ของรหัสโซน (mig 0315)
  assert.equal(value.zones[1].floor, '04');
  assert.equal(value.zones[0].floor, null);   // โซนเดิมไม่ต้องถามชั้นซ้ำ
  assert.equal(value.requestedDueTime, '13:00');
  assert.equal(value.requestedResultDate, '2026-09-11');
});

// ── ชั้นของพื้นที่ใหม่ (mig 0315) ──────────────────────────────────────────
test('🔴 พื้นที่ใหม่ต้องมีชั้น — ชั้นเป็นท่อนหนึ่งของรหัสโซน ไม่ใช่ข้อมูลเสริม', () => {
  const noFloor = normalizeSurveyZones([{ name: 'โซนอาหาร' }]);
  assert.match(noFloor.error, /พื้นที่รายการที่ 1: ต้องระบุชั้น/);
  // ชั้นรูปผิดก็ตีกลับพร้อมบอกว่ารายการไหน
  assert.match(normalizeSurveyZones([{ name: 'โซนอาหาร', floor: 'ชั้นบน' }]).error, /รายการที่ 1/);
  // โซนเดิมไม่ต้องมีชั้น — ทะเบียนรู้อยู่แล้ว
  assert.equal(normalizeSurveyZones([{ zoneId: 'ZN-1' }]).error, null);
});
