"use client";
// ── ฟอร์มเครื่องกระจายกลิ่น (mig 0185) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   asset = null → โหมดสร้าง (ไม่มีช่องสถานะ — เครื่องใหม่เริ่มที่ 'ใช้งาน' เสมอ)
//   asset = row  → โหมดแก้ (มีช่องสถานะ + วันที่ถอด)
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ASSET_STATUSES, ASSET_STATUS_LABELS, normalizeAssetInput } from "@/lib/service/sites";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  label: "", model: "", serial: "", productName: "",
  bottleMl: "", mlPerDay: "", installedAt: "", removedAt: "",
  status: "active", note: "",
};

export default function ServiceAssetModal({ open, asset = null, onClose, onSave }) {
  const editing = !!asset;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(asset
      ? {
        label: asset.label || "",
        model: asset.model || "",
        serial: asset.serial || "",
        productName: asset.productName || "",
        // null (ยังไม่รู้อัตราใช้) ต้องกลับมาเป็นช่องว่าง ไม่ใช่ "0"
        bottleMl: asset.bottleMl == null ? "" : String(asset.bottleMl),
        mlPerDay: asset.mlPerDay == null ? "" : String(asset.mlPerDay),
        installedAt: asset.installedAt || "",
        removedAt: asset.removedAt || "",
        status: asset.status || "active",
        note: asset.note || "",
      }
      : EMPTY);
  }, [open, asset]);

  const change = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async () => {
    const { error: invalid } = normalizeAssetInput(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขเครื่อง ${asset.label}` : "เพิ่มเครื่อง"} size="md">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>ชื่อ / ตำแหน่ง *</span>
          <Input value={form.label} onChange={change("label")} placeholder="เครื่องล็อบบี้ (ซ้าย)" maxLength={150} />
        </label>

        <label className={styles.field}>
          <span>รุ่น</span>
          <Input value={form.model} onChange={change("model")} maxLength={100} />
        </label>

        <label className={styles.field}>
          <span>Serial</span>
          <Input value={form.serial} onChange={change("serial")} mono maxLength={100} />
          <small>ห้ามซ้ำทั้งระบบ — ถ้าย้ายเครื่องไปไซต์ใหม่ ให้แก้ไซต์ของเครื่องเดิม ไม่ใช่สร้างใหม่</small>
        </label>

        <label className={styles.field}>
          <span>กลิ่นที่เติม</span>
          <Input value={form.productName} onChange={change("productName")} maxLength={200} />
        </label>

        <label className={styles.field}>
          <span>ขนาดขวด (ml)</span>
          <Input type="number" min="0" step="any" value={form.bottleMl} onChange={change("bottleMl")} />
        </label>

        <label className={styles.field}>
          <span>อัตราใช้ต่อวัน (ml)</span>
          <Input type="number" min="0" step="any" value={form.mlPerDay} onChange={change("mlPerDay")} />
          <small>กรอกทั้งคู่แล้วระบบจะประเมินได้ว่าน้ำหอมจะหมดวันไหน · เว้นว่าง = ไม่เดาให้</small>
        </label>

        <label className={styles.field}>
          <span>วันที่ติดตั้ง</span>
          <DateInput value={form.installedAt} onChange={(iso) => setForm((prev) => ({ ...prev, installedAt: iso }))} />
        </label>

        {/* โหมดสร้างไม่มีสถานะ/วันถอด — เครื่องใหม่เริ่มที่ "ใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <>
            <label className={styles.field}>
              <span>สถานะ</span>
              <Select value={form.status} onChange={change("status")}>
                {ASSET_STATUSES.map((status) => (
                  <option key={status} value={status}>{ASSET_STATUS_LABELS[status]}</option>
                ))}
              </Select>
            </label>
            <label className={styles.field}>
              <span>วันที่ถอด</span>
              <DateInput value={form.removedAt} onChange={(iso) => setForm((prev) => ({ ...prev, removedAt: iso }))} />
            </label>
          </>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มเครื่อง"}
        </Button>
      </div>
    </Modal>
  );
}
