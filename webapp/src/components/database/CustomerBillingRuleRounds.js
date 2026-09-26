"use client";
// ── รอบถัดไปของ "รอบวางบิล" — ชิ้นร่วมของการ์ดบนหน้าลูกค้ากับโมดัลแก้รอบ (mig 0389 · ม็อก A) ──
//
// ⭐ ตัวคิดวันทั้งหมดอยู่ที่ `lib/sales/billingRule.js` — ไฟล์นี้แค่เลือกว่าจะโชว์อะไรแล้ววาด
//    (ห้ามคิดวันซ้ำตรงนี้ ไม่งั้นการ์ด/โมดัล/ชิปรอบบนใบสั่งขายจะพูดคนละวัน)
// ⚠️ "วันนี้" = `businessDate()` นาฬิกาไทย — ผู้เรียกส่งเข้ามา
// ⚠️ ตรงเสาร์/อาทิตย์ = ป้ายเตือนอย่างเดียว **ไม่เลื่อนวัน** (มติเจ้าของ 26/09 ข้อ 1)
import { ArrowRight, TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { TableScroll } from "@/components/ui/Table";
import { NA } from "@/lib/format";
import { billingRounds, billingRuleOf, dueDateForBilling, formatBillingDate, weekendNote } from "@/lib/sales/billingRule";
import { daysBetween } from "@/lib/sales/paymentCoverage";
import styles from "./CustomerBillingRule.module.css";

/**
 * แถวที่จะโชว์ของรอบวางบิล
 * · วางบิลรายเดือน = 3 รอบถัดไปนับจากวันนี้ (ชิปชุดเดียวกับที่ SA แตะบนงวดของใบสั่งขาย)
 * · วางบิลได้ทุกวัน = ไม่มีรอบให้คิดล่วงหน้า (`billingRounds` คืน []) ⇒ โชว์ "ถ้าวางบิลวันนี้" หนึ่งแถว
 *   ให้เห็นว่าเงินเข้าเมื่อไร — ไม่ใช่ตารางว่างที่อ่านเหมือนตั้งรอบไม่สำเร็จ
 * @returns `{ anyday, rows: [{ billingDate, dueDate, gap }] }`
 */
export function billingPreviewOf(value, todayIso, count = 3) {
  const rule = billingRuleOf(value);
  if (!rule || !todayIso) return { anyday: false, rows: [] };
  const anyday = rule.billing.mode !== "monthly";
  const base = anyday
    ? [{ billingDate: todayIso, dueDate: dueDateForBilling(rule, todayIso) }]
    : billingRounds(rule, todayIso, count);
  return {
    anyday,
    rows: base.map((row) => ({ ...row, gap: daysBetween(row.billingDate, row.dueDate) })),
  };
}

/* ป้ายเตือนวันหยุดสุดสัปดาห์ — โทน warning (ไม่ใช่แดง: แดงสงวนให้ "เลยกำหนด" เท่านั้น) */
export function WeekendBadge({ date }) {
  const note = weekendNote(date);
  if (!note) return null;
  return <StatusBadge tone="warning" size="sm" icon={TriangleAlert} iconSize={11} label={note} />;
}

/* ตาราง 3 รอบถัดไปบนการ์ด — รอบ · วันวางบิล · เงินเข้า/กำหนดชำระ · ห่าง */
export function BillingRoundsTable({ rows }) {
  return (
    <TableScroll family="list" surface="embedded" className={styles.roundsTable}>
      <table>
        <thead>
          <tr>
            <th>รอบ</th>
            <th>วันวางบิล</th>
            <th>เงินเข้า / กำหนดชำระ</th>
            <th className="num">ห่าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.billingDate}>
              <td className={styles.roundNo}>{index + 1}</td>
              <td>
                <span className={styles.dateCell}>{formatBillingDate(row.billingDate)}<WeekendBadge date={row.billingDate} /></span>
              </td>
              <td>
                <span className={styles.dateCell}>{formatBillingDate(row.dueDate)}<WeekendBadge date={row.dueDate} /></span>
              </td>
              <td className={`num ${styles.gap}`}>{row.gap === null ? NA : `${row.gap} วัน`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/* รายการรอบในโมดัล — แถวเดียวอ่านจบ "วางบิล … → เงินเข้า …" (คิดสดตามที่เลือก ไม่ใช่ช่องกรอก) */
export function BillingRoundsList({ rows }) {
  return (
    <ol className={styles.roundsList}>
      {rows.map((row, index) => (
        <li key={row.billingDate}>
          <span className={styles.roundBullet} aria-hidden="true">{index + 1}</span>
          <span className={styles.roundSeg}>วางบิล <b>{formatBillingDate(row.billingDate)}</b><WeekendBadge date={row.billingDate} /></span>
          <ArrowRight size={14} className={styles.roundArrow} aria-hidden="true" />
          <span className={styles.roundSeg}>เงินเข้า <b>{formatBillingDate(row.dueDate)}</b><WeekendBadge date={row.dueDate} /></span>
          {row.gap === null ? null : <span className={styles.roundGap}>ห่าง {row.gap} วัน</span>}
        </li>
      ))}
    </ol>
  );
}
