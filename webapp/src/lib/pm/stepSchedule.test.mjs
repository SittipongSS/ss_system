import test from 'node:test';
import assert from 'node:assert/strict';

import { setHolidays } from './dateHelpers.js';
import { computeFinish, durationFromDates, syncStepForm } from './stepSchedule.js';

setHolidays([]); // เทสต์นี้สนใจเสาร์-อาทิตย์อย่างเดียว ไม่ปนวันหยุดประจำปี

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

test('computeFinish นับเฉพาะวันทำการ และนับรวมวันเริ่ม', () => {
  // จันทร์ 2026-07-13 + 1 วันทำการ = วันเดียวกัน
  assert.equal(iso(computeFinish('2026-07-13', 1)), '2026-07-13');
  // จันทร์ + 5 วันทำการ = ศุกร์
  assert.equal(iso(computeFinish('2026-07-13', 5)), '2026-07-17');
  // จันทร์ + 6 วันทำการ ต้องข้ามเสาร์-อาทิตย์ ไปจันทร์ถัดไป
  assert.equal(iso(computeFinish('2026-07-13', 6)), '2026-07-20');
});

test('computeFinish เลื่อนวันเริ่มที่ตกวันหยุดมาเป็นวันทำการก่อน', () => {
  // เสาร์ 2026-07-18 → เริ่มจริงจันทร์ 20
  assert.equal(iso(computeFinish('2026-07-18', 1)), '2026-07-20');
});

test('computeFinish คืน null เมื่อไม่มีวันเริ่ม/วันเริ่มผิดรูป', () => {
  assert.equal(computeFinish('', 3), null);
  assert.equal(computeFinish('ไม่ใช่วันที่', 3), null);
});

test('durationFromDates เป็นผกผันของ computeFinish', () => {
  assert.equal(durationFromDates('2026-07-13', '2026-07-17'), 5);
  assert.equal(durationFromDates('2026-07-13', '2026-07-20'), 6); // ข้ามสุดสัปดาห์
});

test('durationFromDates คืน 1 เมื่อข้อมูลไม่พอหรือวันจบมาก่อนวันเริ่ม', () => {
  assert.equal(durationFromDates('', '2026-07-17'), 1);
  assert.equal(durationFromDates('2026-07-17', ''), 1);
  assert.equal(durationFromDates('2026-07-17', '2026-07-13'), 1);
});

test('syncStepForm: แก้วันสิ้นสุด → คำนวณจำนวนวัน แล้ว snap วันสิ้นสุดเป็นวันทำการ', () => {
  const next = syncStepForm({ startDate: '2026-07-13', finishDate: '2026-07-17', durationDays: 5 }, { finishDate: '2026-07-19' });
  // 19 = อาทิตย์ → ระยะเวลาเท่ากับถึงศุกร์ 17 แล้ว snap วันจบกลับมาเป็นวันทำการ
  assert.equal(next.durationDays, 5);
  assert.equal(next.finishDate, '2026-07-17');
});

test('syncStepForm: แก้วันเริ่ม → คำนวณวันสิ้นสุดใหม่จากจำนวนวันเดิม', () => {
  const next = syncStepForm({ startDate: '2026-07-13', finishDate: '2026-07-17', durationDays: 5 }, { startDate: '2026-07-14' });
  assert.equal(next.durationDays, 5);
  assert.equal(next.finishDate, '2026-07-20'); // อังคาร + 5 วันทำการ = จันทร์ถัดไป
});

test('syncStepForm: ไม่มีวันเริ่ม → ล้างวันสิ้นสุด (ขั้นตอนอิงงานที่รออยู่)', () => {
  const next = syncStepForm({ startDate: '2026-07-13', finishDate: '2026-07-17', durationDays: 5 }, { startDate: '' });
  assert.equal(next.finishDate, '');
});

test('syncStepForm: กรอกวันสิ้นสุดทั้งที่ยังไม่มีวันเริ่ม → ไม่คำนวณมั่ว ปล่อยค่าตามที่กรอก', () => {
  const next = syncStepForm({ startDate: '', finishDate: '', durationDays: 1 }, { finishDate: '2026-07-17' });
  assert.equal(next.finishDate, '2026-07-17');
  assert.equal(next.durationDays, 1);
});

test('syncStepForm ไม่แก้ของเดิม (pure)', () => {
  const form = { startDate: '2026-07-13', finishDate: '2026-07-17', durationDays: 5, name: 'ทดสอบ' };
  const next = syncStepForm(form, { durationDays: 3 });
  assert.equal(form.finishDate, '2026-07-17');
  assert.equal(next.finishDate, '2026-07-15');
  assert.equal(next.name, 'ทดสอบ'); // ฟิลด์อื่นติดมาครบ
});
