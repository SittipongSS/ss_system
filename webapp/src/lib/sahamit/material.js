// SAHAMIT — material / lead-time logic (pure).
//
// Business rule (S&S ↔ สหมิตร):
//   • PM (packaging) is pre-stocked when an FC exists for that sku+month.
//   • RM (raw material) is ordered only when a PO arrives.
//   • PO that matches an existing FC ("in FC")  → PM already stocked, order RM
//     only → ready in ~60 working days.
//   • PO with no FC ("out of FC")               → must order PM + RM
//     → ~90 working days.
//
// readyDate = วันส่งที่ "แนะนำ" = receivedDate + leadDays *working* days. This is
// OUR guideline (counted from when the PO actually reached us), used to control
// our timeline scope: if the PO arrived late, readyDate shifts with it, so a
// missed customer dueDate caused by a late PO is documented and not our fault.
import { addBusinessDays, toLocalISODate } from '../pm/dateHelpers';

export const LEAD_IN_FC = 60;
export const LEAD_OUT_FC = 90;

export const leadDaysFor = (inForecast) => (inForecast ? LEAD_IN_FC : LEAD_OUT_FC);

// receivedDate + leadDays working days → 'YYYY-MM-DD' (null if no/invalid date).
export function recommendedReadyDate(receivedDate, leadDays, holidays) {
  if (!receivedDate) return null;
  const start = new Date(receivedDate);
  if (isNaN(start.getTime())) return null;
  return toLocalISODate(addBusinessDays(start, leadDays, holidays));
}

// Enrich one PO line with its lead-time view.
//   line          — { dueDate, actualDeliveredDate, ... }
//   fcQty         — effective FC for this line's (fgCode, deliveryMonth)
//   receivedDate  — the parent PO's receivedDate (anchor for the count)
//   holidays      — Set of 'YYYY-MM-DD' (from the holidays table)
// Returns { inForecast, leadDays, readyDate, lateVsDue, ourSlip }.
export function materialView(line, fcQty, receivedDate, holidays) {
  const inForecast = Number(fcQty || 0) > 0;
  const leadDays = leadDaysFor(inForecast);
  const readyDate = recommendedReadyDate(receivedDate, leadDays, holidays);

  // Our recommended date is later than what the customer asked for → the miss is
  // due to a late PO / lead time, not our execution.
  const lateVsDue = !!(readyDate && line?.dueDate && readyDate > line.dueDate);
  // We actually delivered after our own recommended date → that's our slip.
  const ourSlip = !!(line?.actualDeliveredDate && readyDate && line.actualDeliveredDate > readyDate);

  return { inForecast, leadDays, readyDate, lateVsDue, ourSlip };
}

/* ── ตัวกรองของจอ /sahamit/material — การ์ดนับกับตารางถามตัวเดียวกัน (ตรวจตัวเลข L6 · 26/10/2026) ─────────
   🐞 การ์ดสี่ใบ (บรรทัด PO ทั้งหมด · นอก FC · เกินกำหนด · เราส่งช้า) เป็น <div> กดไม่ได้ และนับจากทุกแถว
      ขณะที่ตารางกรองด้วยคำค้น/ตัวกรองที่ค้างอยู่ ⇒ ชุดตรงกับการ์ดมีอยู่ในแผงกรองแล้ว แต่ต้องประกอบเองทีละช่อง
      และคำค้นที่ค้างไว้ทำให้เห็นไม่เท่าเลข
   ⭐ การ์ดแต่ละใบ = ตัวกรอง **ทั้งชุด** (`MATERIAL_CARD_FILTERS` · ล้างคำค้นกับสถานะที่ค้างด้วย — กติกาเดียวกับแถบลีด)
      เลขบนการ์ด = `materialRowMatches` ด้วยชุดนั้น = จำนวนแถวที่ตารางวาดหลังกด (ตารางเรียกตัวเดียวกัน)
   ⚠️ `stageOf` มากับผู้เรียก — stage ของบรรทัดคิดจาก lineStage (po.js) + สถานะวัสดุ ซึ่งจอเป็นเจ้าของ */
export const MATERIAL_CARD_FILTERS = Object.freeze({
  all: Object.freeze({ fc: [], stages: [], issues: [] }),
  outFc: Object.freeze({ fc: ['out'], stages: [], issues: [] }),
  late: Object.freeze({ fc: [], stages: [], issues: ['late'] }),
  slip: Object.freeze({ fc: [], stages: [], issues: ['slip'] }),
});

const hasText = (value, needle) => String(value ?? '').toLowerCase().includes(needle);

/** แถววัสดุผ่านตัวกรองชุดนี้ไหม — คำค้น (รหัส · ชื่อสินค้า · เลข PO) · ในแผน (in/out) · สถานะ · ปัญหา (late/slip) */
export function materialRowMatches(row, { q = '', fc = [], stages = [], issues = [] } = {}, stageOf = () => null) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle && !hasText(row?.fgCode, needle) && !hasText(row?.productName, needle) && !hasText(row?.poNumber, needle)) return false;
  if (fc.length && !fc.includes(row?.inForecast ? 'in' : 'out')) return false;
  if (stages.length && !stages.includes(stageOf(row))) return false;
  if (issues.length && !((issues.includes('late') && row?.lateVsDue) || (issues.includes('slip') && row?.ourSlip))) return false;
  return true;
}

/** เลขบนการ์ดสี่ใบ — นับด้วยชุดตัวกรองของการ์ดใบนั้นเอง (ไม่ใช่ตัวกรองที่ค้างบนจอ) */
export function materialCardCounts(rows = [], stageOf = () => null) {
  const counts = {};
  for (const [key, filters] of Object.entries(MATERIAL_CARD_FILTERS)) {
    counts[key] = rows.filter((row) => materialRowMatches(row, filters, stageOf)).length;
  }
  return counts;
}
