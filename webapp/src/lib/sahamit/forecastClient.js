// SAHAMIT — client-side derivations over the rounds payload (pure).
// Bridges the API shape (rounds[] each with lines[]) to the tested pure logic
// (snapshots / diff / peak). No React, no fetch — just data → data.
import { snapshotForSku } from './snapshots';
import { diffSnapshots } from './diff';
import { computeSkuFcWarning } from './peak';

// Distinct fgCodes across a set of rounds, with a display name (latest non-empty).
function collectSkus(rounds) {
  const names = new Map();
  for (const r of rounds) {
    for (const l of r.lines || []) {
      if (l.productName) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
    }
  }
  return names; // Map<fgCode, productName|null>
}

// Sum every line of a round across all SKUs (for the rounds list).
export function roundTotal(round) {
  return (round.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
}

export function roundSkuCount(round) {
  return new Set((round.lines || []).map((l) => l.fgCode)).size;
}

// All months present in a round, sorted.
export function roundMonths(round) {
  return [...new Set((round.lines || []).map((l) => l.month))].sort();
}

// Build the SKU × month matrix for one round (for the grid view).
//   → { months:[...], rows:[{ fgCode, productName, qty:{month:qty}, total }] }
export function roundMatrix(round) {
  const months = roundMonths(round);
  const byFg = new Map();
  for (const l of round.lines || []) {
    if (!byFg.has(l.fgCode)) byFg.set(l.fgCode, { fgCode: l.fgCode, productName: l.productName, qty: {}, total: 0 });
    const row = byFg.get(l.fgCode);
    row.qty[l.month] = (row.qty[l.month] || 0) + Number(l.qty || 0);
    row.total += Number(l.qty || 0);
  }
  const rows = [...byFg.values()].sort((a, b) => String(a.fgCode).localeCompare(String(b.fgCode)));
  return { months, rows };
}

// Compare the round at `index` (in ascending-ordered `rounds`) against the
// previous round, and compute the peak warning across rounds[0..index] per SKU.
//   → { targetRoundNo, prevRoundNo, perSku:[{ fgCode, productName, diff, peak,
//        prevTotal, targetTotal, net, changed }], hasPrev }
export function compareRounds(rounds, index) {
  const ordered = [...rounds].sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
  const target = ordered[index];
  if (!target) return null;
  const prev = index > 0 ? ordered[index - 1] : null;
  const upto = ordered.slice(0, index + 1);

  const skus = collectSkus(prev ? [prev, target] : [target]);
  const perSku = [];

  for (const [fgCode, productName] of skus) {
    const targetSnap = snapshotForSku(target.lines, fgCode);
    const prevSnap = prev ? snapshotForSku(prev.lines, fgCode) : {};
    const diff = diffSnapshots(prevSnap, targetSnap);

    const series = upto.map((r) => ({ roundNo: r.roundNo, snapshot: snapshotForSku(r.lines, fgCode) }));
    const peak = computeSkuFcWarning(series);

    const prevTotal = Object.values(prevSnap).reduce((s, q) => s + Number(q || 0), 0);
    const targetTotal = Object.values(targetSnap).reduce((s, q) => s + Number(q || 0), 0);
    const changed =
      diff.increases.length || diff.decreases.length || diff.added.length ||
      diff.removed.length || diff.shifts.length || diff.lockedBreaks.length;

    perSku.push({
      fgCode, productName, diff, peak,
      prevTotal, targetTotal, net: targetTotal - prevTotal,
      changed: !!changed,
    });
  }

  perSku.sort((a, b) => {
    // Peak-drop SKUs first, then changed, then by fgCode.
    const pa = a.peak?.hasWarning ? 0 : a.changed ? 1 : 2;
    const pb = b.peak?.hasWarning ? 0 : b.changed ? 1 : 2;
    return pa - pb || String(a.fgCode).localeCompare(String(b.fgCode));
  });

  return {
    targetRoundNo: target.roundNo,
    prevRoundNo: prev?.roundNo ?? null,
    hasPrev: !!prev,
    perSku,
  };
}
