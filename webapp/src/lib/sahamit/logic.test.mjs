// Sanity tests for the ported SAHAMIT pure logic. Mirrors the user's worked
// example: FC round 1 covers months 1–4, round 2 covers 2–6 (a month dropped,
// later months added, some shifted). Run: npm test (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { snapshotForSku, snapshotSeriesForSku, snapshotTotal } from './snapshots.js';
import { diffSnapshots } from './diff.js';
import { computeSkuFcWarning } from './peak.js';
import { reconcileCell } from './reconcile.js';
import { compareRounds, roundTotal, roundSkuCount } from './forecastClient.js';
import { buildReconMatrix, cellDetail } from './reconcileClient.js';
import { leadDaysFor, recommendedReadyDate, materialView, LEAD_IN_FC, LEAD_OUT_FC } from './material.js';
import { detectFlags } from './flags.js';
import { avgShiftForSku, predictShifts, suggestCoverage, addMonths, urgencyOf } from './predict.js';

test('snapshotForSku aggregates one round, one SKU, sums same-month lines', () => {
  const lines = [
    { fgCode: 'A', month: '2026-01', qty: 100 },
    { fgCode: 'A', month: '2026-01', qty: 50 },   // same month → summed
    { fgCode: 'A', month: '2026-02', qty: 200 },
    { fgCode: 'B', month: '2026-01', qty: 999 },  // other SKU → ignored
  ];
  assert.deepEqual(snapshotForSku(lines, 'A'), { '2026-01': 150, '2026-02': 200 });
  assert.equal(snapshotTotal(snapshotForSku(lines, 'A')), 350);
});

test('snapshotSeriesForSku orders rounds ascending', () => {
  const rounds = [
    { roundNo: 2, lines: [{ fgCode: 'A', month: '2026-02', qty: 10 }] },
    { roundNo: 1, lines: [{ fgCode: 'A', month: '2026-01', qty: 5 }] },
  ];
  const series = snapshotSeriesForSku(rounds, 'A');
  assert.deepEqual(series.map((s) => s.roundNo), [1, 2]);
});

test('diffSnapshots classifies increase / decrease / add / remove', () => {
  const oldS = { '2026-01': 100, '2026-02': 200, '2026-03': 300 };
  const newS = { '2026-02': 250, '2026-03': 150, '2026-04': 400 };
  const d = diffSnapshots(oldS, newS);
  // 2026-01 removed(100), 2026-04 added(400); but shift-matching may pair them.
  assert.deepEqual(d.increases, [{ month: '2026-02', oldQty: 200, newQty: 250, diff: 50 }]);
  assert.deepEqual(d.decreases, [{ month: '2026-03', oldQty: 300, newQty: 150, diff: -150 }]);
});

test('diffSnapshots pairs a removed+added month of similar qty as a shift', () => {
  // Jun 1000 disappears, Jul 1000 appears → one shift, no add/remove left over.
  const d = diffSnapshots({ '2026-06': 1000 }, { '2026-07': 1000 });
  assert.equal(d.shifts.length, 1);
  assert.deepEqual(
    { from: d.shifts[0].fromMonth, to: d.shifts[0].toMonth, diff: d.shifts[0].diff },
    { from: '2026-06', to: '2026-07', diff: 0 },
  );
  assert.equal(d.added.length, 0);
  assert.equal(d.removed.length, 0);
});

test('diffSnapshots keeps far-apart qty as separate add/remove (not a shift)', () => {
  const d = diffSnapshots({ '2026-06': 1000 }, { '2026-07': 100 }); // 90% apart > 50%
  assert.equal(d.shifts.length, 0);
  assert.equal(d.removed.length, 1);
  assert.equal(d.added.length, 1);
});

test('diffSnapshots honors the isLocked predicate (lockedBreak vs change)', () => {
  const d = diffSnapshots({ '2026-01': 100 }, { '2026-01': 80 }, { isLocked: (m) => m === '2026-01' });
  assert.equal(d.decreases.length, 0);
  assert.deepEqual(d.lockedBreaks, [{ month: '2026-01', oldQty: 100, newQty: 80, diff: -20 }]);
});

