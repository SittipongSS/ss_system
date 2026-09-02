"use client";
/* ── โมดัลฟอร์มกลิ่น — ใช้ร่วมหน้ารายการกับหน้ารายละเอียด (2026-08-19) ─────
 * เหตุผลและกฎเหมือน `FormulaFormModal` ทุกข้อ (ดูคอมเมนต์ที่นั่น)
 */
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ScentForm from "@/components/database/ScentForm";

export default function ScentFormModal({
  form, onChange, onClose, onSubmit, saving = false,
  customers = [], scents = [], perfumers = [],
  canSetCode = false, canSetLegacy = false, proposal = false,
}) {
  return (
    <Modal
      open={!!form} onClose={onClose} size="md" dismissible={!saving}
      /* ⚠️ หัวโมดัลต้องบอกผลลัพธ์จริงของคนกด (mig 0269) — ฝ่ายขายกดแล้วได้ **ร่าง**
         ไม่ใช่แถวในทะเบียน (toast บอกถูกมาตลอด แต่หัวเรื่องเคยสวนกันเอง) */
      title={form?.mode === "edit"
        ? `แก้ข้อมูลกลิ่น — ${form.scent?.name}`
        : (proposal ? "เสนอกลิ่นเข้าทะเบียน" : "เพิ่มกลิ่นเข้าทะเบียน")}
      footer={form && (
        <>
          <Button variant="quiet" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={onSubmit} disabled={saving}>บันทึก</Button>
        </>
      )}
    >
      {form && (
        <ScentForm
          perfumers={perfumers}
          mode={form.mode} value={form.value}
          customers={customers} scents={scents}
          editingId={form.scent?.id || null}
          canSetCode={canSetCode} canSetLegacy={canSetLegacy} proposal={proposal}
          disabled={saving}
          onChange={onChange}
        />
      )}
    </Modal>
  );
}
