import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as leaf from './surveyMethod.js';
import {
  SURVEY_METHOD_DRAWING, SURVEY_METHOD_ONSITE,
  isDrawingZone, isJpgOrPngFile, surveyConfirmState, surveyDrawingAssessor, surveyDropSupersededDrawing,
  surveyMethodMix, surveyNeedsVisit, surveyNewZoneMethod, surveyZoneChangeFlips, surveyZoneNeedsResave, zoneMethod,
} from './surveyMethod.js';

/* แถว `service_survey_zones` สามแบบที่ทุกเทสต์ใช้
   ⚠️ `old` = แถวก่อน mig 0408 / fixture เก่า — **ไม่มีคีย์ `method` เลย** ต้องอ่านเป็นลงหน้างานทุกที่ */
const on = (over = {}) => ({ id: 'A', status: 'ok', method: 'onsite', ...over });
const dw = (over = {}) => ({ id: 'B', status: 'ok', method: 'drawing', ...over });
const old = (over = {}) => ({ id: 'L', status: 'ok', ...over });
const cut = { status: 'cut' };

/* ── 1) zoneMethod — ที่เดียวในระบบที่เทียบค่าคอลัมน์ ─────────────────────── */
test('🔑 zoneMethod: เป็น "จากแบบ" เฉพาะ method === \'drawing\' ตรงตัว นอกนั้นลงหน้างานหมด', () => {
  const cases = [
    ['drawing ตรงตัว', { method: 'drawing' }, 'drawing'],
    ['onsite', { method: 'onsite' }, 'onsite'],
    ['null', { method: null }, 'onsite'],
    ['undefined', { method: undefined }, 'onsite'],
    ['ไม่มีคีย์ method (แถวเก่า)', { id: 'Z1', status: 'ok' }, 'onsite'],
    ['ตัวพิมพ์ใหญ่', { method: 'Drawing' }, 'onsite'],
    ['สตริงว่าง', { method: '' }, 'onsite'],
    ['row เป็น null', null, 'onsite'],
  ];
  for (const [name, row, want] of cases) {
    assert.equal(zoneMethod(row), want, name);
    assert.equal(isDrawingZone(row), want === 'drawing', `isDrawingZone · ${name}`);
  }
});

test('zoneMethod: ค่าที่ "เกือบใช่" ไม่นับ — มีช่องว่าง / ไม่ใช่สตริง / row ไม่ใช่ออบเจ็กต์', () => {
  for (const row of [{ method: ' drawing ' }, { method: true }, { method: ['drawing'] }, undefined, 'drawing', 0]) {
    assert.equal(zoneMethod(row), 'onsite', JSON.stringify(row));
  }
});

test('ค่าคงที่ตรงกับ CHECK ของ mig 0408', () => {
  assert.equal(SURVEY_METHOD_ONSITE, 'onsite');
  assert.equal(SURVEY_METHOD_DRAWING, 'drawing');
});

/* ── 2) surveyMethodMix — นับเฉพาะพื้นที่ที่ไม่ถูกตัด ─────────────────────── */
test('surveyMethodMix: นับรายวิธีบนแถวที่ไม่ถูกตัด และบอกโหมดของใบ', () => {
  const cases = [
    ['ไม่มีแถว', [], { onsite: 0, drawing: 0, mode: 'empty' }],
    ['ลงหน้างานล้วน', [on(), on({ id: 'A2' })], { onsite: 2, drawing: 0, mode: 'onsite' }],
    ['จากแบบล้วน', [dw(), dw({ id: 'B2' })], { onsite: 0, drawing: 2, mode: 'drawing' }],
    ['ผสม', [on(), dw(), dw({ id: 'B2' })], { onsite: 1, drawing: 2, mode: 'mixed' }],
    ['แถวตัดไม่นับ — เหลือจากแบบ', [on(cut), dw()], { onsite: 0, drawing: 1, mode: 'drawing' }],
    ['แถวตัดไม่นับ — เหลือลงหน้างาน', [on(), dw(cut)], { onsite: 1, drawing: 0, mode: 'onsite' }],
    ['ตัดหมดทั้งใบ', [on(cut), dw(cut)], { onsite: 0, drawing: 0, mode: 'empty' }],
    ['แถวไม่มีคีย์ method = ลงหน้างาน', [old(), old({ id: 'L2' })], { onsite: 2, drawing: 0, mode: 'onsite' }],
    ['method null = ลงหน้างาน', [on({ method: null }), dw()], { onsite: 1, drawing: 1, mode: 'mixed' }],
    ['ไม่มี status = ยังใช้อยู่', [{ id: 'X', method: 'drawing' }, { id: 'Y' }], { onsite: 1, drawing: 1, mode: 'mixed' }],
    ['ช่องว่างในลิสต์ถูกข้าม', [null, undefined, on()], { onsite: 1, drawing: 0, mode: 'onsite' }],
  ];
  for (const [name, rows, want] of cases) assert.deepEqual(surveyMethodMix(rows), want, name);
});