test('computeSkuFcWarning flags a peak drop with a per-line breakdown', () => {
  // Round1 peak total 1000; round2 drops to 700 on the same active months.
  const series = [
    { roundNo: 1, snapshot: { '2026-03': 600, '2026-04': 400 } },
    { roundNo: 2, snapshot: { '2026-03': 600, '2026-04': 100 } },
  ];
  const w = computeSkuFcWarning(series);
  assert.equal(w.hasWarning, true);
  assert.equal(w.oldTotal, 1000);
  assert.equal(w.newTotal, 700);
  assert.ok(w.breakdown.some((b) => b.type === 'decrease' && b.month === '2026-04' && b.change === -300));
});

test('computeSkuFcWarning: no warning when total holds or rises; null under 2 rounds', () => {
  assert.equal(computeSkuFcWarning([{ roundNo: 1, snapshot: { '2026-01': 100 } }]), null);
  const up = computeSkuFcWarning([
    { roundNo: 1, snapshot: { '2026-01': 100 } },
    { roundNo: 2, snapshot: { '2026-01': 120 } },
  ]);
  assert.equal(up.hasWarning, false);
});

test('reconcileCell core statuses match ss-cj labels', () => {
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 0 })), { status: 'none', label: '' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 0, hasHistory: true })), { status: 'cancelled', label: 'ยกเลิกแล้ว' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 100 })), { status: 'match', label: '✓ ครบ' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 150 })), { status: 'over', label: '◉ PO เกิน' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 150 })), { status: 'unforecasted', label: 'นอก FC' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 60 })), { status: 'discrepancy', label: '◐ PO ไม่ครบ' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 0 })), { status: 'pending', label: '◌ รอ PO' });
});

function pick(r) { return { status: r.status, label: r.label }; }

// ── flag detection (shift/cut audit) ──────────────────────────────────
test('detectFlags: a decrease vs previous round → drop flag', () => {
  const rounds = [
    { roundNo: 1, lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 100 }] },
    { roundNo: 2, lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] },
  ];
  const flags = detectFlags(rounds, []);
  const jul = flags.find((f) => f.month === '2026-07');
  assert.equal(jul.kind, 'drop');
  assert.equal(jul.drop, 40);
  assert.equal(jul.roundNo, 2);
});

test('detectFlags: month vanished + reappeared elsewhere → shift_suspect', () => {
  const rounds = [
    { roundNo: 1, lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }] },
    { roundNo: 2, lines: [{ fgCode: 'A', month: '2026-07', qty: 100 }] },
  ];
  const flags = detectFlags(rounds, []);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].kind, 'shift_suspect');
  assert.deepEqual([flags[0].month, flags[0].shiftToMonth], ['2026-06', '2026-07']);
});

test('detectFlags: locked cell whose effective FC differs → lockedBreak', () => {
  const rounds = [{ roundNo: 1, coverMonths: ['2026-06'], lines: [{ fgCode: 'A', month: '2026-06', qty: 80 }] }];
  const flags = detectFlags(rounds, [{ fgCode: 'A', month: '2026-06', lockedQty: 100 }]);
  const lb = flags.find((f) => f.kind === 'lockedBreak');
  assert.equal(lb.prevQty, 100);
  assert.equal(lb.newQty, 80);
});

// ── material / lead-time ──────────────────────────────────────────────
const NO_HOLIDAYS = new Set(); // weekends still skipped by addBusinessDays

test('leadDaysFor: in-FC = 60, out-of-FC = 90 working days', () => {
  assert.equal(leadDaysFor(true), LEAD_IN_FC);
  assert.equal(leadDaysFor(false), LEAD_OUT_FC);
  assert.equal(LEAD_IN_FC, 60);
  assert.equal(LEAD_OUT_FC, 90);
});

