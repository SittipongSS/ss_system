// Tests รหัสเอนทิตี DL/PJ (mig 0096). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { ymKey, entityCodeDisplay } from './entityCode.js';

test('ymKey: YYMM จากปี ค.ศ. 2 หลัก', () => {
  assert.equal(ymKey(new Date('2026-07-14T09:00:00+07:00')), '2607'); // ก.ค. 2026
  assert.equal(ymKey(new Date('2026-01-01T09:00:00+07:00')), '2601'); // ม.ค.
  assert.equal(ymKey(new Date('2025-12-31T09:00:00+07:00')), '2512'); // ธ.ค.
});

// รอยต่อเดือน: นับตามเวลาไทย ไม่ใช่ timezone ของเครื่องที่รัน — วินาทีเดียวกันนี้ที่ UTC
// ยังเป็นเดือนก่อน ถ้าอ่านเดือนจาก Date ตรง ๆ ดีล/โครงการจะตกไปอยู่เดือนเก่า
// ขณะที่ใบเสนอราคา (businessMonthKey อยู่แล้ว) ขึ้นเดือนใหม่
test('ymKey: ข้ามเดือนตามเวลาไทย ไม่ใช่ UTC', () => {
  assert.equal(ymKey(new Date('2026-08-01T00:30:00+07:00')), '2608'); // = 2026-07-31T17:30Z
  assert.equal(ymKey(new Date('2026-07-31T23:59:00+07:00')), '2607'); // = 2026-07-31T16:59Z
  assert.equal(ymKey(new Date('2027-01-01T06:00:00+07:00')), '2701'); // ข้ามปีด้วย
});

test('entityCodeDisplay: ฐาน + "-" + revision (เริ่ม 0)', () => {
  assert.equal(entityCodeDisplay('DL-26070001', 0), 'DL-26070001-0');
  assert.equal(entityCodeDisplay('PJ-26070001', 2), 'PJ-26070001-2');
  assert.equal(entityCodeDisplay('DL-26070001', null), 'DL-26070001-0'); // null → 0 (ดีลไม่ revise)
  assert.equal(entityCodeDisplay('DL-26070001', undefined), 'DL-26070001-0');
  assert.equal(entityCodeDisplay('PJ-26070001'), 'PJ-26070001-0');
});

test('entityCodeDisplay: ไม่มีรหัส → "-"', () => {
  assert.equal(entityCodeDisplay(null, 0), '-');
  assert.equal(entityCodeDisplay('', 3), '-');
  assert.equal(entityCodeDisplay(undefined), '-');
});
