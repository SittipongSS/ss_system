// ── Excise-tax workflow: single source of truth (clean-room rebuild) ───────
// Replaces lib/tax/status.js for the new UI. Defines every status label, tone,
// icon, and pipeline position for BOTH tracks so the badge, the KPI rail, the
// work queue, the list filters, and the drawer timeline all agree.
//
//   Track 1 (การขึ้นทะเบียน) — excise_registrations
//       pending_legal → approved          (rejected = correction loop)
//   Track 2 (การยื่นชำระภาษี) — orders
//       draft → pending → received → filing → complete → delivered
//       (rejected = correction loop)
//
// `tone` maps to the .status-pill CSS modifiers (success / warning / danger /
// info). `icon` names a lucide-react component resolved by StatusBadge.

export const STATUS = {
  // Track 1
  draft: { label: "ฉบับร่าง", tone: "neutral", icon: "FileEdit", track: null },
  pending_legal: { label: "รออนุมัติ", tone: "warning", icon: "Clock", track: "registration" },
  approved: { label: "ขึ้นทะเบียนแล้ว", tone: "success", icon: "CheckCircle2", track: "registration" },
  // Track 2
  pending: { label: "รอรับเงิน", tone: "danger", icon: "Wallet", track: "payment" },
  received: { label: "รอยื่น", tone: "warning", icon: "Clock", track: "payment" },
  filing: { label: "กำลังยื่น", tone: "info", icon: "Loader", track: "payment" },
  complete: { label: "ชำระแล้ว", tone: "success", icon: "CheckCircle2", track: "payment" },
  delivered: { label: "ส่งเอกสารให้ลูกค้าแล้ว", tone: "success", icon: "CheckCircle2", track: "payment" },
  // shared correction loop
  rejected: { label: "ตีกลับให้แก้ไข", tone: "danger", icon: "XCircle", track: null },
};

export function statusMeta(status) {
  return STATUS[status] || { label: status || "-", tone: "neutral", icon: null, track: null };
}

// Ordered forward stages of each track. `owner` = the department that ACTS at
// the stage (used to highlight a role's lane + decide available actions).
// `done` marks the terminal success stage. The rejected loop is shown apart.
export const TRACKS = {
  registration: {
    key: "registration",
    label: "การขึ้นทะเบียนสินค้า",
    href: "/tax/registrations",
    stages: [
      { key: "draft", label: "ฉบับร่าง (รอแนบเอกสาร)", owner: "SA" },
      { key: "rejected", label: "รอแก้ไข (ตีกลับ)", owner: "SA" },
      { key: "pending_legal", label: "รออนุมัติ", owner: "LG" },
      { key: "approved", label: "ขึ้นทะเบียนแล้ว", owner: null, done: true },
    ],
  },
  payment: {
    key: "payment",
    label: "การยื่นชำระภาษี",
    href: "/tax/filings",
    stages: [
      { key: "draft", label: "เตรียมใบยื่น", owner: "SA" },
      { key: "pending", label: "รอรับเงิน", owner: "SA" },
      { key: "received", label: "รอยื่น", owner: "LG" },
      { key: "filing", label: "กำลังยื่น", owner: "LG" },
      { key: "complete", label: "ชำระแล้ว", owner: "SA" },
      { key: "delivered", label: "ส่งเอกสารแล้ว", owner: null, done: true },
    ],
  },
};

// Map a role to its department code for stage-ownership + action gating.
//   SA = sales lane, LG = legal lane, AD = admin (sees both, owns nothing)
export function deptOf(role) {
  if (role === "legal") return "LG";
  if (["ae_supervisor", "senior_ae", "ac", "ae"].includes(role)) return "SA";
  if (role === "admin") return "AD";
  return null;
}

/* ── "รอฉันลงมือ" ของโมดูลภาษี — เจ้าของขั้นเป็นตัวตัดสิน (ม-117) ──────────
   TRACKS ประกาศ `owner` ของทุกขั้นอยู่แล้ว (SA / LG) ⇒ ไม่ต้องมีลิสต์สถานะชุดที่สอง
   ที่ต้องคอยไล่แก้ให้ตรงกัน · ขั้นที่ `done` ไม่นับ มันจบแล้ว
   ⚠️ **AD (แอดมิน) ได้ลิสต์ว่างโดยตั้งใจ** — โมดูลนี้ประกาศไว้เองว่าแอดมิน "เห็นทั้งสอง
   เลนแต่ไม่เป็นเจ้าของอะไร" ⇒ ป้ายที่ขึ้นกับแอดมินคือการทวงงานที่ไม่ใช่ของเขา */
export function ownedStages(trackKey, dept) {
  const track = TRACKS[trackKey];
  if (!track || !dept || dept === "AD") return [];
  return track.stages.filter((stage) => !stage.done && stage.owner === dept).map((stage) => stage.key);
}

export function isTaxWaitingOnMe(row, trackKey, dept) {
  return ownedStages(trackKey, dept).includes(row?.status);
}

export const seesSA = (dept) => dept === "SA" || dept === "AD";
export const seesLG = (dept) => dept === "LG" || dept === "AD";

// Filter chip option lists for each track's list page (+ "all").
export const MINE_FILTER = { key: "mine", label: "รอฉันลงมือ" };

export const REGISTRATION_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  MINE_FILTER,
  { key: "draft", label: "ฉบับร่าง" },
  { key: "pending_legal", label: "รออนุมัติ" },
  { key: "approved", label: "ขึ้นทะเบียนแล้ว" },
  { key: "rejected", label: "ตีกลับ" },
];
export const FILING_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  MINE_FILTER,
  { key: "draft", label: "เตรียมใบยื่น" },
  { key: "pending", label: "รอรับเงิน" },
  { key: "received", label: "รอยื่น" },
  { key: "filing", label: "กำลังยื่น" },
  { key: "complete", label: "ชำระแล้ว" },
  { key: "delivered", label: "ส่งเอกสารแล้ว" },
  { key: "rejected", label: "ตีกลับ" },
];
