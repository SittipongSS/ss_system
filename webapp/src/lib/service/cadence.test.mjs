// ความถี่ของรอบบริการตามปฏิทิน (mig 0397) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
//
// ⭐ มติเจ้าของ 29/09 + คำตอบ 4 ข้อ: รอบเดินตามปฏิทิน ("ทุกเดือน วันที่ 22") · ตกวันหยุดเลื่อนไปข้างหน้าโดยไม่ข้าม
//    เดือน/สัปดาห์/ช่วงวัน ไม่ได้จึงถอยหลัง ⇒ หนึ่งงวดหนึ่งนัดเสมอ · ชนิด "ทุก N วัน" ต้องเดินเหมือนเดิมทุกตัวอักษร
//
// ชุดวันหยุดของตัวอย่าง = 20 แถวของปี 2026 ที่อยู่ในตาราง holidays ของจริง ณ 01/10 · **ไม่มีปี 2027 สักแถว**
// ⇒ 1 ม.ค. 2027 กับสงกรานต์ 2027 นับเป็นวันทำการในตัวอย่างข้างล่าง (ช่องโหว่ข้อมูลที่ตั้งใจให้เห็น ไม่ใช่กติกา)
// "SO247" = ช่วง 2026-10-22 → 2027-10-21 ของ SO-26090247-0 (12 เดือนพอดี เริ่มวันพฤหัสบดี)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CADENCE_ERRORS, CADENCE_EVERY_MONTHS, CADENCE_EVERY_WEEKS, CADENCE_FIELDS, CADENCE_KINDS, CADENCE_TEXT,
  DEFAULT_HORIZON_DAYS, MONTH_END_DAY, WEEKDAY_NAMES,
  cadenceOf, cadenceShiftText, cadenceSlots, cadenceText, countSlots, dayOfMonth, defaultCadenceFor,
  holidayGapText, horizonDaysFor, horizonEndFor, isCadenceSlot, isIsoDay, isWorkday, nextPlannedAfter, normalizeCadence,
  plannedDateOfSlot, plannedVisits, sameCadence, shiftReason, slotPeriod, suggestCadence, suggestEveryDays,
  yearsWithoutHolidays,
} from './cadence.js';
import * as cadenceModule from './cadence.js';
import { addDays, dayOfWeek, weekStartOf } from '../datePeriods.js';
import { MONTH_END_DAY as BILLING_MONTH_END_DAY } from '../sales/billingRuleV4.js';
import { WEEKDAY_LABELS } from './sites.js';

const H2026 = new Set([
  '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04',
  '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13',
  '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
]);
const SO247 = { startDate: '2026-10-22', endDate: '2027-10-21' };
const Y2026 = { startDate: '2026-01-01', endDate: '2026-12-31' };
const M = (every, day, to = null) => ({ cadenceKind: 'monthly', cadenceEvery: every, cadenceMonthDay: day, cadenceMonthDayTo: to });
const W = (every, weekday) => ({ cadenceKind: 'weekly', cadenceEvery: every, cadenceWeekday: weekday });
const D = (everyDays) => ({ everyDays });
const six = (over) => ({
  cadenceKind: null, everyDays: null, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null, ...over,
});
/** นัดตามรอบทั้งช่วงของรอบ → 'ช่อง→วันนัด' (ไม่เลื่อน = วันเดียว) */
const visitsOf = (cadence, range = SO247, holidays = H2026) => plannedVisits(
  { ...cadence, ...range }, { from: range.startDate, to: range.endDate, holidays },
);
const datesOf = (cadence, range = SO247, holidays = H2026) => visitsOf(cadence, range, holidays).map((v) => v.date);
const monthOf = (day) => day.slice(0, 7);
/** วันจบของช่วง "เริ่ม + n เดือน − 1 วัน" (วันเริ่ม 1–28) */
const periodEnd = (from, months) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d - 1)).toISOString().slice(0, 10);
};

// ── ค่าคงที่ + ความเป็นไฟล์ล้วน ───────────────────────────────────────────────────────────────
test('ค่าคงที่: ชนิด · ตัวเลือก · หกช่อง · ชื่อวันขึ้นต้นวันอาทิตย์ (ดัชนี = dayOfWeek)', () => {
  assert.deepEqual(CADENCE_KINDS, ['monthly', 'weekly', 'days']);
  assert.equal(MONTH_END_DAY, 31);
  assert.equal(MONTH_END_DAY, BILLING_MONTH_END_DAY, 'สิ้นเดือน = เลขเดียวกับกติกาวางบิลรุ่นสี่');
  assert.equal(DEFAULT_HORIZON_DAYS, 90);
  assert.deepEqual(CADENCE_EVERY_MONTHS, [1, 2, 3, 4, 6, 12]);
  assert.ok(CADENCE_EVERY_MONTHS.every((n) => Number.isInteger(n) && n >= 1 && n <= 12));
  assert.deepEqual(CADENCE_EVERY_WEEKS, [1, 2]);
  assert.deepEqual(CADENCE_FIELDS, ['cadenceKind', 'everyDays', 'cadenceEvery', 'cadenceWeekday', 'cadenceMonthDay', 'cadenceMonthDayTo']);
  assert.deepEqual(WEEKDAY_NAMES, ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']);
  assert.equal(WEEKDAY_NAMES.length, 7);
  // ลำดับเดียวกับป้ายย่อของไซต์ (อา. จ. อ. พ. พฤ. ศ. ส.) และกับ dayOfWeek ของ datePeriods
  assert.equal(WEEKDAY_LABELS.length, 7);
  WEEKDAY_LABELS.forEach((label, i) => assert.ok(WEEKDAY_NAMES[i].includes(label.replace(/\.$/, '')), `${label} ↔ ${WEEKDAY_NAMES[i]}`));
  assert.ok(WEEKDAY_NAMES[0].startsWith('อา') && WEEKDAY_LABELS[0].startsWith('อา'), 'ทั้งสองลิสต์ขึ้นต้นวันอาทิตย์');
  assert.equal(WEEKDAY_NAMES[dayOfWeek('2026-10-25')], 'อาทิตย์');
  assert.equal(WEEKDAY_NAMES[dayOfWeek('2026-10-22')], 'พฤหัสบดี');
});

test('ชื่อที่ cadence.js ส่งออก = สัญญาของแผน §4 ครบและไม่เกิน (rounds.js · โมดัล · เส้น API import ตามชื่อพวกนี้)', () => {
  assert.deepEqual(Object.keys(cadenceModule).sort(), [
    'CADENCE_ERRORS', 'CADENCE_EVERY_MONTHS', 'CADENCE_EVERY_WEEKS', 'CADENCE_FIELDS', 'CADENCE_KINDS', 'CADENCE_TEXT',
    'DEFAULT_HORIZON_DAYS', 'MONTH_END_DAY', 'WEEKDAY_NAMES',
    'cadenceOf', 'cadenceShiftText', 'cadenceSlots', 'cadenceText', 'countSlots', 'dayOfMonth', 'defaultCadenceFor',
    'holidayGapText', 'horizonDaysFor', 'horizonEndFor', 'isCadenceSlot', 'isIsoDay', 'isWorkday', 'nextPlannedAfter', 'normalizeCadence',
    'plannedDateOfSlot', 'plannedVisits', 'sameCadence', 'shiftReason', 'slotPeriod', 'suggestCadence', 'suggestEveryDays',
    'yearsWithoutHolidays',
  ].sort());
});

const SOURCE = readFileSync(new URL('./cadence.js', import.meta.url), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
const CODE = stripComments(SOURCE);

test('🔴 cadence.js import ได้ที่เดียว: @/lib/datePeriods (ซึ่งไม่ import ใคร) — ไม่มีวงวน ไม่มีตัวหาวันในสัปดาห์ของตัวเอง', () => {
  const specifiers = [...CODE.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(specifiers, ['@/lib/datePeriods']);
  assert.match(CODE, /^import \{ addDays, dayOfWeek, weekStartOf \} from '@\/lib\/datePeriods';$/m);
  assert.doesNotMatch(CODE, /\brequire\(|\bimport\(/, 'ไม่มี import แบบอื่น');
  const leaf = stripComments(readFileSync(new URL('../datePeriods.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(leaf, /^\s*import\s/m, 'lib/datePeriods.js ต้องไม่ import ใคร');

  // วันในสัปดาห์/ต้นสัปดาห์ถาม datePeriods — ไม่คิดเอง และไม่ส่งออกเลขคณิตวันของตัวเอง
  assert.doesNotMatch(CODE, /getDay\(|getUTCDay\(/);
  for (const name of ['addDays', 'dayOfWeek', 'weekStartOf', 'weekdayOf', 'weekRange']) {
    assert.equal(name in cadenceModule, false, `cadence.js ต้องไม่ส่งออก ${name}`);
  }
  // เลขคณิตปฏิทินผ่าน Date.UTC เท่านั้น — ไม่มี new Date() เปล่า (นาฬิกาเครื่อง) และไม่มี new Date(สตริง)
  const dates = [...CODE.matchAll(/new Date\(([^)]*)/g)].map((m) => m[1]);
  assert.ok(dates.length >= 1);
  assert.ok(dates.every((inner) => inner.startsWith('Date.UTC(')), dates.join(' | '));
  assert.doesNotMatch(CODE, /Date\.now\(|businessDate\(/, 'ไฟล์ล้วนไม่ถาม "วันนี้" — ผู้เรียกส่งมา');
});

test('🔴 ด่าน check:thaitime มองไม่เห็นไฟล์ใหม่ที่ยังไม่อยู่ใน git — ทาบสี่รูปผิดกับ cadence.js ตรงนี้แทน', () => {
  const lines = CODE.split('\n');
  const patterns = [
    /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(0,\s*(?:10|7)\)/,
    /\b(?:now|nowIso|iso|createdAt|updatedAt|\w+At)\s*\.slice\(0,\s*(?:10|7)\)/,
    /\.slice\(11,\s*(?:16|19)\)/,
    /new Date\(\)\s*\.get(?:Hours|Minutes)\(\)|\bd\.get(?:Hours|Minutes)\(\)/,
  ];
  const hits = lines.filter((line) => patterns.some((re) => re.test(line)));
  assert.deepEqual(hits, []);
});

test('🔴 สัปดาห์เริ่มวันอาทิตย์: ไม่มีสูตรถอยไปวันจันทร์ · ไม่มีลิสต์ชื่อวันที่ขึ้นต้นวันจันทร์', () => {
  assert.doesNotMatch(CODE, /\+\s*6\s*\)\s*%\s*7/);
  assert.doesNotMatch(CODE, /===\s*0\s*\?\s*-?\s*6\s*:/);
  assert.doesNotMatch(CODE, /\[\s*['"`](?:จ\.?|จันทร์|วันจันทร์)['"`]\s*,/);
  assert.doesNotMatch(CODE, /เริ่มวันจันทร์|จ\.\s*[–-]\s*อา\./);
});

// ── วัน ────────────────────────────────────────────────────────────────────────────────────
test('isIsoDay: ต้องเป็นวันที่มีจริงในปฏิทิน — 30 ก.พ. · เดือน 13 · timestamp · ค่าว่าง = false', () => {
  for (const ok of ['2026-10-22', '2028-02-29', '2026-12-31', '2026-01-01']) assert.equal(isIsoDay(ok), true, ok);
  for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-10-00', '2026-10-22T00:00:00Z',
    '26-10-22', '2026-1-1', 'x', '', null, undefined, 20261022, {}]) assert.equal(isIsoDay(bad), false, String(bad));
});

test('dayOfMonth: วันที่ของเดือน · อ่าน timestamp ที่ขึ้นต้นด้วยวันได้ · ไม่ใช่วัน = null', () => {
  assert.equal(dayOfMonth('2026-10-22'), 22);
  assert.equal(dayOfMonth('2026-10-01'), 1);
  assert.equal(dayOfMonth('2028-02-29'), 29);
  assert.equal(dayOfMonth('2026-10-22T03:00:00+07:00'), 22);
  for (const bad of ['2026-02-30', 'x', '', null, undefined]) assert.equal(dayOfMonth(bad), null, String(bad));
});

test('isWorkday / shiftReason: เสาร์–อาทิตย์ · วันหยุด (Set หรือ Map) · null = ดูแค่เสาร์–อาทิตย์', () => {
  assert.equal(isWorkday('2026-10-22', H2026), true);                // พฤหัสบดี
  assert.equal(isWorkday('2026-10-23', H2026), false);               // ศุกร์ วันปิยมหาราช
  assert.equal(isWorkday('2026-10-23'), true, 'ไม่ส่งวันหยุด = ดูแค่เสาร์–อาทิตย์');
  assert.equal(isWorkday('2026-10-24', H2026), false);               // เสาร์
  assert.equal(isWorkday('2026-10-25', null), false);                // อาทิตย์
  assert.equal(isWorkday('2026-10-23', new Map([['2026-10-23', 'วันปิยมหาราช']])), false, 'Map ก็ใช้ได้');
  assert.equal(isWorkday('2026-02-30', H2026), false, 'ไม่ใช่วัน = ไม่ใช่วันทำการ');
  assert.equal(isWorkday(null), false);
  assert.equal(shiftReason('2026-10-25', H2026), 'sun');
  assert.equal(shiftReason('2026-10-24', H2026), 'sat');
  assert.equal(shiftReason('2026-10-23', H2026), 'holiday');
  assert.equal(shiftReason('2026-10-23'), null);
  assert.equal(shiftReason('2026-10-22', H2026), null);
  assert.equal(shiftReason('2026-05-31', H2026), 'sun', 'วันหยุดที่ตรงวันอาทิตย์ บอกว่าเป็นวันอาทิตย์');
  assert.equal(shiftReason('x', H2026), null);
});

// ── รูปของความถี่ ───────────────────────────────────────────────────────────────────────────
test('cadenceOf: ไม่มีชนิดแต่มี everyDays = days (แถวก่อน 0397) · รูปที่อ่านไม่ออก = null', () => {
  assert.deepEqual(cadenceOf({ everyDays: 30 }), { kind: 'days', everyDays: 30 });
  assert.deepEqual(cadenceOf({ cadenceKind: 'days', everyDays: '45' }), { kind: 'days', everyDays: 45 });
  assert.deepEqual(cadenceOf({ everyDays: 30.9 }), { kind: 'days', everyDays: 30 }, 'อ่านแบบผ่อน ปัดลง เท่าโค้ดเดิม');
  assert.deepEqual(cadenceOf(W(2, 5)), { kind: 'weekly', every: 2, weekday: 5 });
  assert.deepEqual(cadenceOf(W(1, 0)), { kind: 'weekly', every: 1, weekday: 0 }, 'วันอาทิตย์อ่านได้ (ตัวตรวจเป็นคนปฏิเสธ ไม่ใช่ตัวอ่าน)');
  assert.deepEqual(cadenceOf(M(1, 22)), { kind: 'monthly', every: 1, monthDay: 22, monthDayTo: null });
  assert.deepEqual(cadenceOf(M(3, 25, 31)), { kind: 'monthly', every: 3, monthDay: 25, monthDayTo: 31 });
  // ชนิดเป็นตัวตัดสิน — everyDays ที่ค้างมากับรอบรายเดือนไม่ทำให้กลายเป็น days
  assert.deepEqual(cadenceOf({ ...M(1, 22), everyDays: 30 }), { kind: 'monthly', every: 1, monthDay: 22, monthDayTo: null });
  for (const bad of [null, undefined, {}, { everyDays: 0 }, { everyDays: -5 }, { everyDays: 'x' }, { everyDays: '' },
    { cadenceKind: 'days' }, { cadenceKind: 'yearly', everyDays: 30 },
    W(0, 3), W(53, 3), W(1, 7), W(1, null), W(null, 3), W(1.5, 3),
    M(0, 22), M(13, 22), M(1, 0), M(1, 32), M(1, null), M(null, 22), M(1, 5, 5), M(1, 5, 3), M(1, 5, 32)]) {
    assert.equal(cadenceOf(bad), null, JSON.stringify(bad));
  }
});

test('normalizeCadence: ทุกแถวของตารางข้อความผิด · คืนครบหกช่องเสมอ ช่องที่ไม่ใช้เป็น null', () => {
  const err = (body) => normalizeCadence(body).error;
  // ไม่มีชนิด / ชนิดแปลก
  assert.equal(err({}), CADENCE_ERRORS.kind);
  assert.equal(err(), CADENCE_ERRORS.kind);
  assert.equal(err({ cadenceKind: 'yearly', everyDays: 30 }), CADENCE_ERRORS.kind);
  for (const empty of [null, undefined, '']) {
    assert.equal(err({ cadenceKind: empty, everyDays: empty }), CADENCE_ERRORS.kind, 'ค่าว่างคือ "ไม่ได้ส่งมา" ไม่ถูกแปลงเป็น 0');
  }
  // days
  for (const bad of [0, 366, 400, -1, 1.5, 'x', '30.5']) assert.equal(err({ everyDays: bad }), CADENCE_ERRORS.days, String(bad));
  assert.equal(err({ cadenceKind: 'days' }), CADENCE_ERRORS.days);
  assert.equal(err({ cadenceKind: 'days', everyDays: '' }), CADENCE_ERRORS.days);
  assert.equal(CADENCE_ERRORS.days, 'รอบต้องเป็นจำนวนวันระหว่าง 1–365', 'ข้อความเดิมของ rounds.js (เทสต์เดิมตรึง /1–365/)');
  // weekly
  for (const bad of [null, undefined, '', 0, 53, 1.5]) assert.equal(err(W(bad, 3)), CADENCE_ERRORS.weekEvery, String(bad));
  for (const bad of [null, undefined, '', 7, -1, 2.5]) assert.equal(err(W(1, bad)), CADENCE_ERRORS.weekday, String(bad));
  assert.equal(err(W(1, 0)), CADENCE_ERRORS.weekend);
  assert.equal(err(W(2, 6)), CADENCE_ERRORS.weekend);
  // monthly
  for (const bad of [null, undefined, '', 0, 13, 2.5]) assert.equal(err(M(bad, 22)), CADENCE_ERRORS.monthEvery, String(bad));
  for (const bad of [null, undefined, '', 0, 32, 1.5]) assert.equal(err(M(1, bad)), CADENCE_ERRORS.monthDay, String(bad));
  for (const bad of [5, 3, 32, 0, 5.5, 'x']) assert.equal(err(M(1, 5, bad)), CADENCE_ERRORS.monthDayTo, String(bad));
  assert.equal(err(M(1, 31, 31)), CADENCE_ERRORS.monthDayTo, 'สิ้นเดือนไม่มีช่วงต่อ');

  // ของที่ผ่าน — หกช่องครบ
  const ok = (body) => { const r = normalizeCadence(body); assert.equal(r.error, null, JSON.stringify(body)); return r.value; };
  assert.deepEqual(ok({ everyDays: 30 }), six({ cadenceKind: 'days', everyDays: 30 }));
  assert.deepEqual(ok({ everyDays: '45' }), six({ cadenceKind: 'days', everyDays: 45 }), 'ตัวเลขจากช่องกรอกเป็นสตริงได้');
  assert.deepEqual(ok({ cadenceKind: 'days', everyDays: 365 }), six({ cadenceKind: 'days', everyDays: 365 }));
  assert.deepEqual(ok({ cadenceKind: 'days', everyDays: 1 }), six({ cadenceKind: 'days', everyDays: 1 }));
  assert.deepEqual(ok(W(2, 5)), six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 5 }));
  assert.deepEqual(ok(W(52, 1)), six({ cadenceKind: 'weekly', cadenceEvery: 52, cadenceWeekday: 1 }));
  assert.deepEqual(ok(M(1, 22)), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }));
  assert.deepEqual(ok(M(12, 31)), six({ cadenceKind: 'monthly', cadenceEvery: 12, cadenceMonthDay: 31 }));
  assert.deepEqual(ok(M(1, 1, 5)), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 1, cadenceMonthDayTo: 5 }));
  assert.deepEqual(ok(M(3, 25, 31)), six({ cadenceKind: 'monthly', cadenceEvery: 3, cadenceMonthDay: 25, cadenceMonthDayTo: 31 }));
  assert.deepEqual(ok({ ...M(1, 22), cadenceMonthDayTo: '' }), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }));
  for (const body of [{ everyDays: 30 }, W(2, 5), M(1, 22), M(1, 1, 5)]) {
    assert.deepEqual(Object.keys(ok(body)), CADENCE_FIELDS, 'ลำดับและจำนวนช่อง = CADENCE_FIELDS');
  }
});

test('⭐ normalizeCadence ล้างช่องของชนิดอื่น — เปลี่ยน days → monthly ผ่าน merge แบบ PATCH แล้ว everyDays ต้องเป็น null', () => {
  // แถวเดิม "ทุก 30 วัน" + body ของโมดัลใหม่ (หกช่อง) → merge `{...before, ...body}` แบบที่เส้น PATCH ทำ
  const before = { id: 'P1', siteId: 'S1', kind: 'refill', cadenceKind: 'days', everyDays: 30, cadenceEvery: null,
    cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null };
  const merged = { ...before, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 };
  assert.equal(merged.everyDays, 30, 'ของตั้งต้น: merge เปล่า ๆ ทิ้ง everyDays เดิมค้างไว้');
  assert.deepEqual(normalizeCadence(merged).value, six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }));
  // รอบรายเดือนที่พก everyDays: 30 ค้างมา
  assert.deepEqual(normalizeCadence({ ...M(1, 22), everyDays: 30 }).value.everyDays, null);
  // กลับทาง: monthly → weekly → days ช่องของชนิดเก่าหายหมด
  const toWeekly = normalizeCadence({ ...M(1, 1, 5), everyDays: 30, cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 3 }).value;
  assert.deepEqual(toWeekly, six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 3 }));
  const toDays = normalizeCadence({ ...M(1, 1, 5), ...W(2, 3), cadenceKind: 'days', everyDays: 14 }).value;
  assert.deepEqual(toDays, six({ cadenceKind: 'days', everyDays: 14 }));
  // ผลของตัวตรวจผ่านตัวตรวจซ้ำได้ผลเดิม และอ่านกลับได้ความถี่เดิม
  for (const body of [{ everyDays: 30 }, W(2, 5), M(1, 22), M(3, 25, 31)]) {
    const value = normalizeCadence(body).value;
    assert.deepEqual(normalizeCadence(value).value, value);
    assert.equal(sameCadence(value, body), true);
  }
});

