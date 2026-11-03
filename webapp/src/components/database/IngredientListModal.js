"use client";
// ── โมดัลใส่/แก้ Ingredient List ของสูตร (ม-159 · มติเจ้าของ 03/11/2026) ─────────────────────────────
//
// ⭐ **โมดัลเดียวสามทางเข้า** — การ์ดหน้าสูตร (`PATCH /api/master/formulas/[id]` action `ingredients`) · ปุ่มบนแถวคำร้อง
//   และหน้า "รอใส่ราคา" (`POST /api/sa/requests/[id]/items/[itemId]/ingredients`) · ทุกทางลงสูตรตัวเดียวกันผ่าน
//   `saveFormulaIngredientList` ⇒ ใส่ที่ไหนก็ปิดแถวที่ใส่ราคาแล้วรออยู่ให้ (กฎ AGENTS.md: ของเหมือนกัน = component เดียว)
// ⭐ ก้าวแยกจากราคา (ราคา/Ingredient List มาไม่พร้อมกัน) แต่แถวจบเมื่อครบทั้งสอง — ข้อความใต้ช่องบอกผลของการกด
//   (กติกา #1223 ทุกก้าวที่ปิดงานต้องบอกว่าจะเกิดอะไร)
// ⚠️ ตีกลับ = โชว์ในโมดัล ไม่ปิด (ของที่พิมพ์ไม่หาย)
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import IngredientListField from "@/components/database/IngredientListField";
import { apiJson } from "@/lib/apiFetch";
import { INGREDIENT_LIST_LABEL } from "@/lib/master/ingredientList";

export default function IngredientListModal({
  open,
  onClose,
  subtitle = "",       // รหัส · ชื่อสูตร
  current = null,      // ค่าที่สูตรมีอยู่ (เติมให้ตอนเปิด)
  required = true,     // สูตรหมวดที่ต้องมี — ลบทิ้งไม่ได้
  endpoint,
  method = "POST",
  extraBody = null,    // เช่น `{ action: "ingredients" }` ของ route สูตร
  hint = null,         // ผลของการกด (ผู้เรียกรู้บริบท) · null = ข้อความมาตรฐาน
  onSaved,             // (msg, data) => void
  onError = null,      // (error) => void — ผู้เรียกโหลดใหม่ (สถานะเปลี่ยนระหว่างเปิดโมดัล)
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initial = current || "";
  // โมดัลค้าง mount ระหว่างปิด/เปิด — เปิดใหม่ต้องได้ค่าของสูตรที่เพิ่งเลือก
  useEffect(() => {
    if (open) { setText(initial); setError(""); }
  }, [open, initial]);

  const close = () => { if (!saving) onClose(); };
  const save = async () => {
    setSaving(true); setError("");
    try {
      const data = await apiJson(endpoint, {
        method,
        json: { ...(extraBody || {}), ingredientList: text },
        fallbackError: `บันทึก ${INGREDIENT_LIST_LABEL} ไม่สำเร็จ`,
      });
      onSaved?.(`บันทึก ${INGREDIENT_LIST_LABEL} แล้ว`, data);
    } catch (e) {
      setError(e.message);
      onError?.(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open} onClose={close} size="sm" dismissible={!saving}
      title={`${current ? "แก้" : "ใส่"} ${INGREDIENT_LIST_LABEL}`}
      subtitle={subtitle}
      footer={(
        <>
          <Button variant="quiet" onClick={close} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={save} disabled={saving || (required && !text.trim())}>บันทึก</Button>
        </>
      )}
    >
      {error && <StatusNotice tone="danger" role="alert">{error}</StatusNotice>}
      <IngredientListField
        id="ingredient-list-modal" value={text} onChange={setText} disabled={saving} required={required}
        hint={hint}
      />
    </Modal>
  );
}