test('surveyMethodMix: ไม่ใช่อาร์เรย์ = ไม่มีแถว', () => {
  for (const rows of [null, undefined, 'drawing', 3, { 0: dw(), length: 1 }]) {
    assert.deepEqual(surveyMethodMix(rows), { onsite: 0, drawing: 0, mode: 'empty' }, JSON.stringify(rows));
  }
});

/* ── 3) surveyNeedsVisit — ตัวตัดสินเดียวว่าใบนี้ต้องมีนัดไหม ────────────────── */
test('🔑 surveyNeedsVisit: ตารางความจริงทั้งชุด', () => {
  const cases = [
    ['ไม่มีแถวเลย', [], true],
    ['ลงหน้างานพื้นที่เดียว', [on()], true],
    ['แถวไม่มีคีย์ method', [old()], true],
    ['method null', [on({ method: null })], true],
    ['จากแบบพื้นที่เดียว', [dw()], false],
    ['จากแบบทุกพื้นที่', [dw(), dw({ id: 'B2' })], false],
    ['ผสม', [on(), dw()], true],
    ['ลงหน้างานถูกตัด + จากแบบยังใช้', [on(cut), dw()], false],
    ['จากแบบถูกตัด + ลงหน้างานยังใช้', [on(), dw(cut)], true],
    /* RQ-AS-26090233 — ใบจริงที่พื้นที่เดียวของใบถูกตัด: ต้องเดินเหมือนทุกวันนี้ ไม่ใช่กลายเป็นงานโต๊ะเอง */
    ['ตัดหมด · ลงหน้างานล้วน (ทรง RQ-AS-26090233)', [on(cut)], true],
    ['ตัดหมด · แถวเก่าไม่มีคีย์ method', [old(cut), old({ id: 'L2', ...cut })], true],
    ['ตัดหมด · จากแบบล้วน', [dw(cut), dw({ id: 'B2', ...cut })], false],
    ['ตัดหมด · ผสม', [on(cut), dw(cut)], true],
    ['ลิสต์มีแต่ช่องว่าง = ไม่มีแถว', [null, undefined], true],
  ];
  for (const [name, rows, want] of cases) assert.equal(surveyNeedsVisit(rows), want, name);
});

/* ⚠️ ผู้อ่านที่ยังไม่ได้แนบแถวพื้นที่มา ต้องได้พฤติกรรมเดิม (= ต้องมีนัด) ไม่ใช่งานโต๊ะ */
test('⚠️ surveyNeedsVisit: ไม่ใช่อาร์เรย์ = ต้องมีนัด', () => {
  for (const rows of [null, undefined, 'drawing', 0, {}, { 0: dw(), length: 1 }]) {
    assert.equal(surveyNeedsVisit(rows), true, JSON.stringify(rows));
  }
});

/* 🐞 ลำดับ A (ลงหน้างาน) ถูกตัด → B สลับเป็นจากแบบ → B ถูกตัด
   ถ้าแถว A ที่ตัดไปแล้วยังเป็น 'onsite' คำตอบจะพลิกกลับเป็น "ต้องมีนัด" ทั้งที่วันบนใบเป็นวันงานโต๊ะ
   ⇒ route ที่ทำให้ใบพลิกต้องเขียน 'drawing' ลงแถวที่ตัดด้วย (กลุ่ม F) — เทสต์นี้ตรึงทั้งสองฝั่งของเหตุผล */
test('🐞 ลำดับ A ตัด → B เป็นจากแบบ → B ตัด: A ยัง onsite = พลิกกลับ · A ถูกมาร์กเป็น drawing = ไม่พลิก', () => {
  const a = on({ id: 'A', ...cut });
  const b = dw({ id: 'B' });
  assert.equal(surveyNeedsVisit([a, b]), false, 'B ยังใช้อยู่ = งานโต๊ะ');
  assert.equal(surveyNeedsVisit([a, { ...b, ...cut }]), true, 'A ยัง onsite ⇒ ตัด B แล้วพลิกกลับ');

  const marked = { ...a, method: 'drawing' };
  assert.equal(surveyNeedsVisit([marked, b]), false);
  assert.equal(surveyNeedsVisit([marked, { ...b, ...cut }]), false, 'A ถูกมาร์กแล้ว ⇒ ยังเป็นงานโต๊ะ');
});

/* ── 4) surveyNewZoneMethod — พื้นที่ที่เพิ่มบนใบเกิดมาเป็นวิธีไหน ───────────── */
test('surveyNewZoneMethod: ใบมีแถวแล้ว = เดินตามแถว ไม่ดู variant', () => {
  const cases = [
    ['ลงหน้างานล้วน', [on()], 'drawing', 'onsite'],
    ['แถวเก่าไม่มีคีย์ method', [old()], 'drawing', 'onsite'],
    ['ผสม', [on(), dw()], 'drawing', 'onsite'],
    ['จากแบบล้วน', [dw(), dw({ id: 'B2' })], 'standard', 'drawing'],
    ['ลงหน้างานถูกตัด + จากแบบยังใช้', [on(cut), dw()], 'standard', 'drawing'],
    ['ตัดหมด · จากแบบล้วน', [dw(cut)], 'standard', 'drawing'],
    ['ตัดหมด · ลงหน้างานล้วน', [on(cut)], 'drawing', 'onsite'],
    ['ตัดหมด · ผสม', [on(cut), dw(cut)], 'drawing', 'onsite'],
  ];
  for (const [name, rows, variant, want] of cases) {
    assert.equal(surveyNewZoneMethod(rows, { variant }), want, name);
    assert.equal(surveyNewZoneMethod(rows), want, `${name} · ไม่ส่ง options`);
  }
});

