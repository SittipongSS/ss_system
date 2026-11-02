// ── Excise-tax workflow: single source of truth (clean-room rebuild) ───────
// Replaces lib/tax/status.js for the new UI. Defines every status label, tone,
// icon, and pipeline position for BOTH tracks so the badge, the KPI rail, the
// work queue, the list filters, and the drawer timeline all agree.
//
//   Track 1 (การขึ้นทะเบียน) — excise_registrations
//       pending_legal → approved          (rejected = correction loop)
//   Track 2 (การยื่นชำระภาษี) — orders · เส้นของฝ่าย RA ทั้งเส้น (แผนรื้อสรรพสามิต v3 · มติเจ้าของ 02/11)
//       (รอ RA = ยังไม่มีแถว) → filing → complete
//       แถว orders = **บันทึกการยื่น** ที่ระบบเขียนเองตอน RA กด "กำลังยื่น" (ไม่มีปุ่มสร้าง ไม่มีขั้นร่าง)
//       ⚠️ draft / rejected / delivered (PR5) และ pending / received (ก่อน PR5) เลิกใช้แล้ว — ป้ายยังอยู่ใน STATUS
//          ให้อ่านของเก่าออก (prod 02/11: ตาราง orders ว่าง 0 แถว)
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
  // แถวคิวของ RA ที่ยังไม่มีบันทึกการยื่น (มติ 29/10 + v3 02/11) — ไม่ใช่สถานะของแถว orders
  queued: { label: "รอ RA", tone: "warning", icon: "Clock", track: null },
  upcoming: { label: "กำลังมา", tone: "neutral", icon: "Clock", track: null },
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
  /* v3 (มติเจ้าของ 02/11): RA อัปเดตสองขั้น — กำลังยื่น → ชำระแล้ว · ขั้น "รอ RA" ก่อนหน้าไม่มีแถว orders
     (คำนวณสดจากคิว `loadRaFilingQueue`) จึงไม่อยู่ในรายการขั้นของแถว */
  payment: {
    key: "payment",
    label: "การยื่นชำระภาษี",
    href: "/tax/filings",
    stages: [
      { key: "filing", label: "กำลังยื่น", owner: "RA" },
      { key: "complete", label: "ชำระแล้ว", owner: null, done: true },
    ],
  },
};

/* ── ทางเดินสถานะของบันทึกการยื่น: ตารางเดียวของ PATCH /api/orders/[id] และปุ่มบนหน้างาน ─────────
   🐞 ตรวจระบบ 2026-10-26 (ข้อ 4): route เดิมเช็กสถานะต้นทางแค่ 3 ปลายทาง ⇒ ฝ่าย RA ปิดงาน "ชำระแล้ว"
   จากร่างได้ตรง ๆ · เลขใบเสร็จบังคับแค่ในโมดัล ⇒ ทุกปลายทางประกาศ "มาจากไหน · ใครทำ · ต้องมีอะไร" ที่นี่ที่เดียว
   ⭐ v3 (มติเจ้าของ 02/11): RA อัปเดตสองขั้น — **กำลังยื่น** เกิดตอนระบบเขียนบันทึก (POST /api/tax/orders/from-sales-order ·
      ด่านทะเบียนเด็ดขาด `filingStartGateError`) จึงไม่อยู่ในตารางนี้ · เหลือปลายทางเดียวคือ **ชำระแล้ว**
      ไม่มีขั้นร่าง/ตีกลับ/ส่งเอกสารแล้ว · ถอยจากกำลังยื่น = ยกเลิกการเริ่มยื่น (DELETE + เหตุผล) ไม่ใช่สถานะ
     by          RA = ฝ่าย RA (ra:approve) · (SA ไม่มีปลายทางไหนเหลือแล้ว)
     from        สถานะต้นทางที่ยอม
     requires    ช่องที่ต้องมีค่า (จาก body หรือที่เก็บไว้แล้ว) — ใบยกเว้นภาษีทั้งใบไม่ต้อง */
export const FILING_TRANSITIONS = {
  complete: { by: "RA", from: ["filing"], requires: [["exciseReceiptNumber", "เลขที่ใบเสร็จสรรพสามิต"]] },
};

const filled = (value) => String(value ?? "").trim() !== "";

