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

test('cellDetail lists contributing FC rounds and active PO lines', () => {
  const d = cellDetail(RC_ROUNDS, RC_POS, 'A', '2026-07');
  assert.deepEqual(d.fcs.map((f) => f.roundNo), [1, 2]); // both rounds had Jul
  assert.equal(d.poLines.length, 1);                      // cancelled excluded? no — detail shows all; but only 1 Jul PO exists
});