test('recommendedReadyDate: null-safe, valid date, and 90d is later than 60d', () => {
  assert.equal(recommendedReadyDate(null, 60, NO_HOLIDAYS), null);
  const d60 = recommendedReadyDate('2026-01-01', 60, NO_HOLIDAYS);
  const d90 = recommendedReadyDate('2026-01-01', 90, NO_HOLIDAYS);
  assert.match(d60, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(d90 > d60); // more lead → later ready date
});

test('materialView: in-FC→60d, out-FC→90d; lateVsDue & ourSlip flags', () => {
  const inFc = materialView({ dueDate: '2026-12-31' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(inFc.inForecast, true);
  assert.equal(inFc.leadDays, 60);
  assert.equal(inFc.lateVsDue, false); // ready (~Mar) before Dft Dec due

  const outFc = materialView({ dueDate: '2026-01-15' }, 0, '2026-01-01', NO_HOLIDAYS);
  assert.equal(outFc.inForecast, false);
  assert.equal(outFc.leadDays, 90);
  assert.equal(outFc.lateVsDue, true); // ready (~May) after Jan-15 due → late because PO/lead

  const slipped = materialView({ dueDate: '2026-12-31', actualDeliveredDate: '2026-12-31' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(slipped.ourSlip, true); // delivered Dec-31, well after the ~Mar ready date
  const onTime = materialView({ dueDate: '2026-12-31', actualDeliveredDate: '2026-02-02' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(onTime.ourSlip, false);
});

// ── forecastClient (the API-payload → comparison bridge) ──────────────
const ROUNDS = [
  { id: 'r1', roundNo: 1, lines: [
    { fgCode: 'A', month: '2026-01', qty: 100 },
    { fgCode: 'A', month: '2026-02', qty: 100 },
    { fgCode: 'B', month: '2026-01', qty: 500 },
  ] },
  { id: 'r2', roundNo: 2, lines: [
    { fgCode: 'A', month: '2026-02', qty: 120 }, // A grew
    { fgCode: 'B', month: '2026-01', qty: 300 }, // B dropped (peak warning)
  ] },
];

test('roundTotal / roundSkuCount aggregate a round', () => {
  assert.equal(roundTotal(ROUNDS[0]), 700);
  assert.equal(roundSkuCount(ROUNDS[0]), 2);
});

test('compareRounds: first round has no previous', () => {
  const c = compareRounds(ROUNDS, 0);
  assert.equal(c.hasPrev, false);
  assert.equal(c.targetRoundNo, 1);
});

test('compareRounds: round 2 vs 1 — B flagged as peak drop, sorted first', () => {
  const c = compareRounds(ROUNDS, 1);
  assert.equal(c.hasPrev, true);
  assert.deepEqual([c.prevRoundNo, c.targetRoundNo], [1, 2]);
  const b = c.perSku.find((s) => s.fgCode === 'B');
  assert.equal(b.peak.hasWarning, true);          // 500 → 300 on the same month
  assert.equal(b.net, -200);
  // peak-drop SKUs sort ahead of non-warning ones
  assert.equal(c.perSku[0].fgCode, 'B');
  const a = c.perSku.find((s) => s.fgCode === 'A');
  assert.equal(a.peak?.hasWarning ?? false, false); // A's active-month total grew
});

// ── reconcileClient (FC × PO matrix) ──────────────────────────────────
const RC_ROUNDS = [
  { roundNo: 1, receivedDate: '2026-05-01', lines: [
    { fgCode: 'A', month: '2026-06', qty: 100, productName: 'Alpha' },
    { fgCode: 'A', month: '2026-07', qty: 100, productName: 'Alpha' },
  ] },
  { roundNo: 2, receivedDate: '2026-06-01', lines: [
    { fgCode: 'A', month: '2026-07', qty: 150, productName: 'Alpha' }, // latest restates Jul
  ] },
];
const RC_POS = [
  { poNumber: 'PO-1', lines: [
    { fgCode: 'A', deliveryMonth: '2026-06', qty: 100, status: 'open' }, // matches Jun FC
    { fgCode: 'A', deliveryMonth: '2026-08', qty: 50, status: 'open' },  // นอก FC (no FC Aug)
    { fgCode: 'A', deliveryMonth: '2026-07', qty: 999, status: 'cancelled' }, // ignored
  ] },
];

test('buildReconMatrix: effective FC = latest round per month; PO matched by deliveryMonth', () => {
  const m = buildReconMatrix(RC_ROUNDS, RC_POS);
  assert.deepEqual(m.months, ['2026-06', '2026-07', '2026-08']);
  const a = m.rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-06'].fcQty, 100);
  assert.equal(a.cells['2026-06'].poQty, 100);
  assert.equal(a.cells['2026-06'].status, 'match');     // 100 = 100
  assert.equal(a.cells['2026-07'].fcQty, 150);          // round 2 restated Jul
  assert.equal(a.cells['2026-07'].status, 'pending');   // FC 150, no PO (cancelled ignored)
  assert.equal(a.cells['2026-08'].status, 'unforecasted'); // PO 50, no FC
});

test('buildReconMatrix coverMonths: round2 covers a month but drops the SKU → 0 (cancelled)', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-04'], lines: [{ fgCode: 'A', month: '2026-04', qty: 100 }] },
    // round 2's window includes Apr but does NOT list A for Apr → A/Apr is cut to 0
    { roundNo: 2, coverMonths: ['2026-04', '2026-05'], lines: [{ fgCode: 'A', month: '2026-05', qty: 100 }] },
  ];
  const m = buildReconMatrix(rounds, []);
  const a = m.rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-04'].fcQty, 0);
  assert.equal(a.cells['2026-04'].status, 'cancelled'); // had FC in round 1, dropped, no PO
  assert.equal(a.cells['2026-05'].fcQty, 100);
});

test('buildReconMatrix coverMonths: a shift is NOT double-counted (total preserved)', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-04'], lines: [{ fgCode: 'A', month: '2026-04', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-04', '2026-05'], lines: [{ fgCode: 'A', month: '2026-05', qty: 100 }] },
  ];
  const a = buildReconMatrix(rounds, []).rows.find((r) => r.fgCode === 'A');
  assert.equal(a.fcTotal, 100); // Apr 0 + May 100 — NOT 200
});

test('buildReconMatrix coverage: PO excess in one month covers shortfall in another', () => {
  const rounds = [{ roundNo: 1, coverMonths: ['2026-06', '2026-07'], lines: [
    { fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 100 },
  ] }];
  const pos = [{ poNumber: 'P1', lines: [{ fgCode: 'A', deliveryMonth: '2026-07', qty: 200, status: 'open' }] }];

  // Without coverage: Jun pending (FC100/PO0), Jul over (FC100/PO200)
  const before = buildReconMatrix(rounds, pos).rows.find((r) => r.fgCode === 'A');
  assert.equal(before.cells['2026-06'].status, 'pending');
  assert.equal(before.cells['2026-07'].status, 'over');

  // Allocate 100 of Jul's PO to cover Jun
  const cov = [{ fgCode: 'A', sourceMonth: '2026-07', targetMonth: '2026-06', qty: 100 }];
  const after = buildReconMatrix(rounds, pos, cov).rows.find((r) => r.fgCode === 'A');
  assert.equal(after.cells['2026-06'].status, 'match');     // covered → matches FC
  assert.equal(after.cells['2026-06'].coverageIn, 100);
  assert.equal(after.cells['2026-06'].poQty, 0);            // displayed PO unchanged (actual)
  assert.equal(after.cells['2026-07'].status, 'match');     // excess allocated away
  assert.equal(after.cells['2026-07'].coverageOut, 100);
  assert.equal(after.cells['2026-07'].poQty, 200);          // displayed PO unchanged (actual)
});

test('cellDetail lists contributing FC rounds and active PO lines', () => {
  const d = cellDetail(RC_ROUNDS, RC_POS, 'A', '2026-07');
  assert.deepEqual(d.fcs.map((f) => f.roundNo), [1, 2]); // both rounds had Jul
  assert.equal(d.poLines.length, 1);                      // cancelled excluded? no — detail shows all; but only 1 Jul PO exists
});

// ── predict.js (shift prediction & coverage suggestion) ─────────────────────

test('addMonths / urgencyOf helpers', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01'); // wraps the year
  assert.equal(addMonths('2026-03', 1), '2026-04');
  assert.equal(urgencyOf(10), 'high');
  assert.equal(urgencyOf(45), 'medium');
  assert.equal(urgencyOf(90), 'low');
});

