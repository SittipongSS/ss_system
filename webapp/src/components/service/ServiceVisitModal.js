"use client";
// ── ฟอร์มนัดเข้าบริการ (mig 0188) — ตัวเดียวใช้ทั้ง "นัดใหม่" และ "แก้นัด" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   visit = null → โหมดสร้าง (ไม่มีช่องสถานะ/ผลการเข้า — นัดใหม่เริ่มที่ 'นัดไว้')
//   visit = row  → โหมดแก้ (มีสถานะ + วันเวลาที่เข้าจริง + สรุปงาน)
//   focusField / staffLoadFor → โหมดของ "รายการงาน" บนจอจัดคิว (มติ 2026-09-22) ไม่ใช่ฟอร์มที่สอง
//   onDelete → ปุ่ม "ลบนัด" ของงานนอกรอบในโหมดแก้ (มติเจ้าของ 24/09) — ไม่ส่ง = ไม่มีปุ่ม (ไม่มีสิทธิ์)
//
// ⭐ หน้าตาแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09 · mockups/schedule-modal TwoCol-Visit) — **เปลือกเดียวกับ
//    โมดัลลงคิวเข้าพื้นที่** (`ScheduleModalShell`) ช่องวัน/เวลาเดียวกัน (`TimeWindowField`) แผงด่านเดียวกัน
//    (`GatePanel`) ตัวเลือกคนเดียวกัน (`CrewLoadPicker`):
//    · ซ้าย — "งานนี้" (ชนิด · โซน · ที่ไหน · ที่มา + แก้ไซต์/ชนิดงาน) · ด่านสี่ข้อ (เห็นก่อนเลือกคน · pain 5)
//             · สถานะนัด · ผลการเข้าจริง (เฉพาะเมื่อถึงเวลา · pain 7) · หมายเหตุ · ความเคลื่อนไหว (พับ)
//    · ขวา  — วันที่ · แผ่นเวลาที่เห็นว่าเลือกอันไหน · ช่วงเข้าไซต์ใต้เวลา · คน (ว่าง = แผ่น · ไม่ว่าง = แถบภาระ)
//             · ผู้ไปด้วย (ชิป ไม่ใช่รายชื่อชุดที่สอง · pain 4)
//    · ท้าย — ปุ่มรองซ้าย · **ปุ่มหลักปุ่มเดียว** (ร่าง = ปล่อยขึ้นตาราง · pain 6) · บรรทัดผลลัพธ์ใต้ปุ่ม
// ⚠️ **ขอบเขต "UI อย่างเดียว"** — ก้อนที่ส่ง (`submit` → `onSave`) · ด่าน · สิทธิ์ · ชุดช่องและปุ่ม เท่าเดิมทุกตัว
//    ส่วนไหนโผล่/ปุ่มไหนอยู่ท้าย/บรรทัดผลลัพธ์ ตัดสินที่ `visitModalView` (lib/service/scheduleModal.js) ที่เดียว
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarCheck, Trash2 } from "lucide-react";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Textarea from "@/components/ui/Textarea";
import TimeInput from "@/components/ui/TimeInput";
import { evaluateVisitGate, gateReasons, gateVisitBeforeChange } from "@/lib/service/visitGate";
import { visitDeleteButton } from "@/lib/service/visitDelete";
import { canOverrideServiceGate } from "@/lib/permissions";
import { useRole } from "@/lib/roleContext";
import {
  VISIT_KINDS_MANUAL,
  VISIT_KIND_LABELS,
  isReschedule,
  normalizeVisitInput,
} from "@/lib/service/rounds";
import {
  accessLine, gatePanelView, threadDigest, visitEndDateNote, visitFormCheckInput, visitHeaderView, visitJobRows,
  visitModalView,
} from "@/lib/service/scheduleModal";
import UpdateThread from "@/components/updates/UpdateThread";
import CrewLoadPicker from "./CrewLoadPicker";
import GatePanel from "./GatePanel";
import HelperChips from "./HelperChips";
import ScheduleModalShell from "./ScheduleModalShell";
import { Disclosure, JobFacts, ModalField, focusFieldBox } from "./ScheduleModalParts";
import TimeWindowField from "./TimeWindowField";
import styles from "./ServiceVisitModal.module.css";

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