/**
 * ตัดสินการเปลี่ยนสถานะบันทึกการยื่นหนึ่งครั้ง — คืน `{ status, error }` เมื่อไม่ผ่าน หรือ null เมื่อผ่าน
 * @param from    สถานะปัจจุบันของบันทึก
 * @param to      สถานะปลายทาง
 * @param caps    `{ sales, ra }` — ถือ sales:act / ra:approve ไหม (แอดมินถือทั้งคู่)
 * @param exempt  ยกเว้นภาษีทั้งใบไหม (`isExemptFiling` — ไม่ใช่ยอด 0) ⇒ ไม่ต้องมีเลขใบเสร็จ
 * @param fields  ค่าหลังรวมของที่ส่งมากับที่เก็บไว้ `{ exciseReceiptNumber }`
 */
export function filingTransitionError({ from, to, caps = {}, exempt = false, fields = {} } = {}) {
  const rule = FILING_TRANSITIONS[to];
  if (!rule) return { status: 400, error: `เปลี่ยนเป็น "${statusMeta(to).label}" ด้วยทางนี้ไม่ได้` };
  const allowedBy = rule.by === "SA" ? caps.sales : caps.ra;
  if (!allowedBy) return { status: 403, error: "ไม่อนุญาตให้เปลี่ยนสถานะนี้" };
  if (!rule.from.includes(from)) {
    const label = (key) => statusMeta(key).label;
    return {
      status: 400,
      error: `เปลี่ยนเป็น "${label(to)}" จาก "${label(from)}" ไม่ได้ — ต้องมาจาก ${rule.from.map((key) => `"${label(key)}"`).join(" หรือ ")}`,
    };
  }
  const missing = (exempt ? [] : rule.requires || []).filter(([key]) => !filled(fields[key])).map(([, label]) => label);
  if (missing.length) return { status: 400, error: `กรุณาระบุ${missing.join(" และ ")}` };
  return null;
}

/** ปลายทางที่บันทึกในสถานะนี้ไปได้ (ตามตาราง ไม่ดูสิทธิ์/ช่องบังคับ) — ปุ่มบนจออ่านจากตัวนี้ */
export function canTransitionFiling(from, to) {
  return !!FILING_TRANSITIONS[to]?.from.includes(from);
}

/* ── ทางเดินสถานะของทะเบียน: ตารางเดียวของ PATCH /api/excise-registrations/[id] ─────────
   🐞 ตรวจระบบ 2026-10-26 (ข้อ 5): route เขียน `status` ตาม body ตรง ๆ ให้ทุกคนที่ถือ ra:approve ⇒
   อนุมัติร่างที่ยังไม่ยื่นได้ (ข้ามด่านเอกสารบังคับ) · ยื่นแทนฝ่ายขายโดยไม่ผ่านด่านเอกสาร · ตีกลับใบที่ยังไม่ยื่น ·
   ตั้งค่าที่ไม่ใช่สถานะ · เลขอนุมัติบังคับแค่ใน ApproveDialog — ยิง API ตรงอนุมัติได้โดยไม่มีเลข
   ⇒ รูปเดียวกับ FILING_TRANSITIONS: ทุกปลายทางประกาศ "มาจากไหน · ใครทำ · ต้องมีอะไร" ที่นี่ที่เดียว
     by  SA = ฝ่ายขาย (products:edit) · RA = ฝ่าย RA (ra:approve)
   ⚠️ อนุมัติแล้ว → ร่าง (ปลดอนุมัติ) ไม่อยู่ในตารางนี้ — route แยกเส้นของมันก่อนถึงตาราง (RA + เหตุผล + แจ้งเตือน)
   ⚠️ ยื่น (`pending_legal`) ผ่านตารางแล้วยังต้องผ่านด่านเอกสารบังคับใน route */
export const REGISTRATION_TRANSITIONS = {
  pending_legal: { by: "SA", from: ["draft", "rejected"] },
  approved: { by: "RA", from: ["pending_legal"], requires: [["approvalNumber", "เลขที่อนุมัติ"]] },
  rejected: { by: "RA", from: ["pending_legal"], requires: [["rejectionReason", "เหตุผลที่ตีกลับ"]] },
};

/**
 * ตัดสินการเปลี่ยนสถานะทะเบียนหนึ่งครั้ง — คืน `{ status, error }` เมื่อไม่ผ่าน หรือ null เมื่อผ่าน
 * @param caps    `{ sales, ra }` — ถือ products:edit / ra:approve ไหม (แอดมินถือทั้งคู่)
 * @param fields  ค่าหลังรวมของที่ส่งมากับที่เก็บไว้ `{ approvalNumber, rejectionReason }`
 */
