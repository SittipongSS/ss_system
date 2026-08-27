import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatrix,
  overlayHistory,
  unallocatedRow,
  rowHasValue,
  closedCountOnAxis,
  indexOfMonth,
  monthsOfDashboards,
  rangeWindow,
  closedMonths,
  ytdMonths,
  carryIn,
  windowStat,
  yearSummary,
  statusOf,
  carryTable,
  yoySeries,
  cumulativeSeries,
  windowForPeriod,
  bpOfWindow,
  toKind,
  prevPeriod,
  nextPeriod,
  periodKindOf,
} from './performanceMath';

const row = (target, actual, forecast = Array(12).fill(0), fcTotal = forecast) => ({ target, actual, forecast, fcTotal });
const fill = (v) => Array(12).fill(v);

/* ---------- buildMatrix ---------- */

test('buildMatrix folds byOwner/byTeam/totals into 12-slot arrays and sorts by team order', () => {
  const months = [
    {
      month: '2026-01',
      totals: { targetAmount: 30, fullForecast: 21, weightedForecast: 5, wonValue: 12 },
      byOwner: [
        { ownerId: 'u2', ownerName: 'บี', team: 'SV', target: 10, won: 4, weighted: 2, fcTotal: 8 },
        { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 10, won: 8, weighted: 3, fcTotal: 13 },
      ],
      byTeam: [
        { team: 'SV', target: 10, won: 4, weighted: 2, fcTotal: 8 },
        { team: 'KA', target: 20, won: 8, weighted: 3, fcTotal: 13 }, // เป้าทีม > รวมรายคน (มีเป้าระดับทีม)
      ],
    },
    {
      month: '2026-03',
      totals: { targetAmount: 40, fullForecast: 6, weightedForecast: 0, wonValue: 0 },
      byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 15, won: 0, weighted: 0, fcTotal: 6 }],
      byTeam: [{ team: 'KA', target: 15, won: 0, weighted: 0, fcTotal: 6 }],
    },
  ];
  const m = buildMatrix(months);
  assert.equal(m.people.length, 2);
  assert.deepEqual(m.people.map((p) => p.name), ['เอ', 'บี']); // KA มาก่อน SV
  assert.equal(m.people[0].target[0], 10);
  assert.equal(m.people[0].target[2], 15);
  assert.equal(m.people[0].actual[0], 8);
  assert.equal(m.people[0].fcTotal[0], 13);
  assert.equal(m.people[0].fcTotal[2], 6);
  assert.equal(m.people[0].forecast[0], 3);
  assert.equal(m.people[0].target[1], 0); // เดือนไม่มีข้อมูล = 0
  // ทีมอ่านจาก byTeam ตรง ๆ ไม่ sum จากรายคน — เป้าระดับทีมไม่หาย
  assert.equal(m.teams[0].team, 'KA');
  assert.equal(m.teams[0].target[0], 20);
  assert.equal(m.company.target[0], 30);
  assert.equal(m.company.fcTotal[0], 21);
  assert.equal(m.company.actual[0], 12);
});

test('buildMatrix handles empty input', () => {
  const m = buildMatrix([]);
  assert.deepEqual(m.people, []);
  assert.deepEqual(m.teams, []);
  assert.equal(m.company.target.length, 12);
  assert.equal(m.company.target[0], 0);
});

/* ---------- closed/ytd months ---------- */

test('closedMonths and ytdMonths respect the year boundary', () => {
  const now = { year: 2026, monthIdx: 6 }; // ก.ค.
  assert.equal(closedMonths(2025, now), 12);
  assert.equal(closedMonths(2026, now), 6); // ม.ค.–มิ.ย. จบแล้ว, ก.ค. กำลังวิ่ง
  assert.equal(closedMonths(2027, now), 0);
  assert.equal(ytdMonths(2026, now), 7); // YTD รวมเดือนปัจจุบัน
  assert.equal(ytdMonths(2025, now), 12);
  assert.equal(ytdMonths(2027, now), 0);
});

/* ---------- carryIn ---------- */

test('carryIn accumulates shortfall and lets surplus cancel it (cumulative, not per-month max)', () => {
  const target = [10, 10, 10, ...fill(0).slice(3)];
  // ม.ค. ขาด 5, ก.พ. เกิน 3 → ทบเข้ามี.ค. = 2
  const actual = [5, 13, 0, ...fill(0).slice(3)];
  assert.equal(carryIn(target, actual, 2, 12), 2);
});