test('avgShiftForSku learns the shift distance from round history, defaults +1', () => {
  // No history (one round) → default +1.
  const one = [{ roundNo: 1, lines: [{ fgCode: 'A', month: '2026-01', qty: 100 }] }];
  assert.equal(avgShiftForSku(one, 'A'), 1);

  // Two rounds: Jan(100) → Mar(100) is a +2 shift (qty within 50%).
  const two = [
    { roundNo: 1, coverMonths: ['2026-01', '2026-02', '2026-03'], lines: [{ fgCode: 'A', month: '2026-01', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-01', '2026-02', '2026-03'], lines: [{ fgCode: 'A', month: '2026-03', qty: 100 }] },
  ];
  assert.equal(avgShiftForSku(two, 'A'), 2);
});

test('predictShifts predicts ONLY for SKUs with real shift history (first round stays quiet)', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-06', '2026-07', '2026-08'], lines: [
      { fgCode: 'A', month: '2026-06', qty: 100, productName: 'Alpha' },
      { fgCode: 'A', month: '2026-07', qty: 100 },
      { fgCode: 'B', month: '2026-08', qty: 50, productName: 'Bravo' }, // B never moves
    ] },
    { roundNo: 2, coverMonths: ['2026-06', '2026-07', '2026-08'], lines: [
      { fgCode: 'A', month: '2026-07', qty: 100 },
      { fgCode: 'A', month: '2026-08', qty: 100 }, // A: Jun→Aug shift (+2)
      { fgCode: 'B', month: '2026-08', qty: 50 },
    ] },
  ];
  const preds = predictShifts(rounds, [], { today: '2026-07-01' });
  // A has shifted before → its still-pending month is predicted, target = +2.
  assert.ok(preds.has('A||2026-08'));
  assert.equal(preds.get('A||2026-08').toMonth, '2026-10');
  assert.equal(preds.get('A||2026-08').avgShift, 2);
  assert.equal(preds.get('A||2026-08').productName, 'Alpha');
  // B never shifted → NO prediction even though it's pending (this is the fix).
  assert.ok(!preds.has('B||2026-08'));

  // A single first round (no history at all) predicts nothing.
  assert.equal(predictShifts([rounds[0]], [], { today: '2026-07-01' }).size, 0);
});

