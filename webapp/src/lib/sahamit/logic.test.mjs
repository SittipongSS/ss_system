// Sanity tests for the ported SAHAMIT pure logic. Mirrors the user's worked
// example: FC round 1 covers months 1–4, round 2 covers 2–6 (a month dropped,
// later months added, some shifted). Run: npm test (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { snapshotForSku, snapshotSeriesForSku, snapshotTotal } from './snapshots.js';
import { diffSnapshots } from './diff.js';
import { computeSkuFcWarning } from './peak.js';
import { reconcileCell } from './reconcile.js';

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