test('carryIn clamps at zero when cumulative surplus', () => {
  assert.equal(carryIn([10, 10], [15, 8], 2, 12), 0); // สะสม +3 → ไม่มีทบ (และไม่ติดลบ)
});

test('carryIn ignores months that are not closed yet', () => {
  const target = fill(10);
  const actual = fill(0);
  // งวดเริ่มเดือน 7 (idx 6) แต่จบไปแค่ 3 เดือน → ทบจาก 3 เดือนแรกเท่านั้น
  assert.equal(carryIn(target, actual, 6, 3), 30);
  assert.equal(carryIn(target, actual, 0, 12), 0); // งวดแรกของปี ไม่มีอะไรให้ทบ
});

/* ---------- windowStat ---------- */

test('windowStat sums the window and adds carry when carryOn', () => {
  const r = row([10, 10, 10, 10, ...fill(0).slice(4)], [5, 10, 0, 0, ...fill(0).slice(4)], [0, 0, 4, 3, ...fill(0).slice(4)]);
  const s = windowStat(r, { startIdx: 2, endIdx: 3, carryOn: true, closedCount: 2 });
  assert.equal(s.target, 20);
  assert.equal(s.carry, 5); // ม.ค. ขาด 5
  assert.equal(s.mustClose, 25);
  assert.equal(s.fcTotal, 7);
  assert.equal(s.forecast, 7);
  assert.equal(s.actual, 0);
  assert.equal(s.projected, 7);
  assert.equal(s.diff, -25);
});

test('windowStat with carry off: mustClose equals plain target', () => {
  const r = row([10, 10], [0, 0]);
  const s = windowStat(r, { startIdx: 1, endIdx: 1, carryOn: false, closedCount: 1 });
  assert.equal(s.carry, 0);
  assert.equal(s.mustClose, 10);
});

test('windowStat pct is null when mustClose is zero', () => {
  const s = windowStat(row(fill(0), fill(0)), { startIdx: 0, endIdx: 11, carryOn: true, closedCount: 12 });
  assert.equal(s.pct, null);
});

/* ---------- yearSummary ---------- */

/* ⭐ เดือนที่กำลังวิ่ง: จบไปแล้ว 2 เดือน (ม.ค. 12 · ก.พ. 8) กำลังอยู่เดือนที่ 3 ซึ่งเพิ่ง
   ได้มา 1 — เป้าเดือนละ 10 ทุกเดือน · ปีก่อนได้เดือนละ 10 เท่ากันทุกเดือน */
const RUNNING = { closedCount: 2, ytdCount: 3 };

test('⭐ เทียบเป้า/ปีก่อน นับเฉพาะเดือนที่จบแล้ว — ไม่เอาเป้าเต็มเดือนไปเทียบยอดครึ่งเดือน', () => {
  const r = row(fill(10), [12, 8, 1]);
  const s = yearSummary(r, { ...RUNNING, lastYearActual: fill(10) });

  assert.equal(s.targetClosed, 20, 'เป้าของสองเดือนที่จบแล้ว ไม่รวมเดือนที่วิ่ง');
  assert.equal(s.actualClosed, 20, 'ยอดของสองเดือนที่จบแล้ว');
  assert.equal(s.actualYtd, 21, 'Actual สะสมเป็นข้อเท็จจริง รวมยอดของเดือนที่วิ่งด้วย');
  assert.equal(s.gap, 0, 'จบแล้วพอดีเป้า — ถ้าเอาเป้าเดือนที่ 3 มานับด้วยจะกลายเป็น -9');
  assert.equal(s.achv, 100, 'ฐานเดิมจะได้ 70% ทั้งที่ยังไม่มีเดือนไหนพลาดเป้า');
  assert.equal(s.yoy, 0, 'ฐานเดิมจะได้ -30% เพราะเดือนที่วิ่งเทียบกับเดือนเต็มของปีก่อน');
});