test('sameCadence / defaultCadenceFor', () => {
  assert.equal(sameCadence({ everyDays: 30 }, { cadenceKind: 'days', everyDays: '30' }), true);
  assert.equal(sameCadence(M(1, 22), { ...M(1, 22), everyDays: 30, startDate: '2026-10-22' }), true, 'ดูแค่ความถี่ ไม่ดูวันของรอบ');
  assert.equal(sameCadence(M(1, 22), M(1, 23)), false);
  assert.equal(sameCadence(M(1, 22), M(2, 22)), false);
  assert.equal(sameCadence(M(1, 1), M(1, 1, 5)), false, 'วันเดียวกับช่วงวันไม่เท่ากัน');
  assert.equal(sameCadence(W(1, 3), W(1, 4)), false);
  assert.equal(sameCadence(W(1, 3), M(1, 3)), false);
  assert.equal(sameCadence({ everyDays: 30 }, { everyDays: 31 }), false);
  assert.equal(sameCadence({}, {}), false, 'อ่านไม่ออกทั้งคู่ = ไม่เท่า');
  assert.equal(sameCadence(null, M(1, 22)), false);

  // คำตอบเจ้าของข้อ 3: รอบใหม่ = ทุกเดือน วันที่ของวันเริ่มรอบ
  assert.deepEqual(defaultCadenceFor('2026-10-22'), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }));
  assert.deepEqual(defaultCadenceFor('2027-01-31'), six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 31 }));
  assert.deepEqual(defaultCadenceFor(''), six({ cadenceKind: 'monthly', cadenceEvery: 1 }), 'ยังไม่มีวันเริ่ม = ยังไม่รู้วันที่');
  assert.equal(cadenceText({ ...defaultCadenceFor('2026-10-22') }), 'ทุกเดือน วันที่ 22');
  assert.equal(normalizeCadence(defaultCadenceFor('')).error, CADENCE_ERRORS.monthDay);
});

// ── R1 ช่องของรอบ ────────────────────────────────────────────────────────────────────────────
test('R1-a รายเดือน: ช่องแรก = วันที่นั้นตัวแรกที่ไม่ก่อนวันเริ่มรอบ · ทุก N เดือน · ไม่เกินวันสิ้นสุด', () => {
  const day22 = cadenceSlots({ ...M(1, 22), ...SO247 });
  assert.deepEqual(day22, ['2026-10-22', '2026-11-22', '2026-12-22', '2027-01-22', '2027-02-22', '2027-03-22',
    '2027-04-22', '2027-05-22', '2027-06-22', '2027-07-22', '2027-08-22', '2027-09-22']);
  const day21 = cadenceSlots({ ...M(1, 21), ...SO247 });
  assert.equal(day21.length, 12);
  assert.equal(day21[0], '2026-11-21');
  assert.equal(day21.at(-1), '2027-10-21');
  const day1 = cadenceSlots({ ...M(1, 1), ...SO247 });
  assert.equal(day1.length, 12);
  assert.equal(day1[0], '2026-11-01');
  assert.equal(day1.at(-1), '2027-10-01');
  assert.deepEqual(cadenceSlots({ ...M(3, 22), ...SO247 }), ['2026-10-22', '2027-01-22', '2027-04-22', '2027-07-22']);
  assert.deepEqual(cadenceSlots({ ...M(12, 22), ...SO247 }), ['2026-10-22']);
  // ทุก N เดือนนับจาก **ช่องแรก** ไม่ใช่จากเดือนของวันเริ่มรอบ: วันที่ 21 เริ่มรอบ 22 ต.ค. → ช่องแรก 21 พ.ย. แล้วทุก 3 เดือน
  assert.deepEqual(cadenceSlots({ ...M(3, 21), ...SO247 }), ['2026-11-21', '2027-02-21', '2027-05-21', '2027-08-21']);
  assert.deepEqual(cadenceSlots({ ...M(6, 1), ...SO247 }), ['2026-11-01', '2027-05-01']);
  assert.deepEqual(cadenceSlots({ ...M(2, 31), startDate: '2026-12-01', endDate: '2027-06-30' }, { from: '2027-03-01', to: '2027-05-31' }), ['2027-04-30']);
});

test('R1-b รายสัปดาห์: ช่องแรก = วันนั้นของสัปดาห์ตัวแรกที่ไม่ก่อนวันเริ่ม · ทุก 7·N วัน — พฤหัสฯ 27 ช่อง ศุกร์ 26 ช่อง', () => {
  const thu = cadenceSlots({ ...W(2, 4), ...SO247 });
  assert.equal(thu.length, 27);
  assert.equal(thu[0], '2026-10-22');
  assert.equal(thu.at(-1), '2027-10-21');
  const fri = cadenceSlots({ ...W(2, 5), ...SO247 });
  assert.equal(fri.length, 26);
  assert.equal(fri[0], '2026-10-23');
  assert.equal(fri[1], '2026-11-06');
  assert.equal(fri.at(-1), '2027-10-08');
  // วันก่อนวันเริ่มในสัปดาห์เดียวกัน = ไปสัปดาห์ถัดไป (เริ่มพฤหัสฯ ขอวันพุธ)
  assert.equal(cadenceSlots({ ...W(1, 3), ...SO247 })[0], '2026-10-28');
  assert.ok(cadenceSlots({ ...W(1, 3), ...SO247 }).every((slot) => dayOfWeek(slot) === 3));
  // ทุก 2 สัปดาห์นับจากช่องแรก (พุธ 28 ต.ค.) ไม่ใช่จากพุธของสัปดาห์ที่รอบเริ่ม (21 ต.ค. อยู่ก่อนวันเริ่ม)
  assert.deepEqual(cadenceSlots({ ...W(2, 3), ...SO247 }).slice(0, 3), ['2026-10-28', '2026-11-11', '2026-11-25']);
  assert.deepEqual(cadenceSlots({ ...W(2, 1), ...SO247 }).slice(0, 2), ['2026-10-26', '2026-11-09']);
  assert.deepEqual(cadenceSlots({ ...W(2, 5), ...SO247 }, { from: '2026-11-07', to: '2026-12-04' }), ['2026-11-20', '2026-12-04']);
});

