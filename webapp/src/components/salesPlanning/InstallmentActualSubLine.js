"use client";
// ── บรรทัดรองใต้ยอดของใบ SO "Actual รายงวด" (mig 0412) — ตัวเดียวทุกตาราง SO (ทะเบียน SO · หน้าดีล · หน้าโครงการ) ──
//
// ⭐ คำมาจาก `installmentActualSubParts` (lib/sales/dealAmountDisplay — ท่อนละคู่ "ป้าย ฿ยอด") · ข้อความรวมเท่ากับ
//   `installmentActualSubLine` ทุกตัวอักษร (ช่องค้นหาของทะเบียนใช้ตัวนั้น — ตาเห็น = ค้นเจอ)
// ⭐ แต่ละท่อนห่อด้วย `keepPhrases` (components/ThaiText — ตัวหนังสือไม่ถูกแตะ) ⇒ ตัดบรรทัดได้เฉพาะที่ " · " ระหว่างท่อน
//   🐞 UAT 27/10 ข้อ 4–5: คอลัมน์ยอดของตาราง SO หน้าดีลแคบ — "รอนับรายงวด" ขาดเป็น "รอนับราย / งวด" และป้ายแยกจากตัวเลข
// ⚠️ ใบที่ไม่ใช่ใบรายงวดที่นับอยู่ = ไม่เรนเดอร์ (ผู้เรียกเช็ก `installmentActualSubLine` ก่อนเพื่อเลือกยอดหลักอยู่แล้ว)
// ⭐ `compact` = ตารางแคบ (ตาราง SO ของหน้าดีล) — ตัวเล็กลงขนาดหมายเหตุรอง ท่อนที่กว้างสุดจึงพอดีคอลัมน์ยอดโดยไม่ดันตารางเกินกล่อง
import { keepPhrases } from "@/components/ThaiText";
import { installmentActualSubParts } from "@/lib/sales/dealAmountDisplay";
import styles from "./InstallmentActualSubLine.module.css";

export default function InstallmentActualSubLine({ order, compact = false }) {
  const parts = installmentActualSubParts(order);
  if (!parts) return null;
  return (
    <span className={compact ? `cell-sub ${styles.compact}` : "cell-sub"}>
      {keepPhrases(parts.join(" · "), parts)}
    </span>
  );
}