test('⭐ เดือนที่ยังวิ่งนับเป็น "ยังเหลือ" — ยังขายได้อยู่ ไม่ใช่เดือนที่หมดสิทธิ์', () => {
  const s = yearSummary(row(fill(10), [12, 8, 1]), RUNNING);
  assert.equal(s.remainMonths, 10, '12 − เดือนที่จบแล้ว (เดิมหักเดือนที่วิ่งออกด้วยได้ 9)');
  // หักเงินที่ได้มาแล้วทั้งหมด (รวมเดือนที่วิ่ง) ออกจากเป้าทั้งปี แล้วเฉลี่ยลงเดือนที่เหลือ
  assert.equal(Math.round(s.needPerMonth * 100) / 100, 9.9); // (120 − 21) / 10
});

test('⭐ gap ของ yearSummary ไม่ใช่ diff ของงวดปี — คนละฐาน ห้ามเอามาแทนกัน', () => {
  const r = row(fill(10), [12, 8, 0]);
  // งวด "ทั้งปี": Actual ทั้งปี − เป้าทั้ง 12 เดือน = เหลืออีกเท่าไรถึงปิดปี
  assert.equal(windowStat(r, { startIdx: 0, endIdx: 11, carryOn: false, closedCount: 2 }).diff, -100);
  // สะสม: Actual − เป้าเฉพาะเดือนที่จบแล้ว = ตอนนี้ตามแผนอยู่ไหม
  assert.equal(yearSummary(r, { closedCount: 2, ytdCount: 3 }).gap, 0);
});

test('yearSummary: เกินเป้าทั้งปีแล้ว ต้องทำ/เดือน = 0 ไม่ใช่ค่าติดลบ', () => {
  const s = yearSummary(row(fill(10), [130]), { closedCount: 1, ytdCount: 2 });
  assert.equal(s.needPerMonth, 0);
});

test('yearSummary: ปีจบแล้วไม่มี "ต่อเดือน" · ไม่มีเป้า/ไม่มีฐานปีก่อน = null ไม่ใช่ 0', () => {
  assert.equal(yearSummary(row(fill(10), fill(10)), { closedCount: 12, ytdCount: 12 }).needPerMonth, null);
  const blank = yearSummary(row(fill(0), fill(5)), { closedCount: 6, ytdCount: 6, lastYearActual: fill(0) });
  assert.equal(blank.achv, null); // เป้า 0 → หารไม่ได้
  assert.equal(blank.yoy, null); // ปีก่อนไม่มียอด → ไม่มี % เติบโต
});

test('ต้นปีที่ยังไม่มีเดือนไหนจบ — เทียบไม่ได้ ต้องคืน null ไม่ใช่ 0%', () => {
  const s = yearSummary(row(fill(10), [3]), { closedCount: 0, ytdCount: 1, lastYearActual: fill(10) });
  assert.equal(s.achv, null);
  assert.equal(s.yoy, null);
  assert.equal(s.gap, 0);
  assert.equal(s.actualYtd, 3, 'ยอดที่ขายได้จริงยังต้องรายงาน');
  assert.equal(s.remainMonths, 12);
});

test('ปีที่จบไปแล้ว สองฐานเท่ากัน ผลลัพธ์ไม่เปลี่ยนจากของเดิม', () => {
  const r = row(fill(10), fill(9));
  const s = yearSummary(r, { closedCount: 12, ytdCount: 12, lastYearActual: fill(6) });
  assert.equal(s.actualClosed, s.actualYtd);
  assert.equal(s.achv, 90);
  assert.equal(Math.round(s.yoy * 10) / 10, 50);
});

/* ---------- statusOf — ทุก branch ---------- */

test('past: cleared with and without carry', () => {
  assert.deepEqual(
    statusOf({ target: 10, carry: 5, mustClose: 15, actual: 15, projected: 15, forecast: 0 }, { periodKind: 'past' }),
    { key: 'cleared', label: '✓ ปิดครบ + ล้างทบ', tone: 'green', amount: 0 },
  );
  assert.equal(
    statusOf({ target: 10, carry: 0, mustClose: 10, actual: 10, projected: 10, forecast: 0 }, { periodKind: 'past' }).label,
    '✓ ปิดครบ',
  );
});

test('past: met base target but carry remains', () => {
  const s = statusOf({ target: 10, carry: 5, mustClose: 15, actual: 12, projected: 12, forecast: 0 }, { periodKind: 'past' });
  assert.equal(s.key, 'met_with_carry');
  assert.equal(s.amount, 3);
  assert.equal(s.tone, 'amber');
});

