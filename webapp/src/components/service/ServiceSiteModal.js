"use client";
// ── ฟอร์มไซต์บริการ (mig 0187) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   site = null → โหมดสร้าง (ไม่มีช่องสถานะ — ของใหม่เริ่มที่เปิดใช้งานเสมอ)
//   site = row  → โหมดแก้ (มีช่องสถานะ)
// ⭐ ช่องทั้งหมดอยู่ที่ `ServiceSiteFields` (ใช้ร่วมกับโมดัลเพิ่มไซต์ย้อนหลัง — 2026-09-11)
//   ไฟล์นี้เหลือแค่เปลือกโมดัล + ด่านก่อนส่ง
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ServiceSiteFields, { useServiceSiteForm } from "./ServiceSiteFields";
import { normalizeSiteInput } from "@/lib/service/sites";

/* `defaults` = ค่าตั้งต้นของโหมด **สร้าง** เท่านั้น (แพตเทิร์นเดียวกับ ServiceVisitModal)
   ใช้ตอนที่ผู้เรียกรู้คำตอบอยู่แล้ว เช่น wizard รับใบสั่งขายซึ่งรู้ว่าลูกค้าคือใคร —
   ไม่ใช่ฟอร์มคนละชุด แค่โหมดที่กรอกช่องที่ตอบได้แล้วให้ล่วงหน้า */
/* `noun` = คำที่ **จอผู้เรียกใช้เรียกของสิ่งนี้**
   🐞 ปุ่มในใบคำร้องเขียน "สร้างสถานที่ใหม่" แต่โมดัลที่เปิดขึ้นมาหัวเรื่อง "เพิ่มไซต์บริการ"
      และปุ่มบันทึก "เพิ่มไซต์" ⇒ สามคำสำหรับของชิ้นเดียวในสองคลิก · ผู้ขอที่ไม่ได้อยู่ฝ่าย
      TS ไม่รู้ว่า "ไซต์" คือสิ่งเดียวกับ "สถานที่" ที่เขาเพิ่งกด
   ⚠️ ค่าตั้งต้นยังเป็น "ไซต์บริการ" — ทะเบียนของฝ่าย TS เรียกแบบนั้นจริง ไม่ใช่คำที่ผิด */
export default function ServiceSiteModal({
  open, site = null, customers = [], customerAddresses = [], defaults = null,
  noun = 'ไซต์บริการ', onClose, onSave,
}) {
  const editing = !!site;
  const ctl = useServiceSiteForm({ open, site, defaults, customerAddresses });
  const { form } = ctl;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const submit = async () => {
    /* ⚠️ **จังหวัดบังคับเฉพาะตอนสร้าง** — `normalizeSiteInput` จงใจไม่บังคับ (ไซต์ยุค
       ก่อน mig 0315 ต้องยังแก้ช่องอื่นได้) ⇒ ด่านของ "ใบใหม่" อยู่ที่ route และที่นี่
       ⭐ บอกตั้งแต่บนจอ ดีกว่าปล่อยให้กดบันทึกแล้วเจอ 400 จาก server */
    if (!editing && !form.provinceCode) {
      setError('ต้องเลือกจังหวัดของไซต์ — รหัสไซต์ประกอบจากภาคและจังหวัด');
      return;
    }
    // validate ด้วยตัวเดียวกับฝั่ง server — ข้อความผิดพลาดตรงกันคำต่อคำ
    const { error: invalid } = normalizeSiteInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไข${noun} ${site.name}` : `เพิ่ม${noun}`} size="lg">
      <ServiceSiteFields ctl={ctl} customers={customers} />

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : `เพิ่ม${noun}`}
        </Button>
      </div>
    </Modal>
  );
}
