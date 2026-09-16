import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  projectionGap,
  resolvePersonDrill,
} from './performanceMath';
import { NO_TEAM_LABEL, findPersonRow, personSliceKey } from './personSlice.js';
import { teamRank } from '@/lib/salesPlanning';
import { monthsForYear } from '@/lib/datePeriods';

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
  assert.equal(findPersonRow(m.people, 'u1').actual[1], 45);
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
  const person = findPersonRow(m.people, 'u9');
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
  for (const key of ['target', 'fcTotal', 'forecast', 'actual', 'pendingApproval', 'pendingApprovalCount', 'wonAwaitingSo', 'wonAwaitingSoCount']) {
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


/* ---------- ยอด SO รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) ---------- */

/* รูปของจริงวันที่ผู้ใช้แจ้ง (11/09/2026): SO รออนุมัติ 8 ใบ 993,000 บนดีล Won ของทีม KA
   ทุกใบ Actual 0 · server วางยอดนี้ที่ **เดือนปัจจุบัน** (ก.ย. = index 8) เท่านั้น
   (ย่อหลักเป็นพันเพื่อให้อ่านเทสต์ง่าย) */
const PENDING_MONTH_IDX = 8;
const pendingDashboards = () => [
  {
    month: '2026-08',
    totals: { targetAmount: 100, fullForecast: 50, weightedForecast: 20, wonValue: 70 },
    byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 100, won: 70, weighted: 20, fcTotal: 50 }],
    byTeam: [{ team: 'KA', target: 100, won: 70, weighted: 20, fcTotal: 50 }],
  },
  {
    month: '2026-09',
    totals: { targetAmount: 1000, fullForecast: 1100, weightedForecast: 50, wonValue: 0, pendingApproval: 993, pendingApprovalCount: 8 },
    byOwner: [
      { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 600, won: 0, weighted: 30, fcTotal: 700, pendingApproval: 693, pendingApprovalCount: 5 },
      { ownerId: 'u2', ownerName: 'บี', team: 'KA', target: 400, won: 0, weighted: 20, fcTotal: 400, pendingApproval: 300, pendingApprovalCount: 3 },
    ],
    byTeam: [{ team: 'KA', target: 1000, won: 0, weighted: 50, fcTotal: 1100, pendingApproval: 993, pendingApprovalCount: 8 }],
  },
];
const withoutPending = (dashboards) => dashboards.map((d) => {
  const strip = ({ pendingApproval, pendingApprovalCount, ...rest }) => rest;
  return { ...d, totals: strip(d.totals), byOwner: d.byOwner.map(strip), byTeam: d.byTeam.map(strip) };
});

test('รออนุมัติ: buildMatrix เติมเส้นแยก 12 ช่องทุกระดับ (บริษัท/ทีม/คน)', () => {
  const m = buildMatrix(pendingDashboards());
  const i = PENDING_MONTH_IDX;
  assert.equal(m.company.pendingApproval.length, 12);
  assert.equal(m.company.pendingApprovalCount.length, 12);
  assert.equal(m.company.pendingApproval[i], 993);
  assert.equal(m.company.pendingApprovalCount[i], 8);
  const ka = m.teams.find((t) => t.team === 'KA');
  assert.equal(ka.pendingApproval[i], 993);
  assert.equal(ka.pendingApprovalCount[i], 8);
  assert.equal(findPersonRow(m.people, 'u1').pendingApproval[i], 693);
  assert.equal(findPersonRow(m.people, 'u1').pendingApprovalCount[i], 5);
  assert.equal(findPersonRow(m.people, 'u2').pendingApproval[i], 300);
  assert.equal(m.company.pendingApproval[i - 1], 0, 'เดือนที่จบแล้วไม่มีวันเห็นยอดนี้');
});

test('⛔ รออนุมัติไม่ไหลเข้า Actual/Target/FC ของ matrix — เส้นเดิมเท่ากับตอนไม่มีช่องนี้เป๊ะ', () => {
  const a = buildMatrix(pendingDashboards());
  const b = buildMatrix(withoutPending(pendingDashboards()));
  for (const key of ['target', 'fcTotal', 'forecast', 'actual']) {
    assert.deepEqual(a.company[key], b.company[key], `company.${key}`);
    assert.deepEqual(a.teams.map((t) => t[key]), b.teams.map((t) => t[key]), `teams.${key}`);
    assert.deepEqual(a.people.map((p) => p[key]), b.people.map((p) => p[key]), `people.${key}`);
  }
  assert.equal(a.company.actual[PENDING_MONTH_IDX], 0);
});

test('รออนุมัติ: payload เก่าที่ไม่มีช่องนี้ (ค้างใน apiCache) ได้ 0 ครบแกน ไม่ใช่ NaN/undefined', () => {
  const m = buildMatrix(yearMonths('2026'));
  for (const r of [m.company, ...m.teams, ...m.people]) {
    assert.deepEqual(r.pendingApproval, fill(0));
    assert.deepEqual(r.pendingApprovalCount, fill(0));
  }
  // แกนข้ามปีก็ได้ความยาวเท่าแกน
  const cross = buildMatrix([dash('2026-01', { target: 1, won: 1 })], { months: ['2025-12', '2026-01'] });
  assert.deepEqual(cross.company.pendingApproval, [0, 0]);
  assert.deepEqual(cross.people[0].pendingApprovalCount, [0, 0]);
  // แถวที่ไม่มีเส้นนี้เลย (fixture เก่า/BLANK เก่า) — windowStat กับ yearSummary ได้ 0
  const s = windowStat(row(fill(10), fill(5), fill(1)), { startIdx: 0, endIdx: 11, carryOn: false, closedCount: 12 });
  assert.equal(s.pendingApproval, 0);
  assert.equal(s.pendingApprovalCount, 0);
  assert.equal(s.projected, 72, 'ไม่มีรออนุมัติ = Actual + Forecast เหมือนเดิม');
  const y = yearSummary(row(fill(10), fill(5)), { closedCount: 8, ytdCount: 9 });
  assert.equal(y.pendingApprovalYtd, 0);
  assert.equal(y.pendingApprovalCountYtd, 0);
});

test('⛔ overlayHistory ทับ Actual ได้ แต่ไม่แตะเส้นรออนุมัติเลย — เป็นสถานะสดของใบเสมอ', () => {
  const built = buildMatrix(pendingDashboards());
  const before = {
    company: [...built.company.pendingApproval],
    companyCount: [...built.company.pendingApprovalCount],
    teams: built.teams.map((t) => [...t.pendingApproval]),
    people: built.people.map((p) => [...p.pendingApproval]),
  };
  const i = PENDING_MONTH_IDX;
  const m = overlayHistory(built, [
    { period: '2026-09', team: null, ownerId: null, actualAmount: 5000 }, // แถวบริษัท
    { period: '2026-09', team: 'KA', ownerId: null, actualAmount: 4000 }, // แถวทีม
    { period: '2026-09', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 3000 }, // แถวรายคน
    { period: '2026-09', team: 'SV', ownerId: 'u9', ownerName: 'ซี', actualAmount: 100 }, // คน+ทีมที่ไม่มีดีล
  ]);
  assert.equal(m.company.actual[i], 5000, 'Actual ถูกทับตามกติกาเดิม');
  assert.deepEqual(m.company.pendingApproval, before.company);
  assert.deepEqual(m.company.pendingApprovalCount, before.companyCount);
  assert.deepEqual(m.teams.filter((t) => t.team === 'KA').map((t) => t.pendingApproval), before.teams);
  assert.deepEqual(m.people.filter((p) => p.ownerId !== 'u9').map((p) => p.pendingApproval), before.people);
  // แถวที่ overlay สร้างขึ้นใหม่ได้เส้นรออนุมัติศูนย์ครบแกน (ไม่ใช่ undefined)
  const newcomer = findPersonRow(m.people, 'u9');
  assert.deepEqual(newcomer.pendingApproval, fill(0));
  assert.deepEqual(newcomer.pendingApprovalCount, fill(0));
  const sv = m.teams.find((t) => t.team === 'SV');
  assert.deepEqual(sv.pendingApproval, fill(0));
  assert.deepEqual(sv.pendingApprovalCount, fill(0));
});