test('surveyNewZoneMethod: ใบยังไม่มีแถว = เดินตามที่ฝ่ายขายขอ (variant)', () => {
  const cases = [
    ['drawing', { variant: 'drawing' }, 'drawing'],
    ['standard', { variant: 'standard' }, 'onsite'],
    ['undefined', { variant: undefined }, 'onsite'],
    ['null', { variant: null }, 'onsite'],
    ['ตัวพิมพ์ใหญ่', { variant: 'Drawing' }, 'onsite'],
    ['options ว่าง', {}, 'onsite'],
  ];
  for (const [name, opts, want] of cases) {
    assert.equal(surveyNewZoneMethod([], opts), want, name);
    assert.equal(surveyNewZoneMethod(null, opts), want, `${name} · rows ไม่ใช่อาร์เรย์`);
  }
  assert.equal(surveyNewZoneMethod([]), 'onsite', 'ไม่ส่ง options เลย');
  assert.equal(surveyNewZoneMethod(), 'onsite', 'ไม่ส่งอะไรเลย');
});

/* ── 5) surveyZoneChangeFlips — ตัด/ลบแถวนี้แล้วใบพลิกเป็น "ไม่ต้องมีนัด" ไหม ── */
test('🔑 surveyZoneChangeFlips: จริงเฉพาะตอน needsVisit เปลี่ยนจาก true เป็น false', () => {
  const cases = [
    ['ตัดลงหน้างานตัวสุดท้าย เหลือจากแบบ', [on(), dw()], { id: 'A', to: 'cut' }, true],
    /* ตัดหมดแล้วแถวที่ตัดยังเป็น onsite ⇒ กติกา "ตัดหมด" ยังตอบว่าต้องมีนัด = ไม่พลิก */
    ['ตัดลงหน้างานตัวสุดท้าย ไม่เหลืออะไร', [on()], { id: 'A', to: 'cut' }, false],
    ['ตัดหนึ่งในสองลงหน้างาน', [on(), on({ id: 'A2' }), dw()], { id: 'A', to: 'cut' }, false],
    ['ตัดพื้นที่จากแบบ', [on(), dw()], { id: 'B', to: 'cut' }, false],
    ['ลบลงหน้างานตัวสุดท้ายที่เพิ่มบนใบ เหลือจากแบบ', [on(), dw()], { id: 'A', to: 'removed' }, true],
    ['ลบแล้วไม่เหลือแถว', [on()], { id: 'A', to: 'removed' }, false],
    ['ใบงานโต๊ะอยู่แล้ว · ตัด', [dw(), dw({ id: 'B2' })], { id: 'B', to: 'cut' }, false],
    ['ใบงานโต๊ะอยู่แล้ว · ลบ', [dw(), dw({ id: 'B2' })], { id: 'B', to: 'removed' }, false],
    ['ตัดแถวที่ตัดอยู่แล้ว', [on(cut), dw()], { id: 'A', to: 'cut' }, false],
    /* แถวที่ตัดไว้ (ยัง onsite) คือสิ่งเดียวที่ทำให้ใบ "ตัดหมด" ยังต้องมีนัด ⇒ ลบมันทิ้ง = พลิก */
    ['ตัดหมด · ลบแถว onsite ที่ค้ำไว้', [on(cut), dw(cut)], { id: 'A', to: 'removed' }, true],
    ['ไม่รู้จัก id', [on(), dw()], { id: 'ZZ', to: 'cut' }, false],
    ['ไม่ส่ง id', [on(), dw()], { to: 'cut' }, false],
    ['id null', [on(), dw()], { id: null, to: 'cut' }, false],
    ['to อื่น', [on(), dw()], { id: 'A', to: 'ok' }, false],
    ['ไม่ส่ง to', [on(), dw()], { id: 'A' }, false],
    ['ไม่มีแถว', [], { id: 'A', to: 'cut' }, false],
    ['rows ไม่ใช่อาร์เรย์', null, { id: 'A', to: 'cut' }, false],
  ];
  for (const [name, rows, change, want] of cases) {
    assert.equal(surveyZoneChangeFlips(rows, change), want, name);
  }
  assert.equal(surveyZoneChangeFlips([on(), dw()]), false, 'ไม่ส่ง options เลย');
});

