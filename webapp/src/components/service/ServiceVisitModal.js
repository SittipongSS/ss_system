"use client";
// ── ฟอร์มนัดเข้าบริการ (mig 0188) — ตัวเดียวใช้ทั้ง "นัดใหม่" และ "แก้นัด" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   visit = null → โหมดสร้าง (ไม่มีช่องสถานะ/ผลการเข้า — นัดใหม่เริ่มที่ 'นัดไว้')
//   visit = row  → โหมดแก้ (มีสถานะ + วันเวลาที่เข้าจริง + สรุปงาน)
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import TimeInput from "@/components/ui/TimeInput";
import { accessWindowText } from "@/lib/service/sites";
import { evaluateVisitGate, gateBlocker, gatePassed } from "@/lib/service/visitGate";
import {
  TIME_PRESETS,
  VISIT_KINDS,
  VISIT_KIND_LABELS,
  VISIT_STATUSES_MANUAL,
  VISIT_STATUS_LABELS,
  isReschedule,
  normalizeVisitInput,
  visitWarnings,
} from "@/lib/service/rounds";
import UpdateThread from "@/components/updates/UpdateThread";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  siteId: "", kind: "refill", scheduledDate: "", startTime: "", endTime: "",
  assigneeId: "", assigneeName: "", status: "scheduled",
  actualDate: "", actualStartTime: "", actualEndTime: "", summary: "", note: "",
  rescheduleReason: "",
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
        rescheduleReason: "",   // ไม่ค้างจากรอบก่อน — เหตุผลผูกกับการเลื่อนครั้งนี้เท่านั้น
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

  // ⭐ เลื่อนนัด = เปลี่ยน **วัน** ของนัดที่ยังไม่ปิด → ต้องมีเหตุผล (S-5)
  // เปลี่ยนเวลาในวันเดิมไม่นับ (ขยับ 30 นาทีเพราะรถติดไม่ต้องอธิบายให้ลูกค้าฟัง)
  const rescheduling = useMemo(
    () => isReschedule(visit, { ...form, scheduledDate: form.scheduledDate }),
    [visit, form],
  );

  // ⭐ ด่านคำนวณจาก **ค่าที่กำลังกรอก** ไม่ใช่ค่าที่บันทึกไว้ — เลือกช่างในฟอร์มแล้ว
  // ข้อ 3 ต้องติ๊กทันที ไม่ต้องกดบันทึกก่อนถึงจะรู้ว่าผ่านหรือยัง
  // ⚠️ ตัวเดียวกับที่ server ใช้ปฏิเสธ (visitGate.js) — ห้ามคิดเงื่อนไขซ้ำตรงนี้
  const gate = useMemo(
    () => evaluateVisitGate({ ...form, id: visit?.id }, { site }),
    [form, site, visit?.id],
  );
  const canQueue = gatePassed(gate);

  const applyPreset = (preset) =>
    setForm((prev) => ({ ...prev, startTime: preset.startTime, endTime: preset.endTime }));

  const pickTechnician = (id) => {
    const tech = technicians.find((t) => t.id === id);
    setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
  };

  const submit = async (override = null) => {
    const payload = override ? { ...form, ...override } : form;
    const { error: invalid } = normalizeVisitInput(payload);
    if (invalid) { setError(invalid); return; }
    // ตรวจฝั่งหน้าจอด้วย เพื่อให้ผู้ใช้เห็นก่อนกด ไม่ใช่โดน server ตีกลับ
    if (rescheduling && !form.rescheduleReason.trim()) {
      setError("เลื่อนนัดต้องระบุเหตุผล");
      return;
    }
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้นัด ${visit.code || ""}`.trim() : "นัดเข้าบริการ"} size="lg">
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>ไซต์ *</span>
          <SearchableSelect
            value={form.siteId}
            onChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
            options={sites.map((s) => ({
              value: s.id,
              label: s.routeZone ? `${s.name} · ${s.routeZone}` : s.name,
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

        {/* ⭐ ช่องนี้โผล่เฉพาะตอนเลื่อนวันจริง — บังคับกรอกเพราะลูกค้าถามทีหลังว่า
            "ทำไมช่างไม่มาสักที" ต้องตอบได้ว่าเลื่อนกี่ครั้งเพราะอะไร · เหตุผลลงเธรด
            ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียวถูกเขียนทับทุกครั้งที่เลื่อน */}
        {rescheduling && (
          <label className={`${styles.field} ${styles.wide}`}>
            <span>เหตุผลที่เลื่อน *</span>
            <Input
              value={form.rescheduleReason}
              onChange={change("rescheduleReason")}
              placeholder="เช่น ลูกค้าขอเลื่อน · ห้างปิดปรับปรุง · ช่างติดงานด่วน"
              maxLength={500}
            />
            <small>เลื่อนจาก {visit.scheduledDate} → {form.scheduledDate} · เหตุผลจะถูกบันทึกลงความเคลื่อนไหวของนัดนี้</small>
          </label>
        )}

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
            {/* ⚠️ ไม่ใช่ทุกสถานะเลือกมือได้ — `in_progress` · `done` · `partial` เกิดจาก
                **ปุ่มที่ประทับเวลา** เท่านั้น ถ้าปล่อยให้เลือกจากดรอปดาวน์ ทั้งเจตนา
                ของการ stamp ที่ server ก็หมดความหมาย (มติ 2026-08-02 ข้อ 5) */}
            <label className={styles.field}>
              <span>สถานะ</span>
              <Select value={form.status} onChange={change("status")}
                disabled={!VISIT_STATUSES_MANUAL.includes(form.status)}>
                {(VISIT_STATUSES_MANUAL.includes(form.status)
                  ? VISIT_STATUSES_MANUAL
                  : [form.status]
                ).map((status) => (
                  <option key={status} value={status}>{VISIT_STATUS_LABELS[status]}</option>
                ))}
              </Select>
              {!VISIT_STATUSES_MANUAL.includes(form.status) && (
                <small className={styles.hint}>สถานะนี้มาจากปุ่มเริ่มงาน/ปิดงานของช่าง แก้จากที่นี่ไม่ได้</small>
              )}
            </label>

            {/* ⭐ ด่านเข้าไซต์ — ร่างขึ้นตารางได้ต่อเมื่อผ่านด่าน (มติผู้ใช้ 2026-08-28)
                แสดงเป็น **รายการติ๊กพร้อมชื่อคนที่แก้ได้** ไม่ใช่ปุ่มเทา —
                ด่านที่ไม่บอกเหตุผลคือด่านที่คนหาทางอ้อม (§6 ข้อบังคับ 1) */}
            {visit?.status === "draft" && (
              <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
                <legend>ด่านก่อนขึ้นตาราง</legend>
                <p className={styles.hint}>
                  ร่างไม่ขึ้นตาราง ไม่นับภาระของช่าง และไม่โผล่ในงานวันนี้ — ผ่านครบแล้วกด “ปล่อยเข้าคิว”
                </p>
                <ul className={styles.gate}>
                  {gate.map((item) => (
                    <li key={item.key} data-state={item.state}>
                      <span className={styles.gateMark} aria-hidden="true">
                        {item.state === "ok" ? "✓" : item.state === "parked" ? "–" : "!"}
                      </span>
                      <span className={styles.gateText}>
                        <b>{item.label}</b>
                        {item.detail && <span>{item.detail}</span>}
                      </span>
                      <span className={styles.gateOwner}>{item.owner}</span>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

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

      {/* ⚠️ เธรดไม่ถูกปิดตามสถานะนัด — ช่วงที่นัดถูกเลื่อน/ยกเลิก/ติดปัญหา คือช่วงที่
          มีเรื่องต้องเล่ามากที่สุด (กฎเดียวกับ canEditX ที่ห้ามคุมเธรดในโมดูลอื่น) */}
      {editing && (
        <div className={styles.thread}>
          <h3 className={styles.threadTitle}>ความเคลื่อนไหวของนัดนี้</h3>
          <UpdateThread
            entityType="service_visit"
            entityId={visit.id}
            order="desc"
            placeholder="พิมพ์บันทึกหน้างาน เช่น ลูกค้าแจ้งว่าเครื่องมีเสียงดัง..."
            emptyText="ยังไม่มีความเคลื่อนไหว"
          />
        </div>
      )}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        {/* ⭐ ปุ่มนี้ **โชว์เสมอตอนเป็นร่าง** ต่อให้ยังผ่านด่านไม่ครบ — บอกเหตุตอนกด
            ปุ่มที่หายไปไม่ได้สอนใครว่าต้องไปแก้อะไร (GatedAction §มติ 2026-08-22) */}
        {visit?.status === "draft" && (
          <GatedAction
            tone="primary" variant="quiet" disabled={saving}
            blocker={canQueue ? "" : gateBlocker(gate)}
            onClick={() => submit({ status: "scheduled" })}
          >
            ปล่อยเข้าคิว
          </GatedAction>
        )}
        <Button tone="primary" onClick={() => submit()} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างนัด"}
        </Button>
      </div>
    </Modal>
  );
}
