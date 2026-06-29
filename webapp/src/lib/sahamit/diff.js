// SAHAMIT — forecast snapshot diff (pure).
//
// Ported verbatim (algorithm-for-algorithm) from ss-cj TrackingContext
// `diffFcBatches`, with the React/data dependencies removed: the only side
// input was `isForecastLocked(forecasts, sku, month)`, now an injected
// `isLocked(month)` predicate (default: nothing locked).
//
// Given two per-SKU snapshots ({month: qty}) for consecutive FC rounds, classify
// every month's change into:
//   increases / decreases — qty changed on a month present in both
//   added / removed       — month appeared / disappeared
//   shifts                — a removed month paired with an added month of
//                           similar qty (≤50% apart) ⇒ demand moved months
//   lockedBreaks          — a locked month (FC===PO) whose qty changed anyway
//   skipped               — a locked month that stayed identical (informational)
//
// The shift-matching greedily pairs the closest removed/added quantities first;
// this is what lets the UI say "FC for Jun moved to Jul" instead of
// "Jun disappeared, Jul appeared".
export function diffSnapshots(oldSnapshot, newSnapshot, opts = {}) {
  const isLocked = opts.isLocked || (() => false);
  const allMonths = [...new Set([...Object.keys(oldSnapshot), ...Object.keys(newSnapshot)])].sort();
  const result = { lockedBreaks: [], shifts: [], increases: [], decreases: [], added: [], removed: [], skipped: [] };

  const removedCandidates = [];
  const addedCandidates = [];

  allMonths.forEach((month) => {
    const oldQty = oldSnapshot[month] || 0;
    const newQty = newSnapshot[month] || 0;
    const locked = isLocked(month);

    if (oldQty === newQty && oldQty > 0) {
      if (locked) result.skipped.push({ month, qty: newQty });
      return;
    }
    if (locked && oldQty !== newQty && oldQty > 0) {
      result.lockedBreaks.push({ month, oldQty, newQty, diff: newQty - oldQty });
      return;
    }
    if (oldQty === 0 && newQty > 0) addedCandidates.push({ month, qty: newQty });
    else if (oldQty > 0 && newQty === 0) removedCandidates.push({ month, qty: oldQty });
    else if (newQty > oldQty) result.increases.push({ month, oldQty, newQty, diff: newQty - oldQty });
    else if (newQty < oldQty) result.decreases.push({ month, oldQty, newQty, diff: newQty - oldQty });
  });

  const unmatchedRemoved = [...removedCandidates];
  const unmatchedAdded = [...addedCandidates];

  // Greedily pair the closest-quantity removed↔added months as "shifts".
  while (unmatchedRemoved.length > 0 && unmatchedAdded.length > 0) {
    let bestI = -1, bestJ = -1, bestPct = Infinity;
    for (let i = 0; i < unmatchedRemoved.length; i++) {
      for (let j = 0; j < unmatchedAdded.length; j++) {
        const pct = Math.abs(unmatchedRemoved[i].qty - unmatchedAdded[j].qty) / Math.max(unmatchedRemoved[i].qty, 1);
        if (pct < bestPct) { bestPct = pct; bestI = i; bestJ = j; }
      }
    }
    if (bestPct <= 0.5) {
      const rem = unmatchedRemoved.splice(bestI, 1)[0];
      const add = unmatchedAdded.splice(bestJ, 1)[0];
      result.shifts.push({
        fromMonth: rem.month, toMonth: add.month,
        fromQty: rem.qty, toQty: add.qty,
        diff: add.qty - rem.qty,
        diffPct: Math.round(((add.qty - rem.qty) / rem.qty) * 100),
      });
    } else break;
  }

  result.added.push(...unmatchedAdded);
  result.removed.push(...unmatchedRemoved);
  return result;
}
