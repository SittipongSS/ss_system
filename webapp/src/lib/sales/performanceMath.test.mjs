import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatrix,
  closedMonths,
  ytdMonths,
  carryIn,
  windowStat,
  statusOf,
  carryTable,
  yoySeries,
  cumulativeSeries,
  windowForPeriod,
  prevPeriod,
  nextPeriod,
  periodKindOf,
} from './performanceMath';

const row = (target, actual, forecast = Array(12).fill(0)) => ({ target, actual, forecast });
const fill = (v) => Array(12).fill(v);

/* ---------- buildMatrix ---------- */

test('buildMatrix folds byOwner/byTeam/totals into 12-slot arrays and sorts by team order', () => {
  const months = [
    {
      month: '2026-01',
      totals: { targetAmount: 30, weightedForecast: 5, wonValue: 12 },
      byOwner: [
        { ownerId: 'u2', ownerName: 'บี', team: 'SV', target: 10, won: 4, weighted: 2 },
        { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 10, won: 8, weighted: 3 },
      ],
      byTeam: [
        { team: 'SV', target: 10, won: 4, weighted: 2 },
        { team: 'KA', target: 20, won: 8, weighted: 3 }, // เป้าทีม > รวมรายคน (มีเป้าระดับทีม)
      ],
    },
    {
      month: '2026-03',
      totals: { targetAmount: 40, weightedForecast: 0, wonValue: 0 },
      byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 15, won: 0, weighted: 0 }],
      byTeam: [{ team: 'KA', target: 15, won: 0, weighted: 0 }],
    },
  ];
  const m = buildMatrix(months);
  assert.equal(m.people.length, 2);
  assert.deepEqual(m.people.map((p) => p.name), ['เอ', 'บี']); // KA มาก่อน SV
  assert.equal(m.people[0].target[0], 10);
  assert.equal(m.people[0].target[2], 15);
  assert.equal(m.people[0].actual[0], 8);
  assert.equal(m.people[0].forecast[0], 3);
  assert.equal(m.people[0].target[1], 0); // เดือนไม่มีข้อมูล = 0
  // ทีมอ่านจาก byTeam ตรง ๆ ไม่ sum จากรายคน — เป้าระดับทีมไม่หาย
  assert.equal(m.teams[0].team, 'KA');
  assert.equal(m.teams[0].target[0], 20);
  assert.equal(m.company.target[0], 30);
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

test('yoySeries nulls months without base or beyond ytd', () => {
  const yoy = yoySeries([12, 20, 30, ...fill(0).slice(3)], [10, 0, 20, ...fill(0).slice(3)], 3);
  assert.equal(Math.round(yoy[0]), 20); // 12 vs 10 = +20%
  assert.equal(yoy[1], null); // ฐานปีก่อน 0
  assert.equal(Math.round(yoy[2]), 50);
  assert.equal(yoy[3], null); // เกิน YTD
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
