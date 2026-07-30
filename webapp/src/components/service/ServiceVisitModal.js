"use client";
// ── ฟอร์มนัดเข้าบริการ (mig 0186) — ตัวเดียวใช้ทั้ง "นัดใหม่" และ "แก้นัด" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   visit = null → โหมดสร้าง (ไม่มีช่องสถานะ/ผลการเข้า — นัดใหม่เริ่มที่ 'นัดไว้')
//   visit = row  → โหมดแก้ (มีสถานะ + วันเวลาที่เข้าจริง + สรุปงาน)
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import TimeInput from "@/components/ui/TimeInput";
import { accessWindowText } from "@/lib/service/sites";
import {
  TIME_PRESETS,
  VISIT_KINDS,
  VISIT_KIND_LABELS,
  VISIT_STATUSES,
  VISIT_STATUS_LABELS,
  normalizeVisitInput,
  visitWarnings,
} from "@/lib/service/rounds";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  siteId: "", kind: "refill", scheduledDate: "", startTime: "", endTime: "",
  assigneeId: "", assigneeName: "", status: "scheduled",
  actualDate: "", actualStartTime: "", actualEndTime: "", summary: "", note: "",
};

export default function ServiceVisitModal({
  open, visit = null, sites = [], technicians = [], defaults = null, onClose, onSave,
}) {
  const editing = !!visit;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (visit) {
      setForm({
        siteId: visit.siteId || "",
        kind: visit.kind || "refill",
        scheduledDate: visit.scheduledDate || "",
        startTime: (visit.startTime || "").slice(0, 5),
        endTime: (visit.endTime || "").slice(0, 5),
        assigneeId: visit.assigneeId || "",
        assigneeName: visit.assigneeName || "",
        status: visit.status || "scheduled",
        actualDate: visit.actualDate || "",
        actualStartTime: (visit.actualStartTime || "").slice(0, 5),
        actualEndTime: (visit.actualEndTime || "").slice(0, 5),
        summary: visit.summary || "",
        note: visit.note || "",
      });
    } else {
      // คลิกช่องว่างบนปฏิทิน = รู้วันและช่างอยู่แล้ว — เติมให้เลย
      setForm({ ...EMPTY, ...(defaults || {}) });
    }
  }, [open, visit, defaults]);

  const change = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const site = useMemo(() => sites.find((s) => s.id === form.siteId) || null, [sites, form.siteId]);

  // ⭐ เตือนสด ๆ ระหว่างกรอก — ผู้ใช้เห็นก่อนกดบันทึก ไม่ใช่หลังบันทึกแล้วงง
  // **เตือน ไม่บล็อก**: ลูกค้าอนุโลมเป็นครั้ง ๆ ได้ · ระบบที่บล็อกจะถูกเลี่ยงไปนัดนอกระบบ
  const warnings = useMemo(
    () => visitWarnings({ ...form, id: visit?.id }, { site }),
    [form, site, visit?.id],
  );

  const applyPreset = (preset) =>
    setForm((prev) => ({ ...prev, startTime: preset.startTime, endTime: preset.endTime }));

  const pickTechnician = (id) => {
    const tech = technicians.find((t) => t.id === id);
    setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
  };

  const submit = async () => {
    const { error: invalid } = normalizeVisitInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้นัด ${visit.code || ""}`.trim() : "นัดเข้าบริการ"} size="lg">
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>ไซต์ *</span>
          <SearchableSelect
            value={form.siteId}
            onChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
            options={sites.map((s) => ({
              value: s.id,
              label: s.zone ? `${s.name} · ${s.zone}` : s.name,
            }))}
            placeholder="เลือกไซต์"
            ariaLabel="ไซต์ที่จะเข้า"
          />
          {site && accessWindowText(site) && (
            <small>ไซต์นี้ให้เข้า {accessWindowText(site)}{site.accessNote ? ` · ${site.accessNote}` : ""}</small>
          )}
        </label>

        <label className={styles.field}>
          <span>ชนิดงาน *</span>
          <Select value={form.kind} onChange={change("kind")}>
            {VISIT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{VISIT_KIND_LABELS[kind]}</option>
            ))}
          </Select>
        </label>

        <label className={styles.field}>
          <span>วันที่นัด *</span>
          <DateInput value={form.scheduledDate} onChange={(iso) => setForm((prev) => ({ ...prev, scheduledDate: iso }))} />
        </label>

        <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
          <legend>เวลานัด</legend>
          <div className={styles.dayRow}>
            {/* ⭐ เช้า/บ่าย/เต็มวัน เป็น **ปุ่มลัดที่เติมเวลาให้** ไม่ใช่ค่าที่เก็บใน DB —
                เก็บทั้ง slot และเวลาจริงเมื่อไหร่ ก็เพี้ยนหากันเมื่อนั้น */}
            {TIME_PRESETS.map((preset) => (
              <Button key={preset.key} tone="neutral" variant="quiet" size="sm" onClick={() => applyPreset(preset)}>
                {preset.label}
              </Button>
            ))}
            <Button tone="neutral" variant="quiet" size="sm" onClick={() => setForm((prev) => ({ ...prev, startTime: "", endTime: "" }))}>
              ล้างเวลา
            </Button>
          </div>
          <div className={styles.timeRow}>
            <label className={styles.timeField}>
              <span>ตั้งแต่</span>
              <TimeInput value={form.startTime} onChange={(value) => setForm((prev) => ({ ...prev, startTime: value }))} />
            </label>
            <label className={styles.timeField}>
              <span>ถึง</span>
              <TimeInput value={form.endTime} onChange={(value) => setForm((prev) => ({ ...prev, endTime: value }))} />
            </label>
          </div>
          <p className={styles.hint}>เว้นว่าง = นัดไว้ทั้งวัน ยังไม่ระบุเวลา</p>
        </fieldset>

        <label className={styles.field}>
          <span>ช่างผู้รับผิดชอบ</span>
          <SearchableSelect
            value={form.assigneeId}
            onChange={pickTechnician}
            options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="ยังไม่มอบหมาย"
            ariaLabel="ช่างผู้รับผิดชอบ"
          />
        </label>

        {/* โหมดสร้างไม่มีสถานะ/ผลการเข้า — นัดใหม่เริ่มที่ "นัดไว้" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <>
            <label className={styles.field}>
              <span>สถานะ</span>
              <Select value={form.status} onChange={change("status")}>
                {VISIT_STATUSES.map((status) => (
                  <option key={status} value={status}>{VISIT_STATUS_LABELS[status]}</option>
                ))}
              </Select>
            </label>

            <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
              <legend>ผลการเข้าจริง</legend>
              <p className={styles.hint}>
                รอบถัดไปนับจาก <strong>วันที่เข้าจริง</strong> ไม่ใช่วันที่นัดไว้ — เข้าช้า รอบหน้าขยับตาม
              </p>
              <div className={styles.timeRow}>
                <label className={styles.timeField}>
                  <span>วันที่เข้าจริง</span>
                  <DateInput value={form.actualDate} onChange={(iso) => setForm((prev) => ({ ...prev, actualDate: iso }))} />
                </label>
                <label className={styles.timeField}>
                  <span>เริ่ม</span>
                  <TimeInput value={form.actualStartTime} onChange={(value) => setForm((prev) => ({ ...prev, actualStartTime: value }))} />
                </label>
                <label className={styles.timeField}>
                  <span>เสร็จ</span>
                  <TimeInput value={form.actualEndTime} onChange={(value) => setForm((prev) => ({ ...prev, actualEndTime: value }))} />
                </label>
              </div>
              <label className={styles.field}>
                <span>สรุปงานที่ทำ</span>
                <Input as="textarea" rows={2} value={form.summary} onChange={change("summary")} maxLength={2000} />
              </label>
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
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างนัด"}
        </Button>
      </div>
    </Modal>
  );
}
