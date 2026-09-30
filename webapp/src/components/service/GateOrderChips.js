"use client";
// ── ชิปใบสั่งขายบนข้อด่านที่ติด (PR-C · C9 · D15 · C-D19) ────────────────────────────────────────────
//
// ⭐ ร่างที่ติด "โซนนี้ยังไม่มีรอบขายที่มีผล" บอกว่า **ใบไหนกำลังมา** — "ใบสั่งขาย SO-… · ฉบับร่าง · AE" + ลิงก์ "เปิดใบสั่งขาย"
//    (ใบที่ฝ่ายขายเลือกโซนนี้ไว้แล้วแต่ยังไม่เปิดงานบริการ · ตัวติดป้ายอยู่ฝั่ง server `zoneSetupOrders.js`)
//    ⇒ คนจัดคิวไม่ต้องเดาว่าต้องตามใคร · ผลด่านไม่ขยับ (ชิปเป็นป้ายบอกทางล้วน)
// 🔴 **hook ครั้งเดียวที่หัวคอมโพเนนต์นี้** (rule 19 · critique H1) — การ์ด/แผงด่านวาดข้อด่านใน `.map()` ⇒ ห้ามเรียก `useCan`
//    ที่ผู้วาด · ตัวนี้เรียกเองก่อน return ใด ๆ (ลำดับ hook คงที่ทุกการวาด แม้ไม่มีชิป)
// 🔴 **inline ล้วน** (rule 20) — ทั้งสองจุดที่วางอยู่ใน `<p>` ⇒ มีแค่ span กับ Link (ห้าม div/p/ul/StatusNotice)
// ⚠️ ลิงก์เฉพาะคนที่เปิดใบสั่งขายได้ (`salesplan:view` · ไม่มีสิทธิ์ = ไม่โชว์) — ชิปข้อความโชว์ทุกคน (ใครก็ต้องรู้ว่ารอใบไหน)
// ⚠️ ข้อความมาจาก `zoneSetupOrderText.js` (ไฟล์ไม่มี import — critique L9) · ห้าม import ตัวติดป้ายเข้าจอ
import Link from "next/link";
import { useCan } from "@/lib/roleContext";
import { setupOrderChipText } from "@/lib/service/zoneSetupOrderText";
import styles from "./GateOrderChips.module.css";

/* ท่อนของชิป — แยกที่ " · " (เลขที่ใบ · ขั้น · AE) แล้ววาดท่อนละก้อน inline-block
   🐞 จอ 375px: ชิปทั้งเส้นห่อด้วยพจนานุกรม ICU แล้วหั่นกลางชื่อคน ("สม|หญิง") ⇒ ห่อเฉพาะรอยต่อระหว่างท่อน
   (ท่อนเดียวยาวเกินบรรทัดจึงห่อข้างในท่อน) · ข้อความที่อ่าน/ค้นเท่าเดิมทุกตัวอักษร (`setupOrderChipText`) */
const SEPARATOR = " · ";
const chipRuns = (order) => setupOrderChipText(order).split(SEPARATOR);

/**
 * @param orders ชิปของข้อด่าน (`item.orders` / `row.orders`) — `{ orderId, orderNumber, stateLabel, group, ownerName }[]`
 *               ไม่มี/ว่าง = ไม่วาดอะไรเลย
 */
export default function GateOrderChips({ orders = [] }) {
  const canOpen = useCan("salesplan:view");
  const list = Array.isArray(orders) ? orders.filter((order) => order?.orderId) : [];
  if (!list.length) return null;
  return (
    <span className={styles.chips}>
      {list.map((order) => (
        <span key={order.orderId} className={styles.item}>
          <span className={styles.chip}>
            {chipRuns(order).map((run, index, runs) => (
              <span key={index}>
                <span className={styles.run}>{index < runs.length - 1 ? `${run} ·` : run}</span>
                {index < runs.length - 1 ? " " : null}
              </span>
            ))}
          </span>
          {canOpen && (
            <Link
              href={`/sa/sales-orders/${encodeURIComponent(order.orderId)}`}
              className={`linklike ${styles.open}`}
              aria-label={`เปิดใบสั่งขาย ${order.orderNumber || ""}`.trim()}
            >
              เปิดใบสั่งขาย
            </Link>
          )}
        </span>
      ))}
    </span>
  );
}
