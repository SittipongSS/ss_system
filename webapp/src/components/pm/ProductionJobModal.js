"use client";
// ── ฟอร์มงานผลิต (mig 0189) — ตัวเดียวใช้ทั้ง "สร้าง" และ "วางคิว/แก้" ─────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   job = null → โหมดสร้าง (ไม่มีช่องสถานะ/ผลจริง — งานใหม่เริ่มที่ "ร่าง")
//   job = row  → โหมดแก้ (มีสถานะ + วางไลน์ + ผลผลิตจริง)
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  jobDateRange,
  jobWarnings,
  normalizeJobInput,
} from "@/lib/pm/productionPlan";
import styles from "./ProductionJobModal.module.css";

const EMPTY = {
  productName: "", fgCode: "", qty: "", unit: "", dueDate: "",
  lineId: "", plannedStart: "", ratePerDay: "",
  status: "draft", actualStart: "", actualFinish: "", qtyProduced: "", note: "",
};

export default function ProductionJobModal({ open, job = null, lines = [], onClose, onSave }) {
  const editing = !!job;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(job
      ? {
        productName: job.productName || "",
        fgCode: job.fgCode || "",
        qty: job.qty == null ? "" : String(job.qty),
        unit: job.unit || "",
        dueDate: job.dueDate || "",
        lineId: job.lineId || "",
        plannedStart: job.plannedStart || "",
        ratePerDay: job.ratePerDay == null ? "" : String(job.ratePerDay),
        status: job.status || "draft",
        actualStart: job.actualStart || "",
        actualFinish: job.actualFinish || "",
        qtyProduced: job.qtyProduced == null ? "" : String(job.qtyProduced),
        note: job.note || "",
      }
      : EMPTY);
  }, [open, job]);

  const change = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const line = useMemo(() => lines.find((l) => l.id === form.lineId) || null, [lines, form.lineId]);

  // ⭐ พรีวิวแผนสด ๆ ระหว่างกรอก — PC เห็นว่าวางแล้วจบวันไหนก่อนกดบันทึก
  // ไม่ใช่บันทึกแล้วค่อยไปดูที่บอร์ด
  const preview = useMemo(
    () => jobDateRange({ ...form, qty: Number(form.qty), ratePerDay: form.ratePerDay === "" ? null : Number(form.ratePerDay), dayOverrides: job?.dayOverrides || {} }, line),
    [form, line, job?.dayOverrides],
  );

  // **เตือน ไม่บล็อก** — โรงงานจริงมี OT และของอาจมาก่อนกำหนด
  const warnings = useMemo(
    () => jobWarnings(
      { ...form, qty: Number(form.qty), ratePerDay: form.ratePerDay === "" ? null : Number(form.ratePerDay), dayOverrides: job?.dayOverrides || {} },
      line,
      { readiness: job?.readiness || null },
    ),
    [form, line, job?.readiness, job?.dayOverrides],
  );

  const submit = async () => {
    const { error: invalid } = normalizeJobInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `งานผลิต ${job.code || ""}`.trim() : "สร้างงานผลิต"} size="lg">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>สินค้า *</span>
          <Input value={form.productName} onChange={change("productName")} placeholder="ชื่อสินค้าที่ผลิต" maxLength={200} />
        </label>

        <label className={styles.field}>
          <span>รหัส FG</span>
          <Input value={form.fgCode} onChange={change("fgCode")} mono maxLength={50} />
        </label>

        <label className={styles.field}>
          <span>จำนวน *</span>
          <Input type="number" min="0" step="any" value={form.qty} onChange={change("qty")} />
        </label>

        <label className={styles.field}>
          <span>หน่วย</span>
          <Input value={form.unit} onChange={change("unit")} placeholder="ชิ้น / กก." maxLength={30} />
          {/* หน่วยของงานยึดหน่วยของไลน์ที่จอง (มติ §10.1) */}
          {line?.unit && <small>ไลน์นี้คิดกำลังเป็น {line.unit}</small>}
        </label>

        <label className={styles.field}>
          <span>กำหนดส่ง</span>
          <DateInput value={form.dueDate} onChange={(iso) => setForm((p) => ({ ...p, dueDate: iso }))} />
        </label>

        <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
          <legend>วางคิวผลิต</legend>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>ไลน์ผลิต</span>
              <SearchableSelect
                value={form.lineId}
                onChange={(value) => setForm((p) => ({ ...p, lineId: value }))}
                options={lines.filter((l) => l.isActive !== false).map((l) => ({
                  value: l.id,
                  label: l.capacityPerDay ? `${l.name} (${l.code}) · ${l.capacityPerDay} ${l.unit || ""}/วัน` : `${l.name} (${l.code})`,
                }))}
                placeholder="ยังไม่วางไลน์"
                ariaLabel="ไลน์ผลิต"
              />
            </label>
            <label className={styles.field}>
              <span>เริ่มผลิต</span>
              <DateInput value={form.plannedStart} onChange={(iso) => setForm((p) => ({ ...p, plannedStart: iso }))} />
            </label>
            <label className={styles.field}>
              <span>อัตราต่อวัน</span>
              <Input type="number" min="0" step="any" value={form.ratePerDay} onChange={change("ratePerDay")} placeholder="ตามกำลังไลน์" />
            </label>
          </div>
          <p className={styles.hint}>
            {preview
              ? `แผน: ${preview.start} – ${preview.finish} (${preview.days} วันทำการ)`
              : "ยังคำนวณแผนไม่ได้ — ต้องมีไลน์ + วันเริ่ม และไลน์ต้องมีกำลังผลิต (หรือระบุอัตราต่อวันเอง)"}
          </p>
        </fieldset>

        {/* โหมดสร้างไม่มีสถานะ/ผลจริง — งานใหม่เริ่มที่ "ร่าง" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <>
            <label className={styles.field}>
              <span>สถานะ</span>
              <Select value={form.status} onChange={change("status")}>
                {JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>{JOB_STATUS_LABELS[status]}</option>
                ))}
              </Select>
            </label>

            <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
              <legend>ผลผลิตจริง</legend>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>เริ่มจริง</span>
                  <DateInput value={form.actualStart} onChange={(iso) => setForm((p) => ({ ...p, actualStart: iso }))} />
                </label>
                <label className={styles.field}>
                  <span>จบจริง</span>
                  <DateInput value={form.actualFinish} onChange={(iso) => setForm((p) => ({ ...p, actualFinish: iso }))} />
                </label>
                <label className={styles.field}>
                  <span>ผลิตได้จริง</span>
                  <Input type="number" min="0" step="any" value={form.qtyProduced} onChange={change("qtyProduced")} />
                </label>
              </div>
            </fieldset>
          </>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>
      </div>

      {warnings.length > 0 && (
        <ul className={styles.warnList}>
          {warnings.map((warning) => (
            <li key={warning.kind}>
              <AlertTriangle size={14} aria-hidden="true" />
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างงานผลิต"}
        </Button>
      </div>
    </Modal>
  );
}