test('past: missed', () => {
  const s = statusOf({ target: 10, carry: 0, mustClose: 10, actual: 4, projected: 4, forecast: 0 }, { periodKind: 'past' });
  assert.equal(s.key, 'missed');
  assert.equal(s.amount, 6);
  assert.equal(s.tone, 'red');
});

test('past: boundary actual === mustClose counts as cleared', () => {
  const s = statusOf({ target: 10, carry: 2, mustClose: 12, actual: 12, projected: 12, forecast: 0 }, { periodKind: 'past' });
  assert.equal(s.key, 'cleared');
});

test('current: on track vs behind uses actual+forecast', () => {
  assert.equal(
    statusOf({ target: 10, carry: 0, mustClose: 10, actual: 4, forecast: 6, projected: 10 }, { periodKind: 'current' }).key,
    'running_on_track',
  );
  const behind = statusOf({ target: 10, carry: 0, mustClose: 10, actual: 4, forecast: 2, projected: 6 }, { periodKind: 'current' });
  assert.equal(behind.key, 'running_behind');
  assert.equal(behind.amount, 4);
});

test('future: pending variants by forecast coverage', () => {
  assert.equal(statusOf({ mustClose: 10, actual: 0, forecast: 0, projected: 0 }, { periodKind: 'future' }).key, 'pending');
  assert.equal(statusOf({ mustClose: 10, actual: 0, forecast: 12, projected: 12 }, { periodKind: 'future' }).key, 'pending_fc_ok');
  const shortFc = statusOf({ mustClose: 10, actual: 0, forecast: 7, projected: 7 }, { periodKind: 'future' });
  assert.equal(shortFc.key, 'pending_fc_short');
  assert.equal(shortFc.amount, 3);
});

/* ---------- carryTable ---------- */

test('carryTable tracks per-month carry and cumulative, nulls unfinished months', () => {
  const r = row([10, 10, 10, 10, ...fill(0).slice(4)], [5, 13, 0, 0, ...fill(0).slice(4)]);
  const t = carryTable(r, { closedCount: 3 });
  assert.equal(t[0].carryIn, 0);
  assert.equal(t[0].diff, -5);
  assert.equal(t[0].cumAfter, -5);
  assert.equal(t[1].carryIn, 5);
  assert.equal(t[1].mustClose, 15);
  assert.equal(t[1].cumAfter, -2); // -5 + 3
  assert.equal(t[2].carryIn, 2);
  assert.equal(t[2].cumAfter, -12);
  // เดือนที่ 4 ยังไม่จบ → actual/diff/cumAfter = null แต่ทบยกมายังคำนวณให้
  assert.equal(t[3].actual, null);
  assert.equal(t[3].diff, null);
  assert.equal(t[3].cumAfter, null);
  assert.equal(t[3].carryIn, 12);
  assert.equal(t[3].mustClose, 22);
});

/* ---------- yoy / cumulative ---------- */

test('yoySeries nulls months without base or beyond closed months', () => {
  const yoy = yoySeries([12, 20, 30, ...fill(0).slice(3)], [10, 0, 20, ...fill(0).slice(3)], 3);
  assert.equal(Math.round(yoy[0]), 20); // 12 vs 10 = +20%
  assert.equal(yoy[1], null); // ฐานปีก่อน 0
  assert.equal(Math.round(yoy[2]), 50);
  assert.equal(yoy[3], null); // เกินเดือนที่จบแล้ว
});

test('⭐ เดือนที่กำลังวิ่งต้องไม่มีจุดบนกราฟ YoY — ยอดครึ่งเดือนเทียบเดือนเต็มได้หลุมปลอม', () => {
  // ม.ค.–ก.พ. จบแล้ว · มี.ค. เพิ่งเริ่ม ได้มา 1 จากที่ปีก่อนทั้งเดือนได้ 100
  const yoy = yoySeries([100, 100, 1, ...fill(0).slice(3)], fill(100), 2);
  assert.equal(yoy[0], 0);
  assert.equal(yoy[1], 0);
  assert.equal(yoy[2], null, 'ฐานเดิมจะพล็อต -99% ทั้งที่แค่เดือนยังไม่จบ');
});