test('R1-c ทุก N วัน: วันเริ่มรอบ + k·N เหมือนเดิม · ขอบ from/to ตัดช่อง', () => {
  const p = { ...D(30), startDate: '2026-08-03', endDate: null };
  assert.deepEqual(cadenceSlots(p, { to: '2026-11-05' }), ['2026-08-03', '2026-09-02', '2026-10-02', '2026-11-01']);
  assert.deepEqual(cadenceSlots(p, { from: '2026-09-02', to: '2026-10-02' }), ['2026-09-02', '2026-10-02']);
  assert.deepEqual(cadenceSlots(p, { from: '2026-09-03', to: '2026-10-01' }), []);
  assert.deepEqual(cadenceSlots({ ...p, endDate: '2026-09-01' }, { to: '2026-12-01' }), ['2026-08-03']);
  assert.deepEqual(cadenceSlots(p), [], 'ปลายเปิดและไม่บอก to = ไม่เดินไม่รู้จบ');
  assert.deepEqual(cadenceSlots(p, { from: '2026-07-01', to: '2026-08-03' }), ['2026-08-03'], 'from ก่อนวันเริ่ม = เริ่มที่วันเริ่มรอบ');
  // ขอบที่ส่งมาแต่ไม่ใช่วัน = ไม่เดา
  assert.deepEqual(cadenceSlots(p, { to: 'x' }), []);
  assert.deepEqual(cadenceSlots({ ...p, endDate: '2026-12-31' }, { from: '2026-02-30' }), []);
  assert.deepEqual(cadenceSlots({ ...D(30), startDate: 'x', endDate: '2026-12-31' }), []);
  assert.deepEqual(cadenceSlots({ startDate: '2026-08-03', endDate: '2026-12-31' }), [], 'ความถี่อ่านไม่ออก');
  // timestamp ที่ขึ้นต้นด้วยวัน อ่านเป็นวัน
  assert.deepEqual(
    cadenceSlots({ ...D(30), startDate: '2026-08-03T00:00:00+07:00', endDate: '2026-09-30T17:00:00Z' }),
    ['2026-08-03', '2026-09-02'],
  );
});

test('R1-d ช่วงวันไม่เพิ่มช่อง — "วันที่ 1–5" มีช่องชุดเดียวกับ "วันที่ 1"', () => {
  assert.deepEqual(cadenceSlots({ ...M(1, 1, 5), ...SO247 }), cadenceSlots({ ...M(1, 1), ...SO247 }));
  assert.equal(cadenceSlots({ ...M(1, 1, 5), ...SO247 }).length, 12);
});

test('R1-f (ตรึงไว้) ช่วง 1–5 ที่รอบเริ่มกลางช่วง: ช่องของเดือนนั้นอยู่ก่อนวันเริ่ม ⇒ ข้ามเดือนนั้น', () => {
  const p = { ...M(1, 1, 5), startDate: '2026-11-03', endDate: '2027-02-28' };
  assert.deepEqual(cadenceSlots(p), ['2026-12-01', '2027-01-01', '2027-02-01']);
  assert.equal(countSlots(p), 3);
});

test('R1-e ⭐ ช่วงเต็มเดือน (วันเริ่ม 1–28): ทุกวันที่ 1–31 ได้ช่องเท่าจำนวนเดือนพอดี และนัดเดือนละหนึ่ง', () => {
  let cases = 0;
  for (const from of ['2026-10-22', '2026-10-01', '2026-12-15', '2027-03-10', '2026-06-28', '2027-02-01', '2028-02-28']) {
    for (const months of [1, 3, 6, 12, 24]) {
      const range = { startDate: from, endDate: periodEnd(from, months) };
      for (let day = 1; day <= 31; day += 1) {
        cases += 1;
        const p = { ...M(1, day), ...range };
        assert.equal(countSlots(p), months, `${from} +${months} เดือน วันที่ ${day}`);
        const visits = plannedVisits(p, { from: range.startDate, to: range.endDate, holidays: H2026 });
        assert.equal(visits.length, months, `${from} +${months} เดือน วันที่ ${day}: จำนวนนัด`);
        assert.equal(new Set(visits.map((v) => monthOf(v.date))).size, months, `${from} +${months} เดือน วันที่ ${day}: เดือนไม่ซ้ำ`);
        assert.ok(visits.every((v) => monthOf(v.date) === monthOf(v.slot)), `${from} +${months} เดือน วันที่ ${day}: นัดไม่ออกนอกเดือนของช่อง`);
        assert.ok(visits.every((v) => isWorkday(v.date, H2026) && v.date >= range.startDate && v.date <= range.endDate));
      }
    }
  }
  assert.equal(cases, 1085);
});

test('R1-e (ตรึงไว้) ขอบที่ช่วงเริ่มวันที่ 29–31: นับได้เกินหนึ่งช่อง — ไม่ใช่บั๊ก', () => {
  // ช่วง 1 เดือนที่เริ่ม 31 ม.ค. จบ 28 ก.พ. · ช่วง 12 เดือนที่เริ่ม 29 ก.พ. 2028 จบ 28 ก.พ. 2029
  assert.equal(countSlots({ ...M(1, 31), startDate: '2026-01-31', endDate: '2026-02-28' }), 2);
  assert.deepEqual(cadenceSlots({ ...M(1, 31), startDate: '2026-01-31', endDate: '2026-02-28' }), ['2026-01-31', '2026-02-28']);
  assert.equal(countSlots({ ...M(1, 29), startDate: '2028-02-29', endDate: '2029-02-28' }), 13);
});

// ── R2 ตัดสิ้นเดือน ──────────────────────────────────────────────────────────────────────────
test('R2-a วันที่ 31 = วันสุดท้ายของทุกเดือน — 12 เดือนได้ 12 ช่อง เดือนละช่อง', () => {
  const slots = cadenceSlots({ ...M(1, 31), ...SO247 });
  assert.deepEqual(slots, ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31',
    '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31', '2027-08-31', '2027-09-30']);
  assert.equal(new Set(slots.map(monthOf)).size, 12);
});

test('R2-b วันที่ 29/30 ในเดือนกุมภาพันธ์ — ปี 2027 (28 วัน) และปีอธิกสุรทิน 2028 (29 วัน)', () => {
  assert.deepEqual(
    cadenceSlots({ ...M(1, 30), startDate: '2027-01-01', endDate: '2027-04-30' }),
    ['2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30'],
  );
  assert.deepEqual(
    cadenceSlots({ ...M(1, 29), startDate: '2027-01-01', endDate: '2027-04-30' }),
    ['2027-01-29', '2027-02-28', '2027-03-29', '2027-04-29'],
  );
  assert.deepEqual(
    cadenceSlots({ ...M(1, 29), startDate: '2028-01-01', endDate: '2028-04-30' }),
    ['2028-01-29', '2028-02-29', '2028-03-29', '2028-04-29'],
  );
  assert.deepEqual(
    cadenceSlots({ ...M(1, 30), startDate: '2028-01-01', endDate: '2028-04-30' }),
    ['2028-01-30', '2028-02-29', '2028-03-30', '2028-04-30'],
  );
});

test('R2-c การตัดเป็นรายช่อง — หลัง 28 ก.พ. ช่องถัดไปกลับไป 30/31 มี.ค. ไม่ใช่ 28 มี.ค.', () => {
  const day30 = cadenceSlots({ ...M(1, 30), startDate: '2027-02-01', endDate: '2027-03-31' });
  assert.deepEqual(day30, ['2027-02-28', '2027-03-30']);
  const day31 = cadenceSlots({ ...M(1, 31), startDate: '2027-02-01', endDate: '2027-03-31' });
  assert.deepEqual(day31, ['2027-02-28', '2027-03-31']);
  // ทุก 2 เดือนสิ้นเดือน เริ่ม ธ.ค. → ก.พ. (28) → เม.ย. (30) → มิ.ย. (30)
  assert.deepEqual(
    cadenceSlots({ ...M(2, 31), startDate: '2026-12-01', endDate: '2027-06-30' }),
    ['2026-12-31', '2027-02-28', '2027-04-30', '2027-06-30'],
  );
});

// ── R3 เลื่อนหนีวันหยุด/เสาร์–อาทิตย์ (คำตอบเจ้าของข้อ 2) ────────────────────────────────────────
test('R3-a วันที่ 22 บน SO247: 12 นัด เดือนละนัด — เลื่อนเฉพาะ 22 พ.ย. (อา.) · 22 พ.ค. (ส.) · 22 ส.ค. (อา.)', () => {
  const visits = visitsOf(M(1, 22));
  assert.deepEqual(visits.map((v) => v.date), ['2026-10-22', '2026-11-23', '2026-12-22', '2027-01-22', '2027-02-22',
    '2027-03-22', '2027-04-22', '2027-05-24', '2027-06-22', '2027-07-22', '2027-08-23', '2027-09-22']);
  assert.deepEqual(visits.filter((v) => v.slot !== v.date), [
    { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' },
    { slot: '2027-05-22', date: '2027-05-24', reason: 'sat' },
    { slot: '2027-08-22', date: '2027-08-23', reason: 'sun' },
  ]);
  assert.equal(new Set(visits.map((v) => monthOf(v.date))).size, 12);
});

test('วันที่ 17 (ตารางช่างจริง: 8 ไซต์) บน SO247: 12 นัด เดือนละนัด — ช่องแรกคือ 17 พ.ย. เพราะ 17 ต.ค. อยู่ก่อนวันเริ่มรอบ', () => {
  const visits = visitsOf(M(1, 17));
  assert.equal(visits.length, 12);
  assert.equal(visits[0].slot, '2026-11-17');
  assert.equal(visits.at(-1).slot, '2027-10-17');
  assert.deepEqual(visits.filter((v) => v.slot !== v.date).map((v) => `${v.slot}→${v.date} ${v.reason}`), [
    '2027-01-17→2027-01-18 sun', '2027-04-17→2027-04-19 sat', '2027-07-17→2027-07-19 sat', '2027-10-17→2027-10-18 sun',
  ]);
  assert.equal(new Set(visits.map((v) => monthOf(v.date))).size, 12);
  // ทุก 3 เดือน วันที่ 22: สี่นัด ไม่มีนัดไหนต้องเลื่อน
  assert.deepEqual(datesOf(M(3, 22)), ['2026-10-22', '2027-01-22', '2027-04-22', '2027-07-22']);
});

test('R3-b ⭐ สิ้นเดือนบน SO247: 12 นัด 12 เดือน — ไปข้างหน้าข้ามเดือนไม่ได้จึงถอยหลัง (ไม่มีเดือนสองนัด ไม่มีเดือนว่าง)', () => {
  const visits = visitsOf(M(1, 31));
  assert.deepEqual(visits.map((v) => v.date), ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-29', '2027-02-26',
    '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-30', '2027-08-31', '2027-09-30']);
  assert.deepEqual(visits.filter((v) => v.slot !== v.date).map((v) => `${v.slot}→${v.date} ${v.reason}`), [
    '2026-10-31→2026-10-30 sat', '2026-12-31→2026-12-30 holiday', '2027-01-31→2027-01-29 sun',
    '2027-02-28→2027-02-26 sun', '2027-07-31→2027-07-30 sat',
  ]);
  assert.equal(new Set(visits.map((v) => monthOf(v.date))).size, 12);
  // ของเดิม (ไปข้างหน้าอย่างเดียว) จะได้เดือนที่มีสองนัดกับเดือนที่ไม่มีนัด — ตรวจว่ากติกาใหม่ต่างจริง
  const forwardOnly = cadenceSlots({ ...M(1, 31), ...SO247 })
    .map((slot) => plannedDateOfSlot({ everyDays: 1, startDate: slot }, slot, H2026));
  assert.ok(new Set(forwardOnly.map(monthOf)).size < 12, 'ไปข้างหน้าอย่างเดียวทำให้บางเดือนไม่มีนัด');
});

test('R3-c รายสัปดาห์วันศุกร์: 23 ต.ค. 2026 (วันหยุด) → พฤหัสบดี 22 ต.ค. — ไปข้างหน้าคือวันเสาร์ ไม่ใช่วันทำการของสัปดาห์นั้น', () => {
  const p = { ...W(1, 5), startDate: '2026-10-01', endDate: '2026-11-15' };
  assert.equal(plannedDateOfSlot(p, '2026-10-23', H2026), '2026-10-22');
  assert.deepEqual(
    plannedVisits(p, { from: p.startDate, to: p.endDate, holidays: H2026 }).map((v) => v.date),
    ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-22', '2026-10-30', '2026-11-06', '2026-11-13'],
  );
  // ทุก 2 สัปดาห์วันศุกร์บน SO247: ช่องแรก 23 ต.ค. เป็นวันหยุด → ถอยได้ถึงวันเริ่มรอบ (22 ต.ค.) พอดี
  assert.equal(visitsOf(W(2, 5))[0].date, '2026-10-22');
  assert.equal(visitsOf(W(2, 5)).length, 26);
  // วันหยุดกลางสัปดาห์: พุธ 3 มิ.ย. 2026 → พฤหัสบดี 4 มิ.ย. (ไปข้างหน้าในสัปดาห์เดียวกัน)
  assert.equal(plannedDateOfSlot({ ...W(1, 3), ...Y2026 }, '2026-06-03', H2026), '2026-06-04');
});

test('R3-d สงกรานต์: ช่องวันที่ 13 เม.ย. 2026 (13–15 หยุด) → 16 เม.ย. ยังอยู่ในเดือนเมษายน', () => {
  assert.equal(plannedDateOfSlot({ ...M(1, 13), ...Y2026 }, '2026-04-13', H2026), '2026-04-16');
  assert.equal(plannedDateOfSlot({ ...M(1, 14), ...Y2026 }, '2026-04-14', H2026), '2026-04-16');
  assert.equal(plannedDateOfSlot({ ...M(1, 15), ...Y2026 }, '2026-04-15', H2026), '2026-04-16');
  const april = datesOf(M(1, 13), Y2026).filter((d) => monthOf(d) === '2026-04');
  assert.deepEqual(april, ['2026-04-16']);
});

