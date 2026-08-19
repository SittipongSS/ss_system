"use client";
/* ── โมดัลฟอร์มกลิ่น — ใช้ร่วมหน้ารายการกับหน้ารายละเอียด (2026-08-19) ─────
 * เหตุผลและกฎเหมือน `FormulaFormModal` ทุกข้อ (ดูคอมเมนต์ที่นั่น)
 */
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ScentForm from "@/components/database/ScentForm";

export default function ScentFormModal({
  form, onChange, onClose, onSubmit, saving = false,
  customers = [], scents = [], canSetCode = false,
}) {
  return (
    <Modal
      open={!!form} onClose={onClose} size="md" dismissible={!saving}
      title={form?.mode === "edit" ? `แก้ข้อมูลกลิ่น — ${form.scent?.name}` : "เพิ่มกลิ่นเข้าทะเบียน"}
      footer={form && (
        <>
          <Button variant="quiet" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="accent" onClick={onSubmit} disabled={saving}>บันทึก</Button>
        </>
      )}
    >
      {form && (
        <ScentForm
          mode={form.mode} value={form.value}
          customers={customers} scents={scents}
          editingId={form.scent?.id || null}
          canSetCode={canSetCode} disabled={saving}
          onChange={onChange}
        />
      )}
    </Modal>
  );
}