test('cumulativeSeries: December cumulative equals annual total, actual stops at ytd', () => {
  const target = fill(10);
  const actual = fill(5);
  const c = cumulativeSeries(target, actual, fill(4), 6);
  assert.equal(c.targetCum[11], 120);
  assert.equal(c.actualCum[5], 30);
  assert.equal(c.actualCum[6], null); // หลัง YTD ไม่มีเส้น
  assert.equal(c.lastYearCum[11], 48);
  assert.equal(cumulativeSeries(target, actual, null, 6).lastYearCum, null);
});

/* ---------- periods ---------- */

test('windowForPeriod parses year, quarter, month and rejects junk', () => {
  assert.deepEqual(windowForPeriod('2026'), { year: 2026, startIdx: 0, endIdx: 11, kind: 'year' });
  assert.deepEqual(windowForPeriod('2026-Q3'), { year: 2026, startIdx: 6, endIdx: 8, kind: 'quarter' });
  assert.deepEqual(windowForPeriod('2026-07'), { year: 2026, startIdx: 6, endIdx: 6, kind: 'month' });
  assert.equal(windowForPeriod('2026-13'), null);
  assert.equal(windowForPeriod('abc'), null);
});

test('bpOfWindow เป็นผกผันของ windowForPeriod ทั้งสามชนิด', () => {
  for (const bp of ['2026', '2026-Q3', '2026-07']) {
    assert.equal(bpOfWindow(windowForPeriod(bp)), bp);
  }
  assert.equal(bpOfWindow(null), '');
});

test('toKind คงตำแหน่งเวลาเดิมตอนสลับชนิดงวด', () => {
  assert.equal(toKind('2026-08', 'quarter'), '2026-Q3'); // ส.ค. อยู่ Q3
  assert.equal(toKind('2026-08', 'year'), '2026');
  assert.equal(toKind('2026-Q3', 'month'), '2026-07'); // เดือนแรกของไตรมาส
  assert.equal(toKind('2026-Q4', 'quarter'), '2026-Q4'); // สลับเป็นชนิดเดิม = คงที่
  assert.equal(toKind('2026', 'month'), '2026-01');
  assert.equal(toKind('ขยะ', 'month'), 'ขยะ'); // พาร์สไม่ได้ = คืนของเดิม ไม่ throw
});

test('prev/nextPeriod wrap across year boundaries for all kinds', () => {
  assert.equal(prevPeriod('2026-01'), '2025-12');
  assert.equal(nextPeriod('2026-12'), '2027-01');
  assert.equal(nextPeriod('2026-07'), '2026-08');
  assert.equal(prevPeriod('2026-Q1'), '2025-Q4');
  assert.equal(nextPeriod('2026-Q4'), '2027-Q1');
  assert.equal(nextPeriod('2026-Q2'), '2026-Q3');
  assert.equal(prevPeriod('2026'), '2025');
  assert.equal(nextPeriod('2026'), '2027');
});

test('periodKindOf compares the window against now', () => {
  const now = { year: 2026, monthIdx: 6 };
  assert.equal(periodKindOf(windowForPeriod('2026-06'), now), 'past');
  assert.equal(periodKindOf(windowForPeriod('2026-07'), now), 'current');
  assert.equal(periodKindOf(windowForPeriod('2026-08'), now), 'future');
  assert.equal(periodKindOf(windowForPeriod('2026-Q3'), now), 'current');
  assert.equal(periodKindOf(windowForPeriod('2026-Q4'), now), 'future');
  assert.equal(periodKindOf(windowForPeriod('2026'), now), 'current');
  assert.equal(periodKindOf(windowForPeriod('2025'), now), 'past');
  assert.equal(periodKindOf(windowForPeriod('2027'), now), 'future');
});


/* ── แกนเวลาข้ามปี (รายงานยอดขายตามช่วง) ────────────────────────────── */

const dash = (month, { target = 0, won = 0 } = {}) => ({
  month,
  totals: { targetAmount: target, wonValue: won, fullForecast: 0, weightedForecast: 0 },
  byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target, won, fcTotal: 0, weighted: 0 }],
  byTeam: [{ team: 'KA', target, won, fcTotal: 0, weighted: 0 }],
});

