// ── ประเมินจากแบบ งวด 4 (S4 §2.5) — ตัวอ่าน "ฝ่ายขายยื่นมาแบบไหน" ชุดเดียวของทุกจอ ─────────────
//
// ⭐ `variant` = สิ่งที่ฝ่ายขายขอ ไม่ใช่วิธีปัจจุบัน — ด่าน/คิว/ราง/กระดาษอ่านแถวพื้นที่ (`surveyNeedsVisit`)
// 🔴 ใบที่ยื่นเป็นประเมินจากแบบเก็บ `requestedDueDate` = กระจกของวันรับผล ⇒ `surveyWishedVisit` ห้ามคืนค่านั้น
//    เป็นวันที่อยากให้เข้าพื้นที่ (จอ · ค่าตั้งต้นของโมดัลรับปาก · ภาพนิ่งของกระดาษ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_INTAKE_SWITCH_REASON,
  SURVEY_NO_VISIT_WISH_LINE,
  SURVEY_NO_VISIT_WISH_TEXT,
  SURVEY_RESEED_ASSESSED_ERROR,
  SURVEY_RESEED_MISMATCH_ERROR,
  SURVEY_SALES_ASKED,
  SURVEY_VARIANT_DRAWING,
  SURVEY_ZONE_REPEAT_TEXT,
  surveyFiledAsDrawing,
  surveySalesAskedLine,
  surveyVariantRefusal,
  surveyVariantsOff,
  surveyWishedVisit,
  surveyZoneWording,
} from './surveyIntake.js';
import { SURVEY_METHOD_ERRORS, SURVEY_METHOD_REASON_CHIPS } from './surveyMethodSwitch.js';

test('ข้อความคงที่ตรึงตัวอักษรต่อตัวอักษร', () => {
  assert.equal(SURVEY_VARIANT_DRAWING, 'drawing');
  assert.deepEqual({ ...SURVEY_SALES_ASKED }, { label: 'ฝ่ายขายขอ', value: 'ประเมินจากแบบ', line: 'ฝ่ายขายขอ: ประเมินจากแบบ' });
  assert.ok(Object.isFrozen(SURVEY_SALES_ASKED));
  assert.equal(SURVEY_NO_VISIT_WISH_TEXT, 'ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด');
  assert.equal(SURVEY_NO_VISIT_WISH_LINE, 'ผู้ขออยากให้เข้า: ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด');
  assert.equal(SURVEY_RESEED_ASSESSED_ERROR,
    'พื้นที่ของใบนี้มีผลประเมินบันทึกไว้แล้ว — เปลี่ยนวิธีประเมินจากฟอร์มนี้ไม่ได้ · ส่งคำร้องแล้วเปลี่ยนได้ที่ฝ่ายบริการ (หัวหน้า TS)');
  assert.equal(SURVEY_RESEED_MISMATCH_ERROR,
    'พื้นที่ของใบนี้มีผลประเมินจากวิธีเดิมบันทึกไว้ — กด “แก้ไข” แล้วเลือกวิธีประเมินเดิมก่อนส่งคำร้อง');
  assert.deepEqual({ ...SURVEY_ZONE_REPEAT_TEXT }, { measure: 'วัดซ้ำพื้นที่เดิม', assess: 'ประเมินซ้ำพื้นที่เดิม' });
  assert.ok(Object.isFrozen(SURVEY_ZONE_REPEAT_TEXT));
  // O8 = ข (19/10): เหตุผลของตราที่ฝ่ายขายสลับเป็นลงหน้างาน · CHECK ของ mig 0408 ≤ 300 · ไม่ซ้ำชิปเหตุผลของหัวหน้า
  assert.equal(SURVEY_INTAKE_SWITCH_REASON, 'ฝ่ายขายเปลี่ยนวิธีประเมินเป็นลงหน้างานก่อนส่งคำร้อง');
  assert.ok(SURVEY_INTAKE_SWITCH_REASON.length <= 300);
  assert.equal(SURVEY_METHOD_REASON_CHIPS.includes(SURVEY_INTAKE_SWITCH_REASON), false);
});

test('surveyZoneWording — เฉพาะ drawing = assess · ว่าง/null/standard = measure (ข้อความวันนี้)', () => {
  assert.equal(surveyZoneWording('drawing'), 'assess');
  for (const v of ['', null, undefined, 'standard', 'npd']) assert.equal(surveyZoneWording(v), 'measure', String(v));
});

