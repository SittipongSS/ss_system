import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPublishableChangeNote,
  holidayCalendarStatusLabel,
  isValidHolidayDate,
  normalizeHolidayEntries,
  parseHolidayLines,
} from './holidayCalendar';

test('holiday calendar rejects malformed and impossible dates', () => {
  assert.equal(isValidHolidayDate('2027-01-01'), true);
  assert.equal(isValidHolidayDate('2027-1-1'), false);
  assert.equal(isValidHolidayDate('2026-02-30'), false);
  assert.equal(isValidHolidayDate(''), false);
});

test('holiday calendar normalize sorts, trims and rejects duplicates', () => {
  const { value, errors } = normalizeHolidayEntries([
    { date: '2027-04-14', name: ' วันสงกรานต์ ' },
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2027-04-14', name: 'ซ้ำ' },
    { date: 'ไม่ใช่วันที่', name: 'x' },
  ]);
  assert.deepEqual(value.map((entry) => entry.date), ['2027-01-01', '2027-04-14']);
  assert.equal(value[1].name, 'วันสงกรานต์');
  assert.ok(errors.some((message) => message.includes('ซ้ำ')));
  assert.ok(errors.some((message) => message.includes('ไม่ถูกต้อง')));
});

test('holiday calendar bulk paste parses a new-year set line by line', () => {
  const { entries, errors } = parseHolidayLines(
    '2027-01-01 วันขึ้นปีใหม่\n\n2027-04-13 วันสงกรานต์\nabc วันผิด',
  );
  assert.deepEqual(entries, [
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2027-04-13', name: 'วันสงกรานต์' },
  ]);
  assert.equal(errors.length, 1);
});

test('holiday calendar lifecycle labels and publish gate', () => {
  assert.equal(holidayCalendarStatusLabel('published'), 'เผยแพร่แล้ว');
  assert.equal(holidayCalendarStatusLabel('draft'), 'ฉบับร่าง');
  assert.equal(hasPublishableChangeNote({ changeNote: '  ' }), false);
  assert.equal(hasPublishableChangeNote({ changeNote: 'เพิ่มวันหยุดปี 2027' }), true);
});
