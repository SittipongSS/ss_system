// SAHAMIT — peak-protection warning (pure).
//
// Ported from ss-cj TrackingContext `skuWarningCache.computeSummary`, with the
// data dependency replaced by an explicit ordered snapshot series (one entry per
// FC round). Business rule: a SKU's forecast peak should not drop — once the
// customer has forecast a high total, later rounds should hold or raise it.
//
// We compare the LATEST round against the highest-total PAST round, scoped to
// the months still active in the latest round (months zeroed/removed don't drag
// the comparison). If the latest total is lower, return a per-line breakdown so
// the UI can show exactly which items fell — that's what S&S asks the customer
// about.
import { diffSnapshots } from './diff';
import { snapshotTotal } from './snapshots';

//   series: [{ roundNo, snapshot }]  ascending by roundNo (≥2 to warn)
//   opts:   { isLocked? } forwarded to diffSnapshots
// Returns null (not enough rounds) | { hasWarning:false, ... } | { hasWarning:true, breakdown, ... }
export function computeSkuFcWarning(series, opts = {}) {
  if (!Array.isArray(series) || series.length < 2) return null;

  const latest = series[series.length - 1].snapshot;
  // Months still in play in the latest round — removed/zeroed months excluded.
  const activeMonths = new Set(
    Object.entries(latest).filter(([, q]) => Number(q) > 0).map(([m]) => m),
  );
  const scopedTotal = (snap) => snapshotTotal(snap, activeMonths);

  const newTotal = scopedTotal(latest);

  const past = series.slice(0, -1);
  let maxSnap = past[0].snapshot;
  let maxTotal = scopedTotal(maxSnap);
  for (let i = 1; i < past.length; i++) {
    const t = scopedTotal(past[i].snapshot);
    if (t > maxTotal) { maxTotal = t; maxSnap = past[i].snapshot; }
  }

  const diff = diffSnapshots(maxSnap, latest, opts);
  const summary = {
    oldTotal: maxTotal,
    newTotal,
    totalDiff: newTotal - maxTotal,
    isDecrease: newTotal < maxTotal,
    diff,
  };

  if (!summary.isDecrease) return { ...summary, hasWarning: false };

  const breakdown = [];
  diff.decreases.forEach((d) => breakdown.push({ type: 'decrease', month: d.month, oldQty: d.oldQty, newQty: d.newQty, change: d.diff }));
  diff.removed.forEach((r) => breakdown.push({ type: 'removed', month: r.month, oldQty: r.qty, newQty: 0, change: -r.qty }));
  diff.increases.forEach((inc) => breakdown.push({ type: 'increase', month: inc.month, oldQty: inc.oldQty, newQty: inc.newQty, change: inc.diff }));
  diff.added.forEach((a) => breakdown.push({ type: 'added', month: a.month, oldQty: 0, newQty: a.qty, change: a.qty }));
  diff.shifts.forEach((s) => breakdown.push({ type: 'shift', fromMonth: s.fromMonth, toMonth: s.toMonth, fromQty: s.fromQty, toQty: s.toQty, change: s.diff }));
  diff.lockedBreaks.forEach((lb) => breakdown.push({ type: 'lockedBreak', month: lb.month, oldQty: lb.oldQty, newQty: lb.newQty, change: lb.diff }));

  return { ...summary, hasWarning: true, breakdown };
}
