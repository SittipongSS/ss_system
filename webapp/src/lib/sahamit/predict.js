// SAHAMIT — shift prediction & coverage suggestion (pure).
//
// Restores the proactive half of ss-cj's reconciliation UX (generateFcPredictions):
// instead of only auditing a shift AFTER a new FC round arrives (that's flags.js),
// we look at the CURRENT picture and predict which forecast months are likely to
// slip — then the UI surfaces a "✨ →month" hint and a "💡 pull from month" coverage
// suggestion the user can confirm.
//
// Everything here is derived from the rounds/pos already loaded on the recon page:
// no new table, no persistence. A prediction disappears on its own once the user
// acts (a PO lands, a coverage link is made, or the cell is locked), because the
// underlying cell status stops being "pending".
import { snapshotForSku } from './snapshots';
import { diffSnapshots } from './diff';
import { buildReconMatrix } from './reconcileClient';

// months between two 'YYYY-MM' strings (b - a), signed.
function monthDiff(a, b) {
  const [ay, am] = String(a).split('-').map(Number);
  const [by, bm] = String(b).split('-').map(Number);
  if (!ay || !by) return 0;
  return (by - ay) * 12 + (bm - am);
}

// add n months to a 'YYYY-MM' string.
export function addMonths(ym, n) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// whole days from `today` (ISO 'YYYY-MM-DD') to the LAST day of 'YYYY-MM'.
// negative = the month is already past.
function daysToMonthEnd(month, today) {
  const [y, m] = String(month).split('-').map(Number);
  const end = Date.UTC(y, m, 0); // day 0 of next month = last day of this month
  const now = new Date(today).getTime();
  return Math.ceil((end - now) / 86400000);
}

// Every shift distance (in months) this SKU has actually exhibited across
// consecutive round pairs (diff.shifts). Empty = the SKU has NEVER shifted → we
// have no basis to predict one (this is what keeps a brand-new first round quiet:
// no history, no prediction).
export function shiftSamplesForSku(rounds, fgCode) {
  const ordered = [...(rounds || [])].sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
  const samples = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = snapshotForSku(ordered[i - 1].lines, fgCode);
    const cur = snapshotForSku(ordered[i].lines, fgCode);
    for (const s of diffSnapshots(prev, cur).shifts) {
      const md = monthDiff(s.fromMonth, s.toMonth);
      if (md !== 0) samples.push(md);
    }
  }
  return samples;
}

// Average shift distance (rounded, ≥1). No history → default +1. Kept for callers
// that want a target month regardless; predictShifts uses shiftSamplesForSku so it
// can REQUIRE real history before predicting.
export function avgShiftForSku(rounds, fgCode) {
  const s = shiftSamplesForSku(rounds, fgCode);
  if (!s.length) return 1;
  const avg = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  return avg > 0 ? avg : 1;
}

export function urgencyOf(daysLeft) {
  if (daysLeft <= 30) return 'high';
  if (daysLeft <= 60) return 'medium';
  return 'low';
}

// Predict shift for every cell that still has forecast but no PO (status
// 'pending') and isn't locked. Returns Map<"fg||month", prediction>.
//   prediction = { fgCode, productName, fromMonth, toMonth, fcQty, avgShift,
//                  daysLeft, urgency, pattern }
// opts: { today: 'YYYY-MM-DD' (required), locks: [{fgCode, month}] }
export function predictShifts(rounds, pos, opts = {}) {
  const today = opts.today;
  const out = new Map();
  if (!today) return out; // no clock → nothing to predict (keeps this pure/testable)

  const lockSet = new Set((opts.locks || []).map((l) => `${l.fgCode}||${l.month}`));
  const matrix = buildReconMatrix(rounds, pos);

  for (const row of matrix.rows) {
    // Predict a SHIFT only for SKUs that have actually shifted before — otherwise
    // a first round (or a SKU that's never moved) would light up every pending
    // month with a baseless "✨ →next", which is pure noise. No samples → skip SKU.
    const samples = shiftSamplesForSku(rounds, row.fgCode);
    if (!samples.length) continue;
    const avg = Math.max(1, Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));

    for (const m of matrix.months) {
      const cell = row.cells[m];
      if (!cell || cell.status !== 'pending') continue; // fcQty>0 && no effective PO
      if (lockSet.has(`${row.fgCode}||${m}`)) continue;

      const daysLeft = daysToMonthEnd(m, today);
      out.set(`${row.fgCode}||${m}`, {
        fgCode: row.fgCode,
        productName: row.productName || null,
        fromMonth: m,
        toMonth: addMonths(m, avg),
        fcQty: cell.fcQty,
        avgShift: avg,
        daysLeft,
        urgency: urgencyOf(daysLeft),
        pattern: `+${avg} เดือน`,
      });
    }
  }
  return out;
}

// For a cell that needs coverage (target month short on PO), find other months of
// the SAME sku carrying surplus PO (cell.excess > 0) that could be reallocated to
// cover it. Returns [{ sourceMonth, canCover }] nearest-month-first. Pure over the
// already-built matrix (the drill-down page has it in hand).
export function suggestCoverage(matrix, fgCode, month) {
  const row = (matrix?.rows || []).find((r) => r.fgCode === fgCode);
  if (!row) return [];
  const suggestions = [];
  for (const m of matrix.months) {
    if (m === month) continue;
    const cell = row.cells[m];
    const canCover = Number(cell?.excess || 0);
    if (canCover > 0) suggestions.push({ sourceMonth: m, canCover });
  }
  // nearest month to the target first (a shift is usually to an adjacent month)
  suggestions.sort((a, b) => Math.abs(monthDiff(month, a.sourceMonth)) - Math.abs(monthDiff(month, b.sourceMonth)));
  return suggestions;
}

// The other direction: `month` HAS surplus PO (cell.excess > 0) — find short
// months of the SAME sku to push it TO. Allocates the surplus greedily to the
// nearest short months first (doesn't exceed the available surplus). Returns
// [{ targetMonth, use }]. This is what makes opening a "PO เกิน" cell useful.
export function suggestCoverageTargets(matrix, fgCode, month) {
  const row = (matrix?.rows || []).find((r) => r.fgCode === fgCode);
  if (!row) return [];
  let remaining = Number(row.cells[month]?.excess || 0);
  if (remaining <= 0) return [];

  const others = matrix.months
    .filter((m) => m !== month)
    .sort((a, b) => Math.abs(monthDiff(month, a)) - Math.abs(monthDiff(month, b)));

  const targets = [];
  for (const m of others) {
    if (remaining <= 0) break;
    const c = row.cells[m];
    const shortage = Math.max(0, Number(c?.fcQty || 0) - Number(c?.effPo ?? c?.poQty ?? 0));
    if (shortage <= 0) continue;
    const use = Math.min(shortage, remaining);
    targets.push({ targetMonth: m, use });
    remaining -= use;
  }
  return targets;
}
