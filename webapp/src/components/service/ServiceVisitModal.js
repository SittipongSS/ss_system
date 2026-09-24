"use client";
// ── ฟอร์มนัดเข้าบริการ (mig 0188) — ตัวเดียวใช้ทั้ง "นัดใหม่" และ "แก้นัด" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   visit = null → โหมดสร้าง (ไม่มีช่องสถานะ/ผลการเข้า — นัดใหม่เริ่มที่ 'นัดไว้')
//   visit = row  → โหมดแก้ (มีสถานะ + วันเวลาที่เข้าจริง + สรุปงาน)
//   focusField / staffLoadFor → โหมดของ "รายการงาน" บนจอจัดคิว (มติ 2026-09-22) ไม่ใช่ฟอร์มที่สอง
//   onDelete → ปุ่ม "ลบนัด" ของงานนอกรอบในโหมดแก้ (มติเจ้าของ 24/09) — ไม่ส่ง = ไม่มีปุ่ม (ไม่มีสิทธิ์)
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import TimeInput from "@/components/ui/TimeInput";
import { accessWindowText } from "@/lib/service/sites";
import { evaluateVisitGate, gateBlocker, gatePassed, gateReasons, gateSummary } from "@/lib/service/visitGate";
import { visitDeleteButton } from "@/lib/service/visitDelete";
import { canOverrideServiceGate } from "@/lib/permissions";
import { useRole } from "@/lib/roleContext";
import {
  TIME_PRESETS,
  VISIT_KINDS_MANUAL,
  VISIT_KIND_LABELS,
  VISIT_STATUSES_MANUAL,
  VISIT_STATUS_LABELS,
  isReschedule,
  normalizeVisitInput,
  visitWarnings,
} from "@/lib/service/rounds";
import UpdateThread from "@/components/updates/UpdateThread";
import CrewLoadPicker from "./CrewLoadPicker";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  siteId: "", kind: "refill", scheduledDate: "", startTime: "", endTime: "",
  assigneeId: "", assigneeName: "", assistantIds: [], status: "scheduled",
  actualDate: "", actualStartTime: "", actualEndTime: "", summary: "", note: "",
  rescheduleReason: "", unableReason: "",
};

/* แถวนัด → ค่าของฟอร์ม · ตัวเดียวที่ทั้งโมดัลนี้ (ตอนเปิดแก้) และปุ่ม "ปล่อยขึ้นตาราง" ลัดบนรายการงาน
   ใช้ประกอบ body ของ PATCH (`{ ...visitToForm(v), status: "scheduled" }`)
   ⚠️ ห้ามให้จอแม่ก๊อปแมปปิ้งนี้ไปเขียนเอง — ช่องที่ขาดไปหนึ่งช่องใน PATCH คือค่าที่ถูกล้างเงียบ ๆ
   และสองชุดที่ต่างกันจะทำให้ "ปล่อยจากรายการ" กับ "ปล่อยจากโมดัล" บันทึกคนละผล */
export function visitToForm(visit) {
  if (!visit) return { ...EMPTY };
  return {
    siteId: visit.siteId || "",
    kind: visit.kind || "refill",
    scheduledDate: visit.scheduledDate || "",
    startTime: (visit.startTime || "").slice(0, 5),
    endTime: (visit.endTime || "").slice(0, 5),
    assigneeId: visit.assigneeId || "",
    assigneeName: visit.assigneeName || "",
    assistantIds: Array.isArray(visit.assistantIds) ? visit.assistantIds : [],
    status: visit.status || "scheduled",
    actualDate: visit.actualDate || "",
    actualStartTime: (visit.actualStartTime || "").slice(0, 5),
    actualEndTime: (visit.actualEndTime || "").slice(0, 5),
    summary: visit.summary || "",
    note: visit.note || "",
    rescheduleReason: "",   // ไม่ค้างจากรอบก่อน — เหตุผลผูกกับการเลื่อนครั้งนี้เท่านั้น
    unableReason: visit.unableReason || "",
  };
}

