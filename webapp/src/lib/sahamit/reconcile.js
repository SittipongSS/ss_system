// SAHAMIT — reconciliation cell status (pure).
//
// Ported from ss-cj TrackingContext `getReconciliationStatus`, reduced to a pure
// function of one cell's quantities. The original read forecasts/pos and the
// cross-month coverage tables inline; here the caller passes the already-summed
// quantities for a single (sku, month) cell. Coverage/shifting is a later phase
// (5) — the `shiftedAway` / `totalCovered` inputs are kept so this stays
// forward-compatible, but in the MVP they default off and the core branches
// (match / over / unforecasted / discrepancy / pending) carry the work.
//
// Labels are kept byte-identical to ss-cj so the grid reads the same.
//   in:  { fcQty, poQty, originalFcQty?, hasHistory?, shiftedAway?, shiftForward?, totalCovered? }
//   out: { status, label, fcQty, poQty, excess }
export function reconcileCell(input) {
  const fcQty = Number(input.fcQty || 0);             // effective FC for the month
  const poQty = Number(input.poQty || 0);
  const originalFcQty = Number(input.originalFcQty ?? fcQty);
  const hasHistory = !!input.hasHistory;
  const shiftedAway = !!input.shiftedAway;
  const shiftForward = input.shiftForward !== false;
  const totalCovered = Number(input.totalCovered || 0);

  // Empty cell — nothing forecast, nothing ordered.
  if (fcQty === 0 && poQty === 0 && originalFcQty === 0) {
    if (hasHistory) return { status: 'cancelled', label: 'ยกเลิกแล้ว', fcQty: 0, poQty: 0, excess: 0 };
    return { status: 'none', label: '', fcQty: 0, poQty: 0, excess: 0 };
  }

  // FC originally here but shifted to another month (phase 5 territory).
  if (originalFcQty > 0 && fcQty === 0 && shiftedAway) {
    if (totalCovered > 0) {
      return { status: 'covered', label: '✓ ชดเชย', fcQty: originalFcQty, poQty, excess: 0 };
    }
    return { status: 'shifted', label: shiftForward ? '⇀ เลื่อน' : '↼ เลื่อน', fcQty: originalFcQty, poQty, excess: 0 };
  }

  if (fcQty === poQty) {
    return { status: 'match', label: '✓ ครบ', fcQty, poQty, excess: Math.max(0, poQty - fcQty) };
  }
  if (poQty > fcQty) {
    const excess = poQty - fcQty;
    if (fcQty === 0) return { status: 'unforecasted', label: 'นอก FC', fcQty, poQty, excess };
    return { status: 'over', label: '◉ PO เกิน', fcQty, poQty, excess };
  }
  // poQty < fcQty
  if (poQty === 0) return { status: 'pending', label: '◌ รอ PO', fcQty, poQty, excess: 0 };
  return { status: 'discrepancy', label: '◐ PO ไม่ครบ', fcQty, poQty, excess: 0 };
}

// Status → semantic color token, for the grid. Mirrors ss-cj's color mapping.
export const RECON_STATUS_COLOR = {
  match: 'green',
  covered: 'green',
  over: 'teal',
  unforecasted: 'violet',
  discrepancy: 'amber',
  pending: 'red',
  shifted: 'blue',
  cancelled: 'text-3',
  none: 'text-3',
};
