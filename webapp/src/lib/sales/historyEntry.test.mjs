import test from 'node:test';
import assert from 'node:assert/strict';
import {
  historyYearOptions,
  isMonthEditable,
  monthsSum,
  resolveYearTotal,
} from './historyEntry.js';

const JULY_2026 = new Date('2026-07-26T10:00:00+07:00');

test('ตัวเลือกปีต้องมีปีปัจจุบันเป็นตัวแรก — เดือนต้นปีนี้ก็ต้องกรอกย้อนหลังได้', () => {
  assert.deepEqual(historyYearOptions(JULY_2026), ['2026', '2025', '2024', '2023']);
});

test('เดือนที่ยังมาไม่ถึงกรอกไม่ได้ ส่วนปีก่อนกรอกได้ทุกเดือน', () => {
  // ก.ค. 2026 = index 6 → ม.ค.–ก.ค. กรอกได้ ส่วน ส.ค. เป็นต้นไปยังไม่เกิดขึ้น
  assert.equal(isMonthEditable('2026', 0, JULY_2026), true);
  assert.equal(isMonthEditable('2026', 6, JULY_2026), true);
  assert.equal(isMonthEditable('2026', 7, JULY_2026), false);
  assert.equal(isMonthEditable('2026', 11, JULY_2026), false);

  for (let mi = 0; mi < 12; mi += 1) assert.equal(isMonthEditable('2025', mi, JULY_2026), true, `2025-${mi}`);

  assert.equal(isMonthEditable('2027', 0, JULY_2026), false);
  assert.equal(isMonthEditable('ไม่ใช่ปี', 0, JULY_2026), false);
  assert.equal(isMonthEditable('2025', 12, JULY_2026), false);
});

test('ผลรวมรายเดือนข้ามช่องว่างและค่าที่ไม่ใช่ตัวเลข', () => {
  assert.equal(monthsSum(['', 100, null, 250, undefined, 'x']), 350);
  assert.equal(monthsSum([]), 0);
});

test('ยอดรวมทั้งปีตามผลรวมรายเดือนจนกว่าผู้ใช้จะแตะช่องเอง', () => {
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: null }), { total: 300, mismatch: false });
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: '' }), { total: 300, mismatch: false });
  // แตะแล้ว = คนคุมเอง ห้ามเขียนทับ
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: 500 }), { total: 500, mismatch: true });
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: 300 }), { total: 300, mismatch: false });
});

test('ปีที่รู้แค่ยอดรวม (ไม่มีรายเดือน) ต้องไม่ขึ้นเตือนว่าไม่ตรง', () => {
  assert.deepEqual(resolveYearTotal({ months: [], override: 1200000 }), { total: 1200000, mismatch: false });
});
