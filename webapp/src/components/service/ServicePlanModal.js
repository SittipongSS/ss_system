"use client";
// ── ฟอร์มรอบบริการ (mig 0188 · ความถี่ตามปฏิทิน mig 0397) — ตัวเดียวใช้ทั้ง "สร้างรอบ" และ "แก้รอบ" ─────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//
// ⭐ **รอบเดินตามปฏิทิน** (มติเจ้าของ 29/09): ความถี่ = แผ่นเลือกสามชนิด (ทุกเดือน · ทุกสัปดาห์ · ทุก N วัน) แล้วช่องของชนิดนั้น
//    ของเดิมมีแต่ "ทุก N วัน" + ปุ่มลัด "ทุกเดือน = 30 วัน" ⇒ สัญญา 12 เดือนได้ 13 นัด และวันที่ของเดือนไหลไปเรื่อย ๆ
//    · สถานะฟอร์ม/ตัวเลขบรรทัดสรุปทั้งหมดอยู่ที่ `servicePlanForm.js` (logic ล้วน มีเทสต์) — ไฟล์นี้วาดอย่างเดียว
//    · คำบนจอของความถี่ทั้งชุดมาจาก `CADENCE_TEXT` (lib/service/cadence.js) — ห้ามพิมพ์ซ้ำที่นี่
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import CustomerBillingRuleDayGrid from "@/components/database/CustomerBillingRuleDayGrid";
import { businessDate } from "@/lib/businessDate";
import { fmtDate } from "@/lib/format";
import useHolidayMap from "@/lib/useHolidayMap";
import { CADENCE_TEXT, cadenceText, holidayGapText, sameCadence, suggestCadence } from "@/lib/service/cadence";
import { CONTRACT_MISSING_WARNING, planSuggestionLabel } from "@/lib/service/intakePlanFacts";
import { PLAN_KINDS, PLAN_ROUNDS_SOLD_HINT, VISIT_KIND_LABELS, VISIT_STATUS_LABELS, normalizePlanInput } from "@/lib/service/rounds";
import { WEEKDAY_LABELS } from "@/lib/service/sites";
import {
  EMPTY_PLAN_FORM, accessWarningText, applySuggestion, cancelVisitIdsOf, everyMonthOptions, everyWeekOptions, isWeekendDay,
  keptOfPreview, pickRangeDay, pickSingleDay, planFormBlocker, planFormCadence, planFormFields, planFormFromPlan,
  planFormMonthDay, planFormWeekday, planSummary, rangeDays, scheduleConfirmOf, setDayMode, staysLineOf,
} from "./servicePlanForm";
import styles from "./ServiceSiteModal.module.css";
import planStyles from "./ServicePlanModal.module.css";

/* คำของปุ่ม "ใช้" ในแคตตาล็อกชื่อขึ้นต้นด้วย `use…` (ใช้ความถี่ / ป้ายปุ่ม) — หยิบออกมาตั้งชื่อใหม่ที่ระดับโมดูล
   ไม่งั้นกฎ react-hooks อ่าน `CADENCE_TEXT.useSuggestionAria(…)` ในเงื่อนไขเป็นการเรียก hook */
const { useSuggestion: SUGGESTION_USE_LABEL, useSuggestionAria: suggestionAriaLabel } = CADENCE_TEXT;

/* `roundsSold` = จำนวนรอบบริการที่ฝ่ายขายตั้งไว้ในใบ (mig 0326) — null/ไม่ส่ง
   = ยังไม่มี ⇒ บรรทัดเทียบไม่ขึ้นเลย ไม่ใช่ขึ้นแล้วบอก 0 */
/* `salesOrderId` = ใบสั่งขายที่ครอบรอบนี้ (mig 0188 มีคอลัมน์นี้มาตั้งแต่แรก)
   🔴 **ก่อนหน้านี้ไม่มีใครส่งค่านี้เลยทั้งระบบ** ⇒ คอลัมน์ "รอบที่เดิน n/N" บนทะเบียน
      ใบสั่งขายซึ่งนับผ่าน `service_plans."salesOrderId"` ตอบ 0 ให้ทุกใบมาตลอด
   ⭐ **ตอนนี้เป็นช่องจริงในฟอร์ม ส่งทั้งตอนสร้างและตอนแก้** (2026-09-02)
      เดิมส่งเฉพาะตอนสร้าง เพราะ PATCH ผสม `{...before, ...body}` แล้ว `undefined`
      ใน spread ทับค่าเดิม ⇒ ส่งทุกครั้งตอนที่ยังไม่มีช่อง = ล้างค่าเดิมทิ้ง
      พอมีช่องแล้ว ค่าที่ส่งคือสิ่งที่คนเลือกไว้เสมอ จึงส่งได้ทุกครั้งอย่างปลอดภัย
   🪤 เคสที่ต้องใช้ช่องนี้บ่อยที่สุดคือ **ออก Rev.** — ไม่มีโค้ดไหนย้าย `salesOrderId`
      ไปใบใหม่ให้ ⇒ รอบชี้ใบที่ตายแล้วจนกว่าจะมีคนย้ายเอง */
