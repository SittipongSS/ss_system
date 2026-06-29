// SAHAMIT — snapshot helpers (pure).
//
// Our forecast model stores explicit ROUNDS (sahamit_forecast_rounds) each with
// LINES (sahamit_forecast_lines: one row per fgCode × month × qty). A "snapshot"
// is the ss-cj concept this module rebuilds from rounds: for a given SKU (fgCode)
// the map { 'YYYY-MM': totalQty } in one round. Comparing consecutive rounds'
// snapshots is what powers diff + peak + reconciliation — exactly why we made
// rounds first-class instead of inferring them from upload dates.

// Aggregate one round's lines for a single SKU into { month: qty }. Lines for
// other fgCodes are ignored. Multiple lines on the same month are summed.
export function snapshotForSku(lines, fgCode) {
  const snap = {};
  for (const l of lines || []) {
    if (l.fgCode !== fgCode) continue;
    snap[l.month] = (snap[l.month] || 0) + Number(l.qty || 0);
  }
  return snap;
}

// Build an ordered list of per-SKU snapshots across rounds (oldest → newest),
// so callers can diff round N-1 vs N or scan history for the peak.
//   rounds: [{ id, roundNo, lines: [{fgCode, month, qty}] }]  (ascending roundNo)
// Returns: [{ roundNo, snapshot }] for the given SKU.
export function snapshotSeriesForSku(rounds, fgCode) {
  return [...(rounds || [])]
    .sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0))
    .map((r) => ({ roundNo: r.roundNo, snapshot: snapshotForSku(r.lines, fgCode) }));
}

// Sum of a snapshot, optionally restricted to a set of months (peak scoping).
export function snapshotTotal(snapshot, onlyMonths = null) {
  return Object.entries(snapshot || {}).reduce(
    (s, [m, q]) => s + (onlyMonths && !onlyMonths.has(m) ? 0 : Number(q || 0)),
    0,
  );
}