test('R3-e ช่วงวัน: นัดวันทำการแรกในช่วง · ทั้งช่วงไม่มีวันทำการ → ที่เหลือของเดือนไปข้างหน้า', () => {
  // 1 พ.ย. 2026 = อาทิตย์ → จันทร์ 2 พ.ย.
  assert.equal(plannedDateOfSlot({ ...M(1, 1, 5), ...SO247 }, '2026-11-01', H2026), '2026-11-02');
  // พ.ค. 2026: 1 หยุด · 2–3 เสาร์–อาทิตย์ · 4 หยุด → 5 พ.ค.
  assert.equal(plannedDateOfSlot({ ...M(1, 1, 5), ...Y2026 }, '2026-05-01', H2026), '2026-05-05');
  // ช่วง 1–4 ของ พ.ค. 2026 ไม่มีวันทำการเลย → ที่เหลือของเดือน ไปข้างหน้า → 5 พ.ค.
  assert.equal(plannedDateOfSlot({ ...M(1, 1, 4), ...Y2026 }, '2026-05-01', H2026), '2026-05-05');
  // ช่วง 2–3 (เสาร์–อาทิตย์) → 5 พ.ค. (4 พ.ค. เป็นวันหยุด)
  assert.equal(plannedDateOfSlot({ ...M(1, 2, 3), ...Y2026 }, '2026-05-02', H2026), '2026-05-05');
  // ⭐ D25: ช่วงที่ไม่มีวันทำการ ไป **ข้างหน้า** ในเดือนเดียวกันก่อน ไม่ใช่ถอย — ช่วง 7–8 พ.ย. 2026 (เสาร์–อาทิตย์) → จันทร์ 9 ไม่ใช่ศุกร์ 6
  assert.equal(plannedDateOfSlot({ ...M(1, 7, 8), ...SO247 }, '2026-11-07', H2026), '2026-11-09');
  // ช่วงสิ้นเดือน 30–31 ของ พ.ค. 2026 (30 เสาร์ · 31 อาทิตย์+วันหยุด): ไปข้างหน้าในเดือนไม่ได้ → ถอยไปก่อนช่วง = ศุกร์ 29
  assert.equal(plannedDateOfSlot({ ...M(1, 30, 31), ...Y2026 }, '2026-05-30', H2026), '2026-05-29');
  // ทั้งปีของช่วง 1–5 บน SO247 (ไม่มีวันหยุดปี 2027 ในชุด ⇒ 1 ม.ค. 2027 นับเป็นวันทำการ)
  assert.deepEqual(visitsOf(M(1, 1, 5)).map((v) => v.date), ['2026-11-02', '2026-12-01', '2027-01-01', '2027-02-01',
    '2027-03-01', '2027-04-01', '2027-05-03', '2027-06-01', '2027-07-01', '2027-08-02', '2027-09-01', '2027-10-01']);
});

test('R3-e ⭐ ช่วงวัน: นัดไม่เคยออกนอกช่วงเมื่อช่วงมีวันทำการ และไม่เคยออกนอกเดือน', () => {
  const range = { startDate: '2026-01-01', endDate: '2027-12-31' };
  for (const [a, b] of [[1, 5], [10, 12], [13, 15], [25, 31], [28, 31], [2, 3], [30, 31], [1, 2]]) {
    const p = { ...M(1, a, b), ...range };
    const visits = plannedVisits(p, { from: range.startDate, to: range.endDate, holidays: H2026 });
    assert.equal(visits.length, 24, `ช่วง ${a}–${b}`);
    assert.equal(new Set(visits.map((v) => monthOf(v.date))).size, 24, `ช่วง ${a}–${b}: เดือนละนัด`);
    for (const v of visits) {
      const period = slotPeriod(p, v.slot);
      assert.equal(period.from, v.slot);
      assert.equal(monthOf(period.to), monthOf(v.slot));
      assert.deepEqual(Object.keys(period.fallback), ['from', 'to']);
      assert.equal(monthOf(v.date), monthOf(v.slot), `ช่วง ${a}–${b} ช่อง ${v.slot}: นัด ${v.date} ออกนอกเดือน`);
      assert.ok(isWorkday(v.date, H2026));
      const inRange = [];
      for (let day = period.from; day <= period.to; day = addDays(day, 1)) if (isWorkday(day, H2026)) inRange.push(day);
      if (inRange.length) assert.equal(v.date, inRange[0], `ช่วง ${a}–${b} ช่อง ${v.slot}: ต้องเป็นวันทำการแรกของช่วง`);
      else assert.ok(v.date < period.from || v.date > period.to, `ช่วง ${a}–${b} ช่อง ${v.slot}: ช่วงไม่มีวันทำการ`);
    }
  }
});

test('R3-f (ตรึงไว้) รอบที่เริ่มวันเสาร์สิ้นเดือน: ถอยหลังคือก่อนวันเริ่มรอบ ⇒ นัดแรกไปเดือนถัดไป', () => {
  const range = { startDate: '2026-10-31', endDate: '2027-01-31' };
  assert.deepEqual(visitsOf(M(1, 31), range).map((v) => `${v.slot}→${v.date}`), [
    '2026-10-31→2026-11-02', '2026-11-30→2026-11-30', '2026-12-31→2026-12-30', '2027-01-31→2027-01-29',
  ]);
  // อาทิตย์ 28 ก.พ. 2027 เป็นวันเริ่มรอบและวันสุดท้ายของเดือน → จันทร์ 1 มี.ค.
  assert.equal(plannedDateOfSlot({ ...M(1, 28), startDate: '2027-02-28', endDate: '2027-05-27' }, '2027-02-28', H2026), '2027-03-01');
});

test('R3-g ไม่เลยวันสิ้นสุด ไม่ก่อนวันเริ่มรอบ — วันที่ 22 ที่รอบจบ 22 พ.ย. 2026 (อาทิตย์) → ศุกร์ 20 พ.ย.', () => {
  const p = { ...M(1, 22), startDate: '2026-10-22', endDate: '2026-11-22' };
  assert.equal(plannedDateOfSlot(p, '2026-11-22', H2026), '2026-11-20');
  assert.deepEqual(plannedVisits(p, { from: p.startDate, to: p.endDate, holidays: H2026 }).map((v) => v.date), ['2026-10-22', '2026-11-20']);
  // รอบเดียวกันที่จบสิ้นเดือน → ไปข้างหน้าได้ตามปกติ (จันทร์ 23 พ.ย.)
  assert.equal(plannedDateOfSlot({ ...p, endDate: '2026-11-30' }, '2026-11-22', H2026), '2026-11-23');
  // เริ่มรอบวันเสาร์ 22 พ.ค. 2027 วันที่ 22: ถอยไม่ได้ (ก่อนวันเริ่ม) → ไปข้างหน้าในเดือน = จันทร์ 24
  assert.equal(plannedDateOfSlot({ ...M(1, 22), startDate: '2027-05-22', endDate: '2027-12-31' }, '2027-05-22', H2026), '2027-05-24');
  // สิ้นเดือน ต.ค. 2026 (เสาร์ 31) ที่รอบเริ่มศุกร์ 30: ถอยได้ถึงวันเริ่มรอบพอดี
  assert.equal(plannedDateOfSlot({ ...M(1, 31), startDate: '2026-10-30', endDate: '2026-12-31' }, '2026-10-31', H2026), '2026-10-30');
});

test('R3-h ทุก N วัน: ไปข้างหน้าอย่างเดียวและข้ามเดือนได้ — ไม่เปลี่ยนจากเดิม', () => {
  assert.equal(plannedDateOfSlot({ ...D(30), startDate: '2026-10-01' }, '2026-10-31', H2026), '2026-11-02');
  assert.equal(plannedDateOfSlot({ ...D(30), startDate: '2026-10-01', endDate: '2026-10-31' }, '2026-10-31', H2026), '2026-11-02',
    'ชนิด days ไม่ถูกวันสิ้นสุดดึงกลับ (กติกาเดิม)');
  assert.equal(plannedDateOfSlot({ ...D(30), startDate: '2026-04-13' }, '2026-04-13', H2026), '2026-04-16');
  assert.equal(slotPeriod({ ...D(30), startDate: '2026-10-01' }, '2026-10-31'), null);
});

