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

// ── มิติที่สองของตัวกรองหน้า PO: "การส่งของ" (สถานะส่งของบนตัว PO · `poRollupStatus`) ──
//
// 🐞 (รอบตรวจ 19/10 ของ H7) ตัวกรอง "สถานะ" ย้ายไปใช้คำบนป้าย (ขั้นผลิต) แล้ว ⇒ ใบที่ส่งไปบางบรรทัดแต่อีกบรรทัดยังรอ
//    ขึ้นป้าย "รอวัสดุ" (ขั้นต่ำสุด) และไม่มีตัวเลือกไหนแยกใบ "ส่งบางส่วน" ออกมาได้อีก · ภาพรวม `/sahamit` ยังนับ
//    ตามการส่งของ (รายการ "PO ที่ต้องการการติดตาม" = รอส่ง + ส่งบางส่วน · พายสถานะ PO) ⇒ เลขบนภาพรวมสร้างซ้ำบนหน้า PO ไม่ได้
// ⭐ คืนเป็นมิติแยก **คนละหมวด** กับ "สถานะ" (ชื่อหมวดบอกว่ากรองเรื่องอะไร) — ไม่ปนคำสองชุดในตัวเลือกเดียวกันอีก
//    ตัวเลือก = คำของ `PO_STATUS_LABEL` · ค่า = คีย์ของ `poRollupStatus` ตัวเดียวกับที่ภาพรวมใช้นับ
export function poDeliveryOptions(pos = []) {
  const present = new Set((pos || []).map(poRollupStatus));
  return Object.keys(PO_STATUS_LABEL).filter((k) => present.has(k)).map((k) => ({ value: k, label: PO_STATUS_LABEL[k] }));
}

/** ใบนี้ผ่านตัวเลือก "การส่งของ" ที่เลือกไว้ไหม — ไม่ได้เลือกอะไร = ผ่าน */
export function poMatchesDelivery(po, selected = []) {
  return !selected?.length || selected.includes(poRollupStatus(po));
}

// ── สถานะของ "บรรทัด" ในมุมมองตาราง (รายบรรทัด) ของ /sahamit/po (ตรวจตัวเลข 20/10 · M24a2) ──
//
// 🐞 ตัวกรอง "สถานะ" ของหน้า PO ใช้คำบนป้ายของใบ (ขั้นผลิต · H7) แต่ป้ายในมุมมองตารางอ่าน `l.status` ดิบ
//    (บรรทัด open ขึ้น "รอส่ง") และการเรียงก็ใช้ค่าดิบ ⇒ เลือก "รอวัสดุ" แล้วได้แถวป้าย "รอส่ง" และได้บรรทัด
//    "ผลิตเสร็จ" ของใบที่ป้ายใบเป็น "รอวัสดุ" ติดมาด้วย — ผิดกติกาของ H7 เอง (เลือกคำไหน ได้แถวที่ป้ายเขียนคำนั้นทุกแถว)
// ⭐ ทรงเดียวกับ `poDisplayStatus` แต่ระดับบรรทัด: มีแถววัสดุของบรรทัดนั้น (`/api/sahamit/material` · poLineId)
//    ⇒ ขั้นผลิต · ไม่มี (บรรทัดยกเลิก · สายวัสดุโหลดไม่ขึ้น) ⇒ แยกสองกรณี
//    · 3 ขั้นหลังที่กดเดินเอง (ผลิตเสร็จ/ส่งแล้ว/ปิดงาน — เก็บใน `sahamit_po_lines.status`) รู้ได้จากบรรทัดเอง ⇒ คำขั้นผลิต
//      ตัวเดียวกับที่ได้ตอนมีแถววัสดุ (`lineStage` ไม่อ่านวัสดุสำหรับสามค่านี้)
//      🐞 (รีวิว 20/10) เดิมถอยทุกค่าไป `poRollupStatus` ⇒ สายวัสดุล้ม บรรทัด `closed`/`produced` ขึ้น "รอส่ง" — คำที่ผิด
//    · open/partial ต้องรู้ว่า PM/RM มาแล้วจริงไหม (อยู่ในแถววัสดุ) ⇒ ถอยไปสถานะส่งของ ด้วยกติกาเดียวกับใบ (`poRollupStatus`)
const LINE_MANUAL_STAGES = new Set(['produced', 'delivered', 'closed']);
export function poLineDisplayStatus(line, materialRow) {
  if (materialRow) {
    const stage = lineStage(materialRow.status, !!materialRow.tracking?.pmArrivedAt, !!materialRow.tracking?.rmArrivedAt);
    return { key: `stage:${stage}`, label: STAGE_LABEL[stage], color: STAGE_COLOR[stage] };
  }
  if (LINE_MANUAL_STAGES.has(line?.status)) {
    const stage = lineStage(line.status, false, false);
    return { key: `stage:${stage}`, label: STAGE_LABEL[stage], color: STAGE_COLOR[stage] };
  }
  const status = poRollupStatus({ lines: line ? [line] : [] });
  return { key: `po:${status}`, label: PO_STATUS_LABEL[status], color: 'text-3' };
}

