"use client";
/* ── ปิด/เปิดยอดค้างค่าสรรพสามิตบน SO ลูกค้า (แบ่งรอบ · แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V11 · D17) ──────────────
   เหตุผล 10–500 ตัวอักษร — กติกาชุดเดียวกับ route (`exciseRemainderReasonInput`) · ปุ่มยืนยันบอกเหตุเมื่อยังไม่ครบ
   ปิด = ไม่ออกรอบใหม่ (รอบที่ออกไปแล้วเดินต่อ) · เปิดกลับ = ออกรอบถัดไปได้อีก */
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { fmtNumber } from "@/lib/format";
import { EXCISE_REMAINDER_REASON_MAX, EXCISE_REMAINDER_REASON_MIN, exciseRemainderReasonInput } from "@/lib/excise/exciseRemainder";
import styles from "./ExciseRemainderDialog.module.css";

/**
 * @param mode       "close" | "reopen"
 * @param remaining  `{ remainingUnits, remainingLines }` (โหมดปิด — บอกว่าจะปิดอะไร)
 * @param onConfirm  `(reason)` — ผู้เรียกยิง PATCH แล้วปิดกล่องเมื่อสำเร็จ
 */
export default function ExciseRemainderDialog({ mode = "close", orderNumber, remaining = null, busy = false, error = "", onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const checked = exciseRemainderReasonInput({ reason });
  const closing = mode === "close";

  const confirm = () => {
    setTouched(true);
    if (checked.error) return;
    onConfirm?.(checked.value);
  };

  return (
    <Modal open onClose={onClose} title={closing ? "ปิดยอดค้างค่าสรรพสามิต" : "เปิดยอดค้างค่าสรรพสามิตกลับ"} size="sm" dismissible={!busy}>
      <div className={styles.body}>
        <p className={styles.description}>
          {orderNumber ? `${orderNumber} — ` : ""}
          {closing
            ? `ส่วนที่ยังค้าง${remaining ? ` ${fmtNumber(remaining.remainingUnits)} หน่วย (${remaining.remainingLines} รายการ)` : ""} จะไม่ออกใบเสนอราคาค่าสรรพสามิตอีก · รอบที่ออกไปแล้วเดินต่อตามเดิม · เปิดกลับได้ถ้ากดผิด`
            : "กลับมาออกใบเสนอราคาค่าสรรพสามิตรอบถัดไปจากยอดที่ค้างได้อีก"}
        </p>
        <label className="form-group">
          <span>เหตุผล *</span>
          <Textarea
            rows={3}
            touch={touched}
            required
            minLength={EXCISE_REMAINDER_REASON_MIN}
            maxLength={EXCISE_REMAINDER_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            placeholder={closing ? "เช่น ลูกค้าลดจำนวนสั่ง ส่วนที่เหลือไม่ส่งแล้ว" : "เช่น ปิดผิดใบ ลูกค้ายังรับส่วนที่เหลือ"}
          />
          <small className={touched && checked.error ? styles.error : styles.help}>
            {touched && checked.error
              ? checked.error
              : `${reason.trim().length}/${EXCISE_REMAINDER_REASON_MAX} · อย่างน้อย ${EXCISE_REMAINDER_REASON_MIN} ตัวอักษร`}
          </small>
        </label>
        {error ? <div className={styles.danger} role="alert">{error}</div> : null}
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button tone={closing ? "warning" : undefined} onClick={confirm} disabled={busy}>
            {busy ? "กำลังบันทึก…" : closing ? "ยืนยัน ปิดยอดค้าง" : "ยืนยัน เปิดยอดค้างกลับ"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
