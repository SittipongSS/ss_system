"use client";
// ── โมดัล "ลงคิวเข้าพื้นที่ / แจ้งกำหนดส่ง" — ตัวเดียวของทุกหน้าที่มีปุ่มนี้ ─────────────
//
// ⭐ มติเจ้าของ 23/09: TS ลงคิวคำร้องประเมินพื้นที่ได้ **จากหน้าจัดคิว** (/service/schedule) ด้วย
//    ไม่ใช่เฉพาะหน้าใบ (/requests/[id]) ⇒ ฟอร์มเดียวกันสองที่ = component เดียว (กติกา AGENTS.md
//    "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" · ฟอร์มที่ก๊อปสองชุดเพี้ยนหากันเสมอ)
//    · ตรรกะทั้งหมด (ป้าย · ค่าตั้งต้น · ก้อน PATCH · ด่านของปุ่ม) อยู่ที่ `lib/requests/commitDue.js`
//      ตัวนี้เป็นเปลือกอย่างเดียว ⇒ **สองหน้าส่งก้อนเดียวกันเสมอ** (`commitDuePayload`)
//    · ผู้เรียกถือการยิง API เอง (`onSubmit(payload)`) — หน้าใบใช้ `call()` ของมัน (ดึงใบใหม่ ·
//      toast · `_warning`) · หน้าจัดคิวโหลดรายการงานใหม่ · โมดัลไม่ต้องรู้ว่าอยู่หน้าไหน
// ⭐ ตัวเลือกเจ้าหน้าที่ = `CrewLoadPicker` ตัวเดียวกับโมดัลนัด (เห็นภาระของวันที่เลือก ไม่นับร่าง)
//    · หน้าจัดคิวส่ง `staffLoadFor` ของตัวเองมา (ตัวเลขชุดเดียวกับตารางที่อยู่ข้าง ๆ)
//    · ไม่ส่งมา (หน้าใบ) ⇒ โมดัลโหลดเองผ่าน `useCrewLoad` — **สูตรเดียวกัน** (`crewLoadPeople`)
//      ⚠️ ฮุกอยู่ในตัวฟอร์มที่เมานต์เฉพาะตอนเปิด ⇒ ไม่ต้องไปวางฮุกหลัง early-return ของหน้าใบ
// ⚠️ โหมดมาจากทะเบียนหัวข้อ (`commitDueMode` → `requestNeedsRef(kind,'site')`) และ "ลงคิวใหม่"
//    มาจาก `surveyQueueStep` ตัวเดียวกับการ์ดบนหน้าจัดคิว — **ผู้เรียกส่งโหมดเองไม่ได้** ⇒ ส่งผิดไม่ได้
// ⚠️ เจ้าหน้าที่ **บังคับ** ⇒ ตัวเลือกไม่มีแถว "ยังไม่มอบหมาย" (`allowUnassigned={false}`)
// ⚠️ ปุ่มส่ง = `GatedAction` — กดได้เสมอ ขาดอะไรบอกครบทุกช่องในครั้งเดียว (`commitDueGaps` ·
//    ตัวเดียวกับที่ server ตอบข้อแรก) ไม่ใช่ปุ่มจางที่ไม่บอกเหตุ (กฎฟอร์มของ repo)
import { useId, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import Textarea from "@/components/ui/Textarea";
import CrewLoadPicker from "@/components/service/CrewLoadPicker";
import useCrewLoad from "@/lib/service/useCrewLoad";
import { surveyQueueStep } from "@/lib/service/surveyQueue";
import {
  COMMIT_DUE_REASON_MAX, commitDueDefaults, commitDueGaps, commitDueLabels, commitDueMode, commitDuePayload,
} from "@/lib/requests/commitDue";
import styles from "./CommitDueDialog.module.css";

/**
 * @param open        เปิดโมดัล — ปิดแล้วตัวฟอร์มถูกถอด (เปิดใหม่ = ค่าตั้งต้นใหม่จากใบ)
 * @param request     แถวคำร้อง (ใบประเมินต้องมี `surveyVisit` ติดมา — ใช้ตัดสิน "ลงคิวใหม่")
 * @param technicians เจ้าหน้าที่ที่มอบหมายได้ [{ id, name }] — ลำดับที่ส่งมาคือลำดับบนจอ
 * @param techniciansLoading รายชื่อยังโหลดไม่เสร็จ (ต่างจาก "ไม่มีใครเลย")
 * @param techniciansError   โหลดรายชื่อไม่สำเร็จ (ต่างจาก "ไม่มีใครเลย" เหมือนกัน)
 * @param staffLoadFor ภาระรายคนของวันหนึ่ง (หน้าจัดคิว) — ไม่ส่ง = โมดัลโหลดเอง
 * @param subtitle    บรรทัดบริบทใต้หัว (หน้าจัดคิวบอกเลขใบ · ไซต์ — หน้าใบไม่ต้อง)
 * @param today       วันนี้แบบไทย 'YYYY-MM-DD' (ค่าตั้งต้นของหัวข้อที่ไม่ใช่ใบประเมิน)
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
  subtitle,
  today,
  busy = false,
  onClose,
  onSubmit,
}) {
  const site = commitDueMode(request) === "site";
  const requeue = surveyQueueStep(request) === "requeue";
  const labels = commitDueLabels(request, { requeue });
  const [form, setForm] = useState(() => commitDueDefaults(request, { requeue, today }));
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  /* ภาระ: ของผู้เรียกก่อน · ไม่มีค่อยโหลดเอง (ฮุกไม่ยิงอะไรเลยเมื่อผู้เรียกส่งมา) */
  const ownLoadFor = useCrewLoad({ enabled: site && !staffLoadFor, technicians });
  const loadFor = staffLoadFor || ownLoadFor;

  const gaps = commitDueGaps(request, form);
  const dateId = useId();
  const resultId = useId();
  const timeLabelId = useId();
  const assigneeLabelId = useId();
  const reasonId = useId();

  const close = () => { if (!busy) onClose?.(); };
  const submit = () => onSubmit?.(commitDuePayload(request, form, { technicians }));

  return (
    <Modal
      open
      onClose={close}
      dismissible={!busy}
      title={labels.title}
      subtitle={subtitle}
      size={site ? "md" : "sm"}
      footer={(
        <>
          <Button variant="quiet" disabled={busy} onClick={close}>ยกเลิก</Button>
          <GatedAction tone="primary" disabled={busy} blocker={gaps.join(" · ")} onClick={submit}>
            {busy ? "กำลังบันทึก…" : labels.submit}
          </GatedAction>
        </>
      )}
    >
      {/* ⭐ fieldset ที่ disabled ล็อกทุกช่องข้างในพร้อมกันระหว่างส่ง (รวม radio ของตัวเลือกคน
          และปุ่มในช่องวัน/เวลา) — ไม่ต้องไล่ส่ง `disabled` ทีละช่องแล้วลืมสักช่อง */}
      <fieldset className={styles.body} disabled={busy}>
        {/* ── วัน (+ เวลา) — คู่ที่อ่านด้วยกัน อยู่แถวเดียวกัน (จอแคบถอยเป็นบน-ล่าง) ── */}
        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor={dateId} className={styles.label}>{labels.dateLabel} *</label>
            <DateInput id={dateId} value={form.date || ""} onChange={set("date")} disabled={busy} />
            {/* วันที่ผู้ขอต้องการเป็นของผู้ขอ · วันกำหนดส่งเป็นของฝ่ายปลายทาง — คนละช่อง คนละเจ้าของ */}
            <small className={styles.hint}>{labels.dateHint}</small>
          </div>
          {site && (
            <div className={styles.field}>
              <span id={timeLabelId} className={styles.label}>เวลานัด (ไม่บังคับ)</span>
              <TimeInput value={form.time || ""} onChange={set("time")} disabled={busy} ariaLabel="เวลานัดเข้าพื้นที่" />
              <small className={styles.hint}>{labels.timeHint}</small>
            </div>
          )}
        </div>

        {site && (
          <>
            {/* ⭐ วันส่งผล — คนละวันกับวันนัด (mig 0368) · บังคับ (ฝ่ายขายถามคำถามเดียว "ได้ตัวเลขวันไหน") */}
            <div className={styles.field}>
              <label htmlFor={resultId} className={styles.label}>{labels.resultLabel} *</label>
              <DateInput id={resultId} value={form.resultDate || ""} onChange={set("resultDate")} disabled={busy} />
              <small className={styles.hint}>{labels.resultHint}</small>
            </div>

            {/* ⭐ ความรับผิดชอบอยู่ท้าย (กฎฟอร์ม §1.4) และตัวเลือกต้องรู้วันก่อนถึงบอกภาระได้
                ⚠️ กล่องเป็น div ไม่ใช่ label — radio แต่ละแถวเป็น label ของตัวเองอยู่แล้ว */}
            <div className={styles.field}>
              <span id={assigneeLabelId} className={styles.label}>เจ้าหน้าที่ผู้รับผิดชอบ *</span>
              {techniciansLoading ? (
                <p className={styles.note}>กำลังโหลดรายชื่อเจ้าหน้าที่…</p>
              ) : techniciansError ? (
                <p className={styles.note} role="alert">โหลดรายชื่อเจ้าหน้าที่ไม่สำเร็จ — ปิดแล้วเปิดใหม่อีกครั้ง</p>
              ) : technicians.length ? (
                <CrewLoadPicker
                  allowUnassigned={false}
                  value={form.assigneeId || ""}
                  onChange={set("assigneeId")}
                  technicians={technicians}
                  load={form.date ? loadFor(form.date) : null}
                  dateIso={form.date || ""}
                  labelledBy={assigneeLabelId}
                  currentName={request.assigneeName || ""}
                />
              ) : (
                <p className={styles.note}>ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน</p>
              )}
              <small className={styles.hint}>{labels.assigneeHint}</small>
            </div>
          </>
        )}

        <div className={styles.field}>
          <label htmlFor={reasonId} className={styles.label}>หมายเหตุ (ไม่บังคับ)</label>
          <Textarea
            id={reasonId} maxLength={COMMIT_DUE_REASON_MAX}
            value={form.reason || ""} disabled={busy}
            placeholder="เช่น รอวัตถุดิบเข้าวันที่ 25 — ส่งได้หลังจากนั้น"
            onChange={(e) => set("reason")(e.target.value)}
          />
        </div>
      </fieldset>
    </Modal>
  );
}
