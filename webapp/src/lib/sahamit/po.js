// SAHAMIT — PO pure helpers (shared by server + client).

// 'YYYY-MM' of a date string, or null. Accepts 'YYYY-MM' or 'YYYY-MM-DD'.
export function monthOf(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr);
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

// The month a PO line is matched to FC by: expected delivery if known, else due.
export function deliveryMonthOf(line) {
  return monthOf(line?.expectedDate || line?.dueDate);
}

export function poTotalQty(po) {
  return (po?.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
}

export function poLineCount(po) {
  return (po?.lines || []).length;
}

// Roll a PO's line statuses up to a single header status for the list view.
export function poRollupStatus(po) {
  const lines = po?.lines || [];
  if (!lines.length) return 'open';
  if (lines.every((l) => l.status === 'cancelled')) return 'cancelled';
  const active = lines.filter((l) => l.status !== 'cancelled');
  if (active.length && active.every((l) => l.status === 'delivered')) return 'delivered';
  if (active.some((l) => l.status === 'delivered' || l.status === 'partial')) return 'partial';
  return 'open';
}

export const PO_STATUS_LABEL = {
  open: 'รอส่ง',
  partial: 'ส่งบางส่วน',
  delivered: 'ส่งครบ',
  cancelled: 'ยกเลิก',
};

export const PO_STATUS_COLOR = {
  open: 'amber',
  partial: 'blue',
  delivered: 'green',
  cancelled: 'text-3',
};

// PO line delivery destination (migration 0057). Normalize any input to a known
// key, else null.
export const DESTINATION_KEYS = ['bangpakong', 'photharam', 'khonkaen'];
export function cleanDestination(v) {
  return DESTINATION_KEYS.includes(v) ? v : null;
}
