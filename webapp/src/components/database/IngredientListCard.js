"use client";

/* ── การ์ด Ingredient List บนหน้าสูตร (ม-158 · มติเจ้าของ 03/11/2026 · mig 0423) ─────────────────────────
   ⭐ หนึ่งสูตร = หนึ่ง Ingredient List — ขั้นราคาของคำร้องบังคับใส่ (สูตรหมวด 01/02 ยกเว้น 02-020) · ที่นี่คือที่ RD แก้ทีหลัง
   · แก้ได้ = RD + ผู้ดูแล (`isFormulaRegistrar` ตัวเดียวกับ API action `ingredients`) · คนอื่นอ่าน/คัดลอกได้อย่างเดียว
   · สูตรหัวน้ำหอม (02-020) ไม่ต้องมี ⇒ ผู้เรียกไม่วางการ์ดนี้ (เว้นแต่มีค่าค้างอยู่ — ยังโชว์ให้เห็น)
   ⚠️ บันทึกผ่าน action เฉพาะ ไม่ใช่ฟอร์มแก้สูตร — ดูเหตุที่หัว `IngredientListField` */
import { useState } from "react";
import { ListChecks, Pencil } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import IngredientListField from "@/components/database/IngredientListField";
import IngredientListText from "@/components/database/IngredientListText";
import { apiJson } from "@/lib/apiFetch";
import { INGREDIENT_LIST_LABEL, formulaNeedsIngredientList } from "@/lib/master/ingredientList";
import styles from "./registryForm.module.css";

export default function IngredientListCard({ formula, canEdit = false, onSaved }) {
  const required = formulaNeedsIngredientList(formula);
  const current = formula?.ingredientList || "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = () => { setDraft(current); setError(""); setOpen(true); };
  const save = async () => {
    setSaving(true); setError("");
    try {
      const data = await apiJson(`/api/master/formulas/${formula.id}`, {
        method: "PATCH",
        json: { action: "ingredients", ingredientList: draft },
        fallbackError: `บันทึก ${INGREDIENT_LIST_LABEL} ไม่สำเร็จ`,
      });
      setOpen(false);
      onSaved?.(data, `บันทึก ${INGREDIENT_LIST_LABEL} แล้ว`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailCard icon={ListChecks} eyebrow="INGREDIENTS" title={INGREDIENT_LIST_LABEL}>
      <IngredientListText
        text={current || null}
        lines={6}
        empty={required ? "ยังไม่มี — ต้องใส่ก่อนปิดขั้นราคาของคำร้องที่ใช้สูตรนี้" : "ยังไม่มี"}
      />
      {canEdit && (
        <div className={styles.ingredientActions}>
          <Button size="sm" icon={<Pencil size={14} aria-hidden="true" />} onClick={openModal}>
            {current ? "แก้ไข" : `ใส่ ${INGREDIENT_LIST_LABEL}`}
          </Button>
        </div>
      )}

      <Modal
        open={open} onClose={() => !saving && setOpen(false)} size="sm" dismissible={!saving}
        title={`${current ? "แก้" : "ใส่"} ${INGREDIENT_LIST_LABEL}`}
        subtitle={`${formula?.code ? `${formula.code} · ` : ""}${formula?.name || ""}`}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setOpen(false)} disabled={saving}>ยกเลิก</Button>
            {/* สูตรที่ต้องมี ลบทิ้งไม่ได้ — server ตีกลับเหมือนกัน (`ingredients` action) */}
            <Button tone="primary" onClick={save} disabled={saving || (required && !draft.trim())}>บันทึก</Button>
          </>
        )}
      >
        {error && <StatusNotice tone="danger" role="alert">{error}</StatusNotice>}
        <IngredientListField
          id="formula-ingredients" value={draft} onChange={setDraft} disabled={saving} required={required}
          hint={required
            ? "ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค — หน้า FG และคำร้องที่ใช้สูตรนี้อ่านตัวเดียวกัน · ลบทิ้งไม่ได้ (สูตรหมวดนี้ต้องมี)"
            : null}
        />
      </Modal>
    </DetailCard>
  );
}