test('surveyZoneChangeFlips: เทียบ id ผ่าน String() — เลขกับสตริงคือแถวเดียวกัน', () => {
  const rows = [on({ id: 7 }), dw({ id: 8 })];
  assert.equal(surveyZoneChangeFlips(rows, { id: '7', to: 'cut' }), true);
  assert.equal(surveyZoneChangeFlips([on({ id: '7' }), dw({ id: '8' })], { id: 7, to: 'removed' }), true);
  /* แถวที่ไม่มี id ต้องไม่ไปจับคู่กับ id ที่ไม่ได้ส่งมา (String(undefined) === 'undefined') */
  assert.equal(surveyZoneChangeFlips([{ status: 'ok', method: 'onsite' }, dw()], { id: undefined, to: 'cut' }), false);
  assert.equal(surveyZoneChangeFlips([{ status: 'ok', method: 'onsite' }, dw()], { id: 'undefined', to: 'cut' }), false);
});

test('surveyZoneChangeFlips: ถามเฉย ๆ ต้องไม่แก้แถวที่ส่งเข้ามา', () => {
  const rows = [on(), dw()];
  const before = JSON.stringify(rows);
  surveyZoneChangeFlips(rows, { id: 'A', to: 'cut' });
  surveyZoneChangeFlips(rows, { id: 'A', to: 'removed' });
  assert.equal(JSON.stringify(rows), before);
  assert.equal(rows.length, 2);
});

/* ── 6) surveyZoneNeedsResave — กลับมาลงหน้างานแล้ว ช่างบันทึกใหม่หรือยัง ────── */
const T0 = '2026-10-09T03:00:00Z';
const T1 = '2026-10-09T04:00:00Z';

test('🔑 surveyZoneNeedsResave: ค้างเฉพาะแถวลงหน้างานที่เคยสลับ และยังไม่ถูกบันทึกหลังสลับ', () => {
  const cases = [
    /* ทุกแถวเดิมของระบบ: ไม่เคยสลับ ⇒ ด่านนี้ต้องเงียบเสมอ */
    ['ไม่เคยสลับ · ยังไม่บันทึก', on({ methodChangedAt: null, surveyedAt: null }), false],
    ['ไม่เคยสลับ · บันทึกแล้ว', on({ methodChangedAt: null, surveyedAt: T0 }), false],
    ['ไม่เคยสลับ · ไม่มีคีย์เลย', old({ surveyedAt: T0 }), false],
    ['ไม่เคยสลับ · ไม่มีคีย์อะไรเลย', old(), false],
    ['methodChangedAt เป็นสตริงว่าง', on({ methodChangedAt: '', surveyedAt: null }), false],
    ['สลับแล้ว · surveyedAt null', on({ methodChangedAt: T0, surveyedAt: null }), true],
    ['สลับแล้ว · ไม่มีคีย์ surveyedAt', on({ methodChangedAt: T0 }), true],
    ['สลับแล้ว · surveyedAt ว่าง', on({ methodChangedAt: T0, surveyedAt: '' }), true],
    ['บันทึกก่อนสลับ', on({ methodChangedAt: T1, surveyedAt: T0 }), true],
    ['บันทึกหลังสลับ', on({ methodChangedAt: T0, surveyedAt: T1 }), false],
    ['เวลาเท่ากันพอดี', on({ methodChangedAt: T0, surveyedAt: T0 }), true],
    ['แถวเก่าไม่มีคีย์ method แต่เคยสลับ', old({ methodChangedAt: T1, surveyedAt: T0 }), true],
    ['อ่าน surveyedAt ไม่ออก', on({ methodChangedAt: T0, surveyedAt: 'เมื่อวาน' }), true],
    ['อ่าน methodChangedAt ไม่ออก', on({ methodChangedAt: 'ไม่ใช่เวลา', surveyedAt: T1 }), true],
    ['row เป็น null', null, false],
  ];
  for (const [name, row, want] of cases) assert.equal(surveyZoneNeedsResave(row), want, name);
});

/* 🪤 PostgREST คืน `+00:00` ส่วน `toISOString()` คืน `Z` — เทียบเป็นสตริงจะตอบผิดเงียบ ๆ */
test('🪤 surveyZoneNeedsResave: เทียบเป็นเวลาจริง ไม่ใช่สตริง (Z · +00:00 · +07:00 · ไมโครวินาที)', () => {
  const cases = [
    ['หลังสลับ 1 วินาที · Z กับ +00:00', '2026-10-09T03:00:01Z', '2026-10-09T03:00:00+00:00', false],
    ['หลังสลับ 1 วินาที · +00:00 กับ Z', '2026-10-09T03:00:01+00:00', '2026-10-09T03:00:00Z', false],
    ['ชั่วขณะเดียวกันคนละรูป', '2026-10-09T03:00:00Z', '2026-10-09T03:00:00+00:00', true],
    ['ชั่วขณะเดียวกัน · เวลาไทยกับ UTC', '2026-10-09T10:00:00+07:00', '2026-10-09T03:00:00Z', true],
    /* สตริง "10:00" มากกว่า "04:00" แต่เวลาจริง 10:00+07 = 03:00Z อยู่ **ก่อน** 04:00Z */
    ['สตริงใหญ่กว่าแต่เวลาจริงมาก่อน', '2026-10-09T10:00:00+07:00', '2026-10-09T04:00:00Z', true],
    ['สตริงเล็กกว่าแต่เวลาจริงมาหลัง', '2026-10-09T03:30:00Z', '2026-10-09T10:00:00+07:00', false],
    ['ไมโครวินาทีแบบ PostgREST · หลังสลับ', '2026-10-09T03:00:00.250000+00:00', '2026-10-09T03:00:00.100000+00:00', false],
    ['ไมโครวินาทีแบบ PostgREST · ก่อนสลับ', '2026-10-09T03:00:00.100000+00:00', '2026-10-09T03:00:00.250000+00:00', true],
  ];
  for (const [name, surveyedAt, methodChangedAt, want] of cases) {
    assert.equal(surveyZoneNeedsResave(on({ surveyedAt, methodChangedAt })), want, name);
  }
});

