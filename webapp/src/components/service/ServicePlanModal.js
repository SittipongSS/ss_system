"use client";
// ── ฟอร์มรอบบริการ (mig 0186) — ตัวเดียวใช้ทั้ง "สร้างรอบ" และ "แก้รอบ" ─────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { PLAN_KINDS, VISIT_KIND_LABELS, normalizePlanInput } from "@/lib/service/rounds";
import styles from "./ServiceSiteModal.module.css";

// ตัวเลือกรอบที่ใช้จริง — พิมพ์เองก็ยังได้ แต่ 4 ค่านี้ครอบเกือบทุกสัญญา
const EVERY_PRESETS = [
  { days: 7, label: 'ทุกสัปดาห์' },
  { days: 14, label: 'ทุก 2 สัปดาห์' },
  { days: 30, label: 'ทุกเดือน' },
  { days: 90, label: 'ทุกไตรมาส' },
];

const EMPTY = {
  kind: "refill", everyDays: 30, startDate: "", endDate: "",
  assigneeId: "", assigneeName: "", isActive: true, note: "",
};

export default function ServicePlanModal({ open, siteId, plan = null, technicians = [], onClose, onSave }) {
  const editing = !!plan;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(plan
      ? {
        kind: plan.kind || "refill",
        everyDays: plan.everyDays ?? 30,
        startDate: plan.startDate || "",
        endDate: plan.endDate || "",
        assigneeId: plan.assigneeId || "",
        assigneeName: plan.assigneeName || "",
        isActive: plan.isActive !== false,
        note: plan.note || "",
      }
      : EMPTY);
  }, [open, plan]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async () => {
    const payload = { ...form, siteId, everyDays: Number(form.everyDays) };
    const { error: invalid } = normalizePlanInput(payload);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "แก้รอบบริการ" : "สร้างรอบบริการ"} size="md">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>ชนิดงาน *</span>
          <Select value={form.kind} onChange={change("kind")}>
            {PLAN_KINDS.map((kind) => (
              <option key={kind} value={kind}>{VISIT_KIND_LABELS[kind]}</option>
            ))}
          </Select>
        </label>

        <label className={styles.field}>
          <span>รอบ (วัน) *</span>
          <Input type="number" min="1" max="365" value={form.everyDays} onChange={change("everyDays")} />
          <div className={styles.dayRow}>
            {EVERY_PRESETS.map((preset) => (
              <Button key={preset.days} tone="neutral" variant="quiet" size="sm"
                onClick={() => setForm((prev) => ({ ...prev, everyDays: preset.days }))}>
                {preset.label}
              </Button>
            ))}
          </div>
        </label>

        <label className={styles.field}>
          <span>เริ่มรอบ *</span>
          <DateInput value={form.startDate} onChange={(iso) => setForm((prev) => ({ ...prev, startDate: iso }))} />
        </label>

        <label className={styles.field}>
          <span>สิ้นสุดรอบ</span>
          <DateInput value={form.endDate} onChange={(iso) => setForm((prev) => ({ ...prev, endDate: iso }))} />
          <small>เว้นว่าง = ไม่มีกำหนดสิ้นสุด</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>ช่างประจำรอบ</span>
          <SearchableSelect
            value={form.assigneeId}
            onChange={(id) => {
              const tech = technicians.find((t) => t.id === id);
              setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
            }}
            options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="ยังไม่กำหนด"
            ariaLabel="ช่างประจำรอบ"
          />
          <small>เป็นค่าตั้งต้นของนัดที่ระบบสร้างให้ · ย้ายคนรายนัดได้ที่ตาราง</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>

        {/* โหมดสร้างไม่มีช่องสถานะ — รอบใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
            <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
            <span>เปิดใช้งาน</span>
            <small>ปิดรอบ = หยุดสร้างนัดใหม่ · นัดที่สร้างไว้แล้วยังอยู่บนตาราง</small>
          </label>
        )}
      </div>

      <p className={styles.hint}>
        ระบบสร้างนัดล่วงหน้า <strong>90 วัน</strong> เท่านั้น แล้วต่อรอบให้เมื่อปิดงานจริง —
        นัดที่สร้างไว้ทั้งปีคือแถวที่จะถูกเลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างรอบ + นัด"}
        </Button>
      </div>
    </Modal>
  );
}