test('ไม่ส่งแกนเวลา = ได้ 12 ช่องของปีที่พบ (ผู้เรียกเดิมต้องไม่กระทบ)', () => {
  const m = buildMatrix([dash('2026-03', { target: 300, won: 200 })]);
  assert.equal(m.company.target.length, 12);
  assert.deepEqual(m.months.at(0), '2026-01');
  assert.deepEqual(m.months.at(-1), '2026-12');
  assert.equal(m.company.target[2], 300); // มี.ค. = index 2
  assert.equal(m.company.actual[2], 200);
});

test('ส่งแกนข้ามปีได้ และค่าลงช่องตามงวดจริง ไม่ใช่ตามเดือนของปี', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02'];
  const m = buildMatrix([
    dash('2025-12', { target: 120, won: 100 }),
    dash('2026-01', { target: 130, won: 140 }),
    dash('2026-07', { target: 999, won: 999 }), // นอกแกน — ต้องถูกทิ้ง
  ], { months });
  assert.deepEqual(m.months, months);
  assert.deepEqual(m.company.target, [0, 120, 130, 0]);
  assert.deepEqual(m.company.actual, [0, 100, 140, 0]);
  // แถวคน/ทีมใช้แกนเดียวกัน
  assert.deepEqual(m.people[0].months, months);
  assert.deepEqual(m.teams[0].target, [0, 120, 130, 0]);
});

test('monthsOfDashboards เรียงเวลา ไม่ซ้ำ และทิ้งค่าที่ไม่ใช่งวด', () => {
  assert.deepEqual(
    monthsOfDashboards([{ month: '2026-02' }, { month: '2025-12' }, { month: '2026-02' }, { month: 'x' }, {}]),
    ['2025-12', '2026-02'],
  );
});

test('ทบยอดรีเซ็ตทุกต้นปีปฏิทิน — ธ.ค. ที่ขาดไม่ทบข้าม ม.ค.', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02'];
  const target = [100, 100, 100, 100];
  const actual = [50, 50, 100, 100]; // ปี 2025 ขาดรวม 100
  // งวดที่เริ่ม ธ.ค. 2025 (index 1) ยังอยู่ปีเดียวกับ พ.ย. ⇒ ทบ 50 มา
  assert.equal(carryIn(target, actual, 1, 4, months), 50);
  // งวดที่เริ่ม ม.ค. 2026 (index 2) = ปีใหม่ ⇒ ทบเป็น 0 ไม่ลากยอดขาดของปีก่อนมา
  assert.equal(carryIn(target, actual, 2, 4, months), 0);
  // ก.พ. 2026 ทบเฉพาะที่ขาดใน ม.ค. ปีเดียวกัน (ม.ค. ปิดครบ ⇒ 0)
  assert.equal(carryIn(target, actual, 3, 4, months), 0);
  // ไม่ส่งแกน = พฤติกรรมเดิม (สะสมตั้งแต่ช่องแรก)
  assert.equal(carryIn(target, actual, 2, 4), 100);
});

test('windowStat บนแกนข้ามปีใช้ทบที่รีเซ็ตแล้ว', () => {
  const months = ['2025-11', '2025-12', '2026-01'];
  const row = { months, target: [100, 100, 100], actual: [50, 50, 0], fcTotal: [0, 0, 0], forecast: [0, 0, 0] };
  const jan = windowStat(row, { startIdx: 2, endIdx: 2, carryOn: true, closedCount: 3 });
  assert.equal(jan.carry, 0, 'ยอดขาดของปี 2025 ต้องไม่ตามมา');
  assert.equal(jan.mustClose, 100);
  const dec = windowStat(row, { startIdx: 1, endIdx: 1, carryOn: true, closedCount: 3 });
  assert.equal(dec.carry, 50);
  assert.equal(dec.mustClose, 150);
});

test('rangeWindow ตัดช่วงให้อยู่ในแกน และคืน null เมื่อไม่ทับกันเลย', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02'];
  assert.deepEqual(rangeWindow(months, { from: '2025-12', to: '2026-01' }), { startIdx: 1, endIdx: 2 });
  // ขอเกินขอบทั้งสองด้าน = ได้ทั้งแกน ไม่ใช่ error
  assert.deepEqual(rangeWindow(months, { from: '2020-01', to: '2030-12' }), { startIdx: 0, endIdx: 3 });
  // เดือนเดียว
  assert.deepEqual(rangeWindow(months, { from: '2026-02', to: '2026-02' }), { startIdx: 3, endIdx: 3 });
  // ไม่ทับแกนเลย / ค่าไม่ถูกต้อง
  assert.equal(rangeWindow(months, { from: '2027-01', to: '2027-12' }), null);
  assert.equal(rangeWindow(months, { from: '2026-02', to: '2025-11' }), null);
  assert.equal(rangeWindow([], { from: '2026-01', to: '2026-02' }), null);
});

