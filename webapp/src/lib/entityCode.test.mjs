// Tests รหัสเอนทิตี DL/PJ (mig 0096). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { ymKey, entityCodeDisplay } from './entityCode.js';

test('ymKey: YYMM จากปี ค.ศ. 2 หลัก', () => {
  assert.equal(ymKey(new Date(2026, 6, 14)), '2607'); // ก.ค. 2026
  assert.equal(ymKey(new Date(2026, 0, 1)), '2601');  // ม.ค.
  assert.equal(ymKey(new Date(2025, 11, 31)), '2512'); // ธ.ค.
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
