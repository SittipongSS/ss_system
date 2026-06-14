// ── Excise-tax status: single source of truth ─────────────────────────
// Every status label, tone, and pipeline position for BOTH tracks lives here
// so the pill, the stage rail, the action queue, and the timeline all agree.
// This replaces the scattered definitions in ProductStatusPill / OrderStatusPill
// and the inline status ternaries in /tax/history.
//
//   Track 1 (การขึ้นทะเบียนสินค้า)  — excise_registrations
//       pending_legal → approved        (rejected = correction loop)
//   Track 2 (การยื่นชำระภาษี)        — orders
//       pending → received → filing → complete   (rejected = correction loop)
//
// `tone` maps to the existing .status-pill CSS modifiers (success/warn/danger).

export const TAX_STATUS = {
  // Track 1 — registration
  pending_legal: { label: "รออนุมัติ", tone: "warn" },
  approved: { label: "ขึ้นทะเบียนแล้ว", tone: "success" },
  // Track 2 — order / payment
  pending: { label: "รอรับเงิน", tone: "danger" },
  received: { label: "รอยื่น", tone: "warn" },
  filing: { label: "กำลังยื่น", tone: "warn" },
  complete: { label: "ชำระแล้ว", tone: "success" },
  // shared correction loop (both tracks)
  rejected: { label: "ตีกลับให้แก้ไข", tone: "danger" },
};

export function statusMeta(status) {
  return TAX_STATUS[status] || { label: status || "-", tone: "warn" };
}

// ── Pipeline stages for the rail ──────────────────────────────────────
// Ordered stages of each track. `owner` = the role/department that ACTS at
// that stage (used to highlight "your" lane). `done` marks the terminal,
// successful stage. The `rejected` correction loop is shown separately, not as
// a forward stage. `count` is filled in by the page from live data.

export const TRACK1 = {
  key: "registration",
  label: "การขึ้นทะเบียนสินค้า",
  stages: [
    // The SA-owned head of the track is the correction loop: items LG bounced
    // back for the sales side to fix and resubmit.
    { key: "rejected", label: "รอแก้ไข (ตีกลับ)", owner: "SA" },
    { key: "pending_legal", label: "รออนุมัติ", owner: "LG" },
    { key: "approved", label: "ขึ้นทะเบียนแล้ว", owner: null, done: true },
  ],
};

export const TRACK2 = {
  key: "payment",
  label: "การยื่นชำระภาษี",
  stages: [
    { key: "pending", label: "รอรับเงิน", owner: "SA" },
    { key: "received", label: "รอยื่น", owner: "LG" },
    { key: "filing", label: "กำลังยื่น", owner: "LG" },
    { key: "complete", label: "ชำระแล้ว", owner: null, done: true },
  ],
};

// Map a role to its department code for stage-ownership highlighting.
export function deptOf(role) {
  if (role === "legal") return "LG";
  if (["ae_supervisor", "senior_ae", "ac", "ae"].includes(role)) return "SA";
  if (role === "admin") return "AD"; // sees everything, owns nothing specifically
  return null;
}
