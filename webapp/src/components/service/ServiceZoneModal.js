"use client";
// ── ฟอร์มโซนบริการ (mig 0297) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   zone = null → โหมดสร้าง (ไม่มีช่องสถานะ — โซนใหม่เริ่มที่ "ใช้งาน" เสมอ)
//   zone = row  → โหมดแก้ (มีช่องเปิด/ปิดใช้งาน)
//
// ⚠️ "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception) — คนละเรื่องกับ "เขตวิ่งงาน"
// (routeZone) ที่อยู่บนฟอร์มไซต์
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { normalizeZoneInput } from "@/lib/service/zones";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = { name: "", note: "", isActive: true };

export default function ServiceZoneModal({ open, zone = null, onClose, onSave }) {
  const editing = !!zone;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(zone
      ? { name: zone.name || "", note: zone.note || "", isActive: zone.isActive !== false }
      : EMPTY);
  }, [open, zone]);

  const submit = async () => {
    const { error: invalid } = normalizeZoneInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขโซน ${zone.name}` : "เพิ่มโซน"} size="sm">
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>ชื่อโซน *</span>
          <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Lobby / ห้องน้ำชั้น 2" maxLength={150} />
          <small>พื้นที่ย่อยในไซต์ที่ติดตามการใช้/รอบบริการแยกกัน — ไม่ใช่เขตวิ่งงานของช่าง</small>
        </label>

        {/* โหมดสร้างไม่มีสถานะ — โซนใหม่เริ่มที่ "ใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={styles.field}>
            <span>สถานะ</span>
            {/* สองค่า = ปุ่มติ๊กตรง ๆ ไม่ใช่ dropdown (กติกา direct controls) */}
            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              <span>ใช้งานอยู่ — ปิดเมื่อพื้นที่นี้เลิกให้บริการ (ประวัติยังอยู่)</span>
            </label>
          </label>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} maxLength={1000} />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มโซน"}
        </Button>
      </div>
    </Modal>
  );
}