export function registrationTransitionError({ from, to, caps = {}, fields = {} } = {}) {
  const rule = REGISTRATION_TRANSITIONS[to];
  const label = (key) => statusMeta(key).label;
  if (!rule) return { status: 400, error: `เปลี่ยนสถานะทะเบียนเป็น "${label(to)}" ด้วยทางนี้ไม่ได้` };
  const allowedBy = rule.by === "SA" ? caps.sales : caps.ra;
  if (!allowedBy) return { status: 403, error: "ไม่อนุญาตให้เปลี่ยนสถานะนี้" };
  if (!rule.from.includes(from)) {
    return {
      status: 400,
      error: `เปลี่ยนเป็น "${label(to)}" จาก "${label(from)}" ไม่ได้ — ต้องมาจาก ${rule.from.map((key) => `"${label(key)}"`).join(" หรือ ")}`,
    };
  }
  const missing = (rule.requires || []).filter(([key]) => !filled(fields[key])).map(([, name]) => name);
  if (missing.length) return { status: 400, error: `กรุณาระบุ${missing.join(" และ ")}` };
  return null;
}

/* ── สินค้า/ลูกค้าของทะเบียนแก้ได้เฉพาะก่อนยื่น ─────────────────────────────────────
   🐞 ตรวจระบบ 2026-10-26 (ข้อ 6): ฝ่ายขายเปลี่ยน FG ได้ระหว่างฝ่าย RA ตรวจ — สถานะไม่ถอย และฉลาก/Artwork
   ของ FG ตัวเดิมยังติดใบ ⇒ RA อาจอนุมัติ FG ตัวใหม่ด้วยเอกสารของตัวเก่า
   ⇒ ชุดเดียวของปุ่ม "แก้ไข" บนหน้าทะเบียนและด่านใน PATCH — สองที่ต้องตรงกัน
   (อนุมัติแล้วล็อกทั้งใบอยู่แล้ว — route ตอบข้อความ "ปลดอนุมัติก่อน" ของมันเอง) */
export const REGISTRATION_LINK_EDITABLE_STATUSES = ["draft", "rejected"];
export const REGISTRATION_LINK_LOCKED_MESSAGE =
  "ทะเบียนนี้รอฝ่าย RA ตรวจอยู่ — เปลี่ยน FG หรือลูกค้าไม่ได้ · ถ้าเลือก FG ผิด ให้ฝ่าย RA ตีกลับก่อนแล้วค่อยแก้";

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
/* หน้างานยื่นชำระ (v3): แถวคิวที่ยังไม่มีบันทึก (กำลังมา · รอ RA) + บันทึกการยื่น (กำลังยื่น · ชำระแล้ว) ในรายการเดียว
   ⚠️ "รอฉันลงมือ" ของ RA = รอ RA + กำลังยื่น (ชุดเดียวกับป้ายเมนู — คิว + `ownedStages('payment', 'RA')`) */
export const FILING_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  MINE_FILTER,
  { key: "upcoming", label: "กำลังมา" },
  { key: "queued", label: "รอ RA" },
  { key: "filing", label: "กำลังยื่น" },
  { key: "complete", label: "ชำระแล้ว" },
];

/* ── ปิดทางสร้างใบยื่นแบบเลือกทะเบียนเอง (แผนรื้อสรรพสามิต PR3 · ตรวจแผน BLOCKER) ──────────────────────────────
   ค่าภาษีเก็บด้วยใบเสนอราคา → SO ค่าสรรพสามิตแล้ว ⇒ ใบยื่นที่สร้างนอกคิวของ RA จะ (1) ชน unique
   orders_sales_order_unique_idx กันใบของ RA และ (2) เก็บเงินค่าภาษีซ้ำกับ SO ค่าสรรพสามิต
   ⇒ POST /api/orders (สร้างเอง) ตอบข้อความนี้ทุกคน · ทางสร้างเดียวคือ RA สร้างจากคิว "รอยื่นกรม"
   (POST /api/tax/orders/from-sales-order · PR5) */
/* สวิตช์ของทางสร้างเดิม — false ตั้งแต่ PR3 · 🔴 ห้ามเปิดกลับ: ทางสร้างของ RA (PR5) เป็นเส้นใหม่ ไม่ใช่สวิตช์นี้ */
export const SA_FILING_CREATE_OPEN = false;
export const FILING_CREATE_CLOSED_MESSAGE = 'บันทึกการยื่นชำระเกิดได้ทางเดียว — ฝ่าย RA กด “เริ่มยื่น” จากงานรอ RA ที่หน้าการยื่นชำระ '
  + '(ฝ่ายขายเก็บค่าภาษีด้วย “ใบเสนอราคาค่าสรรพสามิต” จากหน้าใบสั่งขาย)';
