"use client";
import { CalendarClock } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import { fmtDate } from "@/lib/format";
import { EXCISE_DELIVERY_DATE_TEXT, exciseSubmitDeliveryView } from "@/lib/excise/exciseDeliveryDate";
import styles from "./ExciseSubmitDeliveryDate.module.css";

/**
 * กล่อง "วันที่ส่งของ" ในโมดัลยื่นอนุมัติ SO ค่าสรรพสามิต
 * · มติเจ้าของ 25/11/2026 "วันที่ส่งของต้อง pop ให้เห็นก่อนยื่นอนุมัติ" + ดูจอแล้ว "pop วันที่ส่งของ สามารถแก้ได้ด้วย เผื่อแก้ก่อนกดยื่น"
 * · วางเป็น `lead` ของ ConfirmDialog = อยู่ใต้คำถาม เหนือรายการผลลัพธ์ · ช่องเป็นของผู้เรียก (`value`/`onChange`) — ปุ่มยื่นส่งค่านี้ไปกับคำขอ
 * · ผลกับ SO ต้นทางคิดสดจากวันในช่อง (`exciseSubmitDeliveryView` — lib/excise/exciseDeliveryDate.js) ที่นี่วาดอย่างเดียว
 */
export default function ExciseSubmitDeliveryDate({ order, source = null, value = "", onChange, disabled = false }) {
  const view = value ? exciseSubmitDeliveryView({ ...order, deliveryDueDate: value }, source) : null;
  const saved = order?.deliveryDueDate || "";
  const changed = Boolean(value) && value !== saved;
  return (
    <div className={styles.box} data-testid="excise-submit-delivery-date">
      <div className={styles.head}>
        <CalendarClock size={16} aria-hidden="true" />
        <span className={styles.label}>
          {EXCISE_DELIVERY_DATE_TEXT.label} <span className="required-mark">*</span>
        </span>
      </div>
      <DateInput
        value={value || ""}
        onChange={(next) => onChange(next || "")}
        disabled={disabled}
        invalid={!value}
        ariaLabel={EXCISE_DELIVERY_DATE_TEXT.label}
      />
      {view ? (
        <>
          {changed ? (
            <p className={styles.changed}>
              {saved ? `แก้จาก ${fmtDate(saved)} — ` : ""}กดยื่นแล้วระบบบันทึกวันนี้ลงใบก่อนยื่น
            </p>
          ) : null}
          <p className={styles.effect}>{view.effect}</p>
          <p className={styles.note}>{view.note}</p>
        </>
      ) : (
        <p className={styles.missing} role="alert">{EXCISE_DELIVERY_DATE_TEXT.submitEmpty}</p>
      )}
    </div>
  );
}