test('R3-i (ตรึงไว้) สัปดาห์ที่หยุดทั้งห้าวัน → จันทร์ถัดไป · ช่องแรกที่เป็นวันเริ่มรอบและวันหยุด → ไปข้างหน้าอยู่ดี', () => {
  const week = new Set([...H2026, '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  assert.equal(plannedDateOfSlot({ ...W(1, 3), ...SO247 }, '2026-11-11', week), '2026-11-16');
  // ศุกร์ 23 ต.ค. 2026 (วันหยุด) เป็นวันเริ่มรอบ: ถอยคือก่อนวันเริ่ม ไปข้างหน้าในสัปดาห์คือวันเสาร์ → จันทร์ 26
  assert.equal(plannedDateOfSlot({ ...W(1, 5), startDate: '2026-10-23', endDate: '2027-10-22' }, '2026-10-23', H2026), '2026-10-26');
});

test('⭐ การเลื่อนไม่ออกนอกสัปดาห์ (อาทิตย์–เสาร์) ของช่อง — ทุกวันจันทร์–ศุกร์ ทุก 1 และ 2 สัปดาห์ ทั้งปี 2026', () => {
  for (const every of [1, 2]) {
    for (const weekday of [1, 2, 3, 4, 5]) {
      const p = { ...W(every, weekday), ...Y2026 };
      const visits = plannedVisits(p, { from: Y2026.startDate, to: Y2026.endDate, holidays: H2026 });
      assert.equal(visits.length, countSlots(p), `ทุก ${every} สัปดาห์ วัน ${weekday}: หนึ่งช่องหนึ่งนัด`);
      for (const v of visits) {
        const period = slotPeriod(p, v.slot);
        assert.equal(period.from, weekStartOf(v.slot));
        assert.equal(period.to, addDays(weekStartOf(v.slot), 6));
        assert.equal(period.fallback, null);
        assert.ok(v.date >= period.from && v.date <= period.to, `ช่อง ${v.slot} → ${v.date} ออกนอกสัปดาห์`);
        assert.ok(isWorkday(v.date, H2026), `${v.date} ไม่ใช่วันทำการ`);
        assert.ok(v.date >= Y2026.startDate && v.date <= Y2026.endDate);
      }
      assert.equal(new Set(visits.map((v) => weekStartOf(v.date))).size, visits.length, 'สัปดาห์ละนัด');
    }
  }
});

test('slotPeriod: ต้นสัปดาห์ = weekStartOf ของ datePeriods (วันอาทิตย์) ทุกวันของสองเดือน · รายเดือน = ทั้งเดือน', () => {
  const p = { ...W(1, 3), ...SO247 };
  for (let day = '2026-10-01'; day <= '2026-11-30'; day = addDays(day, 1)) {
    const period = slotPeriod(p, day);
    assert.equal(period.from, weekStartOf(day), day);
    assert.equal(dayOfWeek(period.from), 0, `${day}: ต้นสัปดาห์ต้องเป็นวันอาทิตย์`);
    assert.equal(dayOfWeek(period.to), 6, `${day}: ท้ายสัปดาห์ต้องเป็นวันเสาร์`);
  }
  assert.deepEqual(slotPeriod({ ...M(1, 22), ...SO247 }, '2027-02-22'), { from: '2027-02-01', to: '2027-02-28', fallback: null });
  assert.deepEqual(slotPeriod({ ...M(1, 22), ...SO247 }, '2028-02-22'), { from: '2028-02-01', to: '2028-02-29', fallback: null });
  assert.deepEqual(slotPeriod({ ...M(1, 1, 5), ...SO247 }, '2026-11-01'),
    { from: '2026-11-01', to: '2026-11-05', fallback: { from: '2026-11-01', to: '2026-11-30' } });
  assert.deepEqual(slotPeriod({ ...M(1, 25, 31), ...SO247 }, '2027-02-25'),
    { from: '2027-02-25', to: '2027-02-28', fallback: { from: '2027-02-01', to: '2027-02-28' } });
  assert.equal(slotPeriod({ ...M(1, 22), ...SO247 }, 'x'), null);
  assert.equal(slotPeriod({}, '2026-11-01'), null);
  assert.equal(plannedDateOfSlot({}, '2026-11-01', H2026), null);
  assert.equal(plannedDateOfSlot({ ...M(1, 22), ...SO247 }, '2026-02-30', H2026), null);
});

// ── plannedVisits / isCadenceSlot ───────────────────────────────────────────────────────────
test('plannedVisits: กรองด้วยวันนัด (ไม่ใช่ช่อง) · เรียงตามวันนัด · ไม่มี to = [] · from ไม่ส่ง = วันเริ่มรอบ', () => {
  const p = { ...M(1, 22), ...SO247 };
  // สร้างนัดวันที่ 2026-10-01 มองไป 90 วัน → 22 ต.ค. · 23 พ.ย. (ช่อง 22) · 22 ธ.ค.
  assert.deepEqual(plannedVisits(p, { from: '2026-10-01', to: addDays('2026-10-01', 90), holidays: H2026 }), [
    { slot: '2026-10-22', date: '2026-10-22', reason: null },
    { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' },
    { slot: '2026-12-22', date: '2026-12-22', reason: null },
  ]);
  // ช่อง 22 พ.ย. (นัด 23 พ.ย.): ถามช่วง 23–23 ต้องเจอ · ถามช่วง 22–22 ต้องไม่เจอ
  assert.deepEqual(plannedVisits(p, { from: '2026-11-23', to: '2026-11-23', holidays: H2026 }).map((v) => v.slot), ['2026-11-22']);
  assert.deepEqual(plannedVisits(p, { from: '2026-11-22', to: '2026-11-22', holidays: H2026 }), []);
  // นัดที่ถอยหลัง (ช่อง 31 ต.ค. → 30 ต.ค.) อยู่ก่อน from = 31 ต.ค. ⇒ ไม่คืน (ตัวเติมนัดไม่สร้างนัดย้อนหลัง)
  assert.deepEqual(plannedVisits({ ...M(1, 31), ...SO247 }, { from: '2026-10-31', to: '2026-11-15', holidays: H2026 }), []);
  assert.deepEqual(plannedVisits(p, { from: '2026-10-01', holidays: H2026 }), []);
  assert.deepEqual(plannedVisits(p, { to: '2026-11-30', holidays: H2026 }).map((v) => v.date), ['2026-10-22', '2026-11-23']);
  assert.deepEqual(plannedVisits({ startDate: '2026-10-22' }, { to: '2026-11-30' }), []);
  // ไม่ส่งวันหยุด = เลื่อนหนีเฉพาะเสาร์–อาทิตย์
  assert.equal(plannedDateOfSlot({ ...W(1, 5), ...SO247 }, '2026-10-23'), '2026-10-23');
});

test('isCadenceSlot: จริงเฉพาะช่องของรอบ — วันนัดที่เลื่อนแล้ว · วันนอกช่วงรอบ · ของที่ไม่ใช่วัน = false', () => {
  const p = { ...M(1, 22), ...SO247 };
  assert.equal(isCadenceSlot(p, '2026-11-22'), true);
  assert.equal(isCadenceSlot(p, '2026-11-23'), false, 'วันนัดที่เลื่อนจากช่อง 22 พ.ย. ไม่ใช่ช่อง');
  assert.equal(isCadenceSlot(p, '2026-09-22'), false, 'ก่อนวันเริ่มรอบ');
  assert.equal(isCadenceSlot(p, '2027-10-22'), false, 'หลังวันสิ้นสุดรอบ');
  assert.equal(isCadenceSlot(p, '2026-11-22T00:00:00.000Z'), true, 'timestamp ที่ขึ้นต้นด้วยวัน อ่านเป็นวัน');
  for (const bad of ['x', '', null, undefined, '2026-02-30', 20261122]) assert.equal(isCadenceSlot(p, bad), false, String(bad));
  assert.equal(isCadenceSlot({ ...M(1, 22), startDate: '2026-10-22', endDate: null }, '2031-03-22'), true, 'รอบปลายเปิดก็ตอบได้');
  assert.equal(isCadenceSlot({ ...W(2, 5), ...SO247 }, '2026-11-06'), true);
  assert.equal(isCadenceSlot({ ...W(2, 5), ...SO247 }, '2026-10-30'), false, 'ศุกร์ของสัปดาห์ที่ข้าม');
  assert.equal(isCadenceSlot({ ...D(30), startDate: '2026-10-22' }, '2026-11-21'), true);
  assert.equal(isCadenceSlot({ ...D(30), startDate: '2026-10-22' }, '2026-11-23'), false);
  assert.equal(isCadenceSlot({}, '2026-11-22'), false);
});

// ── ชนิด days ต้องเท่าของเดิมทุกตัว (D10) ─────────────────────────────────────────────────────
/* สำเนาของ plannedDates เดิมใน rounds.js (ณ c0d2cf89) — เดินด้วยเลขคณิต UTC ของตัวเอง ไม่ใช้อะไรจาก cadence.js
   ไปข้างหน้าอย่างเดียว ยาม 14 วัน · การเลื่อนไม่สะสม · วันสิ้นสุดตัดที่ช่อง ไม่ใช่ที่วันนัด */
const legacyAdd = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const legacyBusinessDay = (day, holidays) => {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(day);
};
function legacyPlannedDates(plan, { from, to }, holidays) {
  const every = Number(plan.everyDays);
  if (!plan.startDate || !Number.isFinite(every) || every < 1 || !to) return [];
  const rangeFrom = from || plan.startDate;
  const out = [];
  let cursor = plan.startDate;
  for (let guard = 0; cursor <= to && guard < 2000; guard += 1) {
    if (plan.endDate && cursor > plan.endDate) break;
    let shifted = cursor;
    for (let g = 0; g < 14 && !legacyBusinessDay(shifted, holidays); g += 1) shifted = legacyAdd(shifted, 1);
    if (shifted >= rangeFrom && shifted <= to) out.push(shifted);
    cursor = legacyAdd(cursor, every);
  }
  return out;
}

test('ชนิด days: ตัวอย่างที่ rounds.test.mjs ตรึงไว้ได้ผลเดิมผ่าน plannedVisits', () => {
  const dates = (p, range) => plannedVisits(p, { ...range, holidays: H2026 }).map((v) => v.date);
  const p = { everyDays: 30, startDate: '2026-08-03', endDate: null };
  assert.deepEqual(dates(p, { from: '2026-08-01', to: '2026-11-01' }), ['2026-08-03', '2026-09-02', '2026-10-02']);
  assert.equal(dates(p, { from: '2026-08-01', to: '2026-11-05' }).at(-1), '2026-11-02');
  assert.deepEqual(dates({ everyDays: 90, startDate: '2026-08-01' }, { from: '2026-08-01', to: '2026-08-10' }), ['2026-08-03']);
  assert.deepEqual(dates({ everyDays: 30, startDate: '2026-08-01' }, { from: '2026-08-01', to: '2026-10-05' }),
    ['2026-08-03', '2026-08-31', '2026-09-30'], 'การเลื่อนไม่สะสม');
  assert.deepEqual(dates({ ...p, endDate: '2026-09-01' }, { from: '2026-08-01', to: '2026-12-01' }), ['2026-08-03']);
});

test('ตัวเลขของปัญหาเดิม (ยังเป็นจริงสำหรับชนิด days): ทุก 30 วัน 12 เดือน = 13 นัด · บางเดือนสองนัด · วันที่ของเดือนไหล 22 → 17', () => {
  const so247 = visitsOf(D(30));
  assert.equal(so247.length, 13);
  assert.deepEqual(so247.map((v) => v.slot), ['2026-10-22', '2026-11-21', '2026-12-21', '2027-01-20', '2027-02-19', '2027-03-21',
    '2027-04-20', '2027-05-20', '2027-06-19', '2027-07-19', '2027-08-18', '2027-09-17', '2027-10-17']);
  assert.deepEqual(so247.filter((v) => v.slot !== v.date).map((v) => `${v.slot}→${v.date}`),
    ['2026-11-21→2026-11-23', '2027-03-21→2027-03-22', '2027-06-19→2027-06-21', '2027-10-17→2027-10-18']);
  const y2026 = visitsOf(D(30), Y2026);
  assert.equal(y2026.length, 13);
  const perMonth = new Map();
  for (const v of y2026) perMonth.set(monthOf(v.date), (perMonth.get(monthOf(v.date)) || 0) + 1);
  assert.equal(perMonth.get('2026-06'), 2, 'มิ.ย. 2026 ได้สองนัด (2 มิ.ย. กับ 30 มิ.ย.)');
  // รอบเดียวกันตั้งเป็น "ทุกเดือน วันที่ 22": 12 นัด เดือนละนัด วันที่ไม่ไหล
  assert.equal(visitsOf(M(1, 22)).length, 12);
  assert.ok(visitsOf(M(1, 22)).every((v) => v.slot.endsWith('-22')));
});

test('⭐ ชนิด days เท่าของเดิมทุกกรณี — plannedVisits เทียบสำเนาลูปเดิม (วันเริ่มสิ้นเดือน · วันสิ้นสุดกลางการเลื่อน · from ก่อนวันเริ่ม)', () => {
  let cases = 0;
  const starts = ['2026-01-01', '2026-01-31', '2026-02-28', '2026-04-11', '2026-05-30', '2026-08-01', '2026-10-22', '2026-10-31', '2026-12-26'];
  const everys = [1, 2, 7, 14, 29, 30, 31, 45, 90, 180, 365];
  for (const startDate of starts) {
    for (const everyDays of everys) {
      for (const endDate of [null, legacyAdd(startDate, 29), legacyAdd(startDate, 100), legacyAdd(startDate, 364)]) {
        for (const [from, to] of [
          [null, legacyAdd(startDate, 90)],
          [startDate, legacyAdd(startDate, 90)],
          [legacyAdd(startDate, -20), legacyAdd(startDate, 40)],
          [legacyAdd(startDate, 17), legacyAdd(startDate, 200)],
          [legacyAdd(startDate, 60), legacyAdd(startDate, 60)],
          [legacyAdd(startDate, 100), legacyAdd(startDate, 50)],
        ]) {
          cases += 1;
          const plan = { everyDays, startDate, endDate };
          assert.deepEqual(
            plannedVisits(plan, { from, to, holidays: H2026 }).map((v) => v.date),
            legacyPlannedDates(plan, { from, to }, H2026),
            `${startDate} ทุก ${everyDays} วัน จบ ${endDate} ถาม ${from}..${to}`,
          );
        }
      }
    }
  }
  assert.equal(cases, starts.length * everys.length * 4 * 6);
});

test('ชนิด days: countSlots = floor(ช่วง ÷ N) + 1 เท่าสูตรเดิมของ estimateVisitCount', () => {
  for (const startDate of ['2026-01-01', '2026-01-31', '2026-10-22']) {
    for (const span of [0, 1, 29, 30, 31, 180, 364, 365, 730]) {
      for (const everyDays of [1, 7, 30, 33, 90, 365]) {
        assert.equal(countSlots({ everyDays, startDate, endDate: legacyAdd(startDate, span) }), Math.floor(span / everyDays) + 1);
      }
    }
  }
});

// ── R6 นัดถัดไปหลังปิดงาน (ตัวตั้งของ nextAfterDone) ─────────────────────────────────────────
test('R6-b nextPlannedAfter: ตรงเวลา · เข้าเร็ว · เข้าช้า ลงที่นัดตามรอบตัวถัดไปเสมอ — ปฏิทินไม่ขยับตามวันที่ทำจริง', () => {
  const p = { ...M(1, 22), ...SO247 };
  const next = (after, afterSlot = null) => nextPlannedAfter(p, after, H2026, { afterSlot });
  // ปิดนัดของช่อง 22 ต.ค.: after = max(วันทำจริง, วันนัด)
  assert.deepEqual(next('2026-10-22', '2026-10-22'), { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' });   // ตรงเวลา / เข้าเร็ว (20 ต.ค.)
  assert.deepEqual(next('2026-10-28', '2026-10-22'), { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' });   // ช้า 6 วัน
  assert.deepEqual(next('2026-11-25', '2026-10-22'), { slot: '2026-12-22', date: '2026-12-22', reason: null });    // ช้ามาก ข้ามรอบ
  // นัดของช่อง 22 พ.ย. ถูกย้ายมาทำ 10 พ.ย. → ไม่เสนอ 23 พ.ย. (ช่องของตัวเอง) แต่เป็น 22 ธ.ค.
  assert.deepEqual(next('2026-11-10', '2026-11-22'), { slot: '2026-12-22', date: '2026-12-22', reason: null });
  assert.deepEqual(next('2026-11-10'), { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' }, 'ไม่มีช่อง = ดูแค่วัน');
  // นัดที่ไม่มีช่อง (คนสร้างเอง) ทำ 20 พ.ย. → 23 พ.ย.
  assert.deepEqual(next('2026-11-20', null), { slot: '2026-11-22', date: '2026-11-23', reason: 'sun' });
  // ช่องสุดท้ายของรอบ → ไม่มีนัดถัดไป
  assert.equal(next('2027-09-22', '2027-09-22'), null);
  assert.equal(next('x'), null);
  assert.equal(nextPlannedAfter({}, '2026-10-22', H2026), null);
});

test('nextPlannedAfter: รายสัปดาห์ · ทุก 12 เดือน · รอบปลายเปิด — หน้าต่างค้นยาวพอหนึ่งงวดเสมอ', () => {
  const weekly = { ...W(2, 5), ...SO247 };
  // ปิดนัดของช่อง 23 ต.ค. (นัดจริง 22 ต.ค.) → ช่องถัดไป 6 พ.ย.
  assert.deepEqual(nextPlannedAfter(weekly, '2026-10-22', H2026, { afterSlot: '2026-10-23' }), { slot: '2026-11-06', date: '2026-11-06', reason: null });
  assert.equal(nextPlannedAfter(weekly, '2026-10-22', H2026).slot, '2026-11-06', 'ช่อง 23 ต.ค. นัดวันที่ 22 ⇒ ไม่ใช่ "หลัง" วันที่ 22');
  const yearly = { ...M(12, 22), startDate: '2026-10-22', endDate: null };
  assert.deepEqual(nextPlannedAfter(yearly, '2026-10-22', H2026, { afterSlot: '2026-10-22' }), { slot: '2027-10-22', date: '2027-10-22', reason: null });
  const days = { ...D(30), startDate: '2026-10-22', endDate: null };
  assert.deepEqual(nextPlannedAfter(days, '2026-10-22', H2026), { slot: '2026-11-21', date: '2026-11-23', reason: 'sat' });
});

// ── R5 ของที่ตัวเติมนัดอาศัย: ช่องคือตัวตนของนัด ไม่ใช่วันนัด ────────────────────────────────────
/* ensureVisits อยู่ใน rounds.js (เทสต์ของมันอยู่ที่ planCadence.test.mjs) — ตรงนี้ทดสอบข้อเท็จจริงระดับ cadence ที่ทำให้
   "กันซ้ำด้วยช่อง" ใช้ได้: ช่องของรอบไม่ขึ้นกับวันหยุด · ไม่ขึ้นกับวันที่สั่งสร้าง · วันนัดเท่านั้นที่ขยับ */
const fill = (p, existing, { from, horizon, holidays }) => plannedVisits(p, { from, to: addDays(from, horizon), holidays })
  .filter((planned) => !existing.some((v) => v.planSlotDate === planned.slot))
  .map((planned) => ({ planSlotDate: planned.slot, scheduledDate: planned.date }));

test('R5-a/b/c สร้างซ้ำไม่ได้นัดใหม่ · นัดที่ถูกย้ายวันไม่ถูกสร้างกลับ · เพิ่มวันหยุดทีหลังไม่เกิดนัดซ้อน', () => {
  const p = { ...M(1, 22), ...SO247 };
  const opts = { from: '2026-10-01', horizon: horizonDaysFor(p), holidays: H2026 };
  const first = fill(p, [], opts);
  assert.deepEqual(first, [
    { planSlotDate: '2026-10-22', scheduledDate: '2026-10-22' },
    { planSlotDate: '2026-11-22', scheduledDate: '2026-11-23' },
    { planSlotDate: '2026-12-22', scheduledDate: '2026-12-22' },
  ]);
  assert.deepEqual(fill(p, first, opts), [], 'R5-a สร้างรอบสอง = ไม่มีอะไรใหม่');
  // R5-b ย้ายนัดของช่อง 22 พ.ย. จาก 23 ไป 27 พ.ย. แล้วสั่งสร้างอีกครั้ง
  const moved = first.map((v) => (v.planSlotDate === '2026-11-22' ? { ...v, scheduledDate: '2026-11-27' } : v));
  assert.deepEqual(fill(p, moved, opts), [], 'R5-b ช่องยังถูกถือ แม้วันนัดเปลี่ยน');
  // R5-c มีคนเพิ่มวันหยุด 22 ธ.ค. ทีหลัง: วันนัดของช่องนั้นขยับเป็น 23 ธ.ค. แต่ช่องเดิมมีนัดแล้ว
  const later = new Set([...H2026, '2026-12-22']);
  assert.equal(plannedDateOfSlot(p, '2026-12-22', later), '2026-12-23');
  assert.deepEqual(fill(p, first, { ...opts, holidays: later }), [], 'R5-c ไม่เกิดนัดซ้อนของช่องเดียวกัน');
  // ชุดช่องของรอบไม่ขึ้นกับวันหยุดเลย
  assert.deepEqual(
    plannedVisits(p, { to: SO247.endDate, holidays: later }).map((v) => v.slot),
    plannedVisits(p, { to: SO247.endDate, holidays: null }).map((v) => v.slot),
  );
  // สั่งสร้างวันอื่น (ช่วงมองเลื่อนไป) ได้ช่องชุดเดิมต่อกัน ไม่มีช่องไหนเปลี่ยนตัว
  const nextMonth = fill(p, first, { ...opts, from: '2026-11-01' });
  assert.deepEqual(nextMonth, [{ planSlotDate: '2027-01-22', scheduledDate: '2027-01-22' }]);
});

// ── R7 ระยะสร้างนัดล่วงหน้า ──────────────────────────────────────────────────────────────────
test('R7 horizonDaysFor: days 90 · รายเดือน max(90, min(N×31, 365) + 7) · รายสัปดาห์ max(90, N×7 + 7)', () => {
  assert.equal(horizonDaysFor({ everyDays: 30 }), 90);
  assert.equal(horizonDaysFor({ everyDays: 120 }), 90, 'ชนิด days คง 90 วัน');
  assert.deepEqual(CADENCE_EVERY_MONTHS.map((every) => horizonDaysFor(M(every, 22))), [90, 90, 100, 131, 193, 372]);
  assert.deepEqual([1, 2, 13, 52].map((every) => horizonDaysFor(W(every, 5))), [90, 90, 98, 371]);
  assert.equal(horizonDaysFor(M(1, 1, 5)), 90);
  assert.equal(horizonDaysFor({}), 90, 'อ่านไม่ออก = ค่าตั้งต้น');
  assert.equal(horizonDaysFor(null), DEFAULT_HORIZON_DAYS);
});

test('🔴 horizonEndFor: รอบตามปฏิทินที่ยังไม่เริ่ม นับระยะเติมนัดจากวันเริ่มรอบ (ได้นัดแรกเสมอ) · ทุก N วันนับจากวันสร้างเท่าเดิม', () => {
  const today = '2026-10-01';
  // รอบเริ่มไปแล้ว / เริ่มวันนี้ = วันนี้ + ระยะของรอบ ทุกชนิด
  for (const p of [{ ...M(1, 22), startDate: '2026-09-01' }, { ...W(1, 3), startDate: '2026-10-01' }, { ...D(30), startDate: '2026-01-01' }]) {
    assert.equal(horizonEndFor(p, today), addDays(today, horizonDaysFor(p)), cadenceText(p));
  }
  // ยังไม่เริ่ม: ตามปฏิทิน = วันเริ่มรอบ + ระยะ · ทุก N วัน = วันนี้ + 90 (พฤติกรรมเดิม ไม่เปลี่ยน)
  assert.equal(horizonEndFor({ ...M(1, 15), startDate: '2027-01-15' }, today), addDays('2027-01-15', 90));
  assert.equal(horizonEndFor({ ...M(3, 15), startDate: '2027-01-15' }, today), addDays('2027-01-15', 100));
  assert.equal(horizonEndFor({ ...W(2, 5), startDate: '2026-12-01' }, today), addDays('2026-12-01', 90));
  assert.equal(horizonEndFor({ ...D(30), startDate: '2027-01-15' }, today), addDays(today, 90));
  // ผู้เรียกส่งระยะเอง · timestamp ถูกตัดเป็นวัน · วันสร้างไม่ใช่วัน = null · ความถี่อ่านไม่ออก = นับจากวันสร้าง
  assert.equal(horizonEndFor({ ...M(1, 15), startDate: '2027-01-15' }, today, 40), addDays('2027-01-15', 40));
  assert.equal(horizonEndFor({ ...M(1, 22), startDate: '2026-09-01' }, '2026-10-01T03:00:00Z'), addDays(today, 90));
  assert.equal(horizonEndFor(M(1, 22), 'x'), null);
  assert.equal(horizonEndFor(M(1, 22), null), null);
  assert.equal(horizonEndFor({ startDate: '2027-01-15' }, today), addDays(today, 90));
  assert.equal(horizonEndFor(null, today), addDays(today, 90));
  // ⇒ รอบตามปฏิทินที่เริ่มวันไหนก็ตามในอนาคต มีนัดแรกอยู่ในช่วงเติมนัดเสมอ (ถ้ารอบมีช่องสักช่อง)
  for (const every of CADENCE_EVERY_MONTHS) {
    for (let start = '2026-10-02'; start <= '2028-03-01'; start = addDays(start, 17)) {
      const plan = { ...M(every, 31), startDate: start, endDate: null };
      const seen = plannedVisits(plan, { from: today, to: horizonEndFor(plan, today), holidays: H2026 });
      assert.ok(seen.length >= 1, `ทุก ${every} เดือน เริ่ม ${start}: ไม่มีนัดแรก`);
    }
  }
  for (const every of CADENCE_EVERY_WEEKS) {
    for (let start = '2026-10-02'; start <= '2027-06-01'; start = addDays(start, 11)) {
      const plan = { ...W(every, 3), startDate: start, endDate: null };
      assert.ok(plannedVisits(plan, { from: today, to: horizonEndFor(plan, today), holidays: H2026 }).length >= 1, `ทุก ${every} สัปดาห์ เริ่ม ${start}`);
    }
  }
});

test('R7-a ทุก 3 เดือน วันที่ 22 สั่งสร้าง 23 ต.ค. 2026: มอง 90 วันไม่เจอนัด · มอง 100 วัน (ระยะของรอบนี้) เจอ 22 ม.ค. 2027', () => {
  const p = { ...M(3, 22), ...SO247 };
  const from = '2026-10-23';
  assert.deepEqual(plannedVisits(p, { from, to: addDays(from, 90), holidays: H2026 }), []);
  assert.equal(horizonDaysFor(p), 100);
  assert.deepEqual(plannedVisits(p, { from, to: addDays(from, horizonDaysFor(p)), holidays: H2026 }).map((v) => v.date), ['2027-01-22']);
  // จากวันไหนก็ตาม ระยะของรอบต้องเห็นนัดถัดไปอย่างน้อยหนึ่งนัด (ถ้ารอบยังไม่จบ)
  for (const every of CADENCE_EVERY_MONTHS) {
    const plan = { ...M(every, 31), startDate: '2026-01-31', endDate: null };
    for (let day = '2026-02-01'; day <= '2027-03-01'; day = addDays(day, 13)) {
      const seen = plannedVisits(plan, { from: day, to: addDays(day, horizonDaysFor(plan)), holidays: H2026 });
      assert.ok(seen.length >= 1, `ทุก ${every} เดือน จาก ${day}: ไม่เห็นนัดถัดไป`);
    }
  }
});

// ── R8 ประมาณจำนวนนัด + ข้อเสนอ ──────────────────────────────────────────────────────────────
test('R8-a countSlots: ทุก 30 วันทั้งปี 2026 = 13 (ตรึงไว้) · วันที่ 22 บน SO247 = 12 · ไม่มีวันสิ้นสุด/ข้อมูลผิด = null', () => {
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '2026-12-31', everyDays: 30 }), 13);
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '2026-01-01', everyDays: 30 }), 1);
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '2026-06-30', everyDays: 30 }), 7);
  assert.equal(countSlots({ ...M(1, 22), ...SO247 }), 12);
  assert.equal(countSlots({ ...M(1, 31), ...SO247 }), 12);
  assert.equal(countSlots({ ...M(1, 1, 5), ...SO247 }), 12);
  assert.equal(countSlots({ ...M(3, 22), ...SO247 }), 4);
  assert.equal(countSlots({ ...W(2, 4), ...SO247 }), 27);
  assert.equal(countSlots({ ...W(2, 5), ...SO247 }), 26);
  assert.equal(countSlots({ ...W(1, 5), ...SO247 }), 52);
  assert.equal(countSlots({ ...D(30), ...SO247 }), 13);
  // บอกไม่ได้ = null ไม่ใช่เดา
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '', everyDays: 30 }), null);
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: null, ...M(1, 22) }), null);
  assert.equal(countSlots({ startDate: '', endDate: '2026-12-31', everyDays: 30 }), null);
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '2026-12-31', everyDays: 0 }), null);
  assert.equal(countSlots({ startDate: '2026-12-31', endDate: '2026-01-01', everyDays: 30 }), null, 'ปลายก่อนต้น = ข้อมูลผิด ไม่ใช่ศูนย์นัด');
  assert.equal(countSlots({ startDate: '2026-12-31', endDate: '2026-01-01', ...M(1, 22) }), null);
  assert.equal(countSlots({ startDate: '2026-01-01', endDate: '2026-12-31' }), null);
  assert.equal(countSlots({ startDate: 'x', endDate: '2026-12-31', ...W(1, 3) }), null);
  assert.equal(countSlots(null), null);
});

