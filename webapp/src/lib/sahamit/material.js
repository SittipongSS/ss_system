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
