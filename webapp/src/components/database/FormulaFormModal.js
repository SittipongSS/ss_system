"use client";
/* ── โมดัลฟอร์มสูตร — ใช้ร่วมหน้ารายการกับหน้ารายละเอียด (2026-08-19) ──────
 *
 * ⭐ **ทำไมต้องมีตัวนี้** — เดิมปุ่ม "แก้ไขข้อมูล" บนหน้ารายละเอียด `router.push`
 * กลับไปหน้ารายการพร้อม `?edit=` ⇒ คนที่กำลังอ่านรายละเอียดอยู่ **ถูกเด้งออกจาก
 * หน้าที่ดูอยู่** และหลังบันทึกก็ค้างที่หน้ารายการ ไม่ได้กลับมาที่ตัวที่เพิ่งแก้
 * (ผู้ใช้ทัก 2026-08-19: "ตอนแก้ไขในรายละเอียดทะเบียน กลิ่นและสูตร มันเด้ง")
 *
 * ⚠️ **ห้ามก๊อปฟอร์มไปไว้อีกจอ** (กฎ AGENTS.md) — เปลือกโมดัล + ฟอร์ม + ปุ่ม
 * อยู่ในไฟล์นี้ไฟล์เดียว สองจอเรียกใช้ตัวเดียวกัน · ตัวสร้าง payload อยู่ที่
 * `formulaFormPayload` ใน lib ⇒ ไม่มีทางเลื่อนออกจากกัน
 */
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import FormulaForm from "@/components/database/FormulaForm";

export default function FormulaFormModal({
  form, onChange, onClose, onSubmit, saving = false,
  customers = [], scents = [], formulas = [], categories = [], canSetCode = false,
}) {
  return (
    <Modal
      open={!!form} onClose={onClose} size="md" dismissible={!saving}
      title={form?.mode === "edit" ? `แก้ข้อมูลสูตร — ${form.formula?.name}` : "เพิ่มสูตรเข้าทะเบียน"}
      footer={form && (
        <>
          <Button variant="quiet" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="accent" onClick={onSubmit} disabled={saving}>บันทึก</Button>
        </>
      )}
    >
      {form && (
        <FormulaForm
          mode={form.mode} value={form.value}
          customers={customers} scents={scents} formulas={formulas} categories={categories}
          editingId={form.formula?.id || null}
          canSetCode={canSetCode} disabled={saving}
          onChange={onChange}
        />
      )}
    </Modal>
  );
}