test('รออนุมัติ: แถวทีม + "ยังไม่ได้แยกทีม" = บริษัท · rowHasValue เห็นแถวที่มีแต่รออนุมัติ', () => {
  // ยอดระดับบริษัทที่ยังไม่ลงทีม (เช่น byTeam จาก server รุ่นเก่ายังไม่ส่งช่องนี้ครบ)
  const dashboards = pendingDashboards();
  dashboards[1].byTeam = [{ team: 'KA', target: 1000, won: 0, weighted: 50, fcTotal: 1100, pendingApproval: 693, pendingApprovalCount: 5 }];
  const m = buildMatrix(dashboards);
  const rest = unallocatedRow(m);
  for (const key of ['pendingApproval', 'pendingApprovalCount']) {
    for (let i = 0; i < 12; i += 1) {
      const teams = m.teams.reduce((sum, t) => sum + t[key][i], 0);
      assert.equal(teams + rest[key][i], m.company[key][i], `${key} เดือน ${i + 1} ต้องกระทบกันได้`);
    }
  }
  assert.equal(rest.pendingApproval[PENDING_MONTH_IDX], 300);
  assert.equal(rest.pendingApprovalCount[PENDING_MONTH_IDX], 3);
  assert.deepEqual(rest.actual, fill(0), 'ส่วนต่างของรออนุมัติไม่ไหลเข้า Actual ของแถวนี้');
  assert.equal(rowHasValue(rest, PENDING_MONTH_IDX, PENDING_MONTH_IDX), true, 'แถวที่เหลือแต่ยอดรออนุมัติยังต้องโชว์');
  assert.equal(rowHasValue(rest, 0, 7), false);
  // แยกครบทุกทีม ⇒ แถวศูนย์ ซ่อนได้
  assert.equal(rowHasValue(unallocatedRow(buildMatrix(pendingDashboards())), 0, 11), false);
});

test('rowHasValue: ใบรออนุมัติยอด 0 บาท (ถูกกฎตั้งแต่ mig 0197) นับจากจำนวนใบ', () => {
  const r = { target: fill(0), fcTotal: fill(0), forecast: fill(0), actual: fill(0), pendingApproval: fill(0), pendingApprovalCount: fill(0) };
  assert.equal(rowHasValue(r, 0, 11), false);
  r.pendingApprovalCount[PENDING_MONTH_IDX] = 1;
  assert.equal(rowHasValue(r, PENDING_MONTH_IDX, PENDING_MONTH_IDX), true);
});

test('รออนุมัติ: windowStat รวมในงวดเป็นช่องแยก · projected นับด้วย · Actual/ขาด-เกิน/% ไม่ขยับ', () => {
  const m = buildMatrix(pendingDashboards());
  const i = PENDING_MONTH_IDX;
  const sep = windowStat(m.company, { startIdx: i, endIdx: i, carryOn: false, closedCount: i });
  assert.equal(sep.pendingApproval, 993);
  assert.equal(sep.pendingApprovalCount, 8);
  assert.equal(sep.actual, 0, 'Actual ไม่รวมรออนุมัติ');
  assert.equal(sep.diff, -1000, 'ขาด / เกิน เทียบ Actual ล้วน');
  assert.equal(sep.pct, 0, '% ปิดได้ เทียบ Actual ล้วน');
  assert.equal(sep.fcPct, 5, 'FC% ยังเป็น FC คงเหลือล้วน');
  assert.equal(sep.projected, 0 + 993 + 50, 'ยอดคาดจบงวด = Actual + รออนุมัติ + FC คงเหลือ');
  // งวดใหญ่ที่ครอบเดือนปัจจุบันได้ยอดทั้งก้อน · งวดที่ไม่ครอบได้ 0
  assert.equal(windowStat(m.company, { startIdx: 6, endIdx: 8, carryOn: false, closedCount: i }).pendingApproval, 993);
  assert.equal(windowStat(m.company, { startIdx: 0, endIdx: 11, carryOn: false, closedCount: i }).pendingApprovalCount, 8);
  const aug = windowStat(m.company, { startIdx: 7, endIdx: 7, carryOn: false, closedCount: i });
  assert.equal(aug.pendingApproval, 0);
  assert.equal(aug.pendingApprovalCount, 0);
  // รายทีม/รายคนใช้สูตรเดียวกัน
  assert.equal(windowStat(m.teams[0], { startIdx: i, endIdx: i, carryOn: false, closedCount: i }).pendingApproval, 993);
  assert.equal(windowStat(findPersonRow(m.people, 'u2'), { startIdx: i, endIdx: i, carryOn: false, closedCount: i }).pendingApprovalCount, 3);
});

test('⛔ รออนุมัติไม่หักยอดทบ — ทบยกมาคิดจาก Actual ล้วนแม้เดือนนั้นมีใบรออนุมัติ', () => {
  const r = { ...row([10, 10], [4, 0]), pendingApproval: [6, 0], pendingApprovalCount: [1, 0] };
  const s = windowStat(r, { startIdx: 1, endIdx: 1, carryOn: true, closedCount: 1 });
  assert.equal(s.carry, 6, 'ม.ค. ขาด 6 ต้องทบมาเต็ม ไม่ถูกยอดรออนุมัติหักล้าง');
  assert.equal(s.mustClose, 16);
  const m = buildMatrix(pendingDashboards());
  const sep = windowStat(m.company, { startIdx: PENDING_MONTH_IDX, endIdx: PENDING_MONTH_IDX, carryOn: true, closedCount: PENDING_MONTH_IDX });
  assert.equal(sep.carry, 30, 'ส.ค. เป้า 100 ได้ 70 ⇒ ทบ 30');
  assert.deepEqual(carryTable(r, { closedCount: 1 }), carryTable(row([10, 10], [4, 0]), { closedCount: 1 }));
});

test('รออนุมัติ: งวดที่วิ่งอยู่ — ใบที่ยื่นแล้วนับใน "คาดจบถึงเป้า" · รูปผลลัพธ์ statusOf ไม่เปลี่ยน', () => {
  const base = row(fill(10), fill(0), fill(0));
  base.actual[2] = 1;
  base.forecast[2] = 2;
  const pending = { ...base, pendingApproval: [0, 0, 7, ...fill(0).slice(3)], pendingApprovalCount: [0, 0, 2, ...fill(0).slice(3)] };
  const s = windowStat(pending, { startIdx: 2, endIdx: 2, carryOn: false, closedCount: 2 });
  assert.equal(s.projected, 10);
  assert.deepEqual(statusOf(s, { periodKind: 'current' }), { key: 'running_on_track', label: 'กำลังวิ่ง · คาดจบถึงเป้า', tone: 'green', amount: 0 });
  // ไม่นับรออนุมัติ = "คาดขาด" เกินจริงเท่ายอดทั้งก้อน (อาการที่ผู้ใช้เจอ)
  const without = windowStat(base, { startIdx: 2, endIdx: 2, carryOn: false, closedCount: 2 });
  assert.deepEqual(statusOf(without, { periodKind: 'current' }), { key: 'running_behind', label: 'กำลังวิ่ง · คาดขาด', tone: 'amber', amount: 7 });
});

test('รออนุมัติ: yearSummary คืนยอดแสดงคู่ Actual สะสม · gap/achv/needPerMonth/yoy ไม่ขยับ', () => {
  const base = row(fill(10), [12, 8, 1]);
  const pending = { ...base, pendingApproval: [0, 0, 5], pendingApprovalCount: [0, 0, 2] };
  const a = yearSummary(base, { ...RUNNING, lastYearActual: fill(10) });
  const b = yearSummary(pending, { ...RUNNING, lastYearActual: fill(10) });
  assert.equal(b.pendingApprovalYtd, 5);
  assert.equal(b.pendingApprovalCountYtd, 2);
  assert.equal(a.pendingApprovalYtd, 0);
  for (const key of ['targetYear', 'actualYtd', 'actualClosed', 'targetClosed', 'gap', 'achv', 'remainMonths', 'needPerMonth', 'yoy']) {
    assert.equal(b[key], a[key], `${key} ต้องเป็น Actual ล้วน`);
  }
  // ปีอนาคต (ytdCount 0) ไม่มีช่วงให้รวม
  assert.equal(yearSummary(pending, { closedCount: 0, ytdCount: 0 }).pendingApprovalYtd, 0);
});

test('unallocatedRow ปัดยอดรออนุมัติเป็นสตางค์ — เศษทศนิยมไม่โผล่เป็น "รออนุมัติ ฿0.00"', () => {
  const zeros = () => Array(12).fill(0);
  const company = { target: zeros(), fcTotal: zeros(), forecast: zeros(), actual: zeros(), pendingApproval: zeros(), pendingApprovalCount: zeros() };
  company.pendingApproval[8] = 0.3;
  const team = (v) => ({ ...company, pendingApproval: Object.assign(zeros(), { 8: v }) });
  const rest = unallocatedRow({ company, teams: [team(0.1), team(0.2)] });
  assert.equal(rest.pendingApproval[8] > 0, false);
});


