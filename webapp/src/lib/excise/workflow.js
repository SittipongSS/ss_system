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

import { isSalesRole } from "@/lib/permissions";

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
      { key: "pending_legal", label: "รออนุมัติ", owner: "RA" },
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
      { key: "received", label: "รอยื่น", owner: "RA" },
      { key: "filing", label: "กำลังยื่น", owner: "RA" },
      { key: "complete", label: "ชำระแล้ว", owner: "SA" },
      { key: "delivered", label: "ส่งเอกสารแล้ว", owner: null, done: true },
    ],
  },
};

/* สถานะที่ฝ่ายขายยังแก้รายการ/หัวใบยื่นได้ — ก่อนยืนยันรับเงิน + รอบแก้หลังถูกตีกลับ
   ⚠️ ชุดเดียวของปุ่ม "แก้ไขข้อมูล" บนหน้าใบยื่นและด่านใน PATCH /api/orders/[id] — สองที่ต้องตรงกัน
   (`draft` เพิ่ม 2026-10-26: ใบจาก SO เกิดเป็นร่าง และเป็นจังหวะที่ควรคิดภาษีใหม่หลังเติมราคาขายปลีก) */
export const FILING_EDITABLE_STATUSES = ["draft", "pending", "rejected"];

/* ── ทางเดินสถานะของใบยื่น: ตารางเดียวของ PATCH /api/orders/[id] และปุ่มบนหน้าใบยื่น ─────────
   🐞 ตรวจระบบ 2026-10-26 (ข้อ 4): route เดิมเช็กสถานะต้นทางแค่ 3 ปลายทาง (pending · received ·
   delivered) ⇒ ฝ่าย RA สั่ง "กำลังยื่น"/"ชำระแล้ว" จากร่างหรือรอรับเงินได้ตรง ๆ (ข้ามขั้นรับเงินจาก
   ลูกค้า) · ตีกลับใบที่ชำระแล้วได้ · เลขใบเสร็จบังคับแค่ในโมดัล — ยิง API ตรงปิดงานได้โดยไม่มีใบเสร็จ
   ⇒ ทุกปลายทางประกาศ "มาจากไหน · ใครทำ · ต้องมีอะไร" ที่นี่ที่เดียว
     by          SA = ฝ่ายขาย (sales:act) · RA = ฝ่าย RA (ra:approve)
     from        สถานะต้นทางที่ยอม
     exemptFrom  ต้นทางเพิ่มเติมเฉพาะใบยกเว้นภาษี (isExemptFiling) — ใบยกเว้นไม่มีขั้น "กำลังยื่น"
     taxableOnly ใบยกเว้นห้ามเข้า (ไม่มีภาษีให้ยื่น)
     requires    ช่องที่ต้องมีค่า (จาก body หรือที่เก็บไว้แล้ว) — ใบยกเว้นไม่ต้อง ยกเว้น alwaysRequires */
export const FILING_TRANSITIONS = {
  pending: { by: "SA", from: ["draft"] },
  received: { by: "SA", from: ["pending", "rejected"], requires: [["receiptNumber", "เลขที่ Invoice/Receipt ของ S&S"]] },
  filing: { by: "RA", from: ["received"], taxableOnly: true, requires: [["taxInvoiceNumber", "เลขที่ใบกำกับภาษี"]] },
  complete: { by: "RA", from: ["filing"], exemptFrom: ["received"], requires: [["exciseReceiptNumber", "เลขที่ใบเสร็จสรรพสามิต"]] },
  delivered: { by: "SA", from: ["complete"] },
  rejected: { by: "RA", from: ["received", "filing"], alwaysRequires: [["rejectionReason", "เหตุผลที่ตีกลับ"]] },
};

const filled = (value) => String(value ?? "").trim() !== "";

/**
 * ตัดสินการเปลี่ยนสถานะใบยื่นหนึ่งครั้ง — คืน `{ status, error }` เมื่อไม่ผ่าน หรือ null เมื่อผ่าน
 * @param from    สถานะปัจจุบันของใบ
 * @param to      สถานะปลายทาง
 * @param caps    `{ sales, ra }` — ถือ sales:act / ra:approve ไหม (แอดมินถือทั้งคู่)
 * @param exempt  ใบยกเว้นภาษีไหม (`isExemptFiling` — ไม่ใช่ยอด 0)
 * @param fields  ค่าหลังรวมของที่ส่งมากับที่เก็บไว้ `{ receiptNumber, taxInvoiceNumber, exciseReceiptNumber, rejectionReason }`
 */
export function filingTransitionError({ from, to, caps = {}, exempt = false, fields = {} } = {}) {
  const rule = FILING_TRANSITIONS[to];
  if (!rule) return { status: 400, error: `ไม่รู้จักสถานะ "${to}"` };
  const allowedBy = rule.by === "SA" ? caps.sales : caps.ra;
  if (!allowedBy) return { status: 403, error: "ไม่อนุญาตให้เปลี่ยนสถานะนี้" };
  const fromOk = rule.from.includes(from) || (exempt && (rule.exemptFrom || []).includes(from));
  if (!fromOk) {
    const label = (key) => statusMeta(key).label;
    return {
      status: 400,
      error: `เปลี่ยนเป็น "${label(to)}" จาก "${label(from)}" ไม่ได้ — ต้องมาจาก ${rule.from.map((key) => `"${label(key)}"`).join(" หรือ ")}`,
    };
  }
  if (exempt && rule.taxableOnly) {
    return { status: 400, error: "ใบนี้ได้รับยกเว้นภาษี ไม่ต้องยื่น — ยืนยันชำระได้เลย" };
  }
  const required = [...(rule.alwaysRequires || []), ...(exempt ? [] : rule.requires || [])];
  const missing = required.filter(([key]) => !filled(fields[key])).map(([, label]) => label);
  if (missing.length) return { status: 400, error: `กรุณาระบุ${missing.join(" และ ")}` };
  return null;
}

/** ปลายทางที่ใบในสถานะนี้ไปได้ (ตามตาราง ไม่ดูสิทธิ์/ช่องบังคับ) — ปุ่มบนจออ่านจากตัวนี้ */
export function canTransitionFiling(from, to, { exempt = false } = {}) {
  const rule = FILING_TRANSITIONS[to];
  if (!rule) return false;
  if (exempt && rule.taxableOnly) return false;
  return rule.from.includes(from) || (exempt && (rule.exemptFrom || []).includes(from));
}

// Map a role to its department code for stage-ownership + action gating.
//   SA = sales lane, RA = regulatory lane, AD = admin (sees both, owns nothing)
export function deptOf(role) {
  if (role === "ra") return "RA";
  if (isSalesRole(role)) return "SA";   // ฝ่ายขายทุกตำแหน่ง (SALES_ROLES · ผังตำแหน่ง 2026-09-24)
  if (role === "admin") return "AD";
  return null;
}

/* ── "รอฉันลงมือ" ของโมดูลภาษี — เจ้าของขั้นเป็นตัวตัดสิน (ม-117) ──────────
   TRACKS ประกาศ `owner` ของทุกขั้นอยู่แล้ว (SA / RA) ⇒ ไม่ต้องมีลิสต์สถานะชุดที่สอง
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
export const seesRA = (dept) => dept === "RA" || dept === "AD";

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
