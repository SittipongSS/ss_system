"use client";
// ── ช่องหมายเหตุรายการบนหน้าใบสั่งขาย — โหมด "แก้ไขข้อมูล" ของใบร่าง/ตีกลับ (มติเจ้าของ 25/11/2026) ─────────
//
// วางใต้คำอธิบายของบรรทัดในตารางรายการ (`QuotationReadOnlyLineItems.renderLineNote`) ตรงที่ตารางอ่านอย่างเดียว
// โชว์ "หมายเหตุ: …" · ช่องนี้เป็น **ช่องของฟอร์ม** ไม่มีปุ่มบันทึกของตัวเอง — ค่าที่พิมพ์ไปกับ "บันทึกร่าง"
// (ลูปปกติ: สร้าง → แก้ไขข้อมูล → บันทึกร่าง → ยื่น → อนุมัติ · เหตุผลเต็มที่ `lib/sales/salesOrderLineNote.js`)
// ⚠️ หน้าวาดตัวนี้เฉพาะตอนอยู่ในโหมดแก้ (ใบร่าง/ตีกลับ) — นอกโหมดแก้ตารางโชว์หมายเหตุอ่านอย่างเดียวตามเดิม
import Textarea from "@/components/ui/Textarea";
import { SO_LINE_NOTE_TEXT, lineNoteTooLong } from "@/lib/sales/salesOrderLineNote";
import styles from "./SalesOrderLineNote.module.css";

/**
 * @param value     ข้อความในช่อง (ร่างที่พิมพ์ค้าง หรือหมายเหตุเดิมของบรรทัด)
 * @param index     ลำดับในตาราง (0-based) — ใช้ในชื่อที่โปรแกรมอ่านจอพูด
 * @param fromMaster ข้อความยังเป็นของทะเบียนสินค้า (`metadata.noteAuto`) — บอกว่าแก้แล้วเป็นของใบนี้
 * @param disabled  กำลังบันทึก
 * @param onChange  `(text) => void`
 */
export default function SalesOrderLineNote({ value = "", index = 0, fromMaster = false, disabled = false, onChange }) {
  const tooLong = lineNoteTooLong(value);
  return (
    <span className={styles.field}>
      <span className={styles.label}>{SO_LINE_NOTE_TEXT.label}</span>
      <Textarea
        rows={2}
        value={value}
        disabled={disabled}
        invalid={tooLong}
        placeholder={SO_LINE_NOTE_TEXT.placeholder}
        aria-label={`${SO_LINE_NOTE_TEXT.label} รายการ ${index + 1}`}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {tooLong ? <span className={styles.error} role="alert">{SO_LINE_NOTE_TEXT.tooLong}</span> : null}
      <span className={styles.hint}>
        {fromMaster ? "หมายเหตุตั้งต้นจากทะเบียนสินค้า — แก้เฉพาะใบนี้ได้ · " : ""}{SO_LINE_NOTE_TEXT.hint}
      </span>
    </span>
  );
}
