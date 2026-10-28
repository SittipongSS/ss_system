"use client";
/* ── "ไม่เรียกเก็บค่าสรรพสามิตในระบบ" บน SO ลูกค้า (แผนรื้อสรรพสามิต หมวด 3.5 · มติ Q6/Q7 28/10/2026) ──────────────
   SA เลือกเหตุ (ไทล์ — ตัวเลือก 3 ข้อโชว์ตรง ๆ ไม่ใช่ดรอปดาวน์) + เหตุผล 10–500 ตัวอักษร + เลขอ้างอิง (ไม่บังคับ)
   ⚠️ กติกา/ข้อความชุดเดียวกับ route (`exciseNotBilledInput`) — ปุ่มยืนยันกดได้เมื่อ route จะรับ */
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import {
  EXCISE_NOT_BILLED_KINDS, EXCISE_NOT_BILLED_REASON_MAX, EXCISE_NOT_BILLED_REASON_MIN, EXCISE_NOT_BILLED_REF_MAX,
  exciseNotBilledInput,
} from "@/lib/excise/exciseNotBilled";
import styles from "./ExciseNotBilledDialog.module.css";

const KIND_OPTIONS = Object.entries(EXCISE_NOT_BILLED_KINDS)
  .map(([value, meta]) => ({ value, label: meta.label, description: meta.hint }));

export default function ExciseNotBilledDialog({ open, orderNumber, busy = false, error = "", onConfirm, onClose }) {
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [touched, setTouched] = useState(false);
  const checked = exciseNotBilledInput({ kind, reason, ref });
  const count = `${reason.trim().length}/${EXCISE_NOT_BILLED_REASON_MAX}`;

  const confirm = () => {
    setTouched(true);
    if (checked.error) return;
    onConfirm?.(checked.value);
  };

  return (
    <Modal open={open} onClose={onClose} title="ไม่เรียกเก็บค่าสรรพสามิตในระบบ" size="sm" dismissible={!busy}>
      <div className={styles.body}>
        <p className={styles.description}>
          {orderNumber ? `${orderNumber} — ` : ""}จะไม่ออกใบเสนอราคาค่าสรรพสามิตของใบนี้ ฝ่าย RA ยังยื่นกรมตามเดิม
          (ยกเว้น “ไม่ต้องเสียภาษี”) · ถอนการตัดสินได้จนกว่า RA จะสร้างใบยื่น
        </p>
        <div className="form-group">
          <span>เหตุที่ไม่เรียกเก็บ *</span>
          <OptionTiles
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            ariaLabel="เหตุที่ไม่เรียกเก็บในระบบ"
            invalid={touched && !kind}
            disabled={busy}
          />
        </div>
        <label className="form-group">
          <span>เหตุผล *</span>
          <Textarea
            rows={3}
            touch={touched}
            required
            minLength={EXCISE_NOT_BILLED_REASON_MIN}
            maxLength={EXCISE_NOT_BILLED_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          <small className={touched && checked.error ? styles.error : styles.help}>
            {touched && checked.error ? checked.error : `${count} · อย่างน้อย ${EXCISE_NOT_BILLED_REASON_MIN} ตัวอักษร`}
          </small>
        </label>
        <label className="form-group">
          <span>เลขอ้างอิง (ไม่บังคับ)</span>
          <Input
            value={ref}
            maxLength={EXCISE_NOT_BILLED_REF_MAX}
            onChange={(event) => setRef(event.target.value)}
            placeholder="เลขบิล Express / เลขใบเสนอราคาที่รวมค่าภาษีไว้"
            disabled={busy}
          />
        </label>
        {error ? <div className={styles.danger} role="alert">{error}</div> : null}
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button tone="warning" onClick={confirm} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "ยืนยัน ไม่เรียกเก็บในระบบ"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