test('countSlots อ่านวันเริ่ม/วันสิ้นสุดแบบ timestamp เหมือนวันล้วน (ทุกชนิด)', () => {
  const stamped = { startDate: '2026-10-22T00:00:00+07:00', endDate: '2027-10-21T23:59:59.000Z' };
  assert.equal(countSlots({ ...M(1, 22), ...stamped }), 12);
  assert.equal(countSlots({ ...W(2, 5), ...stamped }), 26);
  assert.equal(countSlots({ ...D(30), ...stamped }), 13);
  assert.deepEqual(cadenceSlots({ ...M(3, 22), ...stamped }), cadenceSlots({ ...M(3, 22), ...SO247 }));
  assert.deepEqual(
    plannedVisits({ ...M(1, 22), ...stamped }, { from: '2026-10-01T05:00:00Z', to: '2026-12-30T05:00:00Z', holidays: H2026 }).map((v) => v.date),
    ['2026-10-22', '2026-11-23', '2026-12-22'],
  );
});

test('R8-b suggestCadence บน SO247: ความถี่ตัวแรกที่ได้นัดเท่าจำนวนรอบบริการพอดี', () => {
  const text = (rounds) => cadenceText(suggestCadence({ ...SO247, rounds }));
  assert.deepEqual(suggestCadence({ ...SO247, rounds: 12 }),
    { ...six({ cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 }), visits: 12, exact: true, clamped: false });
  assert.equal(text(12), 'ทุกเดือน วันที่ 22');
  assert.equal(text(4), 'ทุก 3 เดือน วันที่ 22');
  assert.equal(text(6), 'ทุก 2 เดือน วันที่ 22');
  assert.equal(text(3), 'ทุก 4 เดือน วันที่ 22');
  assert.equal(text(2), 'ทุก 6 เดือน วันที่ 22');
  assert.equal(text(1), 'ทุก 12 เดือน วันที่ 22');
  assert.equal(text(52), 'ทุกสัปดาห์ วันศุกร์');
  assert.equal(text(13), 'ทุก 30 วัน');
  assert.deepEqual(suggestCadence({ ...SO247, rounds: 13 }),
    { ...six({ cadenceKind: 'days', everyDays: 30 }), visits: 13, exact: true, clamped: false });
  // 24 รอบ: ไม่มีความถี่ไหนพอดี → ทุก 15 วัน ได้ 25 นัด บอกตรง ๆ ว่าไม่พอดี
  assert.deepEqual(suggestCadence({ ...SO247, rounds: 24 }),
    { ...six({ cadenceKind: 'days', everyDays: 15 }), visits: 25, exact: false, clamped: false });
  // ทุกข้อเสนอผ่านตัวตรวจ และนับช่องได้เท่าที่บอก
  for (let rounds = 1; rounds <= 60; rounds += 1) {
    const s = suggestCadence({ ...SO247, rounds });
    assert.equal(normalizeCadence(s).error, null, `รอบ ${rounds}`);
    assert.deepEqual(Object.keys(s), [...CADENCE_FIELDS, 'visits', 'exact', 'clamped']);
    assert.equal(countSlots({ ...s, ...SO247 }), s.visits, `รอบ ${rounds}`);
    assert.equal(s.exact, s.visits === rounds);
    assert.ok(s.visits >= rounds, `รอบ ${rounds}: ข้อเสนอต้องไม่ให้นัดน้อยกว่าจำนวนรอบบริการ`);
  }
});

test('⭐ 26 รอบ (ทุก 2 สัปดาห์): ยึดวันเริ่ม (พฤหัสฯ) ได้ 27 ⇒ ตัวค้นเลือกวันศุกร์ที่ได้ 26 พอดี', () => {
  assert.equal(countSlots({ ...W(2, 4), ...SO247 }), 27, 'ยึดวันพฤหัสบดี (วันเริ่มรอบ) = 27');
  const s = suggestCadence({ ...SO247, rounds: 26 });
  assert.deepEqual(s, { ...six({ cadenceKind: 'weekly', cadenceEvery: 2, cadenceWeekday: 5 }), visits: 26, exact: true, clamped: false });
  assert.equal(cadenceText(s), 'ทุก 2 สัปดาห์ วันศุกร์');
  assert.equal(countSlots({ ...s, ...SO247 }), 26);
  // 27 รอบ → วันพฤหัสบดี (วันเริ่มรอบมาก่อนในลำดับค้น)
  assert.equal(cadenceText(suggestCadence({ ...SO247, rounds: 27 })), 'ทุก 2 สัปดาห์ วันพฤหัสบดี');
  assert.equal(cadenceText(suggestCadence({ ...SO247, rounds: 53 })), 'ทุกสัปดาห์ วันพฤหัสบดี');
});