/* ---------- ยอด Won รอยื่น SO (มติผู้ใช้ 2026-09-14) ---------- */

/* รูปของจริง 14/09/2026: ดีล Won 42 ดีลที่ยังไม่มี SO อนุมัติ/รออนุมัติ กระจายตามเดือนที่ปิด Won
   server วางยอดที่ **เดือน Won ของดีล** (ไม่ใช่เดือนปัจจุบันแบบรออนุมัติ) ⇒ เดือนที่จบแล้วมีได้
   มี.ค. = เดือนที่จบแล้ว · ก.ย. = เดือนที่วิ่ง · ย่อหลักให้อ่านเทสต์ง่าย */
const MAR = 2;
const SEP = 8;
const WON_KEYS = ['wonAwaitingSo', 'wonAwaitingSoCount'];
const wonDashboards = () => [
  {
    month: '2026-03',
    totals: { targetAmount: 100, fullForecast: 0, weightedForecast: 0, wonValue: 40, wonAwaitingSo: 550, wonAwaitingSoCount: 3 },
    byOwner: [
      { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 60, won: 40, weighted: 0, fcTotal: 0, wonAwaitingSo: 300, wonAwaitingSoCount: 1 },
      { ownerId: 'u3', ownerName: 'ซี', team: 'KA', target: 0, won: 0, weighted: 0, fcTotal: 0, wonAwaitingSo: 50, wonAwaitingSoCount: 1 },
      { ownerId: 'u2', ownerName: 'บี', team: 'SV', target: 40, won: 0, weighted: 0, fcTotal: 0, wonAwaitingSo: 200, wonAwaitingSoCount: 1 },
    ],
    byTeam: [
      { team: 'KA', target: 60, won: 40, weighted: 0, fcTotal: 0, wonAwaitingSo: 350, wonAwaitingSoCount: 2 },
      { team: 'SV', target: 40, won: 0, weighted: 0, fcTotal: 0, wonAwaitingSo: 200, wonAwaitingSoCount: 1 },
    ],
  },
  {
    month: '2026-09',
    totals: { targetAmount: 1000, fullForecast: 400, weightedForecast: 250, wonValue: 100, pendingApproval: 150, pendingApprovalCount: 1, wonAwaitingSo: 120, wonAwaitingSoCount: 1 },
    byOwner: [{ ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 1000, won: 100, weighted: 250, fcTotal: 400, pendingApproval: 150, pendingApprovalCount: 1, wonAwaitingSo: 120, wonAwaitingSoCount: 1 }],
    byTeam: [{ team: 'KA', target: 1000, won: 100, weighted: 250, fcTotal: 400, pendingApproval: 150, pendingApprovalCount: 1, wonAwaitingSo: 120, wonAwaitingSoCount: 1 }],
  },
];
const withoutWonAwaiting = (dashboards) => dashboards.map((d) => {
  const strip = ({ wonAwaitingSo, wonAwaitingSoCount, ...rest }) => rest;
  return { ...d, totals: strip(d.totals), byOwner: d.byOwner.map(strip), byTeam: d.byTeam.map(strip) };
});
const personOf = (m, id) => findPersonRow(m.people, id);
const teamOf = (m, key) => m.teams.find((t) => t.team === key);
const oneMonth = (idx) => ({ startIdx: idx, endIdx: idx, carryOn: false, closedCount: SEP });

test('Won รอยื่น SO: buildMatrix เติมเส้นแยก 12 ช่องทุกระดับ ตามเดือนที่ server วาง — เดือนที่จบแล้วมีได้', () => {
  const m = buildMatrix(wonDashboards());
  for (const r of [m.company, ...m.teams, ...m.people]) {
    assert.equal(r.wonAwaitingSo.length, 12);
    assert.equal(r.wonAwaitingSoCount.length, 12);
  }
  assert.equal(m.company.wonAwaitingSo[MAR], 550);
  assert.equal(m.company.wonAwaitingSoCount[MAR], 3);
  assert.equal(m.company.wonAwaitingSo[SEP], 120);
  assert.equal(teamOf(m, 'KA').wonAwaitingSo[MAR], 350);
  assert.equal(teamOf(m, 'KA').wonAwaitingSoCount[MAR], 2);
  assert.equal(teamOf(m, 'SV').wonAwaitingSo[MAR], 200);
  assert.equal(personOf(m, 'u1').wonAwaitingSo[MAR], 300);
  assert.equal(personOf(m, 'u1').wonAwaitingSo[SEP], 120);
  assert.equal(personOf(m, 'u3').wonAwaitingSoCount[MAR], 1);
  assert.equal(m.company.wonAwaitingSo[MAR + 1], 0, 'เดือนที่ไม่มีข้อมูล = 0');
});

test('⛔ Won รอยื่น SO ไม่ไหลเข้า Actual/Target/FC/รออนุมัติ — เส้นเดิมเท่ากับตอนไม่มีช่องนี้เป๊ะ', () => {
  const a = buildMatrix(wonDashboards());
  const b = buildMatrix(withoutWonAwaiting(wonDashboards()));
  for (const key of ['target', 'fcTotal', 'forecast', 'actual', 'pendingApproval', 'pendingApprovalCount']) {
    assert.deepEqual(a.company[key], b.company[key], `company.${key}`);
    assert.deepEqual(a.teams.map((t) => t[key]), b.teams.map((t) => t[key]), `teams.${key}`);
    assert.deepEqual(a.people.map((p) => p[key]), b.people.map((p) => p[key]), `people.${key}`);
  }
});

test('Won รอยื่น SO: payload เก่าที่ไม่มีช่องนี้ (ค้างใน apiCache) ได้ 0 ครบแกน · แถวที่ไม่มีเส้นนี้ได้ 0 ใน windowStat', () => {
  const m = buildMatrix(withoutWonAwaiting(wonDashboards()));
  for (const r of [m.company, ...m.teams, ...m.people]) {
    for (const key of WON_KEYS) assert.deepEqual(r[key], fill(0), key);
  }
  const cross = buildMatrix([dash('2026-01', { target: 1, won: 1 })], { months: ['2025-12', '2026-01'] });
  assert.deepEqual(cross.company.wonAwaitingSo, [0, 0]);
  assert.deepEqual(cross.teams[0].wonAwaitingSoCount, [0, 0]);
  assert.deepEqual(cross.people[0].wonAwaitingSo, [0, 0]);
  const s = windowStat(row(fill(10), fill(5), fill(1)), { startIdx: 0, endIdx: 11, carryOn: false, closedCount: 12 });
  assert.equal(s.wonAwaitingSo, 0);
  assert.equal(s.wonAwaitingSoCount, 0);
  assert.equal(s.projected, 72, 'ไม่มีสองเส้นเสริม = Actual + FC คงเหลือ เหมือนเดิม');
});

test('Won รอยื่น SO: windowStat รวมเป็นช่องแยก · projected = Actual + รออนุมัติ + Won รอยื่น SO + FC คงเหลือ · ที่เหลือ Actual ล้วน', () => {
  const m = buildMatrix(wonDashboards());
  const sep = windowStat(m.company, oneMonth(SEP));
  assert.equal(sep.wonAwaitingSo, 120);
  assert.equal(sep.wonAwaitingSoCount, 1);
  assert.equal(sep.projected, 100 + 150 + 120 + 250);
  assert.equal(sep.actual, 100, 'Actual ไม่รวม Won รอยื่น SO');
  assert.equal(sep.diff, -900, 'ขาด / เกิน เทียบ Actual ล้วน');
  assert.equal(sep.pct, 10, '% ปิดได้ เทียบ Actual ล้วน');
  assert.equal(sep.fcPct, 25, 'FC% ยังเป็น FC คงเหลือล้วน');
  // งวดใหญ่รวมทุกเดือนที่มี (มี.ค. 550 + ก.ย. 120)
  const year = windowStat(m.company, { startIdx: 0, endIdx: 11, carryOn: false, closedCount: SEP });
  assert.equal(year.wonAwaitingSo, 670);
  assert.equal(year.wonAwaitingSoCount, 4);
  // ทบยกมาคิดจาก Actual ล้วน — มี.ค. เป้า 100 ได้ 40 ⇒ ทบ 60 แม้เดือนนั้นมีดีลรอยื่น 550
  const opts = { startIdx: SEP, endIdx: SEP, carryOn: true, closedCount: SEP };
  const withLine = windowStat(m.company, opts);
  const withoutLine = windowStat(buildMatrix(withoutWonAwaiting(wonDashboards())).company, opts);
  assert.equal(withLine.carry, 60);
  for (const key of ['target', 'carry', 'mustClose', 'fcTotal', 'forecast', 'actual', 'pendingApproval', 'diff', 'pct', 'fcPct']) {
    assert.equal(withLine[key], withoutLine[key], `${key} ต้องไม่ขยับ`);
  }
  assert.equal(withLine.projected - withoutLine.projected, 120, 'ต่างกันแค่ยอดคาด');
  // รายทีม/รายคนสูตรเดียวกัน
  assert.equal(windowStat(teamOf(m, 'KA'), oneMonth(MAR)).wonAwaitingSo, 350);
  assert.equal(windowStat(personOf(m, 'u2'), oneMonth(MAR)).wonAwaitingSoCount, 1);
});

