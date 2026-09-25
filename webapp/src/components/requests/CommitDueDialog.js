"use client";
// ── โมดัล "ลงคิวเข้าพื้นที่ / แจ้งกำหนดส่ง" — ตัวเดียวของทุกหน้าที่มีปุ่มนี้ ─────────────
//
// ⭐ มติเจ้าของ 23/09: TS ลงคิวคำร้องประเมินพื้นที่ได้ **จากหน้าจัดคิว** (/service/schedule) ด้วย
//    ไม่ใช่เฉพาะหน้าใบ (/requests/[id]) ⇒ ฟอร์มเดียวกันสองที่ = component เดียว (กติกา AGENTS.md
//    "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" · ฟอร์มที่ก๊อปสองชุดเพี้ยนหากันเสมอ)
//    · ตรรกะทั้งหมด (ป้าย · ค่าตั้งต้น · ก้อน PATCH · ด่านของปุ่ม · หัว · "งานนี้" · ชิปผู้ขอ · ผลลัพธ์)
//      อยู่ที่ `lib/requests/commitDue.js` (+ แผงด่านที่ `lib/service/scheduleModal.js`)
//      ตัวนี้เป็นเปลือกอย่างเดียว ⇒ **สองหน้าส่งก้อนเดียวกันเสมอ** (`commitDuePayload`)
//    · ผู้เรียกถือการยิง API เอง (`onSubmit(payload)`) — หน้าใบใช้ `call()` ของมัน (ดึงใบใหม่ ·
//      toast · `_warning`) · หน้าจัดคิวโหลดรายการงานใหม่ · โมดัลไม่ต้องรู้ว่าอยู่หน้าไหน
// ⭐ หน้าตาแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09 · mockups/schedule-modal TwoCol-Request) — **เปลือกเดียวกับ
//    โมดัลนัด** (`ScheduleModalShell` · `TimeWindowField` · `GatePanel` · `CrewLoadPicker`)
//    · ซ้าย — "งานนี้" (งาน · เรื่อง · ที่ไหน · ผู้ขอ · ต้องการ · ที่มา) · ด่านของนัดที่จะเกิด (pain 16) · หมายเหตุ
//    · ขวา  — วันนัด + เวลาเริ่ม (เก็บได้แค่ `committedDueTime` · D1 — เช้า/บ่ายเติมแค่เวลาเริ่ม · เวลาจบเป็นช่องจาง)
//             + ชิปผู้ขอ · วันส่งผล + ชิปผู้ขอ · คน (ช่องบังคับ — ว่างอยู่ = กรอบสีเตือน)
//    · ท้าย — ยกเลิก · ปุ่มหลัก "ลงคิว" · บรรทัดผลลัพธ์ ("จะขึ้นตารางของ …" + คำเตือนที่ไม่บล็อก / เหตุที่ติด)
//      🐞 รีวิว UAT 24/09 (high): เคยทาย "จะจอดเป็นร่าง…" เมื่อนอกช่วงเข้าไซต์ — server ลงตารางเสมอ (ดู `commitDueOutcome`)
//    · แจ้งกำหนดส่ง (หัวข้ออื่น) = คอลัมน์เดียว: วัน + หมายเหตุ (ไม่มีนัด ไม่มีด่าน ไม่มีคน)
// ⭐ ตัวเลือกเจ้าหน้าที่ = `CrewLoadPicker` ตัวเดียวกับโมดัลนัด (เห็นภาระของวันที่เลือก ไม่นับร่าง)
//    · หน้าจัดคิวส่ง `staffLoadFor` ของตัวเองมา (ตัวเลขชุดเดียวกับตารางที่อยู่ข้าง ๆ)
//    · ไม่ส่งมา (หน้าใบ) ⇒ โมดัลโหลดเองผ่าน `useCrewLoad` — **สูตรเดียวกัน** (`crewLoadPeople`)
//      ⚠️ ฮุกอยู่ในตัวฟอร์มที่เมานต์เฉพาะตอนเปิด ⇒ ไม่ต้องไปวางฮุกหลัง early-return ของหน้าใบ
// ⚠️ โหมดมาจากทะเบียนหัวข้อ (`commitDueMode` → `requestNeedsRef(kind,'site')`) และ "ลงคิวใหม่"
//    มาจาก `surveyQueueStep` ตัวเดียวกับการ์ดบนหน้าจัดคิว — **ผู้เรียกส่งโหมดเองไม่ได้** ⇒ ส่งผิดไม่ได้
// ⚠️ เจ้าหน้าที่ **บังคับ** ⇒ ตัวเลือกไม่มีแถว "ยังไม่มอบหมาย" (`allowUnassigned={false}`)
// ⚠️ ปุ่มส่ง = `GatedAction` ของเปลือก — กดได้เสมอ ขาดอะไรบอกครบทุกช่องในครั้งเดียว (`commitDueGaps` ·
//    ตัวเดียวกับที่ server ตอบข้อแรก) ไม่ใช่ปุ่มจางที่ไม่บอกเหตุ (กฎฟอร์มของ repo)
import { useId, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import CrewLoadPicker from "@/components/service/CrewLoadPicker";
import GatePanel from "@/components/service/GatePanel";
import ScheduleModalShell from "@/components/service/ScheduleModalShell";
import { JobFacts, ModalField, WishChip, focusFieldBox } from "@/components/service/ScheduleModalParts";
import TimeWindowField from "@/components/service/TimeWindowField";
import useCrewLoad from "@/lib/service/useCrewLoad";
import { surveyQueueStep } from "@/lib/service/surveyQueue";
import { accessLine, commitDueGateView } from "@/lib/service/scheduleModal";
import {
  COMMIT_DUE_REASON_MAX, WISH_APPLY_TEXT, WISH_SAME_TEXT,
  commitDueDefaults, commitDueGaps, commitDueHeader, commitDueJobRows, commitDueLabels, commitDueMode,
  commitDueOutcome, commitDuePayload, commitDueWishes,
} from "@/lib/requests/commitDue";
import styles from "./CommitDueDialog.module.css";

/**
 * @param open        เปิดโมดัล — ปิดแล้วตัวฟอร์มถูกถอด (เปิดใหม่ = ค่าตั้งต้นใหม่จากใบ)
 * @param request     แถวคำร้อง (ใบประเมินต้องมี `surveyVisit` ติดมา — ใช้ตัดสิน "ลงคิวใหม่")
 * @param technicians เจ้าหน้าที่ที่มอบหมายได้ [{ id, name }] — ลำดับที่ส่งมาคือลำดับบนจอ
 * @param techniciansLoading รายชื่อยังโหลดไม่เสร็จ (ต่างจาก "ไม่มีใครเลย")
 * @param techniciansError   โหลดรายชื่อไม่สำเร็จ (ต่างจาก "ไม่มีใครเลย" เหมือนกัน)
 * @param staffLoadFor ภาระรายคนของวันหนึ่ง (หน้าจัดคิว) — ไม่ส่ง = โมดัลโหลดเอง
 * @param site        ไซต์ของใบ — บรรทัดไซต์ในหัว · "ที่ไหน" · ด่าน ④ (หน้าจัดคิว: แถวไซต์เต็ม · หน้าใบ: `req.surveySite`)
 * @param accessKnown ไซต์ที่ส่งมามีช่วงเวลาที่ให้เข้าครบไหม — ทั้งหน้าจัดคิวและหน้าใบ = true
 *                    (หน้าใบ: `surveySite` select ช่วงเวลามาด้วยแล้ว · มติเจ้าของ 25/09 ปิดข้อจำกัดจากรีวิว UAT 24/09)
 *                    ไม่ส่ง = ด่าน ④ "หน้านี้ไม่เห็นช่วงเข้าไซต์" ไม่เดาว่าผ่าน · ผลของการกดยังบอกได้แน่นอน
 * @param siteLoad    ภาระของไซต์ `{ assets, packs }` (หน้าจัดคิว: `workloadAll` · หน้าใบ: `surveySiteLoad` — สูตร
 *                    `visitBundle` ตัวเดียวกัน) — ไม่ส่ง = ไม่มีตัวเลขจุด (ไม่เดา)
 * @param today       วันนี้แบบไทย 'YYYY-MM-DD' (ค่าตั้งต้นของหัวข้อที่ไม่ใช่ใบประเมิน · "อีก n วัน")
 * @param busy        กำลังส่ง — ล็อกทั้งฟอร์มและปุ่ม
 * @param onSubmit    `(payload) => Promise` — ผู้เรียกยิง `PATCH /api/sa/requests/[id]` แล้วปิดเองเมื่อสำเร็จ
 */
export default function CommitDueDialog({ open, request, ...props }) {
  if (!open || !request) return null;
  return <CommitDueForm key={request.id} request={request} {...props} />;
}

function CommitDueForm({
  request,
  technicians = [],
  techniciansLoading = false,
  techniciansError = false,
  staffLoadFor = null,
  site = null,
  accessKnown = false,
  siteLoad = null,
  today,
  busy = false,
  onClose,
  onSubmit,
}) {
  const siteMode = commitDueMode(request) === "site";
  const requeue = surveyQueueStep(request) === "requeue";
  const labels = commitDueLabels(request, { requeue });
  const [form, setForm] = useState(() => commitDueDefaults(request, { requeue, today }));
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const apply = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  /* ภาระ: ของผู้เรียกก่อน · ไม่มีค่อยโหลดเอง (ฮุกไม่ยิงอะไรเลยเมื่อผู้เรียกส่งมา) */
  const ownLoadFor = useCrewLoad({ enabled: siteMode && !staffLoadFor, technicians });
  const loadFor = staffLoadFor || ownLoadFor;

  /* ภาระของวันที่กรอก — ตัวเลือกคนกับบรรทัดผลลัพธ์ (เตือนเกินภาระ) อ่านชุดเดียวกัน */
  const load = form.date ? loadFor(form.date) : null;

  const gaps = commitDueGaps(request, form);
  const header = commitDueHeader(request, { site });
  const jobRows = commitDueJobRows(request, { site, todayIso: today, siteLoad });
  const wishes = commitDueWishes(request, form);
  const gateView = commitDueGateView(request, form, { site, accessKnown, technicians });
  const outcome = commitDueOutcome(request, form, { site, accessKnown, technicians, load, siteLoad });
  const access = siteMode
    ? accessLine(site, { date: form.date, startTime: form.time }, { known: accessKnown && !!site })
    : null;
  const rosterState = techniciansLoading ? "loading" : techniciansError ? "error" : "ready";

  const resultId = useId();
  const assigneeLabelId = useId();
  const reasonId = useId();
  const dateRef = useRef(null);
  const assigneeRef = useRef(null);

  const close = () => { if (!busy) onClose?.(); };
  const submit = () => onSubmit?.(commitDuePayload(request, form, { technicians }));

  /* ลิงก์แก้บนแผงด่าน — พาโฟกัสไปช่องที่ข้อนั้นติด (คนที่เลือกไว้ก่อน · ไม่มีก็คนแรก · ตัวเดียวกับโมดัลนัด) */
  const focusField = (field) => {
    focusFieldBox(field === "assignee" ? assigneeRef.current : field === "scheduledDate" ? dateRef.current : null);
  };

  const aside = siteMode ? (
    <>
      <JobFacts rows={jobRows} />
      <GatePanel view={gateView} onFix={focusField} />
    </>
  ) : null;

  const main = (
    <>
      {/* ⭐ วัน (+ เวลาเริ่ม) — ช่องตัวเดียวกับโมดัลนัด · วันที่ผู้ขอต้องการเป็นชิป ไม่ใช่คำใบ้ที่ซ้ำค่าในช่อง
          ⚠️ ลงคิวเข้าพื้นที่เก็บได้แค่เวลาเริ่ม (`committedDueTime`) ⇒ เวลาจบเป็นช่องจาง "ไม่ระบุ" · เช้า/บ่ายเติมแค่เวลาเริ่ม
          ⚠️ แจ้งกำหนดส่ง (หัวข้ออื่น) = วันอย่างเดียว (`withTime={false}`) */}
      <TimeWindowField
        date={form.date || ""}
        onDate={set("date")}
        startTime={form.time || ""}
        endTime=""
        onTime={({ startTime }) => set("time")(startTime)}
        withEnd={false}
        withTime={siteMode}
        dateLabel={labels.dateLabel}
        timeLabel="เวลานัด (ไม่บังคับ)"
        todayIso={today}
        access={access}
        dateRef={dateRef}
        dateSlot={labels.dateHint ? <p className={styles.hint}>{labels.dateHint}</p> : null}
        accessSlot={siteMode ? (
          <WishChip wish={wishes.visit} onApply={apply} sameText={WISH_SAME_TEXT} applyText={WISH_APPLY_TEXT} />
        ) : null}
      />

      {siteMode && (
        <>
          {/* ⭐ วันส่งผล — คนละวันกับวันนัด (mig 0368) · บังคับ (ฝ่ายขายถามคำถามเดียว "ได้ตัวเลขวันไหน") */}
          <div className={styles.resultRow}>
            <ModalField label={labels.resultLabel} required htmlFor={resultId}>
              <DateInput id={resultId} value={form.resultDate || ""} onChange={set("resultDate")} required weekday />
            </ModalField>
            <div className={styles.resultSide}>
              <WishChip wish={wishes.result} onApply={apply} sameText={WISH_SAME_TEXT} applyText={WISH_APPLY_TEXT} />
              <p className={styles.hint}>{labels.resultHint}</p>
            </div>
          </div>

          {/* ⭐ ความรับผิดชอบอยู่ท้าย (กฎฟอร์ม §1.4) และตัวเลือกต้องรู้วันก่อนถึงบอกภาระได้
              · รายชื่อกำลังโหลด / โหลดพัง / ไม่มีใครเลย = สามข้อความของตัวเลือก (`rosterState`)
              · ผลของการเลือก (ขึ้นตาราง + คำเตือนเกินภาระ/นอกช่วงเข้าไซต์) อยู่ที่บรรทัดผลลัพธ์ใต้ปุ่ม (`commitDueOutcome`) */}
          <ModalField label="เจ้าหน้าที่ผู้รับผิดชอบ" required labelId={assigneeLabelId} fieldRef={assigneeRef}>
            <CrewLoadPicker
              allowUnassigned={false}
              value={form.assigneeId || ""}
              onChange={set("assigneeId")}
              technicians={technicians}
              load={load}
              dateIso={form.date || ""}
              labelledBy={assigneeLabelId}
              currentName={request.assigneeName || ""}
              siteLoad={siteLoad}
              timeWindow={{ startTime: form.time || "", endTime: "" }}
              rosterState={rosterState}
            />
          </ModalField>
        </>
      )}
    </>
  );

  const tail = (
    <ModalField label="หมายเหตุ (ไม่บังคับ)" htmlFor={reasonId}>
      <Textarea
        id={reasonId} maxLength={COMMIT_DUE_REASON_MAX}
        value={form.reason || ""}
        placeholder={labels.notePlaceholder}
        onChange={(e) => set("reason")(e.target.value)}
      />
    </ModalField>
  );

  return (
    <ScheduleModalShell
      open
      onClose={close}
      busy={busy}
      layout={siteMode ? "split" : "single"}
      title={header.title}
      kind={header.kind}
      status={header.status}
      origin={header.origin}
      context={header.context}
      aside={aside}
      main={main}
      tail={tail}
      secondary={[{ key: "cancel", label: "ยกเลิก", variant: "quiet", onClick: close }]}
      primary={{
        label: labels.submit,
        busyLabel: "กำลังบันทึก…",
        blocker: gaps.join(" · "),
        onClick: submit,
        icon: siteMode ? <CalendarPlus size={15} aria-hidden="true" /> : undefined,
      }}
      outcome={outcome}
    />
  );
}
