"use client";
// ── ฟอร์มโซนบริการ (mig 0297) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   zone = null → โหมดสร้าง (ไม่มีช่องสถานะ — โซนใหม่เริ่มที่ "ใช้งาน" เสมอ)
//   zone = row  → โหมดแก้ (มีช่องเปิด/ปิดใช้งาน)
// ⭐ ช่องทั้งหมด (รวมจุดติดตั้ง mig 0353) อยู่ที่ `ServiceZoneFields` — ใช้ร่วมกับโมดัล
//   เพิ่มไซต์ย้อนหลัง (2026-09-11) · ไฟล์นี้เหลือแค่เปลือกโมดัล + ด่านก่อนส่ง
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ServiceZoneFields, { ZONE_FORM_EMPTY, zoneFormFromRow } from "./ServiceZoneFields";
import { normalizeZoneInput } from "@/lib/service/zones";

export default function ServiceZoneModal({ open, zone = null, onClose, onSave }) {
  const editing = !!zone;
  const [form, setForm] = useState(ZONE_FORM_EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(zone ? zoneFormFromRow(zone) : ZONE_FORM_EMPTY);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขโซน ${zone.name}` : "เพิ่มโซน"} size="md">
      <ServiceZoneFields form={form} setForm={setForm} editing={editing} zoneCode={zone?.code || null} />

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