test('surveyZoneNeedsResave: แถวจากแบบไม่ค้างบันทึกใหม่ ไม่ว่าเวลาจะเป็นอย่างไร', () => {
  for (const over of [
    { methodChangedAt: T0, surveyedAt: null },
    { methodChangedAt: T1, surveyedAt: T0 },
    { methodChangedAt: T0, surveyedAt: T0 },
    { methodChangedAt: 'ไม่ใช่เวลา', surveyedAt: T0 },
  ]) {
    assert.equal(surveyZoneNeedsResave(dw(over)), false, JSON.stringify(over));
  }
});

/* ── 7) surveyDrawingAssessor — ใครคือผู้ประเมินของพื้นที่จากแบบ ─────────────── */
const sentBy = { answeredByName: 'หัวหน้า ส่งผล', answeredAt: '2026-10-09T09:00:00Z' };

test('🔑 surveyDrawingAssessor: ไล่ ① คนบันทึกหลังเป็นจากแบบ → ② คนสลับ → ③ คนส่งผล', () => {
  const cases = [
    ['① เกิดมาเป็นจากแบบ · บันทึกแล้ว',
      dw({ methodChangedAt: null, surveyedAt: T0, surveyedByName: 'หัวหน้า ก', methodChangedByName: null }), sentBy,
      { name: 'หัวหน้า ก', at: T0 }],
    ['① เกิดมาเป็นจากแบบ · ไม่มีคีย์ methodChangedAt',
      dw({ surveyedAt: T0, surveyedByName: 'หัวหน้า ก' }), null,
      { name: 'หัวหน้า ก', at: T0 }],
    ['③ เกิดมาเป็นจากแบบ · ยังไม่เคยบันทึก',
      dw({ methodChangedAt: null, surveyedAt: null, surveyedByName: null }), sentBy,
      { name: 'หัวหน้า ส่งผล', at: '2026-10-09T09:00:00Z' }],
    ['① สลับแล้วบันทึกทีหลัง',
      dw({ methodChangedAt: T0, methodChangedByName: 'หัวหน้า ข', surveyedAt: T1, surveyedByName: 'หัวหน้า ก' }), sentBy,
      { name: 'หัวหน้า ก', at: T1 }],
    ['② สลับแล้วยังไม่บันทึก',
      dw({ methodChangedAt: T0, methodChangedByName: 'หัวหน้า ข', surveyedAt: null, surveyedByName: null }), sentBy,
      { name: 'หัวหน้า ข', at: T0 }],
    /* 🔴 ช่างวัดไว้ตอนยังเป็นลงหน้างาน แล้วหัวหน้าสลับเป็นจากแบบ — ชื่อช่างต้องไม่ขึ้นเป็นผู้ประเมินจากแบบ */
    ['② บันทึกไว้ก่อนสลับ (ชื่อช่างหน้างาน)',
      dw({ methodChangedAt: T1, methodChangedByName: 'หัวหน้า ข', surveyedAt: T0, surveyedByName: 'ช่าง ค' }), sentBy,
      { name: 'หัวหน้า ข', at: T1 }],
    ['② เวลาเท่ากันพอดี = ยังไม่นับว่าบันทึกหลังสลับ',
      dw({ methodChangedAt: T0, methodChangedByName: 'หัวหน้า ข', surveyedAt: T0, surveyedByName: 'ช่าง ค' }), sentBy,
      { name: 'หัวหน้า ข', at: T0 }],
    ['② บันทึกหลังสลับแต่ไม่มีชื่อคนบันทึก',
      dw({ methodChangedAt: T0, methodChangedByName: 'หัวหน้า ข', surveyedAt: T1, surveyedByName: '   ' }), sentBy,
      { name: 'หัวหน้า ข', at: T0 }],
    ['② อ่านเวลาไม่ออก = พิสูจน์ไม่ได้ว่าบันทึกหลังสลับ',
      dw({ methodChangedAt: 'ไม่ใช่เวลา', methodChangedByName: 'หัวหน้า ข', surveyedAt: T1, surveyedByName: 'ช่าง ค' }), sentBy,
      { name: 'หัวหน้า ข', at: 'ไม่ใช่เวลา' }],
    ['③ บันทึกไว้ก่อนสลับ และไม่มีชื่อคนสลับ',
      dw({ methodChangedAt: T1, methodChangedByName: '', surveyedAt: T0, surveyedByName: 'ช่าง ค' }), sentBy,
      { name: 'หัวหน้า ส่งผล', at: '2026-10-09T09:00:00Z' }],
    ['③ ส่งผลแล้วแต่ไม่มีเวลา',
      dw(), { answeredByName: 'หัวหน้า ส่งผล' },
      { name: 'หัวหน้า ส่งผล', at: null }],
    ['ไม่มีชื่อใครเลย', dw(), { answeredByName: null, answeredAt: null }, { name: null, at: null }],
    ['ไม่มีชื่อใครเลย · request null', dw(), null, { name: null, at: null }],
    ['ไม่มีชื่อใครเลย · ไม่ส่ง request', dw(), undefined, { name: null, at: null }],
  ];
  for (const [name, row, request, want] of cases) {
    assert.deepEqual(surveyDrawingAssessor(row, request), want, name);
  }
  assert.deepEqual(surveyDrawingAssessor(dw()), { name: null, at: null }, 'เรียกด้วยอาร์กิวเมนต์เดียว');
});