test('predictShifts skips locked cells and returns empty without a clock', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-06', '2026-07'], lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-06', '2026-07'], lines: [{ fgCode: 'A', month: '2026-07', qty: 100 }] }, // Jun→Jul (+1)
  ];
  assert.ok(predictShifts(rounds, [], { today: '2026-06-15' }).has('A||2026-07')); // pending + history
  const locked = predictShifts(rounds, [], { today: '2026-06-15', locks: [{ fgCode: 'A', month: '2026-07' }] });
  assert.ok(!locked.has('A||2026-07')); // locked → skipped
  assert.equal(predictShifts(rounds, [], {}).size, 0); // no today → pure no-op
});

test('suggestCoverage finds surplus-PO months nearest-first', () => {
  // A: Sep short on PO (pending), Aug & Dec carry surplus PO.
  const rounds = [{
    roundNo: 1, coverMonths: ['2026-08', '2026-09', '2026-12'],
    lines: [
      { fgCode: 'A', month: '2026-08', qty: 100 },
      { fgCode: 'A', month: '2026-09', qty: 200 },
      { fgCode: 'A', month: '2026-12', qty: 100 },
    ],
  }];
  const pos = [{ poNumber: 'PO1', lines: [
    { fgCode: 'A', deliveryMonth: '2026-08', qty: 300 }, // +200 surplus
    { fgCode: 'A', deliveryMonth: '2026-12', qty: 250 }, // +150 surplus
  ] }];
  const matrix = buildReconMatrix(rounds, pos);
  const s = suggestCoverage(matrix, 'A', '2026-09');
  assert.deepEqual(s.map((x) => x.sourceMonth), ['2026-08', '2026-12']); // Aug (1mo) before Dec (3mo)
  assert.equal(s[0].canCover, 200);
});