// ── คำค้นของหน้า PO: ตัวเดียวที่มุมมองรายใบ + มุมมองตาราง + เลข "แสดง N จาก M ใบ" ใช้ร่วมกัน (M24a) ──
//
// 🐞 เดิมมีกองคำค้นสองชุด: ระดับใบรวมสถานที่ส่ง (`destinationLabel`) แต่ระดับบรรทัดไม่รวม ⇒ มุมมองตาราง พิมพ์ "บางปะกง"
//    หัวบอก "แสดง N จาก 112 ใบ" แต่ตารางว่าง "ไม่มีรายการตรงเงื่อนไข"
// ⭐ กองของบรรทัด = กองของใบ (เลขที่ + สถานที่ส่ง) + ช่องของบรรทัดนั้น ⇒ ใบที่ผ่านคำค้นมีบรรทัดที่ผ่านอย่างน้อยหนึ่งบรรทัดเสมอ
//    (ใบที่มีบรรทัด) · `destLabel` รับเป็นพารามิเตอร์ — ตัวแปลงชื่อสถานที่ส่งอยู่ในไฟล์ "use client" ที่ import lucide-react
//    ไฟล์นี้ใช้ทั้งฝั่ง server/client จึง import ตรงไม่ได้ · `needle` = คำค้นที่ trim + ตัวเล็กแล้ว (ว่าง = ผ่าน)
export function poSearchText(po, { destLabel } = {}) {
  return [po?.poNumber, destLabel ? destLabel(po?.destination) : null].filter(Boolean).join(' ').toLowerCase();
}

export function poLineSearchText(line, { prodIdx } = {}) {
  /* ชื่อสินค้ามีสองแหล่ง: ชื่อที่บันทึกไว้กับบรรทัด PO (`productName` — มากับสาย PO เอง) และชื่อปัจจุบันจากรายการสินค้า ·
     ต้องมีทั้งคู่ — รายการสินค้าล้มแล้วค้นด้วยชื่อเคยได้ "ไม่มี PO ตรงเงื่อนไข" (โทษคำค้น ทั้งที่ใบอยู่ครบ) */
  const name = prodIdx?.get?.(String(line?.fgCode ?? '').trim().toLowerCase())?.name;
  return [line?.fgCode, line?.productName, name].filter(Boolean).join(' ').toLowerCase();
}

export function poLineMatchesSearch(po, line, needle, opts = {}) {
  if (!needle) return true;
  return `${poSearchText(po, opts)} ${poLineSearchText(line, opts)}`.includes(needle);
}

export function poMatchesSearch(po, needle, opts = {}) {
  if (!needle) return true;
  if (poSearchText(po, opts).includes(needle)) return true;
  return (po?.lines || []).some((l) => poLineMatchesSearch(po, l, needle, opts));
}

/** ตัวกรองระดับใบที่สองมุมมองใช้ร่วมกัน: การส่งของ + สถานที่ส่ง */
export function poMatchesPoFilters(po, { deliverySel = [], destSel = [] } = {}) {
  if (!poMatchesDelivery(po, deliverySel)) return false;
  if (destSel?.length && !destSel.includes(po?.destination)) return false;
  return true;
}

/**
 * แถวของมุมมอง "ตาราง" — `{ po, line, status }` ต่อบรรทัดที่ผ่าน (ไม่เรียง)
 * ใบผ่านตัวกรองระดับใบ (`poMatchesPoFilters`) · บรรทัดผ่านคำค้น (`poLineMatchesSearch`) และตัวกรองสถานะด้วย
 * **คำบนป้ายของบรรทัดเอง** (`lineStatusOf(line).label`) ⇒ เลือกคำไหน ได้แถวที่ป้ายเขียนคำนั้นทุกแถว
 * ตัวเลข "แสดง N จาก M ใบ · R รายการ" ของมุมมองนี้นับจากผลของฟังก์ชันนี้ตัวเดียวกับที่ตารางวาด
 */
export function poTableLines(pos, { needle = '', statusSel = [], deliverySel = [], destSel = [], lineStatusOf, ...searchOpts } = {}) {
  const statusOf = lineStatusOf || ((l) => poLineDisplayStatus(l, null));
  const out = [];
  for (const po of pos || []) {
    if (!poMatchesPoFilters(po, { deliverySel, destSel })) continue;
    for (const line of po?.lines || []) {
      if (!poLineMatchesSearch(po, line, needle, searchOpts)) continue;
      const status = statusOf(line);
      if (statusSel?.length && !statusSel.includes(status.label)) continue;
      out.push({ po, line, status });
    }
  }
  return out;
}