export default function ServiceVisitModal({
  gateContext = null,   // บริบทด่าน ①② (โซน · รอบขาย · ใบ · งวด · สัญญา) จากจอแม่
  open, visit = null, sites = [], technicians = [], defaults = null, onClose, onSave,
  /* ช่องที่จะพาโฟกัสไปตอนเปิด: 'assignee' | 'scheduledDate' | null — ปุ่ม "เลือกเจ้าหน้าที่" /
     "แก้วัน/เวลา" บนรายการงานเปิดโมดัลนี้เพื่อแก้ช่องเดียว ต้องไม่ให้คนไล่หาเองทั้งฟอร์ม */
  focusField = null,
  /* (dateIso) → { state: 'ok'|'unknown', people: [...] } | null — ภาระรายคนของวันนั้น (ไม่นับร่าง)
     ไม่ส่ง/คืน null ⇒ ตัวเลือกคนบอกว่า "ยังโหลดภาระไม่ได้" (ไม่มีศูนย์ปลอม) */
  staffLoadFor = null,
  /* (visit) → Promise — ลบนัดนี้ (จอแม่ถามยืนยัน ยิง API บอกผล และปิดโมดัลเมื่อสำเร็จ)
     ⚠️ จอแม่ส่งมาเฉพาะคนที่แก้งานบริการได้ (`canEditService`) — ไม่ส่ง = ไม่มีปุ่ม */
  onDelete = null,
  /* คำขอลบของใบนี้กำลังวิ่ง (จอแม่ถือสถานะ — กล่องยืนยันยังเปิดอยู่ไม่นับว่ากำลังลบ) */
  deleting = false,
  /* วันนี้แบบไทย 'YYYY-MM-DD' (จอแม่ · `businessDate()`) — "อีก n วัน" ข้างช่องวัน และตัดสินว่า
     ผลการเข้าจริงถึงเวลาโชว์หรือยัง · ⚠️ ไม่อ่านนาฬิกาเองในเรนเดอร์ */
  todayIso = "",
  /* ภาระของไซต์ `{ [siteId]: { assets, packs } }` (ชุดเดียวกับตาราง) — "งาน · 3 จุด · 2 แพ็ค" และ
     "ถ้าเลือก n นัด · x/12 จุด" ในตัวเลือกคน · ไม่ส่ง = พูดแค่จำนวนนัด (ไม่เดาจุด) */
  workload = null,
  /* รายชื่อเจ้าหน้าที่เอง: 'loading' | 'error' | 'ready' — ต่างจาก "ไม่มีใครเลย" (ตัวเลือกบอกคนละข้อความ) */
  rosterState = "ready",
}) {
  const editing = !!visit;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [overriding, setOverriding] = useState(false);   // เปิดแผ่นข้ามด่าน
  const [overrideReason, setOverrideReason] = useState("");
  const [focusPending, setFocusPending] = useState(null);
  const [whatOpen, setWhatOpen] = useState(false);       // กาง "แก้ไซต์/ชนิดงาน"
  const [actualOpen, setActualOpen] = useState(false);   // กาง "ผลการเข้าจริง" ที่พับไว้
  const [threadOpen, setThreadOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);   // กาง "ปิดร่างนี้แทนการปล่อย" (ชิปสถานะของร่าง)
  const [threadItems, setThreadItems] = useState(null);  // null = เธรดยังโหลดไม่เสร็จ (ไม่ใช่ 0)
  const role = useRole();
  const assigneeLabelId = useId();
  const helpersLabelId = useId();
  const siteLabelId = useId();
  const kindLabelId = useId();
  const statusLabelId = useId();
  const unableId = useId();
  const rescheduleId = useId();
  const actualDateId = useId();
  const summaryId = useId();
  const noteId = useId();
  const overrideId = useId();
  const whatId = useId();
  const assigneeRef = useRef(null);
  const dateRef = useRef(null);
  const overrideRef = useRef(null);

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

  /* ส่วนที่พับ/แผ่นข้ามด่านเริ่มใหม่ทุกครั้งที่เปิดใบ (ของใบก่อนต้องไม่ค้างมาใบถัดไป) */
  useEffect(() => {
    if (!open) return;
    setOverriding(false);
    setOverrideReason("");
    setWhatOpen(false);
    setActualOpen(false);
    setThreadOpen(false);
    setStatusOpen(false);
    setThreadItems(null);
  }, [open, visit?.id]);

  /* ภาระของวันที่กำลังกรอก — เปลี่ยนวันในฟอร์ม ตัวเลขเปลี่ยนตาม (ไม่ใช่วันเดิมของใบ) */
  const dayLoad = useMemo(
    () => (staffLoadFor && form.scheduledDate ? staffLoadFor(form.scheduledDate) : null),
    [staffLoadFor, form.scheduledDate],
  );

  /* ⭐ พาโฟกัสไปช่องที่ถูกขอ — ตั้ง "ค้างไว้" ในรอบเดียวกับที่เติมฟอร์ม (สอง setState รวมเป็น
     เรนเดอร์เดียว) แล้วค่อยโฟกัสในเอฟเฟกต์ถัดไป ซึ่งเห็น DOM ของฟอร์มที่เติมแล้ว
     🪤 โฟกัสทันทีตอนเปิดไม่ได้: รอบแรกฟอร์มยังเป็นค่าเก่า ⇒ ตัวเลือกคนยังไม่มีวัน (แผ่นล้วน)
        แล้วถูกวาดใหม่เป็นกลุ่มว่าง/ไม่ว่างในรอบถัดไป = โฟกัสหลุดไปกับ element ที่ถูกถอด
     ⚠️ ต้องมาหลัง Modal โฟกัสปุ่มแรกของตัวเอง — เอฟเฟกต์ของลูกรันก่อนแม่ และรอบนี้เป็นรอบที่สอง
     ⚠️ ไม่ผูกกับ `visit` — จอแม่โหลดข้อมูลใหม่ (กลับมาที่แท็บ) แล้วได้ออบเจกต์ใบใหม่ระหว่างที่
        โมดัลเปิดอยู่ = โฟกัสจะถูกดึงกลับกลางคันขณะคนกำลังพิมพ์ช่องอื่น · ปิดโมดัล = ล้างคำขอ
     ⭐ ลิงก์แก้บนแผงด่าน (③ "เลือกเจ้าหน้าที่" · ④ "แก้วัน/เวลา") ใช้ทางเดียวกันนี้ (`setFocusPending`) */
  useEffect(() => {
    setFocusPending(open && focusField ? focusField : null);
  }, [open, focusField]);

  useEffect(() => {
    if (!focusPending) return;
    const box = focusPending === "assignee" ? assigneeRef.current
      : focusPending === "scheduledDate" ? dateRef.current : null;
    // ช่องยังไม่ขึ้นจอ — คงคำขอไว้ ลองใหม่เมื่อตัวเลือกคนเปลี่ยนทรง (ตัวพาโฟกัสตัวเดียวกับโมดัลลงคิว)
    if (focusFieldBox(box)) setFocusPending(null);
  }, [focusPending, dayLoad]);

  /* แผ่นข้ามด่านเปิด ⇒ โฟกัสช่องเหตุผลทันที (ปุ่มหลักรอเหตุผลครบ 10 ตัว — คนต้องรู้ว่าต้องพิมพ์ที่ไหน) */
  useEffect(() => {
    if (overriding) overrideRef.current?.focus();
  }, [overriding]);

  const change = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const site = useMemo(() => sites.find((s) => s.id === form.siteId) || null, [sites, form.siteId]);

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
  /* ⚠️ สถานะของด่าน = สถานะที่บันทึกไว้ (`gateVisitBeforeChange` · รีวิว 25/09) ชุดเดียวกับ route PATCH — ร่างที่เลือก
     "ทำไม่ได้" ต้องไม่ขึ้นว่าผ่านข้อสัญญาบนจอ แล้วโดน server ตีกลับตอนกดบันทึก */
  const gate = useMemo(
    () => evaluateVisitGate(gateVisitBeforeChange(visit, { ...form, id: visit?.id }), { ...(gateContext || {}), site }),
    [form, site, visit, gateContext],
  );
  /* ข้ามด่านเป็นสิทธิ์ของแอดมิน (`canOverrideServiceGate`) ไม่ใช่ของทุกคนที่แก้งานบริการได้ — ด่านฝั่ง server
     ปฏิเสธอยู่แล้ว (route PATCH) ที่นี่แค่ไม่โชว์ปุ่มที่กดยังไงก็ไม่ผ่าน (D9: ป้ายเดิม "หัวหน้า" ผิด) */
  const canOverride = canOverrideServiceGate({ role });

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
       ⚠️ ถามด้วย **อาร์กิวเมนต์ชุดเดียวกับ server** ไม่ใช่ผ่อนด่านฝั่งจอ
       🐞 **และค่าชุดเดียวกับ server** — ฟอร์มไม่มีช่องวันที่เสร็จจริง (mig 0386) แต่ server ตรวจด้วยค่าของแถวเดิม
          ⇒ นัดที่ส่งงานข้ามวันเคยบันทึกจากโมดัลนี้ไม่ได้อีกเลย (`visitFormCheckInput` · ก้อนที่ส่งไม่เปลี่ยน) */
    const { error: invalid } = normalizeVisitInput(
      visitFormCheckInput(payload, editing ? visit : null),
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

  // ── ส่วนไหนโผล่ · ปุ่มท้าย · บรรทัดผลลัพธ์ — ตัดสินที่ lib ที่เดียว (ตาราง 1c ของแผน) ──
  const siteLoad = (workload && form.siteId && workload[form.siteId]) || null;
  /* ภาระของวัน + ไซต์เข้าด้วย — บรรทัดผลลัพธ์เตือนเมื่อคนที่เลือกจะเกินภาระ (ตัวเลขเดียวกับแถวของเขาในตัวเลือก) */
  const view = visitModalView({
    visit, form, todayIso, gate, canOverride, deleteAction, overriding, overrideReason, error, deleting,
    load: dayLoad, siteLoad, site,
  });
  const { sections } = view;
  const header = visitHeaderView(visit, { form, site });
  const jobRows = visitJobRows({
    visit, form, site, zones: gateContext?.zones || [], zoneGates: gate.zoneGates || [], siteLoad,
  });
  const gateView = sections.gates
    ? gatePanelView(gate, { visit: { ...form, id: visit?.id }, accessKnown: true, site, mode: sections.gateMode })
    : null;
  const access = accessLine(site, { date: form.scheduledDate, startTime: form.startTime, endTime: form.endTime });
  const digest = threadDigest(threadItems);
  const showWhat = whatOpen || sections.siteEditOpen;

  /* ปุ่มท้าย: lib บอก "ปุ่มไหน" (key) · ที่นี่ผูกแค่ "กดแล้วทำอะไร" — ก้อนที่ส่งเท่าของเดิมทุกทาง
     · สร้าง/บันทึก/บันทึกร่าง = ฟอร์มทั้งก้อน · ปล่อย = ฟอร์ม + `status: "scheduled"` (server ตรวจด่านซ้ำ)
     · ข้ามด่าน = ฟอร์ม + `status: "scheduled"` + `gateOverrideReason` */
  const secondaryActions = {
    delete: remove,
    cancel: onClose,
    saveDraft: () => submit(),
    override: () => { setOverrideReason(""); setOverriding(true); },
    cancelOverride: () => setOverriding(false),
  };
  const primaryActions = {
    create: () => submit(),
    save: () => submit(),
    release: () => submit({ status: "scheduled" }),
    override: async () => {
      await submit({ status: "scheduled", gateOverrideReason: overrideReason.trim() });
      setOverriding(false);
    },
  };
  const secondary = view.secondary.map((action) => ({
    ...action,
    onClick: secondaryActions[action.key],
    icon: action.key === "delete" ? <Trash2 size={15} aria-hidden="true" /> : undefined,
  }));
  const primary = {
    ...view.primary,
    /* "กำลังบันทึก…" เฉพาะตอนบันทึกจริง — ระหว่างลบ ปุ่มหลักดับเฉย ๆ (ป้ายไม่โกหกว่ากำลังบันทึก) */
    busyLabel: saving ? view.primary.busyLabel : "",
    onClick: primaryActions[view.primary.key],
    icon: view.primary.key === "release" || view.primary.key === "override"
      ? <CalendarCheck size={15} aria-hidden="true" />
      : undefined,
  };

  /* ชิปสถานะนัด — ชุดเดียววางได้สองที่ (ช่อง "สถานะนัด" ของนัดที่ขึ้นตาราง · ส่วนพับ "ปิดร่างนี้" ของร่าง) */
  const statusChips = (
    <ChoiceChips
      value={form.status}
      onChange={(status) => setForm((prev) => ({ ...prev, status }))}
      options={sections.statusOptions}
      disabled={sections.status === "locked"}
      ariaLabel="สถานะนัด"
    />
  );

  /* ── ซ้ายบน: งานนี้ · ด่าน · สถานะ ── */
  const whatPanel = (
    <div className={styles.what} id={whatId}>
      <ModalField label="ไซต์" required labelId={siteLabelId}>
        <SearchableSelect
          value={form.siteId}
          onChange={(value) => {
            /* 🐞 รีวิว UAT 24/09: ยังไม่มีไซต์ = ช่องกางเองตอนเปิด (`siteEditOpen`) · เลือกไซต์แล้วช่องเคยหุบทั้งแผง
               (ช่องที่โฟกัสอยู่ + ชิปชนิดงาน หายไปกับโฟกัส) ⇒ กางค้างไว้ด้วยปุ่มพับของมันเอง */
            if (sections.siteEditOpen) setWhatOpen(true);
            setForm((prev) => ({ ...prev, siteId: value }));
          }}
          options={sites.map((s) => ({
            value: s.id,
            label: s.routeZone ? `${s.name} · ${s.routeZone}` : s.name,
          }))}
          placeholder="เลือกไซต์"
          ariaLabel="ไซต์ที่จะเข้า"
        />
      </ModalField>
      {/* ⭐ ชนิดงานที่ **คนเลือกเองไม่ได้** (ประเมินพื้นที่ — เกิดจากใบคำร้อง) แสดงเป็นข้อความ ไม่ใช่ตัวเลือก
          🐞 ของเดิมใช้ลิสต์ที่ตัดชนิดนั้นออก ⇒ เปิดฟอร์มแก้นัดประเมินแล้วช่องขึ้นค่าว่าง
             และถ้าเผลอแตะ ชนิดของนัดจะเปลี่ยนเป็น "ติดตั้ง" ทันที · จุดนี้คือทางเดียว
             ที่จะปล่อยร่างเข้าคิว ⇒ เส้นทางกู้วิ่งผ่านฟอร์มที่ทำลายข้อมูลอยู่ตรงกลาง
          ⭐ ชนิดที่เลือกได้มี 6 ตัว = ชิปเห็นครบ (กติกาคอนโทรล ≤6 · ไม่ซ่อนในดรอปดาวน์) */}
      <ModalField
        label="ชนิดงาน" required labelId={kindLabelId}
        hint={sections.kindLocked ? "ชนิดนี้เกิดจากใบคำร้อง เปลี่ยนที่นี่ไม่ได้ — วัน/เวลา/เจ้าหน้าที่ ยังแก้ได้ตามปกติ" : null}
      >
        {sections.kindLocked ? (
          <p className={styles.readonly}>{VISIT_KIND_LABELS[form.kind] || form.kind}</p>
        ) : (
          <div className={styles.chips}>
            <ChoiceChips
              value={form.kind}
              onChange={(kind) => setForm((prev) => ({ ...prev, kind }))}
              options={VISIT_KINDS_MANUAL.map((kind) => ({ value: kind, label: VISIT_KIND_LABELS[kind] }))}
              ariaLabel="ชนิดงาน"
            />
          </div>
        )}
      </ModalField>
    </div>
  );

  const aside = (
    <>
      <JobFacts rows={jobRows}>
        {/* ไซต์/ชนิดงานแก้ได้ แต่ไม่ใช่งานหลักของโมดัล (หัวบอกไว้แล้ว) — กางเมื่อกด · ยังไม่มีไซต์ = กางไว้เลย */}
        {!sections.siteEditOpen ? (
          <button
            type="button"
            className={`text-action ${styles.whatToggle}`}
            aria-expanded={whatOpen}
            aria-controls={whatOpen ? whatId : undefined}
            onClick={() => setWhatOpen((prev) => !prev)}
          >
            {whatOpen ? "ซ่อนช่องแก้ไซต์/ชนิดงาน" : "แก้ไซต์/ชนิดงาน"}
          </button>
        ) : null}
        {showWhat ? whatPanel : null}
      </JobFacts>

      {/* ⭐ ด่านเข้าไซต์ — ร่างขึ้นตารางได้ต่อเมื่อผ่านด่าน (มติผู้ใช้ 2026-08-28) · สี่ข้อพร้อมชื่อคนที่แก้ได้
          ไม่ใช่ปุ่มเทา — ด่านที่ไม่บอกเหตุผลคือด่านที่คนหาทางอ้อม (§6 ข้อบังคับ 1)
          ⚠️ โผล่เฉพาะตอนสร้างและตอนเป็นร่าง (D6) — server ตรวจด่านเฉพาะร่าง → นัดไว้ · โชว์ด่านติดบนนัดที่
             ขึ้นตารางแล้ว = สัญญาว่าจะบล็อกทั้งที่ไม่มีอะไรบล็อก */}
      <GatePanel view={gateView} onFix={setFocusPending}>
        {/* ⭐ แผ่นข้ามด่าน (แอดมิน) อยู่ **ใต้รายการที่ติด** ไม่ใช่ใต้แถบปุ่ม (pain 12) — ชื่อคนกดกับเหตุผล
            ติดกับใบถาวรและขึ้นบนใบส่งงาน · ต้องเห็นว่า "ข้ามอะไรบ้าง" ก่อนกด — คนที่ข้ามโดยไม่รู้ว่าข้ามอะไร
            คือคนที่จะข้ามทุกใบภายในสัปดาห์เดียว */}
        {overriding ? (
          <div className={styles.override} role="group" aria-label="ข้ามด่านขึ้นตาราง">
            <p className={styles.overrideTitle}>ข้ามด่านขึ้นตาราง — ข้อที่จะข้าม</p>
            <ul className={styles.overrideList}>
              {gateReasons(gate).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <ModalField
              label="เหตุผลที่ต้องข้าม" required htmlFor={overrideId}
              hint="อย่างน้อย 10 ตัวอักษร · ลงบันทึกและขึ้นบนใบส่งงาน"
            >
              <Textarea
                id={overrideId} ref={overrideRef} rows={3} value={overrideReason} maxLength={500}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="เช่น ลูกค้าโอนแล้วส่งสลิปมาทางไลน์ บัญชีติดปิดงบสิ้นเดือน ยืนยันกับบัญชีแล้วว่าจะกดรับรองต้นเดือนหน้า"
              />
            </ModalField>
          </div>
        ) : null}
      </GatePanel>

      {/* ⚠️ ไม่ใช่ทุกสถานะเลือกมือได้ — `in_progress` · `done` · `partial` เกิดจาก **ปุ่มที่ประทับเวลา**
          เท่านั้น (มติ 2026-08-02 ข้อ 5) ⇒ ล็อกพร้อมคำอธิบาย · ร่างไม่มี "นัดไว้" (D5 — ปุ่มหลักคือทางเดียว)
          ⭐ ร่าง = ชิปชุดนี้คือทางปิดร่างทิ้ง ไม่ใช่งานหลัก ⇒ พับไว้ (`statusFold` · รีวิว UAT 24/09: เคยดันหมายเหตุ/
             ความเคลื่อนไหวตกขอบบนจอ 1440) · เลือกสถานะอื่นแล้วกางเองให้เห็นว่าเลือกอะไร · ชิปครบเท่าเดิม */}
      {sections.status ? (
        sections.statusFold === "none" ? (
          <ModalField label="สถานะนัด" labelId={statusLabelId} hint={sections.statusHint || null}>
            <div className={styles.chips}>{statusChips}</div>
          </ModalField>
        ) : (
          <Disclosure
            title="ปิดร่างนี้แทนการปล่อย"
            summary="ยกเลิก · ทำไม่ได้ · เลื่อนแล้ว"
            open={statusOpen || sections.statusFold === "open"}
            onToggle={() => setStatusOpen((prev) => !prev)}
          >
            <div className={styles.chips}>{statusChips}</div>
          </Disclosure>
        )
      ) : null}

      {/* ⭐ **"ทำไม่ได้" เลือกได้จากที่นี่โดยตั้งใจ** — เป็นทางออกที่คนจัดคิวต้องมี
          เมื่อช่างไปแล้วทำไม่ได้แต่ปิดเองไม่ทัน (แผ่นปิดงานอยู่บนจอ "งานวันนี้" เท่านั้น)
          🐞 แต่เดิม **ไม่มีช่องเหตุผลให้กรอก** ทั้งที่ DB บังคับ ≥10 ตัวอักษร
            ⇒ เลือกได้ กดบันทึกแล้วเจอ error ที่สั่งให้กรอกช่องซึ่งไม่มีอยู่บนจอ */}
      {editing && form.status === "unable" && (
        <ModalField label="ทำไม่ได้เพราะอะไร" required htmlFor={unableId} hint={sections.unableHint}>
          <Input
            id={unableId}
            value={form.unableReason}
            onChange={change("unableReason")}
            placeholder="เช่น อาคารไม่อนุญาตให้เข้าวันหยุด · ลูกค้าไม่อยู่ ไม่มีคนเปิดห้อง"
            maxLength={500}
          />
        </ModalField>
      )}
    </>
  );

  /* ── ขวา: วัน · เวลา · คน · ผู้ไปด้วย ── */
  /* ⭐ ช่องเหตุผลที่เลื่อนโผล่เฉพาะตอนเลื่อนวันจริง — บังคับกรอกเพราะลูกค้าถามทีหลังว่า
     "ทำไมเจ้าหน้าที่ไม่มาสักที" ต้องตอบได้ว่าเลื่อนกี่ครั้งเพราะอะไร · เหตุผลลงเธรด
     ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียวถูกเขียนทับทุกครั้งที่เลื่อน · วันในคำใบ้เป็นวันไทย (pain 10) */
  const rescheduleField = sections.reschedule ? (
    <ModalField label="เหตุผลที่เลื่อน" required htmlFor={rescheduleId} hint={sections.rescheduleHint}>
      <Input
        id={rescheduleId}
        value={form.rescheduleReason}
        onChange={change("rescheduleReason")}
        placeholder="เช่น ลูกค้าขอเลื่อน · ห้างปิดปรับปรุง · เจ้าหน้าที่ติดงานด่วน"
        maxLength={500}
      />
    </ModalField>
  ) : null;

  const main = (
    <>
      {/* ⭐ เช้า/บ่าย/เต็มวัน เป็น **ปุ่มลัดที่เติมเวลาให้** ไม่ใช่ค่าที่เก็บใน DB — แผ่นที่เลือกอยู่อ่านจากเวลา */}
      <TimeWindowField
        date={form.scheduledDate}
        onDate={(iso) => setForm((prev) => ({ ...prev, scheduledDate: iso }))}
        startTime={form.startTime}
        endTime={form.endTime}
        onTime={({ startTime, endTime }) => setForm((prev) => ({ ...prev, startTime, endTime }))}
        dateLabel="วันที่นัด"
        todayIso={todayIso}
        access={access}
        dateRef={dateRef}
        dateSlot={rescheduleField}
      />

      {/* ⭐ คนที่ว่างทั้งวันเป็นแผ่นเล็ก · คนที่มีงานแล้วเป็นแถวพร้อมแถบภาระและ "ถ้าเลือก" (เตือน ไม่ห้าม)
          ⚠️ กล่องเป็น div ไม่ใช่ label — radio แต่ละตัวเป็น label ของตัวเองอยู่แล้ว */}
      <ModalField
        label="เจ้าหน้าที่ผู้รับผิดชอบ"
        labelId={assigneeLabelId}
        aside="เจ้าของงาน — ใบส่งงานและรอบถัดไปนับจากคนนี้"
        fieldRef={assigneeRef}
      >
        <CrewLoadPicker
          value={form.assigneeId}
          onChange={pickTechnician}
          technicians={technicians}
          load={dayLoad}
          dateIso={form.scheduledDate}
          labelledBy={assigneeLabelId}
          currentName={form.assigneeName}
          siteLoad={siteLoad}
          timeWindow={{ startTime: form.startTime, endTime: form.endTime }}
          rosterState={rosterState}
        />
      </ModalField>

      {/* ⭐ เจ้าหน้าที่ที่ไปด้วย (F-6) — ไม่ใช่ "เจ้าของงานคนที่สอง": ใบส่งงานและรอบถัดไปยังนับจากคนแรกคนเดียว
          สิ่งที่เปลี่ยนคือคนที่ไปด้วย **เห็นงานนี้ในงานวันนี้ของตัวเอง** · ชิป + ปุ่มเพิ่ม (pain 4) */}
      <div className={styles.helpers}>
        <span id={helpersLabelId} className={styles.helpersLabel}>เจ้าหน้าที่ที่ไปด้วย</span>
        <HelperChips
          value={form.assistantIds}
          onChange={(ids) => setForm((prev) => ({ ...prev, assistantIds: ids }))}
          technicians={technicians}
          assigneeId={form.assigneeId}
          labelledBy={helpersLabelId}
          rosterState={rosterState}
        />
      </div>
    </>
  );

  /* ── ซ้ายล่าง: ผลการเข้าจริง · หมายเหตุ · ความเคลื่อนไหว ── */
  const endDateNote = editing ? visitEndDateNote(visit, form) : null;
  const actualFields = (
    <div className={styles.actual}>
      <p className={styles.hint}>
        รอบถัดไปนับจาก <strong>วันที่เข้าจริง</strong> ไม่ใช่วันที่นัดไว้ — เข้าช้า รอบหน้าขยับตาม
      </p>
      <div className={styles.actualRow}>
        <ModalField label="วันที่เข้าจริง" htmlFor={actualDateId}>
          <DateInput id={actualDateId} value={form.actualDate} onChange={(iso) => setForm((prev) => ({ ...prev, actualDate: iso }))} weekday />
        </ModalField>
        <ModalField label="เริ่ม">
          <TimeInput ariaLabel="เวลาที่เริ่มจริง" value={form.actualStartTime} onChange={(value) => setForm((prev) => ({ ...prev, actualStartTime: value }))} />
        </ModalField>
        <ModalField label="เสร็จ">
          <TimeInput ariaLabel="เวลาที่เสร็จจริง" value={form.actualEndTime} onChange={(value) => setForm((prev) => ({ ...prev, actualEndTime: value }))} />
        </ModalField>
      </div>
      {/* ⭐ งานที่จบคนละวันกับวันเข้า (mig 0386) — บอกวันเสร็จแบบอ่านอย่างเดียว ไม่งั้น "14:00 → 09:00" อ่านเหมือน
          เวลากลับหัว · ช่องแก้วันเสร็จยังไม่มี (ยกไว้ทีหลัง) — ค่ามาจากปุ่มส่งงาน/ปิดงานที่ประทับข้ามวัน */}
      {endDateNote ? <p className={styles.hint} role="note">{endDateNote}</p> : null}
      <ModalField label="สรุปงานที่ทำ" htmlFor={summaryId}>
        <Textarea id={summaryId} rows={2} value={form.summary} onChange={change("summary")} maxLength={2000} />
      </ModalField>
    </div>
  );

  const tail = (
    <>
      {/* ⭐ ผลการเข้าจริงโผล่เมื่อถึงเวลา (pain 7) — ร่างล่วงหน้าไม่มี · นัดที่ยังไม่ถึงวันพับไว้ · ค่าในฟอร์มอยู่ครบเสมอ */}
      {sections.actual === "open" ? (
        <fieldset className={styles.actualSet}>
          <legend className={styles.legend}>ผลการเข้าจริง</legend>
          {actualFields}
        </fieldset>
      ) : sections.actual === "collapsed" ? (
        <Disclosure
          title="ผลการเข้าจริง"
          summary="วันที่เข้าจริง · เวลา · สรุปงานที่ทำ"
          open={actualOpen}
          onToggle={() => setActualOpen((prev) => !prev)}
        >
          {actualFields}
        </Disclosure>
      ) : null}

      <ModalField label="หมายเหตุ" htmlFor={noteId}>
        <Textarea
          id={noteId} rows={3} value={form.note} onChange={change("note")} maxLength={1000}
          placeholder="เช่น ลูกค้าขอให้โทรก่อนเข้า 30 นาที"
        />
      </ModalField>

      {/* ⚠️ เธรดไม่ถูกปิดตามสถานะนัด — ช่วงที่นัดถูกเลื่อน/ยกเลิก/ติดปัญหา คือช่วงที่มีเรื่องต้องเล่ามากที่สุด
          ⭐ พับไว้ แต่ **เมานต์ตั้งแต่เปิดโมดัล** (`hidden`) — โหลด/มาร์คว่าอ่านแล้วจังหวะเดิม · บรรทัดย่อมาจาก
             ก้อนเดียวกับที่เธรดโหลด (`onItemsChange`) ไม่ยิงซ้ำ */}
      {sections.thread && (
        <Disclosure
          title="ความเคลื่อนไหวของนัดนี้"
          count={digest.count}
          summary={digest.latest}
          open={threadOpen}
          onToggle={() => setThreadOpen((prev) => !prev)}
        >
          <UpdateThread
            entityType="service_visit"
            entityId={visit.id}
            order="desc"
            placeholder="พิมพ์บันทึกหน้างาน เช่น ลูกค้าแจ้งว่าเครื่องมีเสียงดัง..."
            emptyText="ยังไม่มีความเคลื่อนไหว"
            onItemsChange={setThreadItems}
          />
        </Disclosure>
      )}
    </>
  );

  return (
    <ScheduleModalShell
      open={open}
      onClose={onClose}
      busy={saving || deleting}
      layout="split"
      title={header.title}
      kind={header.kind}
      status={header.status}
      origin={header.origin}
      context={header.context}
      aside={aside}
      main={main}
      tail={tail}
      secondary={secondary}
      primary={primary}
      outcome={view.outcome}
      error={error}
    />
  );
}