test('surveyDrawingAssessor: ตัดช่องว่างหัวท้ายของชื่อทุกทาง', () => {
  assert.equal(surveyDrawingAssessor(dw({ surveyedAt: T0, surveyedByName: '  หัวหน้า ก ' })).name, 'หัวหน้า ก');
  assert.equal(surveyDrawingAssessor(dw({ methodChangedAt: T0, methodChangedByName: ' หัวหน้า ข  ' })).name, 'หัวหน้า ข');
  assert.equal(surveyDrawingAssessor(dw(), { answeredByName: '\tหัวหน้า ส่งผล\n' }).name, 'หัวหน้า ส่งผล');
});

/* ผลลัพธ์ต้องเทียบเวลาแบบเดียวกับด่านบันทึกใหม่ — ไม่ใช่เทียบสตริง */
test('🪤 surveyDrawingAssessor: "บันทึกหลังสลับ" เทียบเป็นเวลาจริง', () => {
  const row = dw({
    methodChangedAt: '2026-10-09T04:00:00Z', methodChangedByName: 'หัวหน้า ข',
    surveyedAt: '2026-10-09T10:00:00+07:00', surveyedByName: 'ช่าง ค',   // = 03:00Z ก่อนสลับ
  });
  assert.equal(surveyDrawingAssessor(row).name, 'หัวหน้า ข');
  const after = { ...row, surveyedAt: '2026-10-09T11:30:00+07:00', surveyedByName: 'หัวหน้า ก' };   // = 04:30Z
  assert.deepEqual(surveyDrawingAssessor(after), { name: 'หัวหน้า ก', at: '2026-10-09T11:30:00+07:00' });
});

test('surveyDrawingAssessor: แถวลงหน้างานไม่มีผู้ประเมินจากแบบ (null) แม้มีชื่อครบ', () => {
  const names = { surveyedAt: T1, surveyedByName: 'ช่าง ค', methodChangedAt: T0, methodChangedByName: 'หัวหน้า ข' };
  for (const row of [on(names), old(names), on({ ...names, method: null }), null, undefined]) {
    assert.equal(surveyDrawingAssessor(row, sentBy), null, JSON.stringify(row));
  }
});

/* ── 8) isJpgOrPngFile — ภาพแบบที่ลงกระดาษได้ต้องเป็น JPG/PNG เท่านั้น ────────── */
test('🔑 isJpgOrPngFile: มี mimeType = ตัดสินจาก mimeType · ไม่มีค่อยดูนามสกุล', () => {
  const cases = [
    ['jpeg', { mimeType: 'image/jpeg', fileName: 'a.jpg' }, true],
    ['png', { mimeType: 'image/png', fileName: 'a.png' }, true],
    ['mime ตัวพิมพ์ใหญ่', { mimeType: 'IMAGE/JPEG', fileName: 'a' }, true],
    ['mime มีช่องว่างหัวท้าย', { mimeType: ' image/png ', fileName: 'a' }, true],
    ['mime ชนะนามสกุล — pdf ที่ตั้งชื่อ .jpg', { mimeType: 'application/pdf', fileName: 'plan.jpg' }, false],
    ['mime ชนะนามสกุล — tiff ที่ตั้งชื่อ .png', { mimeType: 'image/tiff', fileName: 'plan.png' }, false],
    ['mime ชนะนามสกุล — png ที่ตั้งชื่อ .pdf', { mimeType: 'image/png', fileName: 'plan.pdf' }, true],
    ['tiff', { mimeType: 'image/tiff', fileName: 'plan.tif' }, false],
    ['pdf', { mimeType: 'application/pdf', fileName: 'plan.pdf' }, false],
    ['heic', { mimeType: 'image/heic', fileName: 'IMG_1.HEIC' }, false],
    ['heif', { mimeType: 'image/heif', fileName: 'IMG_1.heif' }, false],
    ['bmp', { mimeType: 'image/bmp', fileName: 'a.bmp' }, false],
    ['webp', { mimeType: 'image/webp', fileName: 'a.webp' }, false],
    ['gif', { mimeType: 'image/gif', fileName: 'a.gif' }, false],
    ['ชื่ออย่างเดียว .JPG', { fileName: 'IMG_0001.JPG' }, true],
    ['ชื่ออย่างเดียว .jpeg', { mimeType: '', fileName: 'ผังชั้น 2.jpeg' }, true],
    ['ชื่ออย่างเดียว .PNG', { mimeType: null, fileName: 'plan.v2.PNG' }, true],
    ['ชื่ออย่างเดียว .tif', { fileName: 'plan.tif' }, false],
    ['ชื่ออย่างเดียว .tiff', { fileName: 'plan.tiff' }, false],
    ['ชื่ออย่างเดียว .pdf', { fileName: 'plan.pdf' }, false],
    ['ชื่ออย่างเดียว .heic', { fileName: 'IMG_1.heic' }, false],
    ['นามสกุลอยู่กลางชื่อ', { fileName: 'plan.jpg.pdf' }, false],
    ['ไม่มีจุด — ชื่อไฟล์ว่า png', { fileName: 'png' }, false],
    ['ไม่มีนามสกุล', { fileName: 'plan' }, false],
    ['ออบเจ็กต์ว่าง', {}, false],
    ['null', null, false],
    ['undefined', undefined, false],
  ];
  for (const [name, file, want] of cases) assert.equal(isJpgOrPngFile(file), want, name);
});

