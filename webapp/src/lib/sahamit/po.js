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

// ยอดที่ใช้ "กระทบยอด" ของบรรทัด PO: ถ้าแบ่งส่ง (มี shippedQty) ให้ใช้ยอดส่งจริง
// (ส่วนที่เหลือถูกเปิดเป็น PO ใบใหม่แล้ว) — กัน PO เดิม+PO เหลือ นับซ้ำ. qty แสดงยังเต็ม.
export function effectivePoQty(line) {
  return Number(line?.shippedQty ?? line?.qty ?? 0);
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

// ── สถานะของใบ PO ที่ "ป้ายในตาราง" โชว์ — ตัวเดียวที่ป้าย ตัวกรอง และการเรียงของหน้า PO ใช้ร่วมกัน ──
//
// 🐞 (ตรวจตัวกรองทั้งระบบ 08/10 · H7) ตัวกรอง "สถานะ" ของ /sahamit/po ใช้ `poRollupStatus` (สถานะส่งของบนตัว PO:
//    รอส่ง/ส่งบางส่วน/ส่งครบ) แต่ป้ายในตารางใช้ขั้นผลิตจากบรรทัดวัสดุ (`poStageRollup`: รอวัสดุ/พร้อมผลิต/…/ปิดงาน)
//    ⇒ คำบนตัวเลือกไม่มีบนป้ายสักใบ (วัดของจริง 19/10: 112 ใบ ไม่ตรงทั้ง 112 · "รอส่ง" = ป้าย "รอวัสดุ" 90 ใบ)
//    และใบที่ปิดงานแล้ว (บรรทัด `closed`) ถูกจัดเป็น "รอส่ง"
// ⭐ คืน `{ key, label, color }` · มีบรรทัดวัสดุ (`/api/sahamit/material` = บรรทัดที่ยังไม่ยกเลิก) ⇒ ขั้นต่ำสุดของบรรทัด ·
//    ไม่มี (ทุกบรรทัดยกเลิก · ไม่มีบรรทัด · สายวัสดุโหลดไม่ขึ้น) ⇒ ถอยไปสถานะส่งของของตัว PO — ทางเดียวกับป้ายเดิม
//    `key` ใส่คำนำหน้าแหล่ง (`stage:` / `po:`) — "delivered" มีทั้งสองชุดแต่คำต่างกัน (ส่งแล้ว / ส่งครบ)
export function poDisplayStatus(po, materialRows = []) {
  if (materialRows && materialRows.length) {
    const stage = poStageRollup(materialRows.map((r) => lineStage(r.status, !!r.tracking?.pmArrivedAt, !!r.tracking?.rmArrivedAt)));
    return { key: `stage:${stage}`, label: STAGE_LABEL[stage], color: STAGE_COLOR[stage] };
  }
  const status = poRollupStatus(po);
  return { key: `po:${status}`, label: PO_STATUS_LABEL[status], color: 'text-3' };
}

// ลำดับของตัวเลือกตัวกรอง/การเรียง = ทางเดินของงาน (ขั้นผลิตก่อน แล้วค่อยสถานะส่งของที่ใช้ตอนไม่มีบรรทัดวัสดุ) · ยกเลิกท้ายสุด
export const PO_DISPLAY_STATUS_ORDER = [
  ...STAGE_ORDER.map((s) => `stage:${s}`),
  ...Object.keys(PO_STATUS_LABEL).filter((s) => s !== 'cancelled').map((s) => `po:${s}`),
  'stage:cancelled', 'po:cancelled',
];

/** ตัวเลือกของตัวกรองสถานะจากสถานะของใบที่มีอยู่จริง — `{ value: คำบนป้าย, label: คำบนป้าย }` ไม่ซ้ำคำ เรียงตามทางเดินของงาน */
export function poStatusOptions(statuses = []) {
  const rank = (key) => {
    const i = PO_DISPLAY_STATUS_ORDER.indexOf(key);
    return i < 0 ? PO_DISPLAY_STATUS_ORDER.length : i;
  };
  const seen = new Map();
  for (const s of [...statuses].sort((a, b) => rank(a.key) - rank(b.key))) {
    if (s?.label && !seen.has(s.label)) seen.set(s.label, { value: s.label, label: s.label });
  }
  return [...seen.values()];
}
