"use client";
// ── ช่องกรอก Ingredient List ของสูตร (ม-158 · มติเจ้าของ 03/11/2026) ─────────────────────────────
//
// ⭐ **ช่องเดียวทุกที่ที่กรอก** — โมดัลใส่ราคาในคำร้อง · หน้า "รอใส่ราคา" (ใช้ราคานี้) · การ์ดบนหน้าสูตร
//   (กฎ AGENTS.md: ของที่เหมือนกันต้องเป็น component เดียว — ป้าย/คำอธิบาย/เพดานความยาวไม่เพี้ยนหากัน)
//
// ⚠️ ไม่อยู่ใน `FormulaForm` โดยเจตนา (เหตุผลด้านข้อมูล) — ฟอร์มนั้นถูกใช้เป็นฟอร์มส่งงานและฟอร์มแก้ทะเบียนจากหน้าคำร้อง
//   ซึ่งประกอบ payload จากสูตรที่โหลดมาไม่ครบคอลัมน์ · ใส่ช่องนี้เข้าไปเมื่อไร การกดบันทึกจากหน้าคำร้องจะส่งค่าว่างทับ
//   Ingredient List ที่ RD ใส่ไว้แล้วเงียบ ๆ ⇒ เขียนผ่าน action เฉพาะของมัน (`ingredients` · ขั้นราคา) เหมือนราคา
import Textarea from "@/components/ui/Textarea";
import { INGREDIENT_LIST_LABEL, INGREDIENT_LIST_MAX_LENGTH } from "@/lib/master/ingredientList";
import styles from "./registryForm.module.css";

export default function IngredientListField({
  id = "ingredient-list",
  value = "",
  onChange,
  disabled = false,
  required = false,
  // ข้อความใต้ช่อง — ผู้เรียกบอกว่าค่าไปลงที่ไหน (เช่น "ลงทะเบียนสูตร PF1092901") · null = ข้อความมาตรฐาน
  hint = null,
}) {
  return (
    <div className="form-group">
      <label htmlFor={id}>
        {INGREDIENT_LIST_LABEL}
        {required && <span className="text-[var(--red)]"> *</span>}
      </label>
      <Textarea
        id={id} name="ingredientList" rows={4} value={value} disabled={disabled}
        maxLength={INGREDIENT_LIST_MAX_LENGTH}
        placeholder="เช่น Alcohol Denat., Parfum (Fragrance), Aqua, Limonene, Linalool"
        onChange={(e) => onChange(e.target.value)}
      />
      <small className={styles.hint}>
        {hint || "ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค — เก็บที่ทะเบียนสูตร หน้า FG และคำร้องที่ใช้สูตรนี้อ่านตัวเดียวกัน"}
      </small>
    </div>
  );
}
