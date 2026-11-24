"use client";
/* ── บรรทัดเหตุผลตีกลับในแถวตาราง (เจ้าของ 24/11/2026 "โชว์เหตุผลตีกลับในตาราง SO ของบริหารงานขาย") ─────────────────
   ชิ้นเดียวของสองเรื่องบนแถวใบสั่งขาย: ใบที่ AE Sup ตีกลับ (ใต้รางขั้น) · งวดที่บัญชีตีกลับ (ใต้ชิปงวด — InstallmentsCell)
   ⭐ ข้อความที่คนพิมพ์ ยาวได้ ⇒ ReadableText ตัดสามบรรทัด + ปุ่ม "อ่านทั้งหมด" (ปุ่ม stopPropagation — ไม่คลิกทะลุไปเปิดใบ)
   ⭐ เพดานกว้างกันคอลัมน์ถ่างจนตารางเลื่อนข้าง (มติ 09/11: จอ 1440 ต้องไม่มีเลื่อนข้าง) */
import ReadableText from "@/components/ui/ReadableText";
import styles from "./RejectReasonLine.module.css";

export default function RejectReasonLine({ text, className = "" }) {
  if (!text) return null;
  return (
    <ReadableText text={text} lines={3} empty={null}
      className={`cell-sub cell-num-bad ${styles.reason} ${className}`.trim()} />
  );
}
