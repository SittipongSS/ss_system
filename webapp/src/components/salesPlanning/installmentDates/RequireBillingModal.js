"use client";
// ── โมดัล "งวดนี้ต้องวางบิล…" (รอบกรรมการ 29/09 ข้อติ #1 · §2.3 · ม็อก recommended.js `needModal`) ──
//
// ⭐ ลูกค้าตั้งไว้ว่า "ไม่ต้องวางบิล" แต่ครั้งนี้ลูกค้าขอใบวางบิล — เลือกขอบเขต **ไม่มีค่าตั้งต้น**:
//   · เฉพาะงวดนี้                 → ตัวแก้ของงวดเปิดที่ปฏิทินวันวางบิลทันที (ร่าง · บันทึกครั้งเดียวที่แถบล่าง)
//   · ทุกงวดที่ยังเปิดของใบนี้     → ทางลัดของ "เฉพาะงวดนี้" หลายงวด (ไม่มีธงระดับใบ — K1 67 ใบจ่ายครบตอน Won)
//   · ลูกค้าต้องวางบิลทุกใบต่อจากนี้ → ไปตัวตั้งค่าของลูกค้า (แท็บใหม่ · กลับมา = ดึงใบสด)
// ⭐ ไม่มีคอลัมน์ใหม่ — วันวางบิลที่ยืนยันแล้วคือข้อยกเว้น · API ลงประวัติ "ยกเว้น: งวดนี้ต้องวางบิล โดย X" จากธง `billingException`
//   ที่ส่งไปกับวันวางบิลใหม่ (scheduleManyRows) · ไม่ยืนยัน = ด่านเขียนตีกลับ (NO_BILLING_WRITE_ERROR)
import { useState } from "react";
import { CalendarDays, ExternalLink, History } from "lucide-react";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";
import { formatBillingDate } from "@/lib/sales/billingRule";
import styles from "./InstallmentDates.module.css";

/**
 * @param row        งวดที่เปิดเมนู · @param orderCode เลขที่ใบ · @param customerCode รหัส AR
 * @param openCount  งวดที่ "ทุกงวดที่ยังเปิดของใบนี้" จะรวม (ไม่ล็อก · ยังไม่มีวันวางบิล · ไม่ติ๊ก — รวมงวดนี้)
 * @param onConfirm  (scope: 'one' | 'so') => void · @param onCustomer () => void (ไปตั้งที่ลูกค้า) · @param onClose
 */
export default function RequireBillingModal({
  row, orderCode = "", customerCode = "", openCount = 1, onConfirm, onCustomer, onClose,
}) {
  const [scope, setScope] = useState(null);
  if (!row) return null;
  const due = String(row.dueDate || "");
  const consequence = {
    one: `เปิดช่องวันวางบิลของงวด ${row.seq} งวดเดียว → เลือกวันต่อทันที · กระดิ่งวางบิล + “ขอใบวางบิลงวดนี้” เฉพาะงวดนี้ · `
      + `กำหนดชำระ${due ? ` ${formatBillingDate(due, { withYear: false })}` : ""} ไม่เปลี่ยน · ลูกค้ายังเป็น “ไม่ต้องวางบิล”`,
    so: `เหมือนเฉพาะงวดนี้ แต่ทุกงวดที่ยังเปิดของ ${orderCode || "ใบนี้"} (${openCount} งวด) · เป็นทางลัด ไม่มีช่องระดับใบ`,
    cust: "ไปที่ตัวตั้งค่าของลูกค้า — เปลี่ยนเป็น “ต้องวางบิล” แล้วตั้งรอบ · ใบที่เปิดอยู่ทุกใบขึ้น “ยังไม่มีวันวางบิล” (ไม่มีวันไหนถูกเติมเอง)",
  };
  const ok = () => {
    if (!scope) return;
    if (scope === "cust") onCustomer?.();
    else onConfirm?.(scope);
  };
  return (
    <Modal open onClose={onClose} size="sm" title="งวดนี้ต้องวางบิล"
      subtitle={`${orderCode ? `${orderCode} · ` : ""}งวด ${row.seq}${row.label ? ` · ${row.label}` : ""} · ${fmtMoney(row.amount)}`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" disabled={!scope} onClick={ok}
            icon={scope === "cust" ? <ExternalLink size={14} aria-hidden="true" /> : <CalendarDays size={14} aria-hidden="true" />}>
            {scope === "cust" ? "ไปตั้งที่ลูกค้า" : "เลือกวันวางบิล"}
          </Button>
        </>
      )}>
      <div className={styles.askBody}>
        <p className={styles.lead}>
          {customerCode ? <span className="nowrap">{customerCode} </span> : "ลูกค้า"}ตั้งไว้ว่า <b>ไม่ต้องวางบิล</b> — ครั้งนี้ลูกค้าขอใบวางบิล ใช้กับอะไร
        </p>
        <OptionTiles ariaLabel="ขอบเขตของข้อยกเว้น" value={scope} onChange={setScope}
          options={[
            { value: "one", label: "เฉพาะงวดนี้", description: `งวด ${row.seq} งวดเดียว` },
            { value: "so", label: "ทุกงวดที่ยังเปิดของใบนี้", description: `${openCount} งวด`, disabled: openCount < 1 },
            { value: "cust", label: "ลูกค้าต้องวางบิลทุกใบต่อจากนี้", description: "แก้ที่ทะเบียนลูกค้า" },
          ]} />
        {scope ? <p className={styles.askConsequence}>{consequence[scope]}</p> : <p className={styles.hint}>เลือกก่อน — ไม่มีค่าตั้งต้น</p>}
        <p className={styles.hint}>
          <History size={14} aria-hidden="true" />
          บันทึกเป็นข้อยกเว้นของงวด (มีผู้ยืนยัน · ลงประวัติของใบ) — ไม่มีสวิตช์ระดับใบ
        </p>
      </div>
    </Modal>
  );
}
