import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultHolidayYear,
  hasHolidaysForYear,
  holidayYearCounts,
  holidayYears,
  missingHolidayYears,
} from './holidayCoverage.js';

const holidays2026 = [
  { date: '2026-01-01', name: 'ปีใหม่' },
  { date: '2026-04-13', name: 'สงกรานต์' },
  { date: '2026-12-31', name: 'สิ้นปี' },
];

test('นับวันหยุดแยกตามปี และข้ามแถวที่วันที่เพี้ยน', () => {
  const counts = holidayYearCounts([...holidays2026, { date: '' }, { date: 'ไม่ใช่วันที่' }, null]);
  assert.equal(counts.get('2026'), 3);
  assert.equal(counts.size, 1);
  assert.equal(hasHolidaysForYear(holidays2026, 2026), true);
  assert.equal(hasHolidaysForYear(holidays2026, 2027), false);
});

test('รายชื่อปีที่มีข้อมูล เรียงปีล่าสุดก่อน', () => {
  const holidays = [...holidays2026, { date: '2025-12-05' }, { date: '2027-01-01' }];
  assert.deepEqual(holidayYears(holidays), ['2027', '2026', '2025']);
  assert.deepEqual(holidayYears([]), []);
});

test('ปีตั้งต้นของแท็บรายการ = ปีปัจจุบันเมื่อมีข้อมูล', () => {
  const holidays = [...holidays2026, { date: '2025-12-05' }];
  assert.equal(defaultHolidayYear(holidays, new Date('2026-07-25T00:00:00')), '2026');
});

test('ปีตั้งต้น: ปีปัจจุบันยังไม่มีข้อมูล → ถอยไปปีล่าสุดที่มี ไม่ใช่โชว์ปีว่าง', () => {
  const holidays = [{ date: '2025-12-05' }, { date: '2024-01-01' }];
  assert.equal(defaultHolidayYear(holidays, new Date('2026-07-25T00:00:00')), '2025');
  assert.equal(defaultHolidayYear([], new Date('2026-07-25T00:00:00')), null);
});

test('ปีหน้ามีข้อมูลแล้ว → ไม่เตือน แม้อยู่ปลายปี', () => {
  const holidays = [...holidays2026, { date: '2027-01-01', name: 'ปีใหม่' }];
  assert.deepEqual(missingHolidayYears(holidays, new Date('2026-12-15T00:00:00')), []);
});

test('ปีหน้าว่างแต่ยังไม่ถึงไตรมาส 4 → ไม่เตือน (กันเสียงรบกวนทั้งปี)', () => {
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-07-25T00:00:00')), []);
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-09-30T00:00:00')), []);
});

test('ปีหน้าว่างและเข้าไตรมาส 4 แล้ว → เตือนปีหน้า', () => {
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-10-01T00:00:00')), [2027]);
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-12-31T00:00:00')), [2027]);
});

test('เลื่อนปฏิทินไปดูปีที่ว่าง → เตือนปีนั้นทันที ไม่ต้องรอไตรมาส 4', () => {
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-02-01T00:00:00'), 2027), [2027]);
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-02-01T00:00:00'), 2029), [2029]);
  // ปีที่กำลังดูมีข้อมูลอยู่แล้ว → เงียบ
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-02-01T00:00:00'), 2026), []);
});

test('ปีอดีตที่ว่างไม่ต้องเตือน — แก้ย้อนหลังไม่ได้และไม่กระทบไทม์ไลน์ข้างหน้า', () => {
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-11-01T00:00:00'), 2024), [2027]);
});

test('ไม่ซ้ำเมื่อไตรมาส 4 ชนกับปีที่กำลังดู', () => {
  assert.deepEqual(missingHolidayYears(holidays2026, new Date('2026-11-01T00:00:00'), 2027), [2027]);
});

test('ตารางว่างทั้งหมด → ไม่เตือน ปล่อยให้ empty state พูดแทน', () => {
  assert.deepEqual(missingHolidayYears([], new Date('2026-12-01T00:00:00')), []);
  assert.deepEqual(missingHolidayYears([], new Date('2026-12-01T00:00:00'), 2027), []);
});
