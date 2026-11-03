"use client";
// ── อ่าน Ingredient List ของสูตร + ปุ่มคัดลอก (ม-158) — หน้าสูตร · หน้า FG ใช้ตัวเดียวกัน ──────────────
//
// ⭐ ปุ่มคัดลอกเพราะของนี้ถูกเอาไปวางต่อ (ฉลาก · จดแจ้ง · ส่งลูกค้า) — ลากคลุมข้อความยาวที่ถูกพับไว้พลาดง่าย
// ⚠️ ว่าง = ข้อความ "ยังไม่มี" ที่ผู้เรียกส่งมา (`empty`) ไม่ใช่ซ่อน — ช่องหายแยกไม่ออกจาก "ไม่ต้องมี"
import { Copy } from "lucide-react";
import Button from "@/components/ui/Button";
import ReadableText from "@/components/ui/ReadableText";
import { notifyToast } from "@/lib/feedback";
import { INGREDIENT_LIST_LABEL } from "@/lib/master/ingredientList";
import styles from "./registryForm.module.css";

export default function IngredientListText({ text = null, lines = 4, empty = "ยังไม่มี" }) {
  if (!text) return <p className={styles.muted}>{empty}</p>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifyToast(`คัดลอก ${INGREDIENT_LIST_LABEL} แล้ว`);
    } catch {
      notifyToast.error("คัดลอกไม่สำเร็จ — ลากคลุมข้อความแล้วคัดลอกเองแทน");
    }
  };
  return (
    <div className={styles.ingredientBlock}>
      <ReadableText text={text} lines={lines} className={styles.ingredientText} />
      <div>
        <Button size="sm" variant="quiet" icon={<Copy size={14} aria-hidden="true" />} onClick={copy}>
          คัดลอก
        </Button>
      </div>
    </div>
  );
}