/* ── 8a) surveyConfirmState — สภาพ "ยืนยันหน้างาน" ของพื้นที่ในทะเบียน (งวด S2a) ─────────────── */
test('surveyConfirmState: แถวลงหน้างาน / ไม่มีแถว = none · แถวจากแบบดูคำตอบบนใบของมัน', () => {
  const cases = [
    ['ไม่มีแถว', null, { surveyConfirm: 'needed' }, 'none'],
    ['undefined', undefined, null, 'none'],
    ['ลงหน้างาน + needed (ค่าบนใบไม่เกี่ยวกับแถวลงหน้างาน)', on(), { surveyConfirm: 'needed' }, 'none'],
    ['แถวเก่าไม่มีคีย์ method + needed', old(), { surveyConfirm: 'needed' }, 'none'],
    ['จากแบบ + needed', dw(), { surveyConfirm: 'needed' }, 'awaiting'],
    ['จากแบบ + not_needed', dw(), { surveyConfirm: 'not_needed' }, 'drawing'],
    ['จากแบบ + ยังไม่ได้เลือก', dw(), { surveyConfirm: null }, 'drawing'],
    ['จากแบบ + ใบไม่มีคีย์', dw(), {}, 'drawing'],
    ['จากแบบ + ไม่มีใบ', dw(), null, 'drawing'],
    ['จากแบบ + ไม่ส่งใบมา', dw(), undefined, 'drawing'],
    ['จากแบบ + ค่าที่ไม่รู้จัก', dw(), { surveyConfirm: 'Needed' }, 'drawing'],
  ];
  for (const [name, row, request, want] of cases) assert.equal(surveyConfirmState(row, request), want, name);
  assert.equal(surveyConfirmState(dw()), 'drawing', 'อาร์กิวเมนต์ที่สองไม่บังคับ');
});

/* ── 8b) surveyDropSupersededDrawing — ผลจากแบบที่ถูกผลลงหน้างานรุ่นหลังแทนแล้ว ─────────────── */
test('surveyDropSupersededDrawing: ทิ้งแถวจากแบบเฉพาะเมื่อมีแถวลงหน้างานของใบที่ **เปิดทีหลัง**', () => {
  const at = { R1: '2026-10-01T03:00:00.000Z', R2: '2026-10-05T03:00:00+00:00', R3: '2026-10-09T03:00:00.000Z' };
  const createdAtOf = (row) => at[row.requestId];
  const d1 = dw({ id: 'D1', requestId: 'R1' });
  const d2 = dw({ id: 'D2', requestId: 'R2' });
  const d3 = dw({ id: 'D3', requestId: 'R3' });
  const o1 = on({ id: 'O1', requestId: 'R1' });
  const o2 = on({ id: 'O2', requestId: 'R2' });
  const o3 = on({ id: 'O3', requestId: 'R3' });
  const l2 = old({ id: 'L2', requestId: 'R2' });
  const noTime = on({ id: 'O9', requestId: 'R9' });
  const dNoTime = dw({ id: 'D9', requestId: 'R9' });
  const cases = [
    ['จากแบบ แล้วลงหน้างานทีหลัง → ทิ้งแถวจากแบบ', [d1, o2], [o2]],
    ['ลำดับในลิสต์ไม่เกี่ยว ดูเวลาของใบ', [o2, d1], [o2]],
    ['จากแบบที่เปิด **หลัง** ลงหน้างาน (ปรับปรุงพื้นที่) → อยู่ครบ', [o1, d2], [o1, d2]],
    ['จากแบบสองแถว ไม่มีลงหน้างาน → อยู่ครบ', [d1, d2], [d1, d2]],
    ['ลงหน้างานในใบเดียวกัน → อยู่ครบ', [d1, o1], [d1, o1]],
    ['อ่านเวลาของแถวลงหน้างานไม่ออก → อยู่ครบ', [d1, noTime], [d1, noTime]],
    ['อ่านเวลาของแถวจากแบบไม่ออก → อยู่ครบ', [dNoTime, o3], [dNoTime, o3]],
    ['รูปเวลาคนละแบบ (…Z กับ …+00:00) เทียบเป็นเวลา ไม่ใช่สตริง', [d2, o3, d3], [o3, d3]],
    ['แถวเก่าไม่มีคีย์ method นับเป็นลงหน้างาน', [d1, l2], [l2]],
    ['หลายแถว: ทิ้งเฉพาะตัวที่ถูกแทน ลำดับเดิม', [d1, o2, d3, o1], [o2, d3, o1]],
  ];
  for (const [name, rows, want] of cases) {
    const got = surveyDropSupersededDrawing(rows, { createdAtOf });
    assert.equal(got.length, want.length, name);
    want.forEach((row, i) => assert.equal(got[i], row, `${name} — ต้องเป็นออบเจ็กต์ตัวเดิม ตำแหน่ง ${i}`));
  }
  // 🐞 เทียบสตริงตรง ๆ จะได้ "…+00:00" < "…Z" ผิด ๆ ถูก ๆ — ชั่วขณะเดียวกันสองรูปต้องนับว่า "ไม่ได้มาทีหลัง"
  const same = { A: '2026-10-05T03:00:00.000Z', B: '2026-10-05T03:00:00+00:00' };
  const dA = dw({ id: 'DA', requestId: 'A' });
  const oB = on({ id: 'OB', requestId: 'B' });
  assert.deepEqual(surveyDropSupersededDrawing([dA, oB], { createdAtOf: (r) => same[r.requestId] }), [dA, oB]);
});

