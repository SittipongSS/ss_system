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

// ชดเชย = ย้าย FC (PO อยู่กับที่). ต่อ 1 ช่อง:
//   spare = FC เกิน PO (มี FC แต่ยังไม่มี PO ครบ) → เดือนนี้ "ส่ง FC ออก" ได้
//   need  = PO เกิน FC (มี PO แต่ FC ขาด)        → เดือนนี้ "ต้องรับ FC เข้า"
const spareOf = (c) => Math.max(0, Number(c?.fcQty || 0) - Number(c?.poQty || 0));
const needOf = (c) => Math.max(0, Number(c?.poQty || 0) - Number(c?.fcQty || 0));

// เดือนนี้ต้องการ FC (PO เกิน FC) → หาเดือนอื่นที่ FC เกิน PO (spare) มาดึง FC เข้า.
// คืน [{ sourceMonth, canCover }] เดือนใกล้สุดก่อน. pure บน matrix ที่หน้ามีอยู่แล้ว.
export function suggestCoverage(matrix, fgCode, month) {
  const row = (matrix?.rows || []).find((r) => r.fgCode === fgCode);
  if (!row) return [];
  const suggestions = [];
  for (const m of matrix.months) {
    if (m === month) continue;
    const canCover = spareOf(row.cells[m]);
    if (canCover > 0) suggestions.push({ sourceMonth: m, canCover });
  }
  suggestions.sort((a, b) => Math.abs(monthDiff(month, a.sourceMonth)) - Math.abs(monthDiff(month, b.sourceMonth)));
  return suggestions;
}

// อีกทิศ: เดือนนี้มี FC เกิน PO (spare) → หาเดือนที่ PO เกิน FC (need) เพื่อ "ส่ง FC ไป".
// จัดสรร spare ให้เดือน need ที่ใกล้สุดก่อน (ไม่เกิน spare ที่มี). คืน [{ targetMonth, use }].
export function suggestCoverageTargets(matrix, fgCode, month) {
  const row = (matrix?.rows || []).find((r) => r.fgCode === fgCode);
  if (!row) return [];
  let remaining = spareOf(row.cells[month]);
  if (remaining <= 0) return [];

  const others = matrix.months
    .filter((m) => m !== month)
    .sort((a, b) => Math.abs(monthDiff(month, a)) - Math.abs(monthDiff(month, b)));

  const targets = [];
  for (const m of others) {
    if (remaining <= 0) break;
    const need = needOf(row.cells[m]);
    if (need <= 0) continue;
    const use = Math.min(need, remaining);
    targets.push({ targetMonth: m, use });
    remaining -= use;
  }
  return targets;
}