test('closedCountOnAxis นับเฉพาะงวดที่จบแล้วบนแกน', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02'];
  // ก.พ. 2026 ยังวิ่ง ⇒ ปิดแล้วสามงวด (พ.ย. · ธ.ค. · ม.ค.)
  assert.equal(closedCountOnAxis(months, { year: 2026, monthIdx: 1 }), 3);
  assert.equal(closedCountOnAxis(months, { year: 2026, monthIdx: 5 }), 4);
  assert.equal(closedCountOnAxis(months, { year: 2025, monthIdx: 10 }), 0);
  assert.equal(indexOfMonth(months, '2026-01'), 2);
  assert.equal(indexOfMonth(months, '2024-01'), -1);
});


/* ---------- overlayHistory + unallocatedRow (ยอดที่กรอกย้อนหลัง) ---------- */

// ปีจำลองที่ล้อของจริงบน prod (27/08/2026): ครึ่งปีแรกกรอกไว้ระดับบริษัทอย่างเดียว
// เดือนถัดมากรอกรายคน ส่วนเดือนล่าสุดมียอดจากดีลตามปกติ
const yearMonths = (year) => [
  {
    month: `${year}-01`,
    totals: { targetAmount: 100, fullForecast: 0, weightedForecast: 0, wonValue: 0 },
    byOwner: [], byTeam: [{ team: 'KA', target: 0, won: 0, weighted: 0, fcTotal: 0 }],
  },
  {
    month: `${year}-02`,
    totals: { targetAmount: 100, fullForecast: 0, weightedForecast: 0, wonValue: 0 },
    byOwner: [
      { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 40, won: 0, weighted: 0, fcTotal: 0 },
      { ownerId: 'u2', ownerName: 'บี', team: 'SV', target: 20, won: 0, weighted: 0, fcTotal: 0 },
    ],
    byTeam: [
      { team: 'KA', target: 40, won: 0, weighted: 0, fcTotal: 0 },
      { team: 'SV', target: 20, won: 0, weighted: 0, fcTotal: 0 },
    ],
  },
  {
    month: `${year}-03`,
    totals: { targetAmount: 100, fullForecast: 90, weightedForecast: 30, wonValue: 60 },
    byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 60, won: 60, weighted: 30, fcTotal: 90 }],
    byTeam: [{ team: 'KA', target: 60, won: 60, weighted: 30, fcTotal: 90 }],
  },
];

test('overlayHistory: แถวรายคนดันขึ้นเป็นยอดทีม เมื่อทีมนั้นไม่ได้กรอกเอง', () => {
  const m = overlayHistory(buildMatrix(yearMonths('2026')), [
    { period: '2026-02', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 45 },
    { period: '2026-02', team: 'SV', ownerId: 'u2', ownerName: 'บี', actualAmount: 15 },
  ]);
  const ka = m.teams.find((t) => t.team === 'KA');
  const sv = m.teams.find((t) => t.team === 'SV');
  assert.equal(ka.actual[1], 45, 'ยอดทีมของเดือนที่กรอกรายคน = ผลรวมคนในทีม');
  assert.equal(sv.actual[1], 15);
  assert.equal(m.company.actual[1], 60, 'ไม่มีแถวบริษัท ⇒ ยอดบริษัท = ผลรวมทีม');
});

test('overlayHistory: แถวที่กรอกตรง ๆ ชนะการ roll up เสมอ', () => {
  const m = overlayHistory(buildMatrix(yearMonths('2026')), [
    { period: '2026-02', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 45 },
    { period: '2026-02', team: 'KA', ownerId: null, actualAmount: 70 }, // แถวของทีมเอง
    { period: '2026-02', team: null, ownerId: null, actualAmount: 500 }, // แถวบริษัท
  ]);
  assert.equal(m.teams.find((t) => t.team === 'KA').actual[1], 70, 'แถวทีมชนะผลรวมรายคน');
  assert.equal(m.company.actual[1], 500, 'แถวบริษัทชนะผลรวมทีม');
  assert.equal(m.people.find((p) => p.id === 'u1').actual[1], 45);
});

