"use client";
/* ── แก้จำนวนของรอบนี้ บนหน้าใบเสนอราคาค่าสรรพสามิต (ร่างที่ยังไม่ยื่น · แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11) ──────────────
   ตาราง = ExciseRoundQuantities ตัวเดียวกับหน้าออกใบ (AGENTS.md "แก้ไข = ฟอร์มตัวเดียวกับตอนสร้าง") · บันทึก = PATCH `exciseQuantities`
   ⇒ server คิดรายการใหม่จาก SO ต้นทางด้วยจำนวนนี้ (ราคา/ชิ้น ณ ตอนนี้) แล้วบันทึกทางเดียวกับ "คิดใหม่จากใบสั่งขาย"
   ⚠️ ปุ่มยืนยันกดไม่ได้เมื่อจำนวนเกินคงเหลือ/เป็นศูนย์ทุกบรรทัด — บอกเหตุใต้ตาราง (server ตรวจซ้ำ) */
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ExciseRoundQuantities, { roundInputsFrom, roundInputsOver, roundInputsPayload } from "@/components/excise/ExciseRoundQuantities";
import { roundQuantitiesOf } from "@/lib/excise/exciseRounds";
import styles from "./ExciseRoundQuantityDialog.module.css";

/**
 * @param open/onClose
 * @param rows       แถวคงเหลือ **ไม่นับใบนี้** (GET ใบ → `exciseRound.rows`)
 * @param lines      บรรทัดปัจจุบันของใบ — จำนวนตั้งต้นของช่องกรอก
 * @param onConfirm  `(exciseQuantities)` → Promise<boolean> (true = บันทึกแล้ว ปิดกล่อง)
 */
export default function ExciseRoundQuantityDialog({ open, rows = [], lines = [], round = null, busy = false, error = "", onConfirm, onClose }) {
  if (!open) return null;
  return (
    <ExciseRoundQuantityForm
      rows={rows} lines={lines} round={round} busy={busy} error={error} onConfirm={onConfirm} onClose={onClose}
    />
  );
}

/* ฟอร์มเกิดใหม่ทุกครั้งที่เปิด ⇒ ช่องกรอกตั้งต้นจากจำนวนของใบตอนเปิด (ไม่ค้างค่าที่พิมพ์ทิ้งไว้รอบก่อน) */
function ExciseRoundQuantityForm({ rows, lines, round, busy, error, onConfirm, onClose }) {
  const [values, setValues] = useState(() => roundInputsFrom(rows, roundQuantitiesOf(lines)));
  const over = roundInputsOver(rows, values);
  const payload = roundInputsPayload(values);
  const empty = !Object.values(payload).some((qty) => qty > 0);
  const blocker = over.length ? `จำนวนเกินคงเหลือ: ${over.join(", ")}` : empty ? "ต้องมีอย่างน้อยหนึ่งรายการที่จำนวนมากกว่า 0" : "";

  return (
    <Modal open onClose={onClose} title={round ? `แก้จำนวนรอบที่ ${round}` : "แก้จำนวนของรอบนี้"} size="lg" dismissible={!busy}>
      <div className={styles.body}>
        <p className={styles.description}>
          ใส่เฉพาะจำนวนที่ส่งรอบนี้ — ส่วนที่เหลือค้างไว้ออกใบรอบถัดไป · รายการคิดใหม่จากใบสั่งขายต้นทางตามจำนวนนี้ (ภาษี/ชิ้น ณ ตอนนี้)
        </p>
        <ExciseRoundQuantities
          rows={rows}
          values={values}
          editable={!busy}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        />
        {blocker ? <p className={styles.blocker}>{blocker}</p> : null}
        {error ? <div className={styles.danger} role="alert">{error}</div> : null}
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={() => onConfirm?.(payload)} disabled={busy || !!blocker}>
            {busy ? "กำลังบันทึก…" : "บันทึกจำนวน"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