test('Won รอยื่น SO: yearSummary ไม่ขยับเลย (Actual ล้วน)', () => {
  const opts = { closedCount: SEP, ytdCount: SEP + 1 };
  assert.deepEqual(
    yearSummary(buildMatrix(wonDashboards()).company, opts),
    yearSummary(buildMatrix(withoutWonAwaiting(wonDashboards())).company, opts),
  );
});

test('🐞 รับใบเสนอราคาแล้ว (Won) แต่ SO ยังเป็นร่าง — ยอดคาดไม่วูบ ทุกช่วงของดีลอยู่ในสูตรช่องเดียว', () => {
  // ดีลมูลค่า 80 ในเดือนที่วิ่ง · เป้า 100 · Actual จากดีลอื่น 20
  const stage = (patch) => {
    const r = {
      target: fill(0), fcTotal: fill(0), forecast: fill(0), actual: fill(0),
      pendingApproval: fill(0), pendingApprovalCount: fill(0), wonAwaitingSo: fill(0), wonAwaitingSoCount: fill(0),
    };
    r.target[SEP] = 100;
    r.actual[SEP] = 20;
    patch(r);
    return windowStat(r, oneMonth(SEP));
  };
  const lifecycle = {
    เปิดอยู่: stage((r) => { r.forecast[SEP] = 80; }),
    Wonรอยื่นSO: stage((r) => { r.wonAwaitingSo[SEP] = 80; r.wonAwaitingSoCount[SEP] = 1; }),
    รออนุมัติ: stage((r) => { r.pendingApproval[SEP] = 80; r.pendingApprovalCount[SEP] = 1; }),
    อนุมัติแล้ว: stage((r) => { r.actual[SEP] = 100; }),
  };
  for (const [name, s] of Object.entries(lifecycle)) {
    assert.equal(s.projected, 100, name);
    assert.deepEqual(projectionGap(s), { projected: 100, mustClose: 100, hasTarget: true, reached: true, shortfall: 0 }, name);
    assert.equal(statusOf(s, { periodKind: 'current' }).key, 'running_on_track', name);
  }
  // ไม่มีเส้นนี้ = อาการที่ผู้ใช้เจอ: ช่วง Won → ยื่น SO "คาดขาด" พุ่งเต็มมูลค่าดีล
  const hole = stage(() => {});
  assert.equal(projectionGap(hole).shortfall, 80);
  assert.deepEqual(statusOf(hole, { periodKind: 'current' }), { key: 'running_behind', label: 'กำลังวิ่ง · คาดขาด', tone: 'amber', amount: 80 });
});

test('projectionGap: คาดขาด / คาดถึงเป้า / ไม่มีเป้าให้เทียบ', () => {
  assert.deepEqual(projectionGap({ projected: 70, mustClose: 100 }), { projected: 70, mustClose: 100, hasTarget: true, reached: false, shortfall: 30 });
  assert.deepEqual(projectionGap({ projected: 130, mustClose: 100 }), { projected: 130, mustClose: 100, hasTarget: true, reached: true, shortfall: 0 });
  assert.equal(projectionGap({ projected: 100, mustClose: 100 + 1e-12 }).reached, true, 'ค่าเผื่อเดียวกับ statusOf');
  assert.deepEqual(projectionGap({ projected: 50, mustClose: 0 }), { projected: 50, mustClose: 0, hasTarget: false, reached: false, shortfall: 0 });
  assert.deepEqual(projectionGap(null), { projected: 0, mustClose: 0, hasTarget: false, reached: false, shortfall: 0 });
});

test('⭐ overlayHistory: เดือนที่บริษัทกรอก Actual มือ ⇒ Won รอยื่น SO ของบริษัทเป็น 0 (ยอดอยู่ในตัวเลขที่กรอกแล้ว)', () => {
  // ล้อของจริง: 2026 ม.ค.–มิ.ย. กรอกไว้ระดับบริษัทอย่างเดียว
  const m = overlayHistory(buildMatrix(wonDashboards()), [
    { period: '2026-03', team: null, ownerId: null, actualAmount: 900 },
  ]);
  assert.equal(m.company.actual[MAR], 900);
  assert.equal(m.company.wonAwaitingSo[MAR], 0, 'นับซ้ำในยอดคาด = บวกสองรอบ');
  assert.equal(m.company.wonAwaitingSoCount[MAR], 0);
  assert.equal(m.company.wonAwaitingSo[SEP], 120, 'เดือนที่ไม่มีแถวประวัติไม่แตะ');
  // แถวทีม/คน Actual ยังเป็นยอดจากดีล (ไม่ถูกทับ) ⇒ ดีลรอยื่นของตัวเองยังอยู่
  assert.equal(teamOf(m, 'KA').wonAwaitingSo[MAR], 350);
  assert.equal(teamOf(m, 'SV').wonAwaitingSo[MAR], 200);
  assert.equal(personOf(m, 'u1').wonAwaitingSo[MAR], 300);
  const company = windowStat(m.company, oneMonth(MAR));
  assert.equal(company.projected, 900, 'ยอดคาดของเดือนที่กรอกมือ = ตัวเลขที่กรอกเท่านั้น');
  // แถวทีม + "ยังไม่ได้แยกทีม" = บริษัท ทุกเส้น (ส่วนต่างของเส้นนี้ติดลบได้ ตามคอมเมนต์ unallocatedRow)
  const rest = unallocatedRow(m);
  for (const key of WON_KEYS) {
    for (let i = 0; i < 12; i += 1) {
      const teams = m.teams.reduce((sum, t) => sum + t[key][i], 0);
      assert.equal(teams + rest[key][i], m.company[key][i], `${key} เดือน ${i + 1} ต้องกระทบกันได้`);
    }
  }
  assert.equal(rest.wonAwaitingSo[MAR], -550);
  const teamsProjected = m.teams.reduce((sum, t) => sum + windowStat(t, oneMonth(MAR)).projected, 0);
  assert.equal(teamsProjected + windowStat(rest, oneMonth(MAR)).projected, company.projected, 'ยอดคาดแถวทีม + แถวที่ยังไม่แยก = บริษัท');
});

