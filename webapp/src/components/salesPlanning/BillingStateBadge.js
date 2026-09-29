// ── ป้ายสถานะการวางบิลของงวด (แผงงวดของใบ SO · ทะเบียนการชำระ FN) — ม็อก billing-cycle จอ C ──
//
// ⭐ ข้อความ/โทนมาจาก `billingState` · `billingStateLabel` · `billingStateTone` ของ lib/sales/billingRule.js
//   ตัวเดียวกับกระดิ่งและทะเบียน FN — **ห้ามเขียนคำ/สีของสถานะเองที่นี่** (จอสองจอจะพูดไม่ตรงกัน)
// ⭐ "เลยรอบวางบิล" เป็นโทนเตือน **ไม่ใช่แดง** — แดงสงวนให้ "เลยกำหนด" ของกำหนดชำระ (dueDate) ช่องเดียว
// ⭐ "ขอใบวางบิลแล้ว" = มีคำร้องขอใบวางบิลที่ยังไม่ถูกยกเลิก/ปฏิเสธผูกกับงวด — **ผู้เรียกตัดสิน `requested`**
//   (ยกเลิกคำร้องแล้วลิงก์ billingRequestId ยังค้างในงวด ⇒ ห้ามอ่าน "มีลิงก์ = ขอแล้ว" ตรง ๆ)
//   ส่ง `requestHref` มา = ป้ายทั้งใบเป็นลิงก์ไปคำร้อง (ขนาดเดียวกับป้ายสถานะอื่นในแถว — `size` ส่งต่อ StatusBadge)
// ไม่มีอะไรจะบอก (ยังไม่กำหนด · รับเงินแล้ว · งวดยกมา) = `billingStateLabel` คืนว่าง ⇒ คืน null — เซลล์ของผู้เรียกใส่ขีดเอง
//   ⚠️ ไม่ทำรายชื่อสถานะเงียบซ้ำที่นี่ — ตัวตัดสินมีที่เดียว (ป้ายกับกระดิ่ง/ทะเบียน FN ต้องเงียบตรงกัน)
import Link from "next/link";
import { BellRing, Clock, Hourglass, Receipt, TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { billingState, billingStateLabel, billingStateTone } from "@/lib/sales/billingRule";
import styles from "./BillingStateBadge.module.css";

const ICONS = {
  late: TriangleAlert,
  today: BellRing,
  soon: BellRing,
  upcoming: Clock,
  requested: Receipt,
  waiting: Hourglass,
};

export default function BillingStateBadge({ row, todayIso, requested = false, requestCode = "", requestHref = "", size = "sm" }) {
  const state = billingState(row, { todayIso, requested });
  const base = billingStateLabel(state, { billingEvent: String(row?.billingEvent || "").trim() });
  if (!base) return null;
  const code = String(requestCode || "").trim();
  const label = state.key === "requested" && code ? `${base} · ${code}` : base;
  const tone = billingStateTone(state);
  const Icon = ICONS[state.key];

  const linked = state.key === "requested" && Boolean(requestHref);
  const badge = (
    <StatusBadge
      size={size}
      tone={tone}
      icon={Icon}
      iconSize={size === "sm" ? 11 : 13}
      label={label}
      className={linked ? styles.linkBadge : ""}
    />
  );
  if (!linked) return badge;
  /* ป้ายทั้งใบเป็นลิงก์ (ม็อก C) — เส้นใต้อยู่ที่ตัวป้ายเพราะ decoration ของ <a> ไม่ไหลเข้า inline-flex
     (ป้ายเป็นกล่อง atomic) · คนที่แยกสีไม่ออกต้องเห็นว่ากดได้ (WCAG 1.4.1) */
  return (
    <Link href={requestHref} className={styles.link} title={code ? `เปิดคำร้อง ${code}` : "เปิดคำร้องขอใบวางบิล"}>
      {badge}
    </Link>
  );
}