/* ⭐ **เปิดจากแถว "รอตั้งรอบ" (PR-C · C6 · IMPL_PLAN_C §4.5)** — สอง props เสริม ไม่ส่ง = หน้าตาเดิมเป๊ะ
   · `context = { subtitle, strip, contractWarning, roundsSold, existingPlanWarning? }` = ของแสดงผลล้วน (แถบ "งานนี้ · …" ·
     คำเตือนสัญญา · ชิป "จำนวนรอบบริการ" · คำเตือนรอบซ้อน) — ไม่เคยกลายเป็นค่าในฟอร์มเอง
   · `prefill = { kind, startDate, endDate, startHint }` = ค่าเริ่มของโหมดสร้างเท่านั้น (ช่วงบริการของใบ ·
     ช่วงเริ่มไปแล้ว = วันนี้) · ทั้งสองก้อนมาจาก `planRowFacts` (intakePlanFacts.js) ตัวเดียว
   ⭐ **ค่าเริ่มของความถี่ = "ทุกเดือน" วันที่ของวันเริ่มรอบ** (คำตอบเจ้าของข้อ 3 · 29/09 — แทน C-D6 "ค่าเริ่ม 30 วัน")
      ข้อเสนอที่ได้นัดเท่าจำนวนรอบบริการพอดีเป็นชิปที่ต้องกด "ใช้" เอง (เขียนความถี่ทั้งก้อน) · ตรงกับที่ตั้งอยู่แล้ว = ชิปหาย
   ⚠️ ชิปขึ้นเฉพาะเมื่อมี `context` — หน้าไซต์/แท็บ SO ส่ง `roundsSold` ระดับไซต์/ใบ (Σ หลายไซต์)
      เอามาหารช่วงเวลาจะได้ความถี่ผิด ⇒ สองจอนั้นไม่ส่ง context และไม่มีชิป */
/* `accessDays` = วันที่ไซต์เปิดให้เข้า (0 = อาทิตย์ … 6 = เสาร์ · ของ service_sites) — ไม่บังคับ · ใช้แค่เตือนใต้ชิปวันของ
   รอบรายสัปดาห์เมื่อวันที่เลือกอยู่นอกลิสต์ (เตือน ไม่บล็อก) · ผู้เรียกที่ไม่มีไซต์ในมือไม่ต้องส่ง */
