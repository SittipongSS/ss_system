// ── ชิปทางลัดของ `DayRangePicker` — "สัปดาห์นี้/สัปดาห์ก่อน" (มติเจ้าของ 26/09 สัปดาห์เริ่มวันอาทิตย์) ──
//
// ⭐ ชิปนี้ป้อนช่วงวันให้รายงานยอดขาย/ลีด/ดีล (+ Excel) ผ่าน ReportPeriodControl ⇒ ต้นสัปดาห์ผิดวันเดียว
//    = ตัวเลขรายงานเลื่อนทั้งก้อนโดยไม่มีอะไรฟ้อง · ไฟล์นี้ล็อกด้วยวันเข้า → วันออก ไม่ใช่ regex ของซอร์ส
// ⚠️ repo ไม่มีตัวเรนเดอร์ React ในเทสต์ (ไฟล์เป็น JSX import ตรงไม่ได้) ⇒ ตัดฟังก์ชันจริงออกจากไฟล์
//    แล้วรันกับ helper จริงของ lib/datePeriods — แพตเทิร์นเดียวกับ serviceVisitModalQueue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDays, dayOfWeek, daysInRange, lastDayOfMonth, weekRange, weekStartOf } from '../../lib/datePeriods.js';

function loadPicker() {
  const src = readFileSync(new URL('./DayRangePicker.js', import.meta.url), 'utf8');
  const pick = (re, name) => {
    const m = src.match(re);
    assert.ok(m, `หา ${name} ใน DayRangePicker.js ไม่เจอ`);
    return m[0].replace(/^export /, '');
  };
  const parts = [
    pick(/const DAYS_TH = \[[^\]]*\];/, 'DAYS_TH'),
    pick(/const monthOf = [^\n]*;/, 'monthOf'),
    pick(/const startOfMonth = [^\n]*;/, 'startOfMonth'),
    pick(/function cellsOfMonth\(month\) \{[\s\S]*?\n\}/, 'cellsOfMonth'),
    pick(/export function quickRanges\(today\) \{[\s\S]*?\n\}/, 'quickRanges'),
  ];
  return new Function(
    'addDays', 'weekStartOf', 'weekRange', 'daysInRange', 'lastDayOfMonth',
    `${parts.join('\n')}\nreturn { DAYS_TH, cellsOfMonth, quickRanges };`,
  )(addDays, weekStartOf, weekRange, daysInRange, lastDayOfMonth);
}

const { DAYS_TH, cellsOfMonth, quickRanges } = loadPicker();
const rangeOf = (today, key) => {
  const r = quickRanges(today).find((q) => q.key === key);
  assert.ok(r, `ไม่มีชิป ${key}`);
  return [r.from, r.to];
};

test('สัปดาห์นี้/สัปดาห์ก่อน = อา.–ส. · วันเสาร์ยังอยู่สัปดาห์เดียวกับอาทิตย์ก่อนหน้า', () => {
  // 26/09/2026 = วันเสาร์ (วันที่มตินี้ออก)
  assert.deepEqual(rangeOf('2026-09-26', 'thisWeek'), ['2026-09-20', '2026-09-26']);
  assert.deepEqual(rangeOf('2026-09-26', 'lastWeek'), ['2026-09-13', '2026-09-19']);
  // จันทร์กลางสัปดาห์เดียวกัน → ช่วงเดิม
  assert.deepEqual(rangeOf('2026-09-21', 'thisWeek'), ['2026-09-20', '2026-09-26']);
});

test('วันอาทิตย์ขึ้นสัปดาห์ใหม่ · สัปดาห์ก่อน = อา.–ส. ที่เพิ่งจบ', () => {
  assert.deepEqual(rangeOf('2026-09-27', 'thisWeek'), ['2026-09-27', '2026-10-03']);
  assert.deepEqual(rangeOf('2026-09-27', 'lastWeek'), ['2026-09-20', '2026-09-26']);
});

test('ข้ามปี: 1 ม.ค. 2026 (พฤ.) อยู่สัปดาห์ที่เริ่ม 28 ธ.ค. 2025', () => {
  assert.deepEqual(rangeOf('2026-01-01', 'thisWeek'), ['2025-12-28', '2026-01-03']);
  assert.deepEqual(rangeOf('2026-01-01', 'lastWeek'), ['2025-12-21', '2025-12-27']);
});

test('ทุกวันตลอด ก.ย.–ต.ค.: ชิปสัปดาห์เริ่มอาทิตย์ จบเสาร์ เจ็ดวันเต็ม และคลุมวันนี้', () => {
  for (const today of daysInRange('2026-09-01', '2026-10-31')) {
    for (const key of ['thisWeek', 'lastWeek']) {
      const [from, to] = rangeOf(today, key);
      assert.equal(dayOfWeek(from), 0, `${today} ${key} from ${from}`);
      assert.equal(dayOfWeek(to), 6, `${today} ${key} to ${to}`);
      assert.equal(daysInRange(from, to).length, 7, `${today} ${key}`);
    }
    const [from, to] = rangeOf(today, 'thisWeek');
    assert.ok(from <= today && today <= to, `${today} ต้องอยู่ใน ${from}..${to}`);
    assert.equal(rangeOf(today, 'lastWeek')[1], addDays(from, -1), `${today} สัปดาห์ก่อนต้องชนสัปดาห์นี้พอดี`);
  }
});

test('ชิปสัปดาห์กับกริดปฏิทินในแผงเดียวกันตรงกัน — ต้นสัปดาห์ตกคอลัมน์แรก (อา) เสมอ', () => {
  assert.equal(DAYS_TH[0], 'อา');
  assert.equal(DAYS_TH[6], 'ส');
  const cells = cellsOfMonth('2026-09');
  // 1 ก.ย. 2026 = อังคาร ⇒ ช่องว่างหน้าเดือนสองช่อง (อา, จ)
  assert.equal(cells.findIndex((c) => c.day === '2026-09-01'), 2);
  for (const today of daysInRange('2026-09-01', '2026-09-30')) {
    const [from, to] = rangeOf(today, 'thisWeek');
    const col = (day) => cells.findIndex((c) => c.day === day) % 7;
    if (from.startsWith('2026-09')) assert.equal(col(from), 0, `${today}: ${from} ต้องอยู่คอลัมน์ อา`);
    if (to.startsWith('2026-09')) assert.equal(col(to), 6, `${today}: ${to} ต้องอยู่คอลัมน์ ส`);
  }
});

test('ชิปที่ไม่ใช่สัปดาห์ไม่ขยับตามมติ — 7/14 วันล่าสุดและเดือนนี้นับจากวันนี้ตามเดิม', () => {
  assert.deepEqual(rangeOf('2026-09-26', '7'), ['2026-09-20', '2026-09-26']);
  assert.deepEqual(rangeOf('2026-09-26', '14'), ['2026-09-13', '2026-09-26']);
  assert.deepEqual(rangeOf('2026-09-26', 'thisMonth'), ['2026-09-01', '2026-09-26']);
});
