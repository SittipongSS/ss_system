"use client";
// ── ฟอร์มไซต์บริการ (mig 0187) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   site = null → โหมดสร้าง (ไม่มีช่องสถานะ — ของใหม่เริ่มที่เปิดใช้งานเสมอ)
//   site = row  → โหมดแก้ (มีช่องสถานะ)
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TimeInput from "@/components/ui/TimeInput";
import { WEEKDAY_LABELS, WEEKDAYS, normalizeSiteInput, toHHMM } from "@/lib/service/sites";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  customerId: "", name: "", routeZone: "", address: "", mapUrl: "",
  contactName: "", contactPhone: "",
  accessFrom: "", accessTo: "", accessDays: [], accessNote: "",
  note: "", isActive: true,
};

/* `defaults` = ค่าตั้งต้นของโหมด **สร้าง** เท่านั้น (แพตเทิร์นเดียวกับ ServiceVisitModal)
   ใช้ตอนที่ผู้เรียกรู้คำตอบอยู่แล้ว เช่น wizard รับใบสั่งขายซึ่งรู้ว่าลูกค้าคือใคร —
   ไม่ใช่ฟอร์มคนละชุด แค่โหมดที่กรอกช่องที่ตอบได้แล้วให้ล่วงหน้า */
export default function ServiceSiteModal({ open, site = null, customers = [], defaults = null, onClose, onSave }) {
  const editing = !!site;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(site
      ? {
        customerId: site.customerId || "",
        name: site.name || "",
        routeZone: site.routeZone || "",
        address: site.address || "",
        mapUrl: site.mapUrl || "",
        contactName: site.contactName || "",
        contactPhone: site.contactPhone || "",
        // Postgres คืน time เป็น '10:00:00' — ช่องกรอกรับ 'HH:MM'
        accessFrom: toHHMM(site.accessFrom),
        accessTo: toHHMM(site.accessTo),
        accessDays: Array.isArray(site.accessDays) ? site.accessDays : [],
        accessNote: site.accessNote || "",
        note: site.note || "",
        isActive: site.isActive !== false,
      }
      : { ...EMPTY, ...(defaults || {}) });
  }, [open, site, defaults]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const days = prev.accessDays.includes(day)
        ? prev.accessDays.filter((d) => d !== day)
        : [...prev.accessDays, day];
      return { ...prev, accessDays: days.sort((a, b) => a - b) };
    });
  };

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.name} (${c.arCode})` : c.name })),
    [customers],
  );

  const submit = async () => {
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขไซต์ ${site.name}` : "เพิ่มไซต์บริการ"} size="lg">
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>ลูกค้า *</span>
          <SearchableSelect
            value={form.customerId}
            onChange={(value) => setForm((prev) => ({ ...prev, customerId: value }))}
            options={customerOptions}
            entity="customer"
            placeholder="เลือกลูกค้า"
            ariaLabel="ลูกค้าเจ้าของไซต์"
          />
        </label>

        <label className={styles.field}>
          <span>ชื่อไซต์ *</span>
          <Input value={form.name} onChange={change("name")} placeholder="สาขาเอ็มควอเทียร์ ชั้น 3" maxLength={150} />
        </label>

        <label className={styles.field}>
          <span>เขตวิ่งงาน</span>
          <Input value={form.routeZone} onChange={change("routeZone")} placeholder="BKK-E / ปริมณฑล" maxLength={50} />
          <small>ใช้จัดรอบวิ่งให้ช่างไม่ต้องข้ามเมืองในวันเดียว</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>ที่อยู่</span>
          <Input as="textarea" rows={2} value={form.address} onChange={change("address")} maxLength={500} />
        </label>

        <label className={styles.field}>
          <span>ลิงก์แผนที่</span>
          <Input value={form.mapUrl} onChange={change("mapUrl")} placeholder="https://maps.app.goo.gl/..." maxLength={500} />
        </label>

        <label className={styles.field}>
          <span>ผู้ติดต่อหน้างาน</span>
          <Input value={form.contactName} onChange={change("contactName")} maxLength={100} />
        </label>

        <label className={styles.field}>
          <span>เบอร์ผู้ติดต่อ</span>
          <Input value={form.contactPhone} onChange={change("contactPhone")} maxLength={50} />
        </label>

        {/* ── ช่วงเวลาที่ไซต์ยอมให้เข้า ─────────────────────────────────── */}
        <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
          <legend>ช่วงเวลาที่เข้าไซต์ได้</legend>
          <p className={styles.hint}>
            ข้อจำกัดถาวรของไซต์ (ห้างเปิด 10:00 · โรงงานพัก 12:00–13:00) กรอกครั้งเดียวใช้ตลอด —
            คนละเรื่องกับเวลานัดแต่ละครั้ง · เว้นว่าง = เข้าได้ตลอดเวลาทำการ
          </p>
          <div className={styles.timeRow}>
            <label className={styles.timeField}>
              <span>ตั้งแต่</span>
              <TimeInput value={form.accessFrom} onChange={(value) => setForm((prev) => ({ ...prev, accessFrom: value }))} />
            </label>
            <label className={styles.timeField}>
              <span>ถึง</span>
              <TimeInput value={form.accessTo} onChange={(value) => setForm((prev) => ({ ...prev, accessTo: value }))} />
            </label>
          </div>
          <div className={styles.dayRow} role="group" aria-label="วันที่เข้าไซต์ได้">
            {WEEKDAYS.map((day) => (
              <label key={day} className={styles.dayChip}>
                <input type="checkbox" checked={form.accessDays.includes(day)} onChange={() => toggleDay(day)} />
                <span>{WEEKDAY_LABELS[day]}</span>
              </label>
            ))}
          </div>
          <p className={styles.hint}>ไม่ติ๊กเลย = เข้าได้ทุกวัน</p>
          <label className={styles.field}>
            <span>เงื่อนไขอื่น</span>
            <Input value={form.accessNote} onChange={change("accessNote")} placeholder="ต้องแลกบัตร · จอดรถชั้น B2" maxLength={1000} />
          </label>
        </fieldset>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>

        {/* โหมดสร้างไม่มีช่องสถานะ — ของใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
            <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
            <span>เปิดใช้งาน</span>
            <small>ปิดใช้งาน = ไซต์และประวัติยังอยู่ แต่ไม่ขึ้นในคิวจัดนัดอีก</small>
          </label>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มไซต์"}
        </Button>
      </div>
    </Modal>
  );
}
