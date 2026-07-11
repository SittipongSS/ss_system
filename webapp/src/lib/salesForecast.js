// Pure, testable logic for the sales target-planning wizard.
//   1. projectTarget  — suggest next year's target from a history of actuals.
//   2. splitByProportion — divide a total across nodes by weight (last takes rest).
//   3. seasonalProfile / distributeBySeasonal — spread a yearly figure over 12
//      months following a season shape (or evenly when no history).
// No React / no DB — everything here is deterministic and unit-tested.

export const DEFAULT_GROWTH_CAP = 0.3; // ±30% damping on YoY growth (user-set)

export function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Year-over-year growth of the actual series, skipping years with no prior base.
// series: numbers (actuals) ordered oldest → newest.
export function yoyGrowths(series) {
  const g = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1]);
    const cur = Number(series[i]);
    if (prev > 0) g.push(cur / prev - 1);
  }
  return g;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Suggest three candidate targets for the next period from historical rows.
// history: [{ year, target, actual }] any order; only rows with actual > 0 drive
// the growth. Returns amounts + the growth figures used, for display.
//   conservative = lastActual × (1 + g/2)
//   base         = lastActual × (1 + g)         g = median YoY, damped to ±cap
//   stretch      = lastActual × (1 + gRaw)      full trend, uncapped upside
export function projectTarget(history, { cap = DEFAULT_GROWTH_CAP } = {}) {
  const rows = (history || [])
    .map((h) => ({ year: Number(h.year), actual: Number(h.actual) || 0, target: Number(h.target) || 0 }))
    .filter((h) => Number.isFinite(h.year))
    .sort((a, b) => a.year - b.year);
  const withActual = rows.filter((h) => h.actual > 0);

  if (!withActual.length) {
    return { hasData: false, lastActual: 0, rawGrowth: 0, dampedGrowth: 0, conservative: 0, base: 0, stretch: 0, attainment: null };
  }

  const lastActual = withActual[withActual.length - 1].actual;
  const growths = yoyGrowths(withActual.map((h) => h.actual));
  const rawGrowth = growths.length ? median(growths) : 0;
  const dampedGrowth = clamp(rawGrowth, -cap, cap);
  const stretchGrowth = Math.max(rawGrowth, dampedGrowth); // never below base

  const round = (n) => Math.round(n);
  const last = withActual[withActual.length - 1];
  const attainment = last.target > 0 ? last.actual / last.target : null;

  return {
    hasData: true,
    lastActual,
    lastYear: last.year,
    rawGrowth,
    dampedGrowth,
    conservative: round(lastActual * (1 + dampedGrowth / 2)),
    base: round(lastActual * (1 + dampedGrowth)),
    stretch: round(lastActual * (1 + stretchGrowth)),
    attainment,
  };
}

// Divide `total` across weighted nodes. Amounts are rounded; the last node
// absorbs the rounding remainder so the parts always sum back to `total`.
// weights: [{ key, weight }]. Non-positive / all-zero weights → even split.
export function splitByProportion(total, weights) {
  const list = (weights || []).map((w) => ({ key: w.key, weight: Math.max(0, Number(w.weight) || 0) }));
  if (!list.length) return [];
  const amt = Math.max(0, Math.round(Number(total) || 0));
  const sumW = list.reduce((s, w) => s + w.weight, 0);
  let allocated = 0;
  return list.map((w, i) => {
    if (i === list.length - 1) return { key: w.key, amount: amt - allocated };
    const share = sumW > 0 ? amt * (w.weight / sumW) : amt / list.length;
    const rounded = Math.round(share);
    allocated += rounded;
    return { key: w.key, amount: rounded };
  });
}

// Season shape from 12 monthly actuals → 12 fractions summing to 1.
// No/zero history → flat 1/12 each.
export function seasonalProfile(monthlyActuals) {
  const arr = Array.from({ length: 12 }, (_, i) => Math.max(0, Number(monthlyActuals?.[i]) || 0));
  const total = arr.reduce((s, v) => s + v, 0);
  if (total <= 0) return Array(12).fill(1 / 12);
  return arr.map((v) => v / total);
}

// Spread a yearly amount over 12 months by a profile (fractions). December (last)
// takes the rounding remainder so the months always sum back to `annual`.
export function distributeBySeasonal(annual, profile) {
  const amt = Math.max(0, Math.round(Number(annual) || 0));
  const frac = Array.from({ length: 12 }, (_, i) => Math.max(0, Number(profile?.[i]) || 0));
  const sumF = frac.reduce((s, v) => s + v, 0);
  let allocated = 0;
  return frac.map((f, i) => {
    if (i === 11) return amt - allocated;
    const share = sumF > 0 ? amt * (f / sumF) : amt / 12;
    const rounded = Math.round(share);
    allocated += rounded;
    return rounded;
  });
}

// Normalize a 12-slot percentage row (numbers, any scale) so it sums to 100 for
// display; used by the editable seasonal row. Empty → flat.
export function normalizeToPercent(values) {
  const arr = Array.from({ length: 12 }, (_, i) => Math.max(0, Number(values?.[i]) || 0));
  const total = arr.reduce((s, v) => s + v, 0);
  if (total <= 0) return Array(12).fill(100 / 12);
  return arr.map((v) => (v / total) * 100);
}
