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

// ── วงจรสถานะบรรทัด PO ────────────────────────────────────────────────
// 2 ขั้นแรกคิดอัตโนมัติจากวัสดุ (PM+RM "มาแล้วจริง"); 3 ขั้นหลังกดเดินเอง (เก็บใน
// sahamit_po_lines.status). แบ่งส่ง (partial) ไว้เฟสถัดไป.
export const STAGE_ORDER = ['waiting_materials', 'ready_produce', 'produced', 'delivered', 'closed'];
export const STAGE_LABEL = {
  waiting_materials: 'รอวัสดุ',
  ready_produce: 'พร้อมผลิต',
  produced: 'ผลิตเสร็จ',
  delivered: 'ส่งแล้ว',
  closed: 'ปิดงาน',
  cancelled: 'ยกเลิก',
};
export const STAGE_COLOR = {
  waiting_materials: 'amber',
  ready_produce: 'blue',
  produced: 'violet',
  delivered: 'green',
  closed: 'text-3',
  cancelled: 'text-3',
};

// สถานะแสดงผลของบรรทัด: ถ้ากดเดินสถานะแล้ว (produced/delivered/closed/cancelled)
// ใช้ค่านั้น; ถ้ายัง (open/partial) → derive จากวัสดุ — PM+RM ต้อง "มาแล้วจริง"
// (arrived) เท่านั้นถึงเป็น พร้อมผลิต (ไม่ใช่แค่ถึงวันกำหนด).
export function lineStage(status, pmArrived, rmArrived) {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'closed') return 'closed';
  if (status === 'delivered') return 'delivered';
  if (status === 'produced') return 'produced';
  return pmArrived && rmArrived ? 'ready_produce' : 'waiting_materials';
}

// สถานะหัว PO = ขั้นต่ำสุดในบรรทัด active (ค้างที่ขั้นช้าสุด). ทุกบรรทัดยกเลิก → ยกเลิก.
export function poStageRollup(stages) {
  const active = (stages || []).filter((s) => s !== 'cancelled');
  if (!active.length) return (stages || []).length ? 'cancelled' : 'waiting_materials';
  let min = STAGE_ORDER.length - 1;
  for (const s of active) { const i = STAGE_ORDER.indexOf(s); if (i >= 0 && i < min) min = i; }
  return STAGE_ORDER[min];
}