export default function ServicePlanModal({
  open, siteId, plan = null, technicians = [], roundsSold = null, salesOrderId = null,
  salesOrders = null, context = null, prefill = null, accessDays = null, onClose, onSave,
}) {
  const editing = !!plan;
  const [form, setForm] = useState(EMPTY_PLAN_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /* กดชิปเสาร์/อาทิตย์ของรอบรายสัปดาห์ ⇒ บอกเหตุใต้ชิป (title อย่างเดียวมองไม่เห็นบนมือถือ) */
  const [weekendNote, setWeekendNote] = useState(false);
  /* คำถามยืนยัน "ยกเลิกนัดตามรอบเดิม n นัด" — `{ payload, preview, error }` · null = ไม่ได้ถามอยู่ */
  const [confirm, setConfirm] = useState(null);
  /* วันหยุดของระบบ (ตารางเดียวกับที่ server ใช้ตอนสร้างนัด) — ใช้กับ "นัดถัดไป" และคำเตือนปีที่ยังไม่มีวันหยุด
     โหลดไม่สำเร็จ/ยังไม่เสร็จ = Map ว่าง: ตัวอย่างเลื่อนหนีแค่เสาร์–อาทิตย์ และไม่มีคำเตือนปีขาด (ไม่ใช่เหตุให้บันทึกไม่ได้) */
  const holidays = useHolidayMap();

  useEffect(() => {
    if (!open) return;
    setError("");
    setWeekendNote(false);
    setConfirm(null);
    setForm(plan
      ? planFormFromPlan(plan)
      /* โหมดสร้าง: ค่าเติมจากแถวคิว (ถ้ามี) — ชนิดงานที่ไม่รู้จักตกกลับค่าเริ่ม · ความถี่มาจาก EMPTY_PLAN_FORM เสมอ
         ("ทุกเดือน" ตามวันเริ่มรอบ) ไม่เติมจากแถว — ข้อเสนอของแถวเป็นชิปให้กด "ใช้" */
      : {
        ...EMPTY_PLAN_FORM,
        salesOrderId: salesOrderId || "",
        kind: PLAN_KINDS.includes(prefill?.kind) ? prefill.kind : EMPTY_PLAN_FORM.kind,
        startDate: prefill?.startDate || "",
        endDate: prefill?.endDate || "",
      });
    /* 🔴 **deps เป็น primitive ของ prefill เท่านั้น ห้ามใส่ object `prefill`/`context`** (critique M6)
       หน้าคิวโหลดใหม่ทุกครั้งที่กลับมาที่แท็บ (`useRevalidateOnFocus`) ⇒ ได้ object ใหม่ค่าเดิมทุกรอบ
       ผูกกับ object = ฟอร์มถูกล้างกลางทาง สิ่งที่ TS พิมพ์ไว้หายเงียบ ๆ (ยาม: servicePlanModalPrefill.test.mjs) */
  }, [open, plan, salesOrderId, prefill?.kind, prefill?.startDate, prefill?.endDate]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const pickKind = (cadenceKind) => {
    setWeekendNote(false);
    setForm((prev) => ({ ...prev, cadenceKind }));
  };
  /* เสาร์–อาทิตย์: โชว์เสมอ กดได้ แต่ไม่ถูกเลือก — กดแล้วบอกเหตุ (กติกา "ติดด่าน = โชว์แล้วบอกเหตุตอนกด") */
  const pickWeekday = (weekday) => {
    if (isWeekendDay(weekday)) { setWeekendNote(true); return; }
    setWeekendNote(false);
    setForm((prev) => ({ ...prev, weekday }));
  };

  /* ⭐ **ตัวประมาณ ไม่ใช่ตัวบังคับ** (มติผู้ใช้) — ระบบไม่บล็อกเมื่อจำนวนนัดไม่ตรงกับจำนวนรอบบริการ
     รอบจริงเลื่อน/งด/แถมได้ตามหน้างาน · บรรทัดสรุปมีไว้ให้คนตั้งความถี่เห็นผลทันที
     ⚠️ ไม่มีวันสิ้นสุด = ประมาณไม่ได้ ⇒ บอกตรง ๆ ว่าต้องใส่วันสิ้นสุดก่อน
     ตัวเลขทั้งหมดมาจาก cadence.js ตัวเดียวกับตัวสร้างนัดของ server (ผ่าน `planSummary`) */
  const summary = planSummary(form, { todayIso: businessDate(), holidays });
  const estimate = summary.estimate;
  const gapText = holidayGapText(summary.gapYears);
  const ranged = form.dayMode === "range";
  const pickedWeekday = planFormWeekday(form);
  const accessWarning = accessWarningText(form, accessDays, WEEKDAY_LABELS);

  /* ชิป "จำนวนรอบบริการ R รอบ → ทุกเดือน วันที่ 22" (คำตามมติ 29/09 · คำตอบเจ้าของข้อ 3) — ตัวตัดสินเดียวกับคอลัมน์
     "รอบที่แนะนำ" ของแถวคิว (`suggestCadence`: ความถี่ตัวแรกที่ได้นัดเท่าจำนวนรอบบริการพอดี) แต่คิดจากวันที่ที่อยู่ในฟอร์มตอนนี้
     ⇒ TS แก้วันเริ่ม/สิ้นสุดแล้วข้อเสนอขยับตาม
     · ตรงกับที่ตั้งอยู่แล้ว = ไม่มีอะไรให้เสนอ ⇒ ชิปหาย (ไม่ใช่ปุ่ม "ใช้" ที่กดแล้วไม่เกิดอะไร)
     · ไม่มีความถี่ไหนได้พอดี/โดนเพดาน 365 วัน ⇒ ข้อความบอกว่าได้ราวกี่นัด — มาจาก `planSuggestionLabel` */
  const suggestion = context?.roundsSold && form.startDate && form.endDate
    ? suggestCadence({ startDate: form.startDate, endDate: form.endDate, rounds: context.roundsSold })
    : null;
  const suggestionLabel = suggestion && !sameCadence(suggestion, summary.cadence)
    ? planSuggestionLabel(context.roundsSold, suggestion)
    : null;

  const submit = async () => {
    /* 🔴 **ส่ง `salesOrderId` ทั้งตอนสร้างและตอนแก้** (เปลี่ยนจากเดิมที่ส่งเฉพาะตอนสร้าง)
       ของเดิมกันไว้เพราะยังไม่มีช่องให้แก้ ⇒ ส่งทุกครั้งจะล้างค่าเดิมทิ้งเมื่อแก้จาก
       หน้าไซต์ · ตอนนี้มีช่องจริงแล้ว ค่าที่ส่งจึงเป็นสิ่งที่คนเลือกไว้เสมอ
       ⚠️ ค่าว่าง = "ไม่ผูกใบ" ซึ่งเป็นคำตอบที่ถูกต้องคำตอบหนึ่ง ไม่ใช่ "ไม่ได้กรอก"
          ⇒ ส่ง null ไปตรง ๆ ไม่ใช่ตัดคีย์ทิ้ง (ตัดทิ้ง = ค่าเดิมค้างเพราะ PATCH ผสม) */
    /* 🔴 **ความถี่ส่งครบหกช่องทุกครั้ง** (ช่องที่ชนิดนั้นไม่ใช้ = null) — PATCH ผสมค่าเดิมมา ถ้าส่งไม่ครบ
       everyDays ของรอบเดิมจะค้างอยู่กับรอบรายเดือน แล้ว CHECK ในฐานตีกลับ · ช่องร่างของจอไม่ถูกส่ง */
    const payload = {
      ...planFormFields(form),
      siteId,
      ...planFormCadence(form),
      salesOrderId: form.salesOrderId || null,
    };
    /* ตัวตรวจตัวเดียวกับ API ก่อน แล้วค่อยด่านของจอ (โหมดช่วงวันที่ยังไม่แตะวันสุดท้าย — API มองไม่เห็น) */
    const invalid = normalizePlanInput(payload).error || planFormBlocker(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      /* ⭐ คำตอบเจ้าของข้อ 4: รอบที่มีนัดสร้างไว้แล้วถูกเปลี่ยนตาราง ⇒ server ยังไม่เขียนอะไร ตอบ 409 พร้อมรายการ
         นัดตามรอบเดิมที่ยังไม่ได้เข้าและไม่มีใครย้ายวัน — ถามก่อน (กติกาโมดัลอนุมัติ: บอกผลก่อนกด) */
      const asked = scheduleConfirmOf(e);
      if (asked) setConfirm({ payload, preview: asked.preview, error: "" });
      else setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  /* ยืนยันแล้ว = ส่ง payload เดิม + id ของนัดในรายการที่เห็น · server ยกเลิกเฉพาะใบที่ยังเข้าข่ายตอนนั้น
     · รายการเปลี่ยนไประหว่างนั้น (มีนัดใหม่เข้าข่าย) ⇒ 409 อีกรอบ: เปลี่ยนรายการแล้วบอกในกล่อง
     · พังกลางทาง (500) ⇒ ข้อความของ server บอกว่าค้างถึงไหน กดยืนยันซ้ำด้วย payload เดิมได้ (ลำดับเขียนของ API ทำให้ซ้ำแล้วหาย) */
  const confirmCancel = async () => {
    if (!confirm) return;
    const { payload, preview } = confirm;
    try {
      await onSave({ ...payload, cancelVisitIds: cancelVisitIdsOf(preview) });
      setConfirm(null);
      onClose();
    } catch (e) {
      const asked = scheduleConfirmOf(e);
      setConfirm(asked
        ? { payload, preview: asked.preview, error: asked.message || "" }
        : { payload, preview, error: e.message || "บันทึกไม่สำเร็จ" });
    }
  };
  const confirmCount = confirm ? confirm.preview.cancel.length : 0;
  const keptLine = confirm ? CADENCE_TEXT.confirm.kept(keptOfPreview(confirm.preview)) : null;
  /* นัดที่ยังไม่ได้เข้าซึ่งอยู่ต่อเป็นนัดของรอบใหม่ (ไม่อยู่ในรายการยกเลิก) — บอกก่อนกด ไม่ใช่ให้ไปรู้จาก toast */
  const staysLine = confirm ? staysLineOf(confirm.preview) : null;

  return (
    <>
    <Modal open={open} onClose={onClose} title={editing ? "แก้รอบบริการ" : "สร้างรอบบริการ"} subtitle={context?.subtitle} size="md" dismissible={!confirm}>
      {/* แถบบริบท (อ่านอย่างเดียว) + คำเตือนสัญญา — อยู่นอกกริดและนอก <label> (คำเตือนเป็นบล็อก · กฎ 20)
          ใบสั่งขายของรอบถูกตรึงจากแถว (C7 ส่ง `salesOrders={null}`) ⇒ แถบนี้คือที่เดียวที่บอกว่ารอบนี้ผูกใบไหน */}
      {context && (
        <div className={planStyles.context}>
          {/* ตัดเป็นท่อนตาม " · " ให้ขึ้นบรรทัดทีละท่อน — สตริงเปล่าบนจอแคบจะหักกลางช่วงวันที่ (22/10/2026– | 21/10/2027)
              · สตริงที่ไม่มีตัวคั่น = ท่อนเดียว (ยังแสดงครบ) */}
          {context.strip ? (
            <p className={planStyles.strip}>
              {context.strip.split(" · ").map((part, index, parts) => (
                <span key={index} className={planStyles.stripPart}>{index < parts.length - 1 ? `${part} ·` : part}</span>
              ))}
            </p>
          ) : null}
          {context.contractWarning && (
            <StatusNotice tone="warning">{CONTRACT_MISSING_WARNING}</StatusNotice>
          )}
          {/* รอบอื่นที่เดินอยู่ที่ไซต์ (ใบอื่น · รอบเดิมที่ควรย้ายมา · รอบไม่ผูกใบ) — สร้างซ้ำ = นัดซ้อน (review 29/09)
              บอกก่อนกด ไม่บล็อก (กติกาเดียวกับ `hasForeignPlan` ของแท็บงานบริการของใบ) */}
          {context.existingPlanWarning && (
            <StatusNotice tone="warning">{context.existingPlanWarning}</StatusNotice>
          )}
        </div>
      )}

      <div className={styles.grid}>
        {/* ไม่มีช่องเลือกใบ (เปิดจากแถวคิว/แท็บงานบริการของใบ) ⇒ ชนิดงานกินเต็มแถว — ไม่งั้นกริดจับ "ชนิดงาน | เริ่มรอบ"
            แล้ววันสิ้นสุดตกไปอยู่เดี่ยวอีกแถว ทั้งที่เริ่ม–สิ้นสุดเป็นคู่ที่อ่านด้วยกัน (docs/form-design-rules.md §1 ข้อ 6) */}
        <label className={Array.isArray(salesOrders) ? styles.field : `${styles.field} ${styles.wide}`}>
          <span>ชนิดงาน *</span>
          <Select value={form.kind} onChange={change("kind")}>
            {PLAN_KINDS.map((kind) => (
              <option key={kind} value={kind}>{VISIT_KIND_LABELS[kind]}</option>
            ))}
          </Select>
        </label>

        {/* ⭐ **รอบเป็นข้อผูกพันของใบสั่งขาย ไม่ใช่ของไซต์** — ช่องนี้คือทางเดียวที่
            ผูก/ย้ายใบให้รอบที่มีอยู่แล้วได้ · ก่อนหน้านี้ไม่มีเลย ⇒ รอบที่สร้างจาก
            หน้าไซต์ได้ `salesOrderId = null` ถาวร แล้วคอลัมน์ "รอบที่เดิน n/N"
            ของทุกใบไม่นับมันเลยตลอดกาล
            🪤 เคสที่ต้องใช้บ่อยที่สุดคือ **ออก Rev.** — ไม่มีโค้ดไหนย้าย salesOrderId
               ไปใบใหม่ให้ ⇒ ต้องมีคนย้ายเอง ที่นี่
            ⚠️ ขึ้นเฉพาะเมื่อผู้เรียกส่งตัวเลือกมา — หน้าที่ไม่รู้จักใบ (ถ้ามีในอนาคต)
               ต้องไม่ได้ช่องเปล่าที่เลือกอะไรไม่ได้ */}
        {Array.isArray(salesOrders) && (
          <label className={styles.field}>
            <span>ใบสั่งขายที่ครอบรอบนี้</span>
            <Select
              value={form.salesOrderId || ""}
              onChange={change("salesOrderId")}
            >
              <option value="">ไม่ผูกใบ</option>
              {salesOrders.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber || o.id}</option>
              ))}
            </Select>
            <small className={styles.hint}>
              {form.salesOrderId
                ? "รอบนี้จะถูกนับเป็น “รอบที่เดิน” ของใบนี้"
                : "ไม่ผูกใบ = ไม่ถูกนับเป็นรอบตามข้อผูกพันของใบไหนเลย"}
            </small>
          </label>
        )}

        {/* วันเริ่ม–สิ้นสุดมาก่อนความถี่ (docs/form-design-rules.md §1 ข้อ 1) — ค่าเริ่มของความถี่ ("วันที่ของวันเริ่มรอบ")
            ข้อเสนอของชิป และจำนวนนัดในบรรทัดสรุป คิดจากสองช่องนี้ทั้งหมด */}
        <label className={styles.field}>
          <span>เริ่มรอบ *</span>
          <DateInput value={form.startDate} onChange={(iso) => setForm((prev) => ({ ...prev, startDate: iso }))} />
          {/* บอกที่มาของวันที่เติมให้ — หายเองเมื่อ TS เปลี่ยนวัน (คำบอกจะโกหกทันทีที่วันไม่ใช่ค่าที่ระบบเติม) */}
          {!editing && prefill?.startHint && form.startDate === prefill.startDate && (
            <small>{prefill.startHint}</small>
          )}
        </label>

        <label className={styles.field}>
          <span>สิ้นสุดรอบ</span>
          <DateInput value={form.endDate} onChange={(iso) => setForm((prev) => ({ ...prev, endDate: iso }))} />
          <small>เว้นว่าง = ไม่มีกำหนดสิ้นสุด</small>
        </label>

        {/* ── ความถี่ (mig 0397) ── <fieldset> ไม่ใช่ <label>: ข้างในเป็นแผ่นเลือก/ตารางวัน/คำเตือนที่เป็นบล็อก (กฎ 20)
            ชุดเล็กตายตัว = แผ่นเลือก/ชิปที่เห็นครบ ไม่ใช่ดรอปดาวน์ (docs/form-design-rules.md §3) */}
        <fieldset className={`${planStyles.cadence} ${styles.wide}`}>
          <legend>{CADENCE_TEXT.fieldLabel} *</legend>
          <div className={planStyles.cadenceBody}>
            <OptionTiles value={form.cadenceKind} onChange={pickKind} options={CADENCE_TEXT.tiles} ariaLabel={CADENCE_TEXT.fieldLabel} />

            {form.cadenceKind === "monthly" && (
              <>
                <div className={planStyles.row}>
                  <span className={planStyles.rowLabel}>{CADENCE_TEXT.everyLabel}</span>
                  <ChoiceChips
                    value={form.monthEvery}
                    onChange={(monthEvery) => setForm((prev) => ({ ...prev, monthEvery }))}
                    options={everyMonthOptions(form)}
                    ariaLabel={CADENCE_TEXT.everyLabel}
                  />
                </div>
                <div className={planStyles.row}>
                  <span className={planStyles.rowLabel}>{CADENCE_TEXT.monthDayLabel}</span>
                  <ChoiceChips
                    value={form.dayMode}
                    onChange={(mode) => setForm((prev) => setDayMode(prev, mode))}
                    options={CADENCE_TEXT.dayModes}
                    ariaLabel={CADENCE_TEXT.monthDayLabel}
                  />
                </div>
                {/* ตารางวัน 1–30 + "31 · สิ้นเดือน" ตัวเดียวกับโมดัลรอบวางบิล — แตะเลือก ไม่พิมพ์ · ไม่ใช่ปฏิทินรายสัปดาห์ (8/6 คอลัมน์)
                    วันเดียว = เลือกหนึ่ง · ช่วงวัน = แตะวันแรกแล้วแตะวันสุดท้าย (ติดสีทั้งช่วง) */}
                <CustomerBillingRuleDayGrid
                  ariaLabel={CADENCE_TEXT.monthDayLabel}
                  multiple={ranged}
                  value={ranged ? rangeDays(form) : planFormMonthDay(form)}
                  onPick={(day) => setForm((prev) => (prev.dayMode === "range" ? pickRangeDay(prev, day) : pickSingleDay(prev, day)))}
                />
                <p className={styles.hint}>{ranged ? CADENCE_TEXT.rangeHint : CADENCE_TEXT.monthEndHint}</p>
              </>
            )}

            {form.cadenceKind === "weekly" && (
              <>
                <div className={planStyles.row}>
                  <span className={planStyles.rowLabel}>{CADENCE_TEXT.everyLabel}</span>
                  <ChoiceChips
                    value={form.weekEvery}
                    onChange={(weekEvery) => setForm((prev) => ({ ...prev, weekEvery }))}
                    options={everyWeekOptions(form)}
                    ariaLabel={CADENCE_TEXT.everyLabel}
                  />
                </div>
                <div className={planStyles.row}>
                  <span className={planStyles.rowLabel}>{CADENCE_TEXT.weekdayLabel}</span>
                  {/* เจ็ดชิปเรียงอาทิตย์–เสาร์จาก WEEKDAY_LABELS ตามดัชนี (มติ 26/09 สัปดาห์เริ่มวันอาทิตย์ — ห้ามพิมพ์ลิสต์วันเอง)
                      อา./ส. โฟกัสได้ กดแล้วบอกเหตุ แต่เลือกไม่ได้ (aria-disabled) — ChoiceChips ไม่มี title/aria-disabled จึงวาดเอง */}
                  <div className={`choice-chips ${planStyles.weekdays}`} role="radiogroup" aria-label={CADENCE_TEXT.weekdayLabel}>
                    {WEEKDAY_LABELS.map((label, weekday) => {
                      const blocked = isWeekendDay(weekday);
                      const on = weekday === pickedWeekday;
                      return (
                        <button
                          key={weekday}
                          type="button"
                          role="radio"
                          className="choice-chip"
                          aria-checked={on}
                          data-on={on ? "1" : undefined}
                          aria-disabled={blocked ? "true" : undefined}
                          title={blocked ? CADENCE_TEXT.weekendBlocked : undefined}
                          onClick={() => pickWeekday(weekday)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className={planStyles.note} role="status">{weekendNote ? CADENCE_TEXT.weekendBlocked : ""}</p>
                {/* เตือน ไม่บล็อก — บอกวันที่ไซต์ให้เข้ากับวันที่เลือกด้วยชื่อ ("ไซต์นี้ให้เข้าเฉพาะ จ. อ. พ. — วันพฤหัสบดี…") */}
                {accessWarning && (
                  <p className={planStyles.warn}>{accessWarning}</p>
                )}
              </>
            )}

            {/* ทุก N วัน — ช่องว่างจนกว่าจะพิมพ์ (ไม่มีค่าเริ่ม 30 · ไม่มีปุ่มลัด "ทุกเดือน = 30 วัน" ที่เป็นต้นเหตุ 13 นัดต่อปี) */}
            {form.cadenceKind === "days" && (
              <label className={styles.field}>
                <span>{CADENCE_TEXT.everyDaysLabel}</span>
                <Input type="number" min="1" max="365" inputMode="numeric" autoComplete="off" value={form.everyDays} onChange={change("everyDays")} />
                <small>{CADENCE_TEXT.everyDaysHint}</small>
              </label>
            )}

            {/* ชิปข้อเสนอ — เฉพาะเมื่อเปิดจากแถวคิว · span + ปุ่ม (ทรงเดิมของ PR-C) */}
            {context && suggestionLabel && (
              <span className={planStyles.suggestion}>
                <span>{suggestionLabel}</span>
                <Button tone="neutral" variant="outline" size="sm" aria-label={suggestionAriaLabel(cadenceText(suggestion))} onClick={() => setForm((prev) => applySuggestion(prev, suggestion))}>{SUGGESTION_USE_LABEL}</Button>
              </span>
            )}

            {/* บรรทัดสรุป: จำนวนรอบบริการ · ความถี่ · ตกวันหยุดไปลงที่ไหน · ได้กี่นัด (เทียบจำนวนรอบบริการ — ไม่ใช่ข้อห้าม) */}
            {(roundsSold || summary.text || summary.pending) && (
              <p className={styles.hint}>
                {/* เปิดจากหน้าใบสั่งขาย = ตัวเลขของ *ใบนั้น* · เปิดจากหน้าไซต์ = ของทั้งไซต์
                    ⇒ ต้องบอกให้ตรง ไม่งั้นฟอร์มหน้าตาเดียวกันโชว์ N คนละตัวโดยไม่มีใครรู้ */}
                {roundsSold
                  ? <>{salesOrderId ? PLAN_ROUNDS_SOLD_HINT.ofOrder : PLAN_ROUNDS_SOLD_HINT.ofSite}{" "}<strong>{roundsSold} รอบ</strong></>
                  : null}
                {roundsSold && (summary.text || summary.pending) ? " · " : null}
                {summary.pending || summary.text}
                {summary.shiftText ? <>{" · "}{summary.shiftText}</> : null}
                {summary.text && estimate != null ? <>{" · "}<strong>{CADENCE_TEXT.visits(estimate)}</strong></> : null}
                {summary.needEndDate ? <>{" · "}{CADENCE_TEXT.needEndDate}</> : null}
                {roundsSold && estimate != null && estimate === roundsSold
                  ? <>{" "}{CADENCE_TEXT.matchesSold}</>
                  : null}
                {roundsSold && estimate != null && estimate !== roundsSold
                  ? <>{" — "}{PLAN_ROUNDS_SOLD_HINT.diff(Math.abs(estimate - roundsSold))}</>
                  : null}
              </p>
            )}
            {summary.nextText ? (
              <p className={styles.hint}>{CADENCE_TEXT.nextLabel} {summary.nextText}</p>
            ) : null}
            {/* ตาราง holidays ยังไม่มีปีที่รอบนี้ไปถึง ⇒ นัดของปีนั้นเลื่อนหนีได้แค่เสาร์–อาทิตย์ — เตือน ไม่บล็อก */}
            {gapText ? <StatusNotice tone="warning">{gapText}</StatusNotice> : null}
          </div>
        </fieldset>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>เจ้าหน้าที่ประจำรอบ</span>
          <SearchableSelect
            value={form.assigneeId}
            onChange={(id) => {
              const tech = technicians.find((t) => t.id === id);
              setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
            }}
            options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="ยังไม่กำหนด"
            ariaLabel="เจ้าหน้าที่ประจำรอบ"
          />
          <small>เป็นค่าตั้งต้นของนัดที่ระบบสร้างให้ · ย้ายคนรายนัดได้ที่ตาราง</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} autoComplete="off" value={form.note} onChange={change("note")} maxLength={1000} />
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

      {/* ระยะเติมนัดของรอบนี้: 90 วัน · รอบหลายเดือน = อย่างน้อยหนึ่งงวดเต็ม + 7 วัน (`horizonDaysFor`) */}
      <p className={styles.hint}>
        ระบบสร้างนัดล่วงหน้า <strong>{summary.horizonDays} วัน</strong> เท่านั้น แล้วต่อรอบให้เมื่อปิดงานจริง —
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

    {/* ⭐ คำตอบเจ้าของข้อ 4 + กติกาโมดัลอนุมัติ: เปลี่ยนรอบที่มีนัดสร้างไว้แล้ว ⇒ กล่องนี้บอกผลก่อนเขียนอะไร —
        นัดใบไหนถูกยกเลิกและถอดออกจากรอบ · ใบไหนไม่ถูกแตะ · แล้วระบบสร้างนัดตามรอบใหม่ให้
        ทางออกมีสองทาง: ยืนยัน หรือ "กลับไปแก้รอบ" (ยังไม่ได้บันทึกอะไร) · ระหว่างถาม โมดัลหลักปิดด้วย Esc/กากบาทไม่ได้
        (Esc · Tab เป็นของโมดัลบนสุดตัวเดียวอยู่แล้ว — components/Modal.js · `dismissible={!confirm}` เป็นยามชั้นสอง
        กันฟอร์มที่กรอกไว้ปิดไปด้วย) · โทนกลาง ไม่ใช่แดง — นัดถูกยกเลิก ไม่ได้ถูกลบ */}
    <ConfirmDialog
      open={!!confirm}
      title={CADENCE_TEXT.confirm.title}
      message={CADENCE_TEXT.confirm.message(confirmCount)}
      detail={confirm ? CADENCE_TEXT.confirm.detail(confirm.preview.fromText, confirm.preview.toText) : undefined}
      confirmLabel={CADENCE_TEXT.confirm.confirmLabel(confirmCount)}
      cancelLabel={CADENCE_TEXT.confirm.cancelLabel}
      error={confirm?.error}
      onConfirm={confirmCancel}
      onClose={() => setConfirm(null)}
    >
      {confirm ? (
        <>
          <ul className={planStyles.visits}>
            {confirm.preview.cancel.map((visit) => (
              <li key={visit.id}>
                <span className="mono">{visit.code || visit.id}</span>
                {" · "}{fmtDate(visit.scheduledDate)}
                {" · "}{VISIT_STATUS_LABELS[visit.status] || visit.status}
                {visit.assigneeName ? ` · ${visit.assigneeName}` : null}
              </li>
            ))}
          </ul>
          {staysLine ? <p className={planStyles.kept}>{staysLine}</p> : null}
          {keptLine ? <p className={planStyles.kept}>{keptLine}</p> : null}
        </>
      ) : null}
    </ConfirmDialog>
    </>
  );
}