test('overlayHistory: เดือนที่ไม่มีแถวประวัติเลย ยังใช้ยอดจากดีลตามเดิม', () => {
  const m = overlayHistory(buildMatrix(yearMonths('2026')), [
    { period: '2026-01', team: null, ownerId: null, actualAmount: 80 },
  ]);
  assert.equal(m.company.actual[2], 60, 'มี.ค. ไม่ถูกแตะ');
  assert.equal(m.teams.find((t) => t.team === 'KA').actual[2], 60);
  assert.equal(m.company.actual[0], 80);
});

test('overlayHistory: คนที่ไม่มีดีลในปีนั้นเลย ยังได้แถวของตัวเอง', () => {
  const m = overlayHistory(buildMatrix(yearMonths('2026')), [
    { period: '2026-01', team: 'SV', ownerId: 'u9', ownerName: 'ซี', actualAmount: 25 },
  ]);
  const person = m.people.find((p) => p.id === 'u9');
  assert.equal(person.actual[0], 25, 'ยอดที่กรอกให้คนที่ยังไม่มีดีลต้องไม่หาย');
  assert.equal(person.actual.length, 12);
  assert.equal(m.teams.find((t) => t.team === 'SV').actual[0], 25, 'และดันขึ้นทีมที่เพิ่งเกิดด้วย');
});

test('unallocatedRow: แถวทีมทุกแถว + ส่วนที่ยังไม่ได้แยก = แถวรวมบริษัท ทุกงวด', () => {
  /* ก.พ. ล้อของจริงบน prod: มีทั้งแถวบริษัทและแถวรายคน แต่รายคนรวมกันไม่ถึงยอดบริษัท
     (27/08/2026 ก.ค.: บริษัท 9,732,781 · รวมรายคน 8,511,698 ⇒ เหลือ 1,221,083) */
  const m = overlayHistory(buildMatrix(yearMonths('2026')), [
    { period: '2026-01', team: null, ownerId: null, actualAmount: 80 }, // บริษัทล้วน
    { period: '2026-02', team: null, ownerId: null, actualAmount: 60 },
    { period: '2026-02', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 45 },
  ]);
  const rest = unallocatedRow(m);
  for (const key of ['target', 'fcTotal', 'forecast', 'actual']) {
    for (let i = 0; i < 12; i += 1) {
      const teams = m.teams.reduce((sum, t) => sum + Number(t[key][i] || 0), 0);
      assert.equal(teams + rest[key][i], m.company[key][i], `${key} เดือน ${i + 1} ต้องกระทบกันได้`);
    }
  }
  assert.equal(rest.target[0], 100, 'ม.ค. ตั้งเป้าไว้แค่ระดับบริษัท ⇒ ตกมาที่แถวนี้ทั้งก้อน');
  assert.equal(rest.actual[0], 80);
  assert.equal(rest.actual[1], 15, 'ก.พ. บริษัท 60 − ทีม (45+0) = 15 ที่ยังไม่รู้ว่าของใคร');
  assert.equal(m.company.actual[1], 60, 'แถวบริษัทที่กรอกไว้ต้องไม่ถูก roll up ทับ');
});

test('unallocatedRow: บริษัทที่แยกครบทุกทีมได้แถวศูนย์ (UI ซ่อนทิ้ง)', () => {
  const m = buildMatrix([{
    month: '2026-01',
    totals: { targetAmount: 60, fullForecast: 30, weightedForecast: 10, wonValue: 20 },
    byOwner: [],
    byTeam: [{ team: 'KA', target: 60, won: 20, weighted: 10, fcTotal: 30 }],
  }]);
  const rest = unallocatedRow(m);
  assert.equal(rowHasValue(rest, 0, 11), false);
});

test('rowHasValue: จับได้ทั้งค่าบวกและค่าลบ เฉพาะในช่วงที่ถาม', () => {
  const r = { target: fill(0), fcTotal: fill(0), forecast: fill(0), actual: fill(0) };
  r.actual[5] = -3;
  assert.equal(rowHasValue(r, 0, 4), false);
  assert.equal(rowHasValue(r, 5, 5), true, 'ยอดติดลบ (ทีมรวมกันเกินบริษัท) ก็ต้องโชว์');
});