test('surveyFiledAsDrawing / surveySalesAskedLine — ไม่เคยมีบรรทัดให้ standard หรือแถวเก่าที่ไม่มี variant', () => {
  const rows = [
    [{ kind: 'site_survey', variant: 'drawing' }, true],
    [{ variant: 'drawing' }, true],             // แถวคิว (ทุกแถวเป็นประเมินพื้นที่) ไม่มี kind ติดมา
    [{ kind: 'site_survey', variant: 'standard' }, false],
    [{ kind: 'site_survey' }, false],
    [{ kind: 'site_survey', variant: '' }, false],
    [{ kind: 'formula_dev', variant: 'drawing' }, false],
    [null, false],
    [undefined, false],
  ];
  for (const [row, expected] of rows) {
    assert.equal(surveyFiledAsDrawing(row), expected, JSON.stringify(row));
    assert.equal(surveySalesAskedLine(row), expected ? 'ฝ่ายขายขอ: ประเมินจากแบบ' : null, JSON.stringify(row));
  }
});

test('surveyWishedVisit — ยื่นเป็นประเมินจากแบบ = ไม่รู้ (ไม่อ่านกระจกวันรับผล) · ที่เหลืออ่านคอลัมน์เดิม', () => {
  assert.deepEqual(
    surveyWishedVisit({ kind: 'site_survey', variant: 'drawing', requestedDueDate: '2026-10-20', requestedDueTime: '09:00-12:00', requestedResultDate: '2026-10-20' }),
    { known: false, date: '', time: '' },
  );
  assert.deepEqual(
    surveyWishedVisit({ kind: 'site_survey', variant: 'standard', requestedDueDate: '2026-10-20', requestedDueTime: '09:00-12:00' }),
    { known: true, date: '2026-10-20', time: '09:00-12:00' },
  );
  assert.deepEqual(surveyWishedVisit({ kind: 'site_survey', requestedDueDate: '2026-10-20' }), { known: true, date: '2026-10-20', time: '' });
  assert.deepEqual(surveyWishedVisit({ kind: 'site_survey', variant: 'standard' }), { known: false, date: '', time: '' });
  assert.deepEqual(surveyWishedVisit({ requestedDueDate: null, requestedDueTime: null }), { known: false, date: '', time: '' });
  assert.deepEqual(surveyWishedVisit(null), { known: false, date: '', time: '' });
});

test('surveyVariantsOff — เปิดจริง (true เท่านั้น) = ไม่ปิดอะไร · ค่าอื่นทั้งหมด = ปิดประเมินจากแบบ', () => {
  assert.deepEqual(surveyVariantsOff(true), []);
  for (const v of [false, undefined, null, 'true', 1]) assert.deepEqual(surveyVariantsOff(v), ['drawing'], String(v));
});

test('surveyVariantRefusal — ตารางความจริง', () => {
  const OFF = SURVEY_METHOD_ERRORS.off;
  assert.equal(OFF, 'ยังไม่เปิดใช้การประเมินจากแบบ');
  const rows = [
    // variant, enabled, current → ผล
    ['drawing', false, null, OFF],
    ['drawing', undefined, null, OFF],
    ['drawing', 'true', null, OFF],
    ['drawing', false, 'standard', OFF],
    ['drawing', false, 'drawing', null],   // ใบที่ถือค่านี้อยู่แล้ว บันทึกต่อได้แม้สวิตช์ถูกปิดทีหลัง
    ['drawing', true, null, null],
    ['drawing', true, 'standard', null],
    ['standard', false, null, null],
    ['standard', false, 'drawing', null],
    ['', false, null, null],
    [undefined, false, null, null],
  ];
  for (const [variant, enabled, current, expected] of rows) {
    assert.equal(surveyVariantRefusal({ variant, enabled, current }), expected, `${variant}/${enabled}/${current}`);
  }
  assert.equal(surveyVariantRefusal({ variant: 'drawing' }), OFF);
  assert.equal(surveyVariantRefusal({}), null);
});

test('ไฟล์นี้ปลอดภัยฝั่งเบราว์เซอร์ — ไม่อ่านสวิตช์ ไม่แตะ DB ไม่มีค่าวิธีของแถวพื้นที่', () => {
  const src = readFileSync('src/lib/service/surveyIntake.js', 'utf8');
  assert.doesNotMatch(src, /process\.env/);
  assert.doesNotMatch(src, /surveyDrawingFlag|supabase|getSupabaseAdmin/i);
  // import เดียว: surveyMethodSwitch (ไฟล์ pure) — ห้ามดึง survey.js / ภาพนิ่งกระดาษเข้ามา (วงจร import)
  const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['@/lib/service/surveyMethodSwitch']);
  assert.doesNotMatch(src, /method\s*[:=]\s*['"]/);
});