/* ตัวที่รับโฟกัสได้ในกล่องของช่อง — ช่องเป็น component กลาง (SearchableSelect · DateInput)
   ที่ไม่ส่ง ref ออกมา จึงหาจากกล่องที่ห่อแทน */
const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ServiceVisitModal({
  gateContext = null,   // บริบทด่าน ①② (โซน · รอบขาย · ใบ · งวด · สัญญา) จากจอแม่
  open, visit = null, sites = [], technicians = [], defaults = null, onClose, onSave,
  /* ช่องที่จะพาโฟกัสไปตอนเปิด: 'assignee' | 'scheduledDate' | null — ปุ่ม "เลือกเจ้าหน้าที่" /
     "แก้วัน/เวลา" บนรายการงานเปิดโมดัลนี้เพื่อแก้ช่องเดียว ต้องไม่ให้คนไล่หาเองทั้งฟอร์ม */
  focusField = null,
  /* (dateIso) → { state: 'ok'|'unknown', people: [...] } | null — ภาระรายคนของวันนั้น (ไม่นับร่าง)
     ส่งมา + มีวันที่นัด ⇒ ช่องผู้รับผิดชอบเป็น CrewLoadPicker · ไม่ส่ง/คืน null ⇒ ดรอปดาวน์เดิม */
  staffLoadFor = null,
  /* (visit) → Promise — ลบนัดนี้ (จอแม่ถามยืนยัน ยิง API บอกผล และปิดโมดัลเมื่อสำเร็จ)
     ⚠️ จอแม่ส่งมาเฉพาะคนที่แก้งานบริการได้ (`canEditService`) — ไม่ส่ง = ไม่มีปุ่ม */
  onDelete = null,
  /* คำขอลบของใบนี้กำลังวิ่ง (จอแม่ถือสถานะ — กล่องยืนยันยังเปิดอยู่ไม่นับว่ากำลังลบ) */
  deleting = false,
}) {
  const editing = !!visit;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [overriding, setOverriding] = useState(false);   // เปิดโมดัลข้ามด่าน
  const [overrideReason, setOverrideReason] = useState("");
  const [focusPending, setFocusPending] = useState(null);
  const role = useRole();
  const assigneeLabelId = useId();
  const assigneeRef = useRef(null);
  const dateRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (visit) {
      setForm(visitToForm(visit));
    } else {
      // คลิกช่องว่างบนปฏิทิน = รู้วันและเจ้าหน้าที่อยู่แล้ว — เติมให้เลย
      setForm({ ...EMPTY, ...(defaults || {}) });
    }
  }, [open, visit, defaults]);

  /* ภาระของวันที่กำลังกรอก — เปลี่ยนวันในฟอร์ม ตัวเลขเปลี่ยนตาม (ไม่ใช่วันเดิมของใบ) */
  const dayLoad = useMemo(
    () => (staffLoadFor && form.scheduledDate ? staffLoadFor(form.scheduledDate) : null),
    [staffLoadFor, form.scheduledDate],
  );

  /* ⭐ พาโฟกัสไปช่องที่ถูกขอ — ตั้ง "ค้างไว้" ในรอบเดียวกับที่เติมฟอร์ม (สอง setState รวมเป็น
     เรนเดอร์เดียว) แล้วค่อยโฟกัสในเอฟเฟกต์ถัดไป ซึ่งเห็น DOM ของฟอร์มที่เติมแล้ว
     🪤 โฟกัสทันทีตอนเปิดไม่ได้: รอบแรกฟอร์มยังเป็นค่าเก่า ⇒ ช่องผู้รับผิดชอบยังเป็นดรอปดาวน์
        (ยังไม่มีวันที่นัด) แล้วถูกแทนด้วย CrewLoadPicker ในรอบถัดไป = โฟกัสหลุดไปกับ element ที่ถูกถอด
     ⚠️ ต้องมาหลัง Modal โฟกัสปุ่มแรกของตัวเอง — เอฟเฟกต์ของลูกรันก่อนแม่ และรอบนี้เป็นรอบที่สอง
     ⚠️ ไม่ผูกกับ `visit` — จอแม่โหลดข้อมูลใหม่ (กลับมาที่แท็บ) แล้วได้ออบเจกต์ใบใหม่ระหว่างที่
        โมดัลเปิดอยู่ = โฟกัสจะถูกดึงกลับกลางคันขณะคนกำลังพิมพ์ช่องอื่น · ปิดโมดัล = ล้างคำขอ */
  useEffect(() => {
    setFocusPending(open && focusField ? focusField : null);
  }, [open, focusField]);

  useEffect(() => {
    if (!focusPending) return;
    const box = focusPending === "assignee" ? assigneeRef.current
      : focusPending === "scheduledDate" ? dateRef.current : null;
    const target = box?.querySelector('input[type="radio"]:checked') || box?.querySelector(FOCUSABLE);
    if (!target) return;   // ช่องยังไม่ขึ้นจอ — คงคำขอไว้ ลองใหม่เมื่อช่องผู้รับผิดชอบเปลี่ยนทรง
    setFocusPending(null);
    box.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
  }, [focusPending, dayLoad]);

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

  // ⭐ ด่านคำนวณจาก **ค่าที่กำลังกรอก** ไม่ใช่ค่าที่บันทึกไว้ — เลือกเจ้าหน้าที่บริการในฟอร์มแล้ว
  // ข้อ 3 ต้องติ๊กทันที ไม่ต้องกดบันทึกก่อนถึงจะรู้ว่าผ่านหรือยัง
  // ⚠️ ตัวเดียวกับที่ server ใช้ปฏิเสธ (visitGate.js) — ห้ามคิดเงื่อนไขซ้ำตรงนี้
  /* ⚠️ **บริบทด่าน ①② มาจากผู้เรียก** (PR-C) — โมดัลไม่ยิงโหลดเอง เพราะจอแม่
     โหลดมาทั้งสัปดาห์แล้ว · ไม่ส่งมา = ด่านตอบว่าติด ซึ่งถูกกว่าเดาว่าผ่าน */
  const gate = useMemo(
    () => evaluateVisitGate({ ...form, id: visit?.id }, { ...(gateContext || {}), site }),
    [form, site, visit?.id, gateContext],
  );
  const canQueue = gatePassed(gate);
  const gateCount = useMemo(() => gateSummary(gate), [gate]);
  /* ข้ามด่านเป็นสิทธิ์ของหัวหน้า ไม่ใช่ของทุกคนที่แก้งานบริการได้ — ด่านฝั่ง server
     ปฏิเสธอยู่แล้ว (route PATCH) ที่นี่แค่ไม่โชว์ปุ่มที่กดยังไงก็ไม่ผ่าน */
  const canOverride = canOverrideServiceGate({ role });

  const applyPreset = (preset) =>
    setForm((prev) => ({ ...prev, startTime: preset.startTime, endTime: preset.endTime }));

  const pickTechnician = (id) => {
    const tech = technicians.find((t) => t.id === id);
    setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
  };

  /* ⭐ ปุ่ม "ลบนัด" (มติเจ้าของ 24/09) — เฉพาะงานนอกรอบที่ยังไม่ปิด · เหตุที่ลบไม่ได้บอกตอนกด
     ⚠️ ถามด่านจาก **ใบที่บันทึกไว้** (`visit`) ไม่ใช่ค่าที่กำลังกรอก — ลบคือลบของที่อยู่ในฐาน และ API ก็ตัดสินจากแถวในฐาน */
  const deleteAction = editing && onDelete ? visitDeleteButton(visit) : null;
  const remove = async () => {
    setError("");
    try {
      await onDelete(visit);
    } catch (e) {
      setError(e.message || "ลบนัดไม่สำเร็จ");
    }
  };

  const submit = async (override = null) => {
    const payload = override ? { ...form, ...override } : form;
    /* 🐞 **นัดประเมินพื้นที่กดบันทึกไม่ได้เลยสักปุ่ม** — ตัวตรวจปฏิเสธ `kind: 'survey'`
       เพราะนัดประเมินเกิดได้ทางเดียวคือจากใบคำร้อง (ห้ามสร้างมือ) · route ของ PATCH
       ส่ง `existingKind` ให้อยู่แล้ว แต่จอไม่ส่ง ⇒ ตายที่ด่านฝั่ง client ก่อนยิง API ด้วยซ้ำ
       ⇒ ร่างนัดประเมินที่ติดด่าน ปล่อยเข้าคิวไม่ได้ตลอดกาล และโมดัลนี้เป็นที่เดียว
         ในระบบที่ปล่อยร่างเข้าคิวได้
       ⚠️ ถามด้วย **อาร์กิวเมนต์ชุดเดียวกับ server** ไม่ใช่ผ่อนด่านฝั่งจอ */
    const { error: invalid } = normalizeVisitInput(
      payload,
      editing && visit?.kind ? { existingKind: visit.kind } : {},
    );
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

        {/* ⭐ ชนิดงานที่ **คนเลือกเองไม่ได้** (ประเมินพื้นที่ — เกิดจากใบคำร้อง) แสดง
            เป็นข้อความ ไม่ใช่ดรอปดาวน์
            🐞 ของเดิมใช้ลิสต์ที่ตัดชนิดนั้นออก ⇒ เปิดฟอร์มแก้นัดประเมินแล้วช่องขึ้นค่าว่าง
               และถ้าเผลอแตะ ชนิดของนัดจะเปลี่ยนเป็น "ติดตั้ง" ทันที · จุดนี้คือทางเดียว
               ที่จะปล่อยร่างเข้าคิว ⇒ เส้นทางกู้วิ่งผ่านฟอร์มที่ทำลายข้อมูลอยู่ตรงกลาง */}
        <label className={styles.field}>
          <span>ชนิดงาน *</span>
          {VISIT_KINDS_MANUAL.includes(form.kind) ? (
            <Select value={form.kind} onChange={change("kind")}>
              {VISIT_KINDS_MANUAL.map((kind) => (
                <option key={kind} value={kind}>{VISIT_KIND_LABELS[kind]}</option>
              ))}
            </Select>
          ) : (
            <>
              <p className={styles.readonlyValue}>{VISIT_KIND_LABELS[form.kind] || form.kind}</p>
              <small>ชนิดนี้เกิดจากใบคำร้อง เปลี่ยนที่นี่ไม่ได้ — วัน/เวลา/เจ้าหน้าที่ ยังแก้ได้ตามปกติ</small>
            </>
          )}
        </label>

        <label className={styles.field} ref={dateRef}>
          <span>วันที่นัด *</span>
          <DateInput value={form.scheduledDate} onChange={(iso) => setForm((prev) => ({ ...prev, scheduledDate: iso }))} />
        </label>

        {/* ⭐ ช่องนี้โผล่เฉพาะตอนเลื่อนวันจริง — บังคับกรอกเพราะลูกค้าถามทีหลังว่า
            "ทำไมเจ้าหน้าที่ไม่มาสักที" ต้องตอบได้ว่าเลื่อนกี่ครั้งเพราะอะไร · เหตุผลลงเธรด
            ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียวถูกเขียนทับทุกครั้งที่เลื่อน */}
        {rescheduling && (
          <label className={`${styles.field} ${styles.wide}`}>
            <span>เหตุผลที่เลื่อน *</span>
            <Input
              value={form.rescheduleReason}
              onChange={change("rescheduleReason")}
              placeholder="เช่น ลูกค้าขอเลื่อน · ห้างปิดปรับปรุง · เจ้าหน้าที่ติดงานด่วน"
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

        {/* ⭐ รู้วันแล้ว + จอแม่ส่งภาระมา ⇒ กางรายชื่อพร้อมภาระของวันนั้น (ไม่ต้องเปิดปฏิทิน
            อีกแท็บเพื่อดูว่าใครว่าง) · ไม่อย่างนั้นคงดรอปดาวน์เดิมทุกอย่าง
            ⚠️ กล่องเป็น div ไม่ใช่ label — radio แต่ละแถวเป็น label ของตัวเองอยู่แล้ว
               (label ซ้อน label ไม่ถูกต้อง และคลิกป้ายหัวจะไปเลือกแถวแรกแทน) */}
        {dayLoad ? (
          <div className={`${styles.field} ${styles.wide}`} ref={assigneeRef}>
            <span id={assigneeLabelId}>เจ้าหน้าที่ผู้รับผิดชอบ</span>
            <CrewLoadPicker
              value={form.assigneeId}
              onChange={pickTechnician}
              technicians={technicians}
              load={dayLoad}
              dateIso={form.scheduledDate}
              labelledBy={assigneeLabelId}
              currentName={form.assigneeName}
            />
            <small>คนนี้คือเจ้าของงาน — ใบส่งงานและรอบถัดไปนับจากคนนี้</small>
          </div>
        ) : (
          <label className={styles.field} ref={assigneeRef}>
            <span>เจ้าหน้าที่ผู้รับผิดชอบ</span>
            <SearchableSelect
              value={form.assigneeId}
              onChange={pickTechnician}
              options={technicians.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="ยังไม่มอบหมาย"
              ariaLabel="เจ้าหน้าที่ผู้รับผิดชอบ"
            />
            <small>คนนี้คือเจ้าของงาน — ใบส่งงานและรอบถัดไปนับจากคนนี้</small>
          </label>
        )}

        {/* ⭐ เจ้าหน้าที่ที่ไปด้วย (F-6) — คอลัมน์ `assistantIds` มีมาตั้งแต่ mig 0188
            แต่ไม่เคยมีจอไหนให้กรอก ⇒ งานสองคนถูกบันทึกเป็นงานคนเดียวมาตลอด
            ⚠️ ไม่ใช่ "เจ้าของงานคนที่สอง" — ใบส่งงานและรอบถัดไปยังนับจากคนแรกคนเดียว
            สิ่งที่เปลี่ยนคือคนที่ไปด้วย **เห็นงานนี้ในงานวันนี้ของตัวเอง** */}
        <label className={`${styles.field} ${styles.wide}`}>
          <span>เจ้าหน้าที่ที่ไปด้วย</span>
          <OptionTiles
            multiple
            value={form.assistantIds}
            onChange={(ids) => setForm((prev) => ({ ...prev, assistantIds: ids }))}
            ariaLabel="เจ้าหน้าที่ที่ไปด้วย"
            options={technicians
              .filter((tech) => tech.id !== form.assigneeId)
              .map((tech) => ({ value: tech.id, label: tech.name }))}
          />
          <small>เว้นว่าง = ไปคนเดียว · คนที่ติ๊กไว้จะเห็นนัดนี้ในงานวันนี้ของตัวเอง</small>
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
                <small className={styles.hint}>สถานะนี้มาจากปุ่มเริ่มงาน/ปิดงานของเจ้าหน้าที่ แก้จากที่นี่ไม่ได้</small>
              )}
            </label>

            {/* ⭐ **"ทำไม่ได้" เลือกได้จากที่นี่โดยตั้งใจ** — เป็นทางออกที่คนจัดคิวต้องมี
                เมื่อช่างไปแล้วทำไม่ได้แต่ปิดเองไม่ทัน (แผ่นปิดงานอยู่บนจอ "งานวันนี้" เท่านั้น)
                🐞 แต่เดิม **ไม่มีช่องเหตุผลให้กรอก** ทั้งที่ DB บังคับ ≥10 ตัวอักษร
                  ⇒ เลือกได้ กดบันทึกแล้วเจอ error ที่สั่งให้กรอกช่องซึ่งไม่มีอยู่บนจอ */}
            {form.status === "unable" && (
              <label className={`${styles.field} ${styles.wide}`}>
                <span>ทำไม่ได้เพราะอะไร *</span>
                <Input
                  value={form.unableReason}
                  onChange={change("unableReason")}
                  placeholder="เช่น อาคารไม่อนุญาตให้เข้าวันหยุด · ลูกค้าไม่อยู่ ไม่มีคนเปิดห้อง"
                  maxLength={500}
                />
                <small className={styles.hint}>
                  {form.unableReason.trim().length >= 10
                    ? "ผู้ขอจะเห็นเหตุผลนี้ — ใบประเมินจะถอยกลับขั้นลงคิวให้เอง"
                    : "อย่างน้อย 10 ตัวอักษร (ฐานข้อมูลบังคับ)"}
                </small>
              </label>
            )}

            {/* ⭐ ด่านเข้าไซต์ — ร่างขึ้นตารางได้ต่อเมื่อผ่านด่าน (มติผู้ใช้ 2026-08-28)
                แสดงเป็น **รายการติ๊กพร้อมชื่อคนที่แก้ได้** ไม่ใช่ปุ่มเทา —
                ด่านที่ไม่บอกเหตุผลคือด่านที่คนหาทางอ้อม (§6 ข้อบังคับ 1) */}
            {visit?.status === "draft" && (
              <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
                <legend>ด่านก่อนขึ้นตาราง</legend>
                {/* ⭐ บอกความคืบหน้าเป็นตัวเลข ไม่ใช่ให้ไล่นับติ๊กเอง — คนที่เปิดมาเจอ
                    เช็คลิสต์ 4 ข้อต้องรู้ทันทีว่าเหลืออีกกี่ข้อถึงจะปล่อยได้ */}
                <p className={styles.gateSummary} data-ready={canQueue ? "yes" : "no"}>
                  <b>ผ่าน {gateCount.ok} จาก {gateCount.total} ข้อ</b>
                  {canQueue ? " — ปล่อยขึ้นตารางได้" : " — ยังขึ้นตารางไม่ได้"}
                  {gateCount.parked > 0 && ` · ${gateCount.parked} ข้อรอระบบสัญญา (ไม่บล็อก)`}
                </p>
                <p className={styles.hint}>
                  ร่างไม่ขึ้นตาราง ไม่นับภาระของเจ้าหน้าที่ และไม่โผล่ในงานวันนี้ — ผ่านครบแล้วกด “ปล่อยขึ้นตาราง”
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

      {/* ⭐ ปุ่มลบอยู่ซ้าย แยกจากกลุ่มยกเลิก/บันทึกทางขวา — กดพลาดจากปุ่มบันทึกไม่ได้ · สีแดงแบบเส้นขอบ = การกระทำรอง
          ⚠️ กลุ่มขวาเป็น `form-actions-buttons` เสมอ (มีหรือไม่มีปุ่มลบ ตำแหน่งปุ่มบันทึกไม่ขยับ)
          📱 จอ ≤680 แถบนี้มีได้ถึงห้าปุ่ม — `.visitFooter` ให้กลุ่มขวาตัดบรรทัดเป็นสองคอลัมน์ + ปุ่มลบสูงเท่าปุ่มนิ้วแตะ
             (ดูเหตุผลใน ServiceSiteModal.module.css) */}
      <div className={`form-actions ${styles.visitFooter}`}>
        {deleteAction && (
          <GatedAction
            tone="danger" variant="outline"
            blocker={deleteAction.blocker}
            onClick={remove}
            disabled={saving || deleting}
            icon={<Trash2 size={15} aria-hidden="true" />}
          >
            {deleting ? "กำลังลบ…" : "ลบนัด"}
          </GatedAction>
        )}
        <div className="form-actions-buttons">
          <Button tone="neutral" onClick={onClose} disabled={saving || deleting}>ยกเลิก</Button>
          {/* ⭐ ปุ่มนี้ **โชว์เสมอตอนเป็นร่าง** ต่อให้ยังผ่านด่านไม่ครบ — บอกเหตุตอนกด
              ปุ่มที่หายไปไม่ได้สอนใครว่าต้องไปแก้อะไร (GatedAction §มติ 2026-08-22) */}
          {visit?.status === "draft" && (
            <>
              {/* ⭐ หัวหน้าข้ามด่านได้ พร้อมเหตุผลบังคับที่ติดกับใบถาวร — ของจริงมี 25 จุด
                  ที่วิ่งอยู่ทั้งที่หมดสัญญา ถ้าบล็อกแข็งวันแรก งานหยุดทันที
                  ⚠️ โชว์เฉพาะหัวหน้า เพราะ server ปฏิเสธคนอื่นอยู่แล้ว (ปุ่มที่กดยังไง
                  ก็ไม่ผ่านไม่ได้สอนอะไรใคร ต่างจากปุ่มที่ติดเงื่อนไข *ข้อมูล* ซึ่งต้องโชว์) */}
              {!canQueue && canOverride && (
                <Button tone="neutral" variant="quiet" disabled={saving || deleting}
                  onClick={() => { setOverrideReason(""); setOverriding(true); }}>
                  ข้ามด่าน (หัวหน้า)
                </Button>
              )}
              {/* ⚠️ `|| deleting` — ระหว่างคำขอลบวิ่ง ปุ่มที่เขียนใบเดียวกันต้องดับทุกตัว (ไม่งั้นปล่อยขึ้นตารางชนกับการลบ) */}
              <GatedAction
                tone="primary" variant="quiet" disabled={saving || deleting}
                blocker={canQueue ? "" : gateBlocker(gate)}
                onClick={() => submit({ status: "scheduled" })}
              >
                ปล่อยขึ้นตาราง
              </GatedAction>
            </>
          )}
          <Button tone="primary" onClick={() => submit()} disabled={saving || deleting}>
            {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างนัด"}
          </Button>
        </div>
      </div>

      {/* ⭐ แผ่นข้ามด่าน — แยกจากฟอร์มโดยตั้งใจ เพราะเป็นการตัดสินใจคนละเรื่องกับ
          การแก้นัด: ชื่อคนกดกับเหตุผลจะติดกับใบถาวรและขึ้นบนใบส่งงาน
          ⚠️ ต้องบอกว่า "ข้ามอะไรบ้าง" ก่อนให้กด — คนที่ข้ามโดยไม่รู้ว่าข้ามอะไร
          คือคนที่จะข้ามทุกใบภายในสัปดาห์เดียว */}
      {overriding && (
        <div className={styles.overrideSheet} role="group" aria-label="ข้ามด่านขึ้นตาราง">
          <h4>ข้ามด่านขึ้นตาราง</h4>
          <p className={styles.hint}>
            นัดนี้จะขึ้นตารางทั้งที่ยังไม่ผ่านด่าน — ใบจะติดร่องรอย “ข้ามด่าน” ถาวร
            พร้อมชื่อคุณและเหตุผล
          </p>
          <ul className={styles.overrideList}>
            {gateReasons(gate).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <label className={styles.field}>
            <span>เหตุผลที่ต้องข้าม *</span>
            <Input
              as="textarea" rows={3} value={overrideReason} maxLength={500}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="เช่น ลูกค้าโอนแล้วส่งสลิปมาทางไลน์ บัญชีติดปิดงบสิ้นเดือน ยืนยันกับบัญชีแล้วว่าจะกดรับรองต้นเดือนหน้า"
            />
            <small>อย่างน้อย 10 ตัวอักษร · ลงบันทึกและขึ้นบนใบส่งงาน</small>
          </label>
          <div className="form-actions">
            <Button tone="neutral" onClick={() => setOverriding(false)} disabled={saving}>ยกเลิก</Button>
            <Button
              tone="primary" disabled={saving || overrideReason.trim().length < 10}
              onClick={async () => {
                await submit({ status: "scheduled", gateOverrideReason: overrideReason.trim() });
                setOverriding(false);
              }}
            >
              ข้ามด่านและขึ้นตาราง
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