test('⭐ overlayHistory: แถวรายคนล้างเฉพาะช่องของคนนั้น · ทีม/บริษัทที่ roll up ใช้ผลรวมชั้นล่าง (คนที่ไม่ได้กรอกยังอยู่)', () => {
  const m = overlayHistory(buildMatrix(wonDashboards()), [
    { period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
  ]);
  assert.equal(personOf(m, 'u1').wonAwaitingSo[MAR], 0);
  assert.equal(personOf(m, 'u1').wonAwaitingSoCount[MAR], 0);
  assert.equal(personOf(m, 'u1').wonAwaitingSo[SEP], 120, 'เดือนอื่นของคนเดียวกันไม่แตะ');
  assert.equal(personOf(m, 'u3').wonAwaitingSo[MAR], 50, 'คนที่ไม่ได้กรอกไม่ถูกแตะ');
  const ka = teamOf(m, 'KA');
  assert.equal(ka.actual[MAR], 70, 'Actual ทีม roll up จากคน (70 + 0)');
  assert.equal(ka.wonAwaitingSo[MAR], 50, 'ล้างทั้งช่องเป็น 0 = ดีลรอยื่นของ u3 หายจากยอดคาดของทีม');
  assert.equal(ka.wonAwaitingSoCount[MAR], 1);
  assert.equal(m.company.wonAwaitingSo[MAR], 50 + 200, 'บริษัท roll up จากทีม');
  assert.equal(m.company.wonAwaitingSoCount[MAR], 2);
  // แถวคนในทีมรวมกัน = แถวทีม ทั้งยอดและจำนวน
  const members = m.people.filter((p) => p.team === 'KA');
  for (const key of WON_KEYS) {
    assert.equal(members.reduce((sum, p) => sum + p[key][MAR], 0), ka[key][MAR], key);
  }
});

test('overlayHistory: แถวทีม/บริษัทที่กรอกตรง ๆ ล้างช่องของตัวเอง · กรอกมือครบทุกคน ⇒ roll up ได้ 0 · แถวที่สร้างใหม่ได้ศูนย์ครบแกน', () => {
  const explicit = overlayHistory(buildMatrix(wonDashboards()), [
    { period: '2026-03', team: 'SV', ownerId: null, actualAmount: 30 },
  ]);
  assert.equal(teamOf(explicit, 'SV').wonAwaitingSo[MAR], 0);
  assert.equal(teamOf(explicit, 'SV').wonAwaitingSoCount[MAR], 0);
  assert.equal(teamOf(explicit, 'KA').wonAwaitingSo[MAR], 350, 'ทีมที่ไม่ได้กรอกไม่แตะ');
  assert.equal(explicit.company.wonAwaitingSo[MAR], 350, 'บริษัท roll up จากทีม (350 + 0)');
  assert.equal(personOf(explicit, 'u2').wonAwaitingSo[MAR], 200, 'แถวคนยังเป็นยอดจากดีล — Actual ของเขาไม่ได้ถูกทับ');

  const everyone = overlayHistory(buildMatrix(wonDashboards()), [
    { period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
    { period: '2026-03', team: 'KA', ownerId: 'u3', ownerName: 'ซี', actualAmount: 10 },
    { period: '2026-03', team: 'SV', ownerId: 'u2', ownerName: 'บี', actualAmount: 5 },
  ]);
  assert.equal(everyone.company.actual[MAR], 85);
  for (const r of [everyone.company, ...everyone.teams, ...everyone.people]) {
    assert.equal(r.wonAwaitingSo[MAR], 0);
    assert.equal(r.wonAwaitingSoCount[MAR], 0);
  }

  const winner = overlayHistory(buildMatrix(wonDashboards()), [
    { period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
    { period: '2026-03', team: 'KA', ownerId: null, actualAmount: 90 },
    { period: '2026-03', team: null, ownerId: null, actualAmount: 500 },
    { period: '2026-03', team: 'ODM', ownerId: 'u9', ownerName: 'ดี', actualAmount: 25 },
  ]);
  assert.equal(teamOf(winner, 'KA').wonAwaitingSo[MAR], 0, 'แถวทีมที่กรอกเองชนะ roll up');
  assert.equal(winner.company.wonAwaitingSo[MAR], 0, 'แถวบริษัทที่กรอกเองชนะ roll up');
  assert.deepEqual(personOf(winner, 'u9').wonAwaitingSo, fill(0));
  assert.deepEqual(personOf(winner, 'u9').wonAwaitingSoCount, fill(0));
  assert.deepEqual(teamOf(winner, 'ODM').wonAwaitingSo, fill(0));
  assert.deepEqual(teamOf(winner, 'ODM').wonAwaitingSoCount, fill(0));
  assert.equal(winner.company.pendingApproval[SEP], 150, 'รออนุมัติยังไม่ถูกแตะ (สถานะสดของใบ)');
});

test('Won รอยื่น SO: unallocatedRow ปัดเป็นสตางค์ · rowHasValue เห็นแถวที่มีแต่เส้นนี้ (ยอดหรือจำนวน)', () => {
  const zeros = () => Array(12).fill(0);
  const blankOf = () => ({
    target: zeros(), fcTotal: zeros(), forecast: zeros(), actual: zeros(),
    pendingApproval: zeros(), pendingApprovalCount: zeros(), wonAwaitingSo: zeros(), wonAwaitingSoCount: zeros(),
  });
  const company = blankOf();
  company.wonAwaitingSo[SEP] = 0.3;
  const team = (v) => Object.assign(blankOf(), { wonAwaitingSo: Object.assign(zeros(), { [SEP]: v }) });
  const rest = unallocatedRow({ company, teams: [team(0.1), team(0.2)] });
  assert.equal(rest.wonAwaitingSo[SEP] > 0, false, 'เศษทศนิยมไม่โผล่เป็น "Won รอยื่น SO ฿0.00"');
  assert.equal(rowHasValue(rest, 0, 11), false);

  const amountOnly = blankOf();
  amountOnly.wonAwaitingSo[MAR] = 80;
  assert.equal(rowHasValue(amountOnly, MAR, MAR), true);
  assert.equal(rowHasValue(amountOnly, SEP, SEP), false, 'เฉพาะช่วงที่ถาม');
  const countOnly = blankOf();
  countOnly.wonAwaitingSoCount[SEP] = 1; // ดีลมูลค่าว่าง ยังเป็นหนึ่งดีล
  assert.equal(rowHasValue(countOnly, SEP, SEP), true);
  // แยกครบทุกทีม ⇒ แถวที่ยังไม่แยกเป็นศูนย์ทุกเส้น ซ่อนได้
  assert.equal(rowHasValue(unallocatedRow(buildMatrix(wonDashboards())), 0, 11), false);
});


/* ---------- แถวคน = (ใคร, ทีมไหน) — มติผู้ใช้ 2026-09-14 "ทีมตามดีล" ----------
   ทุกตัวเลขรายคนอยู่ที่ทีมที่ประทับบนแถวต้นทาง (ดีล/เป้า/ประวัติ) ไม่ใช่ทีมในบัญชี
   ⇒ คนที่มียอดหลายทีมได้แถวละทีม แถวทีม = ผลรวมแถวคนใต้มัน · คนย้ายทีม ประวัติทีมเดิมไม่ขยับ */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEAL_SERIES = ['fcTotal', 'forecast', 'actual', 'pendingApproval', 'pendingApprovalCount', 'wonAwaitingSo', 'wonAwaitingSoCount'];
const ALL_SERIES = ['target', ...DEAL_SERIES];
const JAN = 0;
const AUG = 7;

/* ก้อนเดือนหนึ่งของ API — totals = ผลรวม byTeam (ไม่มีเป้า/ยอดระดับบริษัทล้วนในชุดทดสอบนี้) */
const monthOf = (month, byOwner, byTeam) => {
  const sum = (key) => byTeam.reduce((s, t) => s + Number(t[key] || 0), 0);
  return {
    month,
    totals: {
      targetAmount: sum('target'),
      fullForecast: sum('fcTotal'),
      weightedForecast: sum('weighted'),
      wonValue: sum('won'),
      pendingApproval: sum('pendingApproval'),
      pendingApprovalCount: sum('pendingApprovalCount'),
      wonAwaitingSo: sum('wonAwaitingSo'),
      wonAwaitingSoCount: sum('wonAwaitingSoCount'),
    },
    byOwner,
    byTeam,
  };
};

/* payload หลังมติ: u1 มีดีลทั้ง KA และ ODM ใน ม.ค. · มี.ค. KA อย่างเดียว · ส.ค. ย้ายไป ODM แล้ว
   u2 มีดีลไร้ทีมหนึ่งใบ · แถว legacy ไม่มี ownerId (ชื่อเก่าที่จับบัญชีไม่ได้) */
const multiTeamDashboards = () => [
  monthOf('2026-01', [
    { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 100, won: 40, weighted: 10, fcTotal: 60, pendingApproval: 5, pendingApprovalCount: 1, wonAwaitingSo: 7, wonAwaitingSoCount: 1 },
    { ownerId: 'u1', ownerName: 'เอ', team: 'ODM', target: 30, won: 25, weighted: 5, fcTotal: 30, wonAwaitingSo: 4, wonAwaitingSoCount: 1 },
    { ownerId: 'u2', ownerName: 'บี', team: 'KA', target: 50, won: 10, weighted: 0, fcTotal: 10 },
    { ownerId: 'u2', ownerName: 'บี', team: null, target: 0, won: 3, weighted: 0, fcTotal: 3 },
    { ownerId: null, ownerName: 'คนเก่า', team: 'KA', target: 0, won: 2, weighted: 0, fcTotal: 2 },
  ], [
    { team: 'KA', target: 150, won: 52, weighted: 10, fcTotal: 72, pendingApproval: 5, pendingApprovalCount: 1, wonAwaitingSo: 7, wonAwaitingSoCount: 1 },
    { team: 'ODM', target: 30, won: 25, weighted: 5, fcTotal: 30, wonAwaitingSo: 4, wonAwaitingSoCount: 1 },
    { team: null, target: 0, won: 3, weighted: 0, fcTotal: 3 },
  ]),
  monthOf('2026-03', [
    { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 80, won: 20, weighted: 4, fcTotal: 30 },
    { ownerId: null, ownerName: 'คนเก่า', team: 'KA', target: 0, won: 1, weighted: 0, fcTotal: 1 },
  ], [
    { team: 'KA', target: 80, won: 21, weighted: 4, fcTotal: 31 },
  ]),
  monthOf('2026-08', [
    { ownerId: 'u1', ownerName: 'เอ', team: 'ODM', target: 90, won: 60, weighted: 12, fcTotal: 70 },
  ], [
    { team: 'ODM', target: 90, won: 60, weighted: 12, fcTotal: 70 },
  ]),
];
const sliceOf = (m, team, ownerId) => m.people.find((p) => p.id === personSliceKey({ team, ownerId }));

/* แถวทีม = ผลรวมแถวคนใต้ทีมนั้น ทุกเส้นที่ถาม ทุกเดือน (จัดกลุ่มด้วยคีย์เดียวกับ MorningBoard) */
const assertTeamsEqualPeople = (m, keys) => {
  for (const t of m.teams) {
    const members = m.people.filter((p) => (p.team || NO_TEAM_LABEL) === t.team);
    for (const key of keys) {
      for (let i = 0; i < t[key].length; i += 1) {
        const sum = members.reduce((s, p) => s + Number(p[key][i] || 0), 0);
        assert.equal(sum, t[key][i], `ทีม ${t.team} ${key} เดือน ${i + 1}`);
      }
    }
  }
};

test('แถวคน: คนเดียวกันต่างทีม = คนละแถว · (คน, ทีม) เดียวกันข้ามเดือนรวมแถวเดียว · ownerId/team เก็บแยกจาก id', () => {
  const m = buildMatrix(multiTeamDashboards());
  assert.deepEqual(m.people.map((p) => p.id).sort(), [
    'name:KA:คนเก่า', 'owner:-:u2', 'owner:KA:u1', 'owner:KA:u2', 'owner:ODM:u1',
  ].sort());
  assert.equal(new Set(m.people.map((p) => p.id)).size, m.people.length, 'id ไม่ซ้ำ = React key ไม่ชน');

  const ka = sliceOf(m, 'KA', 'u1');
  assert.equal(ka.ownerId, 'u1');
  assert.equal(ka.team, 'KA');
  assert.equal(ka.actual[JAN], 40, 'ม.ค. เฉพาะดีลทีม KA — ไม่รวมดีล ODM ของคนเดียวกัน');
  assert.equal(ka.actual[MAR], 20, 'มี.ค. ทีมเดิม = แถวเดิม');
  assert.equal(ka.actual[AUG], 0, 'ส.ค. ย้ายไป ODM แล้ว ยอดไม่ไหลกลับเข้าแถวทีมเดิม');
  assert.equal(ka.target[JAN], 100);
  assert.equal(ka.pendingApproval[JAN], 5);
  assert.equal(ka.wonAwaitingSo[JAN], 7);

  const odm = sliceOf(m, 'ODM', 'u1');
  assert.equal(odm.ownerId, 'u1');
  assert.equal(odm.team, 'ODM');
  assert.equal(odm.actual[JAN], 25);
  assert.equal(odm.actual[AUG], 60, 'ม.ค. กับ ส.ค. ทีมเดียวกัน = แถวเดียว');
  assert.equal(odm.wonAwaitingSo[JAN], 4);

  const noTeam = sliceOf(m, null, 'u2');
  assert.equal(noTeam.team, null);
  assert.equal(noTeam.ownerId, 'u2');
  assert.equal(noTeam.actual[JAN], 3);
  assert.equal(sliceOf(m, 'KA', 'u2').actual[JAN], 10);

  const legacy = m.people.find((p) => p.id === 'name:KA:คนเก่า');
  assert.equal(legacy.ownerId, null, 'แถว legacy ไม่มีตัวตน — ผู้ใช้อ่าน ownerId จากช่อง ห้ามแกะจาก id');
  assert.equal(legacy.actual[JAN] + legacy.actual[MAR], 3);

  const ranks = m.people.map((p) => teamRank(p.team));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'ยังเรียงตามลำดับทีม');
  assertTeamsEqualPeople(m, ALL_SERIES);
});

test('overlayHistory: แถวประวัติรายคนจับคู่ด้วย (ทีมของแถวประวัติ, ownerId) · ไม่ดันแถวซ้ำ · roll up ตามทีมของแถวประวัติ', () => {
  const m = overlayHistory(buildMatrix(multiTeamDashboards()), [
    { period: '2026-01', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
    // ยอดทีมเดิมของคนที่ย้ายไป ODM แล้ว — ต้องลงแถว KA ของเขา ไม่ใช่แถวทีมปัจจุบัน
    { period: '2026-08', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 50 },
  ]);
  assert.equal(m.people.length, 5, 'แถว (KA, u1) มีอยู่แล้ว — ห้ามดันแถวซ้ำ (ข้อ 2 จะบวกซ้ำเงียบ ๆ)');
  const ka = sliceOf(m, 'KA', 'u1');
  const odm = sliceOf(m, 'ODM', 'u1');
  assert.equal(ka.actual[JAN], 70);
  assert.equal(ka.wonAwaitingSo[JAN], 0, 'ช่องที่กรอกมือล้าง Won รอยื่น SO ของแถวนั้น');
  assert.equal(odm.actual[JAN], 25, 'ยอดที่กรอกให้ KA ไม่ทับยอด ODM ของคนเดียวกัน');
  assert.equal(odm.wonAwaitingSo[JAN], 4);
  assert.equal(ka.actual[AUG], 50);
  assert.equal(odm.actual[AUG], 60, 'ประวัติทีมเดิมไม่ย้ายตามคน');

  assert.equal(teamOf(m, 'KA').actual[JAN], 70 + 10 + 2, 'KA roll up = ผลรวมแถวคนใต้ KA');
  assert.equal(teamOf(m, 'KA').actual[AUG], 50, 'roll up เข้าทีมของแถวประวัติ ไม่ใช่ทีมล่าสุดของคน');
  assert.equal(teamOf(m, 'ODM').actual[JAN], 25, 'ODM ไม่ถูก roll up');
  assert.equal(teamOf(m, 'ODM').actual[AUG], 60);
  assert.equal(m.company.actual[JAN], 82 + 25 + 3, 'บริษัท = ผลรวมทีม — ไม่นับซ้ำ');
  assert.equal(m.company.actual[AUG], 50 + 60);
  assertTeamsEqualPeople(m, ALL_SERIES);
});

test('overlayHistory: ทีมที่คนนั้นยังไม่มีแถว ⇒ สร้างแถว (คน, ทีมของแถวประวัติ) ครั้งเดียว · กรอกหลายเดือนก็ไม่ซ้ำ', () => {
  const m = overlayHistory(buildMatrix(multiTeamDashboards()), [
    { period: '2026-01', team: 'SV', ownerId: 'u1', ownerName: 'เอ (ชื่อตอนบันทึก)', actualAmount: 15 },
    { period: '2026-02', team: 'SV', ownerId: 'u1', ownerName: 'เอ (ชื่อตอนบันทึก)', actualAmount: 9 },
  ]);
  assert.equal(m.people.length, 6);
  const sv = m.people.filter((p) => p.ownerId === 'u1' && p.team === 'SV');
  assert.equal(sv.length, 1, 'สองเดือนของ (SV, u1) ต้องลงแถวเดียว');
  assert.equal(sv[0].id, 'owner:SV:u1');
  assert.equal(sv[0].actual[JAN], 15);
  assert.equal(sv[0].actual[1], 9);
  assert.deepEqual(sv[0].pendingApproval, fill(0));
  assert.deepEqual(sv[0].wonAwaitingSo, fill(0));
  assert.equal(sliceOf(m, 'KA', 'u1').actual[JAN], 40, 'แถวทีมอื่นของคนเดียวกันไม่แตะ');
  assert.equal(sliceOf(m, 'ODM', 'u1').actual[JAN], 25);
  assert.equal(teamOf(m, 'SV').actual[JAN], 15);
  assert.equal(teamOf(m, 'KA').actual[JAN], 52, 'KA ไม่ถูก roll up');
  assert.equal(m.company.actual[JAN], 52 + 25 + 3 + 15);
  assert.equal(findPersonRow(m.people, 'u1').team, 'KA', 'id เปล่ายังได้แถวของทีมที่เรียงก่อน');
  assertTeamsEqualPeople(m, ALL_SERIES);
});

test('resolvePersonDrill: คีย์เต็ม · id เปล่า · หาไม่เจอ = ว่าง (ไม่ถอยไปคนแรก) · ปีก่อนหาด้วยแถว (คน, ทีม) เดียวกัน', () => {
  const m = buildMatrix(multiTeamDashboards());
  const prev = buildMatrix([monthOf('2025-05', [
    { ownerId: 'u1', ownerName: 'เอ', team: 'KA', target: 10, won: 9, weighted: 0, fcTotal: 9 },
    { ownerId: 'u3', ownerName: 'ซี', team: 'SV', target: 10, won: 4, weighted: 0, fcTotal: 4 },
  ], [
    { team: 'KA', target: 10, won: 9, weighted: 0, fcTotal: 9 },
    { team: 'SV', target: 10, won: 4, weighted: 0, fcTotal: 4 },
  ])]);

  const bare = resolvePersonDrill(m, prev, 'u1');
  assert.equal(bare.row.id, findPersonRow(m.people, 'u1').id);
  assert.equal(bare.row.id, 'owner:KA:u1', 'ลิงก์ "ดูผลงานเต็ม" (user id เปล่า) ได้แถวของทีมที่เรียงก่อน');
  assert.equal(bare.prev.id, 'owner:KA:u1');
  assert.equal(bare.prev.actual[4], 9);

  const odm = resolvePersonDrill(m, prev, 'owner:ODM:u1');
  assert.equal(odm.row.id, 'owner:ODM:u1');
  assert.equal(odm.prev, null, 'ปีก่อนไม่มีแถว ODM ของคนนี้ = ไม่มีฐาน YoY — ห้ามเอาแถว KA มาเทียบ');

  const ghost = resolvePersonDrill(m, prev, 'u3');
  assert.equal(ghost.row, null, 'คนที่ไม่มีแถวในปีที่ดู = ว่าง ห้ามถอยไปคนแรกของรายชื่อ');
  assert.equal(ghost.prev, null);
  assert.equal(resolvePersonDrill(m, prev, 'owner:SV:u1').row, null);

  assert.equal(resolvePersonDrill(m, prev, '').row, m.people[0], 'ยังไม่ได้เลือกใคร = คนแรกของรายชื่อ (พฤติกรรมเดิม)');
  assert.deepEqual(resolvePersonDrill(buildMatrix([]), null, 'u1'), { row: null, prev: null });
  assert.deepEqual(resolvePersonDrill(buildMatrix([]), null, ''), { row: null, prev: null });
});

test('จอผลงาน: ตัวตนคนอ่านจากช่อง ownerId (ไม่แกะ id) · ลิ้นชักรายคนจำกัดทีม · heatmap บอกทีมทุกแถว · หาคนไม่เจอไม่ถอยไปคนแรก', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');
  const board = read('src/components/salesPlanning/dashboard/performance/MorningBoard.js');
  assert.doesNotMatch(board, /includes\(":"\)/, 'id เป็นคีย์ผสมแล้ว — ห้ามเดาแถว legacy จาก ":" ใน id');
  assert.match(board, /ownerId: isPerson \? row\.ownerId \|\| null : null,/);
  assert.match(board, /teamScoped: isPerson,/);
  assert.match(board, /<Row key=\{p\.id\} row=\{p\} \/>/);
  const drill = read('src/components/salesPlanning/dashboard/performance/DrillSection.js');
  assert.match(drill, /resolvePersonDrill\(matrix, prevMatrix, person\)/);
  assert.doesNotMatch(drill, /\|\| matrix\.people\[0\]/);
  // ระหว่างโหลดครั้งแรก matrix ว่าง — ห้ามขึ้นป้าย "ไม่พบพนักงานที่เลือก" ก่อนข้อมูลมา
  assert.match(drill, /personMissing: Boolean\(person\) && !loading/);
  assert.match(drill, /\[scope, team, person, loading, matrix, prevMatrix\]/);
  const heat = read('src/components/salesPlanning/dashboard/performance/YearHeatmap.js');
  assert.match(heat, /\{p\.team \|\| NO_TEAM_LABEL\}/);
  assert.doesNotMatch(heat, /\{p\.team && </);
});


/* ---------- วันนี้ (ข้อมูลจริง 14/09/2026: ไม่มีคนหลายทีม ไม่มียอดที่ทีมต่างจากบัญชี) ตัวเลขต้องเท่าเดิมทุกช่อง ----------
   🧊 สำเนาตรรกะก่อนมติ 2026-09-14 — คีย์คน = ownerId ล้วน · overlay จับคนด้วย ownerId ·
   roll up ตามทีมของแถวคนที่จับได้ · ห้ามแก้สำเนานี้ให้ตามโค้ดใหม่ มันคือไม้บรรทัด */
const LEGACY_SIDE = ['pendingApproval', 'pendingApprovalCount', 'wonAwaitingSo', 'wonAwaitingSoCount'];
const LEGACY_WON = ['wonAwaitingSo', 'wonAwaitingSoCount'];
const legacyBlank = (axis, size) => ({
  months: axis,
  target: Array(size).fill(0),
  fcTotal: Array(size).fill(0),
  forecast: Array(size).fill(0),
  actual: Array(size).fill(0),
  pendingApproval: Array(size).fill(0),
  pendingApprovalCount: Array(size).fill(0),
  wonAwaitingSo: Array(size).fill(0),
  wonAwaitingSoCount: Array(size).fill(0),
});

function legacyBuildMatrix(dashboards) {
  const axis = monthsForYear(String(monthsOfDashboards(dashboards)[0] || '').slice(0, 4) || '');
  const size = axis.length || 12;
  const at = new Map(axis.map((key, i) => [key, i]));
  const company = legacyBlank(axis, size);
  const people = new Map();
  const teams = new Map();
  for (const d of dashboards || []) {
    const mi = at.get(String(d.month || ''));
    if (mi == null) continue;
    const totals = d.totals || {};
    company.target[mi] += Number(totals.targetAmount || 0);
    company.fcTotal[mi] += Number(totals.fullForecast || 0);
    company.forecast[mi] += Number(totals.weightedForecast || 0);
    company.actual[mi] += Number(totals.wonValue || 0);
    for (const k of LEGACY_SIDE) company[k][mi] += Number(totals[k] || 0);
    for (const r of d.byOwner || []) {
      const key = r.ownerId || `${r.team || 'none'}:${r.ownerName || 'ไม่ระบุ'}`;
      if (!people.has(key)) people.set(key, { id: key, name: r.ownerName || 'ไม่ระบุ', team: r.team || null, ...legacyBlank(axis, size) });
      const p = people.get(key);
      p.target[mi] += Number(r.target || 0);
      p.fcTotal[mi] += Number(r.fcTotal || 0);
      p.forecast[mi] += Number(r.weighted || 0);
      p.actual[mi] += Number(r.won || 0);
      for (const k of LEGACY_SIDE) p[k][mi] += Number(r[k] || 0);
    }
    for (const r of d.byTeam || []) {
      const key = r.team || 'ไม่ระบุทีม';
      if (!teams.has(key)) teams.set(key, { team: key, ...legacyBlank(axis, size) });
      const t = teams.get(key);
      t.target[mi] += Number(r.target || 0);
      t.fcTotal[mi] += Number(r.fcTotal || 0);
      t.forecast[mi] += Number(r.weighted || 0);
      t.actual[mi] += Number(r.won || 0);
      for (const k of LEGACY_SIDE) t[k][mi] += Number(r[k] || 0);
    }
  }
  return {
    people: [...people.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team) || a.name.localeCompare(b.name, 'th')),
    teams: [...teams.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team)),
    company,
    months: axis,
  };
}

function legacyOverlayHistory(matrix, rows) {
  const axis = matrix.company.months || [];
  const size = matrix.company.target.length || axis.length || 12;
  const indexOf = (period) => {
    const key = String(period || '').slice(0, 7);
    const onAxis = axis.indexOf(key);
    if (onAxis >= 0) return onAxis;
    if (axis.length) return -1;
    const mi = Number(key.slice(5, 7)) - 1;
    return mi >= 0 && mi < size ? mi : -1;
  };
  const teamKeyOf = (team) => team || 'ไม่ระบุทีม';
  const teamRowOf = (team) => {
    const key = teamKeyOf(team);
    let t = matrix.teams.find((x) => x.team === key);
    if (!t) { t = { team: key, ...legacyBlank(axis, size) }; matrix.teams.push(t); }
    return t;
  };
  const clear = (r, mi) => { for (const k of LEGACY_WON) if (Array.isArray(r?.[k])) r[k][mi] = 0; };
  const rollUp = (r, parts, mi) => {
    for (const k of LEGACY_WON) if (Array.isArray(r?.[k])) r[k][mi] = parts.reduce((s, p) => s + Number(p?.[k]?.[mi] || 0), 0);
  };
  const personTouched = new Map();
  const teamExplicit = new Map();
  const companyExplicit = new Set();
  for (const r of rows || []) {
    const mi = indexOf(r.period);
    if (mi < 0) continue;
    const amt = Number(r.actualAmount || 0);
    if (r.ownerId) {
      let person = matrix.people.find((x) => x.id === r.ownerId);
      if (!person) {
        person = { id: r.ownerId, name: r.ownerName || r.ownerId, team: r.team || null, ...legacyBlank(axis, size) };
        matrix.people.push(person);
      }
      person.actual[mi] = amt;
      clear(person, mi);
      const key = teamKeyOf(person.team);
      if (!personTouched.has(key)) personTouched.set(key, new Set());
      personTouched.get(key).add(mi);
      continue;
    }
    if (!r.team) {
      matrix.company.actual[mi] = amt;
      clear(matrix.company, mi);
      companyExplicit.add(mi);
      continue;
    }
    const teamRow = teamRowOf(r.team);
    teamRow.actual[mi] = amt;
    clear(teamRow, mi);
    const key = teamKeyOf(r.team);
    if (!teamExplicit.has(key)) teamExplicit.set(key, new Set());
    teamExplicit.get(key).add(mi);
  }
  const teamMoved = new Set();
  for (const [key, indexes] of personTouched) {
    const explicit = teamExplicit.get(key);
    const team = teamRowOf(key);
    const members = matrix.people.filter((p) => teamKeyOf(p.team) === key);
    for (const mi of indexes) {
      if (explicit?.has(mi)) continue;
      team.actual[mi] = members.reduce((s, p) => s + Number(p.actual[mi] || 0), 0);
      rollUp(team, members, mi);
      teamMoved.add(mi);
    }
  }
  for (const indexes of teamExplicit.values()) for (const mi of indexes) teamMoved.add(mi);
  for (const mi of teamMoved) {
    if (companyExplicit.has(mi)) continue;
    matrix.company.actual[mi] = matrix.teams.reduce((s, t) => s + Number(t.actual[mi] || 0), 0);
    rollUp(matrix.company, matrix.teams, mi);
  }
  return matrix;
}

/* ทุกคนมีทีมเดียวตลอดปี (ทีมบนยอด = ทีมในบัญชี) + แถว legacy ไม่มี ownerId + คนไม่มีทีม + แถวประวัติทุกชนิด */
const singleTeamExtras = () => [
  monthOf('2026-02', [
    { ownerId: 'u5', ownerName: 'อี', team: null, target: 0, won: 8, weighted: 1, fcTotal: 9, wonAwaitingSo: 2, wonAwaitingSoCount: 1 },
    { ownerId: null, ownerName: 'คนเก่า', team: 'SV', target: 0, won: 2, weighted: 0, fcTotal: 2 },
    { ownerId: 'u2', ownerName: 'บี', team: 'SV', target: 20, won: 5, weighted: 0, fcTotal: 5, pendingApproval: 3, pendingApprovalCount: 1 },
  ], [
    { team: 'SV', target: 20, won: 7, weighted: 0, fcTotal: 7, pendingApproval: 3, pendingApprovalCount: 1 },
    { team: null, target: 0, won: 8, weighted: 1, fcTotal: 9, wonAwaitingSo: 2, wonAwaitingSoCount: 1 },
  ]),
  monthOf('2026-06', [
    { ownerId: 'u5', ownerName: 'อี', team: null, target: 10, won: 1, weighted: 0, fcTotal: 1 },
    { ownerId: null, ownerName: 'คนเก่า', team: 'SV', target: 0, won: 4, weighted: 0, fcTotal: 4 },
  ], [
    { team: 'SV', target: 0, won: 4, weighted: 0, fcTotal: 4 },
    { team: null, target: 10, won: 1, weighted: 0, fcTotal: 1 },
  ]),
];
const todayCases = () => [
  ['Won รอยื่น SO ไม่มีประวัติ', wonDashboards(), []],
  ['Won รอยื่น SO + ประวัติรายคน', wonDashboards(), [{ period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 }]],
  ['Won รอยื่น SO + ประวัติรายทีม', wonDashboards(), [{ period: '2026-03', team: 'SV', ownerId: null, actualAmount: 30 }]],
  ['Won รอยื่น SO + กรอกครบทุกคน', wonDashboards(), [
    { period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
    { period: '2026-03', team: 'KA', ownerId: 'u3', ownerName: 'ซี', actualAmount: 10 },
    { period: '2026-03', team: 'SV', ownerId: 'u2', ownerName: 'บี', actualAmount: 5 },
  ]],
  ['Won รอยื่น SO + แถวที่กรอกตรงชนะ + คนใหม่', wonDashboards(), [
    { period: '2026-03', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 70 },
    { period: '2026-03', team: 'KA', ownerId: null, actualAmount: 90 },
    { period: '2026-03', team: null, ownerId: null, actualAmount: 500 },
    { period: '2026-03', team: 'ODM', ownerId: 'u9', ownerName: 'ดี', actualAmount: 25 },
  ]],
  ['รออนุมัติ + ประวัติทุกระดับ', pendingDashboards(), [
    { period: '2026-09', team: null, ownerId: null, actualAmount: 5000 },
    { period: '2026-09', team: 'KA', ownerId: null, actualAmount: 4000 },
    { period: '2026-09', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 3000 },
    { period: '2026-09', team: 'SV', ownerId: 'u9', ownerName: 'ซี', actualAmount: 100 },
  ]],
  ['ปีจำลอง prod + รายคน', yearMonths('2026'), [
    { period: '2026-02', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 45 },
    { period: '2026-02', team: 'SV', ownerId: 'u2', ownerName: 'บี', actualAmount: 15 },
  ]],
  ['ปีจำลอง prod + บริษัทล้วน', yearMonths('2026'), [
    { period: '2026-01', team: null, ownerId: null, actualAmount: 80 },
    { period: '2026-02', team: null, ownerId: null, actualAmount: 60 },
    { period: '2026-02', team: 'KA', ownerId: 'u1', ownerName: 'เอ', actualAmount: 45 },
    { period: '2026-01', team: 'SV', ownerId: 'u9', ownerName: 'ซี', actualAmount: 25 },
  ]],
  ['legacy + คนไม่มีทีม', singleTeamExtras(), [
    { period: '2026-06', team: null, ownerId: 'u5', ownerName: 'อี', actualAmount: 4 },
    { period: '2026-02', team: 'SV', ownerId: 'u2', ownerName: 'บี', actualAmount: 11 },
  ]],
];

test('⭐ วันนี้ทุกคนมีทีมเดียว ⇒ matrix เท่าตรรกะเดิมทุกช่อง (ก่อน/หลัง overlay + แถวที่ยังไม่แยกทีม) — ต่างแค่ id กับช่อง ownerId', () => {
  /* `targetPersonSum` = เส้นเตือนอย่างเดียว (มติผู้ใช้ 2026-09-16: เป้าทีมชนะเป้ารายคน แต่ต้องบอกบนจอ)
     ไม่มีในตรรกะเดิมและไม่เข้ายอดไหนเลย ⇒ ตัดออกก่อนเทียบ ไม่งั้น parity ตกทั้งที่ยอดเท่าเดิมทุกช่อง */
  const dropWarn = ({ targetPersonSum, ...row }) => row;
  const strip = (m) => ({
    ...m,
    company: dropWarn(m.company),
    teams: m.teams.map(dropWarn),
    people: m.people.map(({ id, ownerId, ...rest }) => dropWarn(rest)),
  });
  for (const [name, dashboards, rows] of todayCases()) {
    const built = buildMatrix(dashboards);
    const legacy = legacyBuildMatrix(dashboards);
    assert.deepEqual(strip(built), strip(legacy), `${name}: buildMatrix`);
    // id ใหม่ = คีย์ (ทีม, คน) · ownerId = id เดิมของแถวที่มีตัวตน (แถว legacy = null)
    built.people.forEach((p, i) => {
      const oldId = legacy.people[i].id;
      const hadOwner = !oldId.includes(':');
      assert.equal(p.ownerId, hadOwner ? oldId : null, `${name}: ownerId ของ ${oldId}`);
      assert.equal(p.id, personSliceKey({ team: p.team, ownerId: p.ownerId, ownerName: p.name }), `${name}: id ของ ${oldId}`);
    });

    const overlaid = overlayHistory(buildMatrix(dashboards), rows);
    const legacyOverlaid = legacyOverlayHistory(legacyBuildMatrix(dashboards), rows);
    assert.deepEqual(strip(overlaid), strip(legacyOverlaid), `${name}: overlayHistory`);
    assert.deepEqual(unallocatedRow(overlaid), unallocatedRow(legacyOverlaid), `${name}: unallocatedRow`);
  }
});
