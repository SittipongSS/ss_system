"use client";
// ── ชิ้นเล็กที่ตัวแก้ · แผงเติม · แถบบันทึกของโหมดตั้งวันใช้ร่วมกัน (ไทล์สองวัน · ป้ายเสาร์-อาทิตย์ · โหนด ○/●) ──
// ⭐ ไทล์ "○ วันวางบิล —n วัน→ ● กำหนดชำระ" เป็นทรงกลางตัวเดียว (บรีฟ index.html: "ต้องทำเป็นคอมโพเนนต์กลางตัวเดียว
//   ไม่ใช่ markup ในแผงการชำระ") — รอบในตัวแก้ · ต่อจากงวดก่อน · ตัวเลือกของแผงเติม วาดผ่าน `DateTile` ตัวนี้
// ⭐ วันตรงเสาร์/อาทิตย์ = ป้ายเป็นคำ (ไม่เลื่อนวัน · มติ 26/09) คำมาจาก weekendNote ตัวเดียวของระบบ
import { Check, TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { daysBetween } from "@/lib/sales/paymentCoverage";
import { PAY_ON_BILLING_TEXT, formatBillingDate, weekendNote } from "@/lib/sales/billingRule";
import styles from "./InstallmentDates.module.css";

export function WeekendBadge({ iso }) {
  const note = weekendNote(iso);
  return note ? <StatusBadge size="sm" tone="warning" icon={TriangleAlert} iconSize={11} label={note} /> : null;
}

export const BillNode = () => <span className={styles.node} aria-hidden="true" />;
export const DueNode = () => <span className={styles.nodeFill} aria-hidden="true" />;

/* "○ วางบิล → ● กำหนดชำระ" — คำอธิบายสัญลักษณ์บรรทัดเดียว (ใช้คำ "กำหนดชำระ" ทุกที่ในตัวแก้ · ข้อ 5) */
export function DateLegend() {
  return (
    <span className={styles.legend}>
      <BillNode />วันวางบิล → <DueNode />กำหนดชำระ
    </span>
  );
}

/* วันเดียว + โหนด + ป้ายเสาร์-อาทิตย์ */
export function DateText({ iso, node = "due", withYear = true }) {
  if (!iso) return null;
  return (
    <span className={styles.tileDate}>
      {node === "bill" ? <BillNode /> : <DueNode />}
      {formatBillingDate(iso, { withYear })}
      <WeekendBadge iso={iso} />
    </span>
  );
}

/* สองวันในบรรทัดเดียว — ไม่มีวันวางบิล (ลูกค้ายังไม่ตั้ง · กำหนดชำระอย่างเดียว) = วันเดียว
   · ชำระวันวางบิล (ไม่มีเครดิต · มติ 28/09) = ระยะ 0 ⇒ วันเดียวสองโหนด + "ชำระวันวางบิล" — ไม่ใช่ "— 0 วัน →" (ห้ามพูดเครดิต 0 วัน)
     และไม่วาดวันเดียวกันสองรอบพร้อมป้ายเสาร์-อาทิตย์ซ้ำ */
export function DatePair({ billingDate = "", dueDate = "" }) {
  const gap = billingDate && dueDate ? daysBetween(billingDate, dueDate) : null;
  if (gap === 0) {
    return (
      <span className={styles.tileDates}>
        <span className={styles.tileDate}>
          <BillNode /><DueNode />{formatBillingDate(billingDate)}<WeekendBadge iso={billingDate} />
        </span>
        <span className={styles.tileGap}>{PAY_ON_BILLING_TEXT}</span>
      </span>
    );
  }
  return (
    <span className={styles.tileDates}>
      {billingDate ? <DateText iso={billingDate} node="bill" /> : null}
      {gap !== null ? <span className={styles.tileGap}>— {gap} วัน →</span> : null}
      {dueDate ? <DateText iso={dueDate} node="due" /> : null}
    </span>
  );
}

/**
 * ไทล์ที่แตะแล้วได้ทั้งสองวัน — เห็นผลก่อนแตะเสมอ (ข้อ 3)
 * @param cap   หัวไทล์ (เช่น "ต่อจากงวด 2 · กำหนดชำระวันที่ 25") · tags = ป้ายเล็กต่อท้ายหัว
 * @param role  "radio" (เลือกหนึ่งในชุด · aria-checked) หรือ undefined (ปุ่มกดทำ · aria-pressed)
 */
export function DateTile({
  billingDate = "", dueDate = "", cap = null, tags = null, list = null, on = false, role, onClick, disabled = false, ariaLabel,
}) {
  const pressed = role === "radio" ? { "aria-checked": on } : { "aria-pressed": on };
  return (
    <button type="button" className={styles.tile} role={role} {...pressed} onClick={onClick} disabled={disabled}
      aria-label={ariaLabel}>
      {cap || tags ? <span className={styles.tileCap}>{cap}{tags}</span> : null}
      {list || <DatePair billingDate={billingDate} dueDate={dueDate} />}
      <span className={styles.tileEnd}>{on ? <Check size={16} aria-hidden="true" /> : null}</span>
    </button>
  );
}

/* ชื่อเสียงอ่านของไทล์ — "วางบิล พ. 21 ต.ค. 2026 กำหนดชำระ จ. 30 พ.ย. 2026" (ตาเห็นเป็นโหนด ○/● ที่เสียงอ่านไม่ออก) */
export function pairLabel(billingDate, dueDate, extra = "") {
  return [
    billingDate ? `วางบิล ${formatBillingDate(billingDate)}` : "",
    dueDate ? `กำหนดชำระ ${formatBillingDate(dueDate)}` : "",
    extra,
  ].filter(Boolean).join(" · ");
}