test('surveyDropSupersededDrawing: ไม่มีอะไรให้ทิ้ง = คืนอาร์เรย์ตัวเดิม (ใบลงหน้างานล้วนไม่ถูกแตะ)', () => {
  const createdAtOf = () => '2026-10-01T03:00:00.000Z';
  const onsiteOnly = [on({ id: 'O1' }), old({ id: 'L1' })];
  assert.equal(surveyDropSupersededDrawing(onsiteOnly, { createdAtOf }), onsiteOnly, 'ไม่มีแถวจากแบบ');
  const mixed = [dw({ id: 'D1' }), on({ id: 'O1' })];
  assert.equal(surveyDropSupersededDrawing(mixed), mixed, 'ไม่ส่งตัวเลือกมา');
  assert.equal(surveyDropSupersededDrawing(mixed, {}), mixed, 'ไม่ส่ง createdAtOf');
  assert.equal(surveyDropSupersededDrawing(mixed, { createdAtOf: 'x' }), mixed, 'createdAtOf ไม่ใช่ฟังก์ชัน');
  const empty = [];
  assert.equal(surveyDropSupersededDrawing(empty, { createdAtOf }), empty);
  assert.deepEqual(surveyDropSupersededDrawing(null, { createdAtOf }), []);
});

/* ── 9) ยามซอร์ส — โมดูลใบ ห้ามดึงโมดูลอื่น ────────────────────────────────── */
/* 🔴 `attachmentTypes.js` ดึง `survey.js` และ `survey.js` จะดึงไฟล์นี้ ⇒ ไฟล์นี้ดึงใครเข้ามาเมื่อไร = วงกลม
   ⚠️ เทียบทั้งไฟล์รวมคอมเมนต์ (ไม่ต้องมีตัวลอกคอมเมนต์ให้พลาด) ⇒ คอมเมนต์ในไฟล์ก็ห้ามใช้สองคำนี้ */
test('🔴 surveyMethod.js ต้องไม่ดึงโมดูลอื่นเข้ามาเลย', () => {
  const src = readFileSync(new URL('./surveyMethod.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bimport\b/, 'โมดูลใบ: ห้ามมีคำว่า import ทั้งแบบประกาศและแบบเรียก');
  assert.doesNotMatch(src, /\brequire\s*\(/, 'โมดูลใบ: ห้าม require(');
});

/* กลุ่มอื่นของ S1 เขียนโค้ดชนชื่อพวกนี้ — ชื่อหาย = build พังทั้งกลุ่มโดยเทสต์ของไฟล์นี้ยังเขียว */
test('ชื่อที่ส่งออกครบตามสเปค S1 §2', () => {
  const fns = [
    'zoneMethod', 'isDrawingZone', 'surveyMethodMix', 'surveyNeedsVisit', 'surveyNewZoneMethod',
    'surveyZoneChangeFlips', 'surveyZoneNeedsResave', 'surveyDrawingAssessor', 'isJpgOrPngFile',
    // งวด S2a §2.1
    'surveyConfirmState', 'surveyDropSupersededDrawing',
  ];
  for (const name of fns) assert.equal(typeof leaf[name], 'function', name);
  assert.equal(typeof leaf.SURVEY_METHOD_ONSITE, 'string');
  assert.equal(typeof leaf.SURVEY_METHOD_DRAWING, 'string');
});