test('R8-c suggestCadence ช่วงอื่น + ไม่เสนอวันเสาร์–อาทิตย์ (วันเริ่มเป็นเสาร์–อาทิตย์ ไล่จากวันจันทร์)', () => {
  const pick = (startDate, endDate, rounds) => suggestCadence({ startDate, endDate, rounds });
  assert.equal(cadenceText(pick('2026-10-01', '2027-09-30', 12)), 'ทุกเดือน วันที่ 1');
  assert.equal(cadenceText(pick('2026-10-01', '2027-09-30', 26)), 'ทุก 2 สัปดาห์ วันศุกร์');
  assert.deepEqual(pick('2026-12-01', '2027-10-21', 12), { ...six({ cadenceKind: 'days', everyDays: 29 }), visits: 12, exact: true, clamped: false });
  assert.deepEqual(pick('2026-09-02', '2027-09-25', 12), { ...six({ cadenceKind: 'days', everyDays: 35 }), visits: 12, exact: true, clamped: false });
  assert.equal(countSlots({ ...M(1, 2), startDate: '2026-09-02', endDate: '2027-09-25' }), 13, 'รายเดือนวันที่ 2 ได้ 13 จึงไม่ถูกเลือก');
  assert.deepEqual(pick('2026-01-01', '2028-01-01', 2), { ...six({ cadenceKind: 'days', everyDays: 365 }), visits: 3, exact: false, clamped: true });
  assert.equal(cadenceText(pick('2026-10-01', '2028-09-30', 2)), 'ทุก 12 เดือน วันที่ 1');
  assert.equal(cadenceText(pick('2026-01-31', '2027-01-30', 12)), 'ทุกเดือน สิ้นเดือน', 'เริ่มวันที่ 31 = สิ้นเดือน');

  // วันเริ่มเสาร์ 24 ต.ค. 2026 · 52 สัปดาห์: ไล่จากวันจันทร์ — ไม่เคยเสนอเสาร์–อาทิตย์
  assert.equal(dayOfWeek('2026-10-24'), 6);
  assert.equal(cadenceText(pick('2026-10-24', '2027-10-22', 52)), 'ทุกสัปดาห์ วันจันทร์');
  assert.equal(dayOfWeek('2026-10-25'), 0);
  assert.equal(cadenceText(pick('2026-10-25', '2027-10-23', 52)), 'ทุกสัปดาห์ วันจันทร์');
  for (const startDate of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']) {
    for (let rounds = 1; rounds <= 60; rounds += 1) {
      const s = pick(startDate, periodEnd(startDate, 12), rounds);
      if (s.cadenceKind === 'weekly') assert.ok(s.cadenceWeekday >= 1 && s.cadenceWeekday <= 5, `${startDate} รอบ ${rounds}`);
      assert.equal(normalizeCadence(s).error, null, `${startDate} รอบ ${rounds}`);
    }
  }
  // ข้อมูลไม่พอ = null (ไม่เดา)
  assert.equal(suggestCadence(), null);
  assert.equal(suggestCadence({ ...SO247 }), null);
  for (const rounds of [0, -3, 1.5, null, '12']) assert.equal(suggestCadence({ ...SO247, rounds }), null, String(rounds));
  assert.equal(pick(null, '2027-10-21', 12), null);
  assert.equal(pick('2026-10-22', null, 12), null);
  assert.equal(pick('2027-10-21', '2026-10-22', 12), null);
  assert.equal(pick('x', '2027-10-21', 12), null);
});

test('R8-d suggestEveryDays: ผลเท่าเดิมทุกกรณีที่ rounds.test.mjs ตรึงไว้ (ย้ายบ้านมา พฤติกรรมไม่เปลี่ยน)', () => {
  const span = { startDate: '2026-10-01', endDate: '2027-09-30' };
  assert.deepEqual(suggestEveryDays({ ...span, rounds: 12 }), { everyDays: 33, visits: 12, clamped: false });
  assert.deepEqual(suggestEveryDays({ ...span, rounds: 13 }), { everyDays: 30, visits: 13, clamped: false });
  assert.deepEqual(suggestEveryDays({ ...span, rounds: 1 }), { everyDays: 365, visits: 1, clamped: false });
  assert.deepEqual(suggestEveryDays({ startDate: '2026-10-01', endDate: '2027-11-05', rounds: 1 }), { everyDays: 365, visits: 2, clamped: true });
  assert.deepEqual(suggestEveryDays({ startDate: '2026-01-01', endDate: '2028-01-01', rounds: 2 }), { everyDays: 365, visits: 3, clamped: true });
  assert.deepEqual(suggestEveryDays({ ...span, rounds: 400 }), { everyDays: 1, visits: 365, clamped: true });
  assert.equal(suggestEveryDays(), null);
  assert.equal(suggestEveryDays({ ...span }), null);
  for (const rounds of [0, -3, 1.5, null, '12']) assert.equal(suggestEveryDays({ ...span, rounds }), null, String(rounds));
  assert.equal(suggestEveryDays({ startDate: null, endDate: '2027-09-30', rounds: 12 }), null);
  assert.equal(suggestEveryDays({ startDate: '2026-10-01', endDate: null, rounds: 12 }), null);
  assert.equal(suggestEveryDays({ startDate: '2027-09-30', endDate: '2026-10-01', rounds: 12 }), null);
  assert.equal(suggestEveryDays({ startDate: 'x', endDate: '2027-09-30', rounds: 12 }), null);
  for (let rounds = 1; rounds <= 60; rounds += 1) {
    const s = suggestEveryDays({ ...span, rounds });
    assert.ok(s.visits >= rounds, `รอบ ${rounds}`);
    assert.ok(s.everyDays >= 1 && s.everyDays <= 365);
    assert.equal(s.clamped, false);
    assert.equal(s.visits, countSlots({ ...span, everyDays: s.everyDays }), 'visits = ตัวนับเดียวกับ countSlots');
  }
});

// ── คำบอกความถี่ ───────────────────────────────────────────────────────────────────────────
test('cadenceText: ทุกรูป · อ่านไม่ออก = ขีด', () => {
  assert.equal(cadenceText({ everyDays: 30 }), 'ทุก 30 วัน');
  assert.equal(cadenceText({ cadenceKind: 'days', everyDays: 7 }), 'ทุก 7 วัน');
  assert.equal(cadenceText(W(1, 3)), 'ทุกสัปดาห์ วันพุธ');
  assert.equal(cadenceText(W(2, 5)), 'ทุก 2 สัปดาห์ วันศุกร์');
  assert.equal(cadenceText(W(1, 4)), 'ทุกสัปดาห์ วันพฤหัสบดี');
  assert.equal(cadenceText(M(1, 22)), 'ทุกเดือน วันที่ 22');
  assert.equal(cadenceText(M(3, 22)), 'ทุก 3 เดือน วันที่ 22');
  assert.equal(cadenceText(M(1, 31)), 'ทุกเดือน สิ้นเดือน');
  assert.equal(cadenceText(M(6, 31)), 'ทุก 6 เดือน สิ้นเดือน');
  assert.equal(cadenceText(M(1, 1, 5)), 'ทุกเดือน วันที่ 1–5');
  assert.equal(cadenceText(M(1, 25, 31)), 'ทุกเดือน วันที่ 25–สิ้นเดือน');
  assert.equal(cadenceText({ ...M(1, 22), ...SO247, id: 'P1' }), 'ทุกเดือน วันที่ 22', 'รับแถวรอบทั้งแถวได้');
  for (const bad of [null, undefined, {}, { everyDays: null }, { cadenceKind: 'weekly' }, M(1, 5, 5)]) assert.equal(cadenceText(bad), '—');
});

test('cadenceShiftText: ประโยคบอกทิศการเลื่อนของแต่ละชนิด', () => {
  assert.equal(cadenceShiftText({ everyDays: 30 }), 'ตกวันหยุดเลื่อนไปวันทำการถัดไป');
  assert.equal(cadenceShiftText(W(1, 3)), 'ตกวันหยุดเลื่อนไปวันทำการในสัปดาห์เดียวกัน');
  assert.equal(cadenceShiftText(M(1, 22)), 'ตกวันหยุดเลื่อนไปวันทำการในเดือนเดียวกัน');
  assert.equal(cadenceShiftText(M(1, 1, 5)), 'นัดวันทำการแรกของช่วง');
  assert.equal(cadenceShiftText({}), '');
});

// ── วันหยุดครอบถึงปีไหน ─────────────────────────────────────────────────────────────────────
test('yearsWithoutHolidays / holidayGapText: SO247 กับวันหยุดที่มีแค่ปี 2026 → [2027] · ชุดว่าง = [] (ยังไม่โหลด ≠ ปีขาด)', () => {
  assert.deepEqual(yearsWithoutHolidays(H2026, '2026-10-22', '2027-10-21'), [2027]);
  assert.deepEqual(yearsWithoutHolidays(new Map([...H2026].map((d) => [d, 'วันหยุด'])), '2026-10-22', '2027-10-21'), [2027], 'Map ก็ใช้ได้');
  assert.deepEqual(yearsWithoutHolidays(H2026, '2026-01-01', '2026-12-31'), []);
  assert.deepEqual(yearsWithoutHolidays(H2026, '2025-06-01', '2028-02-01'), [2025, 2027, 2028]);
  assert.deepEqual(yearsWithoutHolidays(new Set([...H2026, '2027-01-01']), '2026-10-22', '2027-10-21'), [], 'แถวเดียวของปีนั้นก็นับว่ามี');
  assert.deepEqual(yearsWithoutHolidays(H2026, '2026-10-22T00:00:00Z', '2027-10-21T00:00:00Z'), [2027]);
  for (const empty of [new Set(), new Map(), null, undefined, []]) {
    assert.deepEqual(yearsWithoutHolidays(empty, '2026-10-22', '2027-10-21'), [], 'ชุดว่าง/ไม่ใช่ชุด = ไม่เตือน');
  }
  assert.deepEqual(yearsWithoutHolidays(H2026, '2027-10-21', '2026-10-22'), [], 'ช่วงกลับด้าน');
  assert.deepEqual(yearsWithoutHolidays(H2026, 'x', '2027-10-21'), []);

  assert.equal(holidayGapText([2027]),
    'ยังไม่มีวันหยุดปี 2027 ในระบบ — นัดของปีนั้นเลื่อนหนีเฉพาะเสาร์–อาทิตย์ · เพิ่มวันหยุดที่ ตั้งค่า → วันหยุด ก่อนถึงรอบสร้างนัด');
  assert.match(holidayGapText([2027, 2028]), /^ยังไม่มีวันหยุดปี 2027 · 2028 ในระบบ — /);
  assert.equal(holidayGapText([]), null);
  assert.equal(holidayGapText(null), null);
  // ปี ค.ศ. ตามกติกาของระบบ — ไม่มี พ.ศ. (2570) ในข้อความ
  assert.doesNotMatch(holidayGapText([2027]), /25[67]\d/);
});

// ── แคตตาล็อกคำ ─────────────────────────────────────────────────────────────────────────────
test('CADENCE_TEXT: มีครบทุกคีย์ของแผน §9.4 · ตัวที่เป็นฟังก์ชันประกอบคำได้ถูก', () => {
  assert.deepEqual(Object.keys(CADENCE_TEXT), ['fieldLabel', 'tiles', 'everyLabel', 'monthsUnit', 'weeksUnit', 'monthDayLabel',
    'dayModes', 'monthEndHint', 'rangeHint', 'rangePending', 'rangeUnset', 'weekdayLabel', 'weekendBlocked', 'accessWarning', 'everyDaysLabel',
    'everyDaysHint', 'visits', 'matchesSold', 'needEndDate', 'nextLabel', 'shiftReason', 'useSuggestion', 'useSuggestionAria',
    'confirm', 'holidayReadFailed']);
  assert.deepEqual(CADENCE_TEXT.tiles.map((t) => t.value), CADENCE_KINDS, 'ลำดับไทล์ = ลำดับชนิด');
  assert.deepEqual(CADENCE_TEXT.tiles.map((t) => Object.keys(t)), Array(3).fill(['value', 'label', 'description']));
  assert.deepEqual(CADENCE_TEXT.tiles.map((t) => t.label), ['ทุกเดือน (ตามวันที่)', 'ทุกสัปดาห์ (ตามวัน)', 'ทุก N วัน']);
  assert.deepEqual(CADENCE_TEXT.dayModes, [{ value: 'single', label: 'วันเดียว' }, { value: 'range', label: 'ช่วงวัน' }]);
  assert.equal(CADENCE_TEXT.fieldLabel, 'ความถี่');
  assert.equal(CADENCE_TEXT.monthsUnit(3), '3 เดือน');
  assert.equal(CADENCE_TEXT.weeksUnit(2), '2 สัปดาห์');
  assert.equal(CADENCE_TEXT.visits(12), 'ได้ 12 นัด');
  assert.equal(CADENCE_TEXT.matchesSold, 'ตรงกับจำนวนรอบบริการ');
  assert.deepEqual(Object.keys(CADENCE_TEXT.shiftReason), ['sun', 'sat', 'holiday']);
  assert.equal(CADENCE_TEXT.useSuggestionAria('ทุกเดือน วันที่ 22'), 'ใช้ความถี่ทุกเดือน วันที่ 22');
  assert.equal(CADENCE_TEXT.weekendBlocked, 'ช่างไม่เข้าไซต์เสาร์–อาทิตย์');
  // คำเตือนวันที่ไซต์ให้เข้า: ท่อนแรกคือประโยคเดียวกับ sites.accessConflict · เรียกชื่อวันที่เลือก ไม่ใช่ "วันนี้" (อ่านเป็น today)
  assert.equal(CADENCE_TEXT.accessWarning('จ. อ. พ.', 'พฤหัสบดี'), 'ไซต์นี้ให้เข้าเฉพาะ จ. อ. พ. — วันพฤหัสบดีอยู่นอกวันที่ไซต์เปิดให้เข้า');
  assert.doesNotMatch(CADENCE_TEXT.accessWarning('จ.', 'ศุกร์'), /วันนี้/);
  assert.equal(CADENCE_TEXT.rangeUnset, 'เลือกวันแรกและวันสุดท้ายของช่วง หรือเปลี่ยนเป็น “วันเดียว”');
  assert.ok(CADENCE_ERRORS.weekend.startsWith(CADENCE_TEXT.weekendBlocked), 'จอกับ API พูดเรื่องเดียวกันด้วยคำเดียวกัน');

  const c = CADENCE_TEXT.confirm;
  assert.deepEqual(Object.keys(c), ['title', 'message', 'detail', 'kept', 'stays', 'confirmLabel', 'cancelLabel', 'needConfirm', 'stale',
    'threadBody', 'cancelFailed', 'saveFailed', 'afterSaveFailed']);
  assert.equal(c.stays(1), 'คงนัดเดิม 1 นัดไว้ตามรอบใหม่');
  assert.equal(c.stays(0), null);
  assert.equal(c.stays(), null);
  assert.equal(c.title, 'เปลี่ยนรอบบริการ');
  assert.equal(c.message(2), 'ยกเลิกนัดตามรอบเดิม 2 นัด?');
  assert.equal(c.confirmLabel(2), 'ยกเลิกนัดตามรอบเดิม 2 นัด แล้วบันทึก');
  assert.equal(c.cancelLabel, 'กลับไปแก้รอบ');
  assert.equal(c.needConfirm(2), 'รอบนี้มีนัดตามรอบเดิมที่ยังไม่ได้เข้า 2 นัด — ยืนยันการยกเลิกนัดก่อนบันทึก');
  assert.match(c.detail('ทุก 30 วัน', 'ทุกเดือน วันที่ 22'), /^รอบเปลี่ยนจาก “ทุก 30 วัน” เป็น “ทุกเดือน วันที่ 22” — /);
  assert.match(c.detail('ทุกเดือน วันที่ 22', 'ทุกเดือน วันที่ 22'), /^วันเริ่มหรือวันสิ้นสุดของรอบเปลี่ยน — /);
  for (const text of [c.detail('ก', 'ข'), c.detail('ก', 'ก')]) {
    assert.match(text, /จะถูกยกเลิกและถอดออกจากรอบนี้ \(ยังเห็นในประวัติของไซต์\) แล้วระบบสร้างนัดตามรอบใหม่ให้$/, 'โมดัลบอกผลก่อนลงมือ');
  }
  assert.equal(c.kept(), null);
  assert.equal(c.kept({ moved: 0, started: 0, past: 0 }), null);
  assert.equal(c.kept({ moved: 1 }), 'นัดตามรอบเดิมที่ไม่ถูกแตะ: ย้ายวันเอง 1 นัด — จัดการเองได้ที่หน้าจัดคิว');
  assert.equal(c.kept({ moved: 1, started: 2, past: 3 }),
    'นัดตามรอบเดิมที่ไม่ถูกแตะ: ย้ายวันเอง 1 นัด · กำลังทำ 2 นัด · เลยวันนัดแล้ว 3 นัด — จัดการเองได้ที่หน้าจัดคิว');
  // นัดของรอบที่คนตั้งเอง (ไม่มีช่อง) — ไม่ถูกยกเลิก/ย้าย แต่ต้องถูกบอก
  assert.equal(c.kept({ manual: 2 }), 'นัดตามรอบเดิมที่ไม่ถูกแตะ: ตั้งนัดเอง 2 นัด — จัดการเองได้ที่หน้าจัดคิว');
  assert.equal(c.kept({ moved: 1, started: 0, past: 0, manual: 1 }),
    'นัดตามรอบเดิมที่ไม่ถูกแตะ: ย้ายวันเอง 1 นัด · ตั้งนัดเอง 1 นัด — จัดการเองได้ที่หน้าจัดคิว');
  assert.equal(c.kept({ moved: 0, started: 0, past: 0, manual: 0 }), null);
  assert.equal(c.threadBody('ทุก 30 วัน', 'ทุกเดือน วันที่ 22'), 'ยกเลิกนัดตามรอบเดิม — รอบบริการเปลี่ยนจาก “ทุก 30 วัน” เป็น “ทุกเดือน วันที่ 22”');
  assert.equal(c.threadBody('ทุกเดือน วันที่ 22', 'ทุกเดือน วันที่ 22'), 'ยกเลิกนัดตามรอบเดิม — ช่วงของรอบบริการเปลี่ยน (ทุกเดือน วันที่ 22)');
  assert.equal(c.saveFailed(3), 'ยกเลิกนัดตามรอบเดิมแล้ว 3 นัด แต่บันทึกรอบไม่สำเร็จ — กดบันทึกอีกครั้ง');
  assert.equal(CADENCE_TEXT.holidayReadFailed, 'อ่านวันหยุดของระบบไม่สำเร็จ — ยังไม่ได้บันทึกอะไร ลองอีกครั้ง');
  assert.ok(Object.isFrozen(CADENCE_TEXT) && Object.isFrozen(CADENCE_TEXT.confirm) && Object.isFrozen(CADENCE_TEXT.tiles));
});

