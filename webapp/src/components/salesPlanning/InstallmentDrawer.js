"use client";
/* ── ลิ้นชักรายงวดของใบสั่งขายหนึ่งใบ (รื้อรายการ SO + บัญชี PR-2 · มติเจ้าของ 09/11/2026) ─────────────────────────
   เปิดจากชิปงวดบนแถว — ดูงวดทั้งใบได้โดยไม่ออกจากหน้ารายการ
   ⭐ มติข้อ 3: **ฝั่งฝ่ายขายดูอย่างเดียว** · แจ้งชำระ/แนบสลิป/ตั้งวัน ยังทำที่แผงงวดบนหน้าใบ (ปุ่มท้ายลิ้นชักพาไปแท็บการชำระ)
     ชุดเงินเข้า 3 ปุ่มเข้ามาทีหลัง (PR-5) · ปุ่มของบัญชีมาทาง `renderActions` (PR-3b) — ลิ้นชักไม่รู้จักสิทธิ์เอง
   ⭐ ตัวเลขทุกตัวจากก้อน `money` ของแถว (server) — ลิ้นชักไม่อ่าน API เพิ่ม
   ⚠️ `showActual` = เปลือกงานขาย (มติ "บัญชีไม่สนใจ Actual") — ส่ง false จากหน้างานบัญชี/เปลือกบัญชี */
import Link from "next/link";
import RecordDrawer from "@/components/excise/RecordDrawer";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { INSTALLMENT_CHIP_LABELS } from "@/lib/sales/salesOrderMoney";
import { isActualOrder } from "@/lib/sales/historicalOrders";
import InstallmentChips from "@/components/salesPlanning/InstallmentChips";
import styles from "./InstallmentDrawer.module.css";

const KIND_TONE = {
  confirmed: "success", reported: "info", prepaid: "info", pending: "neutral",
  overdue: "danger", rejected: "danger", plan: "neutral", refunded: "neutral",
};

export default function InstallmentDrawer({
  row, focusSeq = null, onClose, showActual = true, detailHref = null, renderActions = null,
  hint = "แจ้งชำระ แนบสลิป และตั้งวันกำหนดชำระ ทำที่แท็บการชำระของหน้าใบ",
}) {
  const money = row?.money;
  if (!row || !money) return null;
  const list = money.installments || [];
  const cancelled = row.status === "cancelled";
  const confirmedCount = list.filter((i) => i.kind === "confirmed").length;
  const href = detailHref || `/sa/sales-orders/${row.id}?tab=payment`;
  return (
    <RecordDrawer
      open
      onClose={onClose}
      title={row.orderNumber}
      subtitle={`${row.quotation?.quoteNumber ? `จาก ${row.quotation.quoteNumber} · ` : ""}${naText(row.customerName)}`}
      footer={(
        <Button as={Link} href={href} tone="primary" size="sm">เปิดหน้าใบ (การชำระ)</Button>
      )}
    >
      <div className={styles.body}>
        <div className={styles.summary}>
          {showActual ? (
            <div className={styles.box}>
              <span className={styles.boxLabel}>Actual ก่อน VAT</span>
              <b className={styles.boxValue}>{isActualOrder(row) ? fmtMoney(row.actualAmount) : NA}</b>
            </div>
          ) : null}
          <div className={styles.box}>
            <span className={styles.boxLabel}>ยอดจ่าย รวม VAT</span>
            <b className={styles.boxValue}>{fmtMoney(money.payable)}</b>
            <span className={styles.boxLabel}>ก่อน VAT {fmtMoney(money.payableNet)}</span>
          </div>
          <div className={styles.box}>
            <span className={styles.boxLabel}>{cancelled ? "เงินค้างบนใบยกเลิก" : `เก็บแล้ว ${confirmedCount}/${list.length} งวด`}</span>
            <b className={`${styles.boxValue} ${cancelled ? "cell-num-bad" : money.collected > 0 ? "cell-num-ok" : ""}`.trim()}>{fmtMoney(cancelled ? money.stranded : money.collected)}</b>
            {!cancelled && money.reviewing > 0 ? <span className={styles.boxLabel}>+ รอบัญชีตรวจ {fmtMoney(money.reviewing)}</span> : null}
          </div>
        </div>

        {!money.tracked ? (
          <StatusNotice tone="info">ใบยังไม่อนุมัติ — งวดด้านล่างคือแผนในใบเสนอราคา ยังไม่ส่งให้บัญชี</StatusNotice>
        ) : null}
        {cancelled && money.stranded > 0 ? (
          <StatusNotice tone="warning">
            ใบนี้ยกเลิกแล้วแต่ยังมีเงินอยู่ — เงินก้อนเดียวกันอยู่ที่ใบใหม่แล้ว (สลิปซ้ำ) ให้บัญชีถอนคำรับรองแล้วตีกลับ ·
            เงินยังไม่ถูกใช้ ให้ยกไปใบใหม่ของดีลเดียวกันที่หน้าใบใหม่ · ลูกค้าไม่ซื้อแล้ว ให้บัญชีบันทึกคืนเงิน
          </StatusNotice>
        ) : null}

        <InstallmentChips installments={list} ariaLabel={`สถานะรายงวดของ ${row.orderNumber}`} />

        <ol className={styles.list}>
          {list.map((inst) => (
            <li key={inst.id || `plan-${inst.seq}`} className={`${styles.inst} ${focusSeq === inst.seq ? styles.focus : ""}`.trim()}>
              <div className={styles.instHead}>
                <span className={styles.instTitle}>
                  งวด {inst.seq}{inst.opening ? " · งวดยกมา" : inst.label ? ` · ${inst.label}` : ""}
                </span>
                <b className={styles.instAmount}>{fmtMoney(inst.amount)}</b>
                <StatusBadge tone={KIND_TONE[inst.kind] || "neutral"} size="sm" label={INSTALLMENT_CHIP_LABELS[inst.kind] || inst.kind} />
              </div>
              <div className={styles.meta}>
                <span className={inst.kind === "overdue" ? "cell-num-bad" : undefined}>
                  กำหนด {inst.dueDate ? fmtDate(inst.dueDate) : "ยังไม่ตั้งวัน"}
                </span>
                {inst.paidOn && inst.kind !== "plan" ? <span>จ่าย {fmtDate(inst.paidOn)}</span> : null}
                <span>
                  {inst.taxInvoiceNo
                    ? <>ใบกำกับ <span className="mono">{inst.taxInvoiceNo}</span></>
                    : inst.kind === "confirmed" && !inst.opening ? "ยังไม่ออกใบกำกับ" : `ใบกำกับ ${NA}`}
                </span>
              </div>
              {renderActions ? renderActions(inst) : null}
            </li>
          ))}
        </ol>
        {!renderActions && hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
    </RecordDrawer>
  );
}
