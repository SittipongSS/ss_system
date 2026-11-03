"use client";

/* ── การ์ด Ingredient List บนหน้าสูตร (ม-158 · มติเจ้าของ 03/11/2026 · mig 0423) ─────────────────────────
   ⭐ หนึ่งสูตร = หนึ่ง Ingredient List — แถวคำร้องที่ใช้สูตรหมวด 01/02 (ยกเว้น 02-020) ต้องมีครบ (ราคา + Ingredient List) ถึงจบ
   · แก้ได้ = RD + ผู้ดูแล (`isFormulaRegistrar` ตัวเดียวกับ API action `ingredients`) · คนอื่นอ่าน/คัดลอกได้อย่างเดียว
   · สูตรหัวน้ำหอม (02-020) ไม่ต้องมี ⇒ ผู้เรียกไม่วางการ์ดนี้ (เว้นแต่มีค่าค้างอยู่ — ยังโชว์ให้เห็น)
   · ม-159 — โมดัลตัวเดียวกับปุ่มบนแถวคำร้อง/หน้า "รอใส่ราคา" (`IngredientListModal`) · บันทึกแล้วแถวที่ใส่ราคาไว้รออยู่จบเอง
   ⚠️ บันทึกผ่าน action เฉพาะ ไม่ใช่ฟอร์มแก้สูตร — ดูเหตุที่หัว `IngredientListField` */
import { useState } from "react";
import { ListChecks, Pencil } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import IngredientListModal from "@/components/database/IngredientListModal";
import IngredientListText from "@/components/database/IngredientListText";
import { INGREDIENT_LIST_LABEL, formulaNeedsIngredientList } from "@/lib/master/ingredientList";
import styles from "./registryForm.module.css";

export default function IngredientListCard({ formula, canEdit = false, onSaved }) {
  const required = formulaNeedsIngredientList(formula);
  const current = formula?.ingredientList || "";
  const [open, setOpen] = useState(false);

  return (
    <DetailCard icon={ListChecks} eyebrow="INGREDIENTS" title={INGREDIENT_LIST_LABEL}>
      <IngredientListText
        text={current || null}
        lines={6}
        empty={required ? "ยังไม่มี — รายการคำร้องที่ใช้สูตรนี้ต้องมีก่อนจบงาน" : "ยังไม่มี"}
      />
      {canEdit && (
        <div className={styles.ingredientActions}>
          <Button size="sm" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setOpen(true)}>
            {current ? "แก้ไข" : `ใส่ ${INGREDIENT_LIST_LABEL}`}
          </Button>
        </div>
      )}

      <IngredientListModal
        open={open}
        onClose={() => setOpen(false)}
        subtitle={`${formula?.code ? `${formula.code} · ` : ""}${formula?.name || ""}`}
        current={current || null}
        required={required}
        endpoint={`/api/master/formulas/${formula?.id}`}
        method="PATCH"
        extraBody={{ action: "ingredients" }}
        hint={required
          ? "ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค — หน้า FG และคำร้องที่ใช้สูตรนี้อ่านตัวเดียวกัน · รายการที่ใส่ราคาไว้แล้วจบเมื่อบันทึก · ลบทิ้งไม่ได้"
          : null}
        onSaved={(msg, data) => {
          setOpen(false);
          const settled = data?.settledRows?.length || 0;
          onSaved?.(data, settled ? `${msg} · ${settled} รายการในคำร้องครบแล้ว` : msg);
        }}
      />
    </DetailCard>
  );
}