test('CADENCE_ERRORS: เก้าข้อความ · staleClient อยู่ในแคตตาล็อกแต่ไม่ออกจาก normalizeCadence', () => {
  assert.deepEqual(Object.keys(CADENCE_ERRORS), ['kind', 'days', 'weekEvery', 'weekday', 'weekend', 'monthEvery', 'monthDay', 'monthDayTo', 'staleClient']);
  assert.equal(CADENCE_ERRORS.kind, 'ต้องเลือกความถี่ของรอบ');
  assert.equal(CADENCE_ERRORS.weekEvery, 'รอบรายสัปดาห์ต้องเป็นทุก 1–52 สัปดาห์');
  assert.equal(CADENCE_ERRORS.weekday, 'ต้องเลือกวันของสัปดาห์');
  assert.equal(CADENCE_ERRORS.weekend, 'ช่างไม่เข้าไซต์เสาร์–อาทิตย์ — เลือกวันจันทร์–ศุกร์');
  assert.equal(CADENCE_ERRORS.monthEvery, 'รอบรายเดือนต้องเป็นทุก 1–12 เดือน');
  assert.equal(CADENCE_ERRORS.monthDay, 'ต้องเลือกวันที่ของเดือน (1–31)');
  assert.equal(CADENCE_ERRORS.monthDayTo, 'วันสุดท้ายของช่วงต้องอยู่หลังวันแรก และไม่เกินวันที่ 31');
  assert.equal(CADENCE_ERRORS.staleClient, 'หน้านี้เป็นรุ่นเก่า — รอบนี้ตั้งตามปฏิทินแล้ว รีเฟรชหน้าแล้วแก้รอบอีกครั้ง');
  // แท็บรุ่นเก่าที่ส่งแค่ everyDays ยังผ่านตัวตรวจเป็น days — การปฏิเสธเป็นหน้าที่ของ mergePlanPatch (รู้ว่ารอบเดิมเป็นชนิดไหน)
  assert.equal(normalizeCadence({ everyDays: 30 }).error, null);
  assert.ok(Object.isFrozen(CADENCE_ERRORS));
});

test('🔴 คำต้องห้ามของจำนวนรอบบริการ (มติ 29/09) ไม่อยู่ในแคตตาล็อกและไม่อยู่ในไฟล์ทั้งไฟล์ (รวมคอมเมนต์)', () => {
  const BANNED = /ไปกี่รอบ|ไป \$\{[^}]*\} รอบ|ขายไว้|ตามที่ขาย|รอบที่ขาย|รอบ\/โซน|ระบุไว้/;
  const strings = [];
  const walk = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (typeof value === 'function') {
      for (const args of [[2], ['ทุก 30 วัน', 'ทุกเดือน วันที่ 22'], ['ก', 'ก'], [{ moved: 1, started: 1, past: 1 }]]) {
        const out = value(...args);
        if (typeof out === 'string') strings.push(out);
      }
    } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(CADENCE_TEXT);
  walk(CADENCE_ERRORS);
  assert.ok(strings.length > 50, `เก็บข้อความได้แค่ ${strings.length} — ตัวเดินแคตตาล็อกน่าจะพัง`);
  assert.deepEqual(strings.filter((s) => BANNED.test(s)), []);
  assert.deepEqual(SOURCE.split('\n').filter((line) => BANNED.test(line)), []);
  // รอบของ TS เรียก "รอบบริการ" / "รอบ" — ไม่มีคำว่า "แผน" บนจอ
  assert.deepEqual(strings.filter((s) => /แผนบริการ|service plan/i.test(s)), []);
});

// ── ข้อความของ migration 0397 (ไฟล์เดียวกับที่เจ้าของรันมือ) ───────────────────────────────────
const MIGRATION = readFileSync(new URL('../../../supabase/migrations/0397_service_plan_calendar_cadence.sql', import.meta.url), 'utf8');
const stripSqlComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const SQL = stripSqlComments(MIGRATION);

test('mig 0397: คอลัมน์ · CHECK · index ครบ · ไม่สร้างฟังก์ชัน · ไม่มีตารางชั่วคราว · ไม่แตะข้อมูล · รันซ้ำได้', () => {
  for (const column of CADENCE_FIELDS.filter((name) => name !== 'everyDays')) {
    assert.match(SQL, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  }
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS "cadenceKind"\s+text\s+NOT NULL DEFAULT 'days'/, 'แถวเดิม/โค้ดรุ่นเก่าได้ days จากค่าตั้งต้น');
  assert.match(SQL, /ALTER COLUMN "everyDays" DROP NOT NULL/);
  assert.match(SQL, /DROP CONSTRAINT IF EXISTS service_plans_cadence_shape;\s*ALTER TABLE public\.service_plans ADD CONSTRAINT service_plans_cadence_shape CHECK/);
  assert.match(SQL, /ALTER TABLE public\.service_visits ADD COLUMN IF NOT EXISTS "planSlotDate" date/);
  assert.match(SQL, /CREATE INDEX IF NOT EXISTS service_visits_plan_slot_idx\s+ON public\.service_visits \("planId", "planSlotDate"\) WHERE "planId" IS NOT NULL/);
  assert.doesNotMatch(SQL, /CREATE UNIQUE INDEX/, 'index ของช่องไม่ unique โดยตั้งใจ (2 SO = 2 รอบ)');
  assert.match(SQL, /mig_0397_needs_0188/);

  // ทั้งไฟล์รวมคอมเมนต์: ไม่มีข้อความ "FUNCTION public." (ไฟล์นี้ไม่สร้างฟังก์ชัน) และไม่มีตารางชั่วคราว
  assert.equal(MIGRATION.includes('FUNCTION public.'), false);
  assert.doesNotMatch(MIGRATION, /\bTEMP/i);
  assert.doesNotMatch(SQL, /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER|TABLE)\b/i);
  assert.doesNotMatch(SQL, /\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|TRUNCATE)\b/i, 'ไม่มีคำสั่งแตะข้อมูล');
  assert.doesNotMatch(SQL, /date_trunc\s*\(\s*'week'/i);

  // ครอบด้วยทรานแซกชัน แล้วสั่ง PostgREST โหลด schema ใหม่
  assert.match(SQL, /^\s*BEGIN;/);
  assert.match(SQL, /COMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/);
  assert.equal((SQL.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((SQL.match(/^COMMIT;$/gm) || []).length, 1);

  // หัวไฟล์: ลำดับ deploy · SELECT ตรวจหลังรันพร้อมค่าที่คาด · บล็อกถอยกลับ
  const header = MIGRATION.slice(0, MIGRATION.indexOf('\nBEGIN;'));
  assert.match(header, /ลำดับ deploy/);
  assert.match(header, /ตรวจหลังรัน \(อ่านอย่างเดียว\)/);
  assert.match(header, /plan_cols = 5 · every_days_nullable = YES · shape_check = 1 · slot_col = 1 · slot_idx = 1 · bad_shape = 0/);
  assert.match(header, /plans = 0 · calendar_plans = 0/);
  assert.match(header, /ถอยกลับ/);
  assert.match(header, /ALTER TABLE public\.service_plans ALTER COLUMN "everyDays" SET NOT NULL;/);
  assert.match(header, /0398/, 'หัวไฟล์เตือนว่าเลขถัดไปมีคนจองแล้ว');
});

test('mig 0397: ขอบของ CHECK = ขอบของตัวตรวจ (365 · 52 · 0–6 · 12 · 31) และทุกช่องบังคับมี IS NOT NULL', () => {
  const check = SQL.slice(SQL.indexOf('ADD CONSTRAINT service_plans_cadence_shape CHECK'), SQL.indexOf('COMMENT ON COLUMN'));
  assert.match(check, /CASE "cadenceKind"/);
  assert.match(check, /ELSE false\s+END/);
  const when = (kind) => check.slice(check.indexOf(`WHEN '${kind}' THEN`)).split(/WHEN '|ELSE false/)[1];
  const days = when('days');
  const weekly = when('weekly');
  const monthly = when('monthly');
  assert.match(days, /"everyDays" IS NOT NULL AND "everyDays" BETWEEN 1 AND 365/);
  assert.match(days, /"cadenceEvery" IS NULL AND "cadenceWeekday" IS NULL\s+AND "cadenceMonthDay" IS NULL AND "cadenceMonthDayTo" IS NULL/);
  assert.match(weekly, /"everyDays" IS NULL/);
  assert.match(weekly, /"cadenceEvery" IS NOT NULL AND "cadenceEvery" BETWEEN 1 AND 52/);
  assert.match(weekly, /"cadenceWeekday" IS NOT NULL AND "cadenceWeekday" BETWEEN 0 AND 6/);
  assert.match(weekly, /"cadenceMonthDay" IS NULL AND "cadenceMonthDayTo" IS NULL/);
  assert.match(monthly, /"everyDays" IS NULL/);
  assert.match(monthly, /"cadenceEvery" IS NOT NULL AND "cadenceEvery" BETWEEN 1 AND 12/);
  assert.match(monthly, /"cadenceMonthDay" IS NOT NULL AND "cadenceMonthDay" BETWEEN 1 AND 31/);
  assert.match(monthly, /"cadenceWeekday" IS NULL/);
  assert.match(monthly, /"cadenceMonthDayTo" IS NULL\s+OR \("cadenceMonthDayTo" > "cadenceMonthDay" AND "cadenceMonthDayTo" <= 31\)/);

  // ตัวตรวจฝั่ง JS ที่ขอบเดียวกัน: ในขอบผ่าน · เลยขอบหนึ่งก้าวตก
  const ok = (body) => normalizeCadence(body).error === null;
  assert.deepEqual([ok({ everyDays: 1 }), ok({ everyDays: 365 }), ok({ everyDays: 0 }), ok({ everyDays: 366 })], [true, true, false, false]);
  assert.deepEqual([ok(W(1, 1)), ok(W(52, 5)), ok(W(0, 1)), ok(W(53, 1))], [true, true, false, false]);
  assert.deepEqual([ok(M(1, 1)), ok(M(12, 31)), ok(M(0, 1)), ok(M(13, 1)), ok(M(1, 0)), ok(M(1, 32))], [true, true, false, false, false, false]);
  assert.deepEqual([ok(M(1, 30, 31)), ok(M(1, 1, 2)), ok(M(1, 30, 32)), ok(M(1, 5, 5))], [true, true, false, false]);
  // ตัวอ่านรับวันในสัปดาห์ 0–6 เท่า CHECK (กว้างกว่าตัวตรวจข้อเดียว: เสาร์–อาทิตย์เป็นกติกางาน ไม่ใช่รูปข้อมูล)
  assert.deepEqual([0, 6, 7].map((weekday) => cadenceOf(W(1, weekday)) !== null), [true, true, false]);
  assert.equal(ok(W(1, 0)), false);
  assert.equal(ok(W(1, 6)), false);
});
