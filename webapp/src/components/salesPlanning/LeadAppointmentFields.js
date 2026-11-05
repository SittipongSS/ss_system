"use client";
// ── ช่องนัดหมายของลีด — วัน · เวลาเริ่ม–จบ · รูปแบบ · ห้อง Studio พร้อมสถานะห้องว่าง (mig 0424) ──
//
// ⭐ ตัวเดียวใช้สองที่ (กฎ AGENTS.md "ฟอร์มสร้าง/แก้ต้องเป็น component เดียว" ขยายถึงกล่องนัด):
//   · ฟอร์มรับลีด/แก้ลีดของ MKT (LeadFormFields) — `allowNone` + โหมด Studio/Online/โทร
//   · กล่อง "นัดประชุม" ของ AE (TransitionDialog field ชนิด custom) — โหมดตาม MEETING_MODES
//   สองที่ต้องเห็นห้องว่างจากแหล่งเดียวกัน ไม่งั้น MKT เห็นว่าว่างแต่ AE เห็นว่าไม่ว่าง (มติข้อ 1)
//
// ⚠️ ห้องที่ไม่ว่าง = แผ่นกดไม่ได้ + บอกช่วงที่ชนในตัวแผ่น (ui-visibility: ติดด่าน = โชว์แล้วบอกเหตุ)
//    ด่านจริงอยู่ที่ API + EXCLUDE ในฐาน — จอนี้ช่วยให้เห็นก่อนกด ไม่ใช่ตัวกัน
// ⚠️ ช่องที่ขึ้นตามรูปแบบอยู่ **ใต้** แผ่นเลือกรูปแบบ (form-design-rules §1.3)

import { useEffect, useMemo, useState } from "react";
import OptionTiles from "@/components/ui/OptionTiles";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import {
  APPOINTMENT_MODE_HINTS, APPOINTMENT_MODE_LABELS, INTAKE_APPOINTMENT_MODES, MEETING_APPOINTMENT_MODES, NO_APPOINTMENT,
  STUDIO_MODE, STUDIO_ROOMS, STUDIO_ROOM_LABELS,
  appointmentConflicts, appointmentPlace, appointmentTimeRange, emptyAppointment, hasAppointmentInput,
  thaiDateTimeToIso,
} from "@/lib/sales/leadAppointments";
import styles from "./LeadAppointmentFields.module.css";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** นัดของวันนั้นจาก API — โหลดเฉพาะตอนเลือก Studio (ห้องเป็นเรื่องเดียวที่ต้องรู้ว่าคนอื่นจองอะไร) */
function useDayAppointments(date, enabled) {
  const [state, setState] = useState({ date: "", rows: [], error: "" });
  const wanted = enabled && DATE_RE.test(String(date || "")) ? date : "";
  useEffect(() => {
    if (!wanted) return undefined;
    let alive = true;
    apiJson(`/api/sales-planning/leads/appointments?date=${wanted}`, { fallbackError: "เช็คห้องว่างไม่สำเร็จ" })
      .then((rows) => { if (alive) setState({ date: wanted, rows: Array.isArray(rows) ? rows : [], error: "" }); })
      .catch((err) => { if (alive) setState({ date: wanted, rows: [], error: err.message || "เช็คห้องว่างไม่สำเร็จ" }); });
    return () => { alive = false; };
  }, [wanted]);
  const ready = !!wanted && state.date === wanted;
  return { rows: ready ? state.rows : [], loading: !!wanted && !ready, error: ready ? state.error : "" };
}

/** แถวสรุปนัดอ่านอย่างเดียว — ฟอร์มแก้ลีดเมื่อ AE ยืนยันนัดนี้เป็นนัดประชุมแล้ว */
export function AppointmentSummary({ appointment }) {
  if (!appointment) return null;
  return (
    <span className={styles.summary}>
      {fmtDate(appointment.startAt)} · {appointmentTimeRange(appointment)} · {appointmentPlace(appointment)}
    </span>
  );
}

export default function LeadAppointmentFields({
  value,
  onChange,
  modes = INTAKE_APPOINTMENT_MODES,
  allowNone = false,
  // ลีดของนัดนี้ — นัดที่ลีดใบเดียวกันจองไว้ไม่นับว่าชน (AE ยืนยันนัดที่ MKT จอง: ห้องเดิม เวลาเดิม)
  leadId = null,
  disabled = false,
  /* นัดที่ล็อกไว้ (ฟอร์มแก้ลีดเมื่อ AE ยืนยันเป็นนัดประชุมแล้ว) — โชว์อ่านอย่างเดียวพร้อมทางไปแก้ */
  locked = null,
}) {
  const current = value || emptyAppointment();
  const active = hasAppointmentInput(current);
  const studio = current.mode === STUDIO_MODE;
  const patch = (next) => onChange?.({ ...current, ...next });
  const day = useDayAppointments(current.date, active && studio && !locked);

  const range = useMemo(() => {
    const startAt = thaiDateTimeToIso(current.date, current.start);
    const endAt = thaiDateTimeToIso(current.date, current.end);
    return startAt && endAt && Date.parse(endAt) > Date.parse(startAt) ? { startAt, endAt } : null;
  }, [current.date, current.start, current.end]);

  const studioRows = useMemo(() => day.rows.filter((row) => row.room), [day.rows]);
  const clashesOf = (room) => (range ? appointmentConflicts({ room, ...range }, studioRows, { leadId }) : []);

  if (locked) {
    return (
      <div className={styles.wrap}>
        <AppointmentSummary appointment={locked.appointment} />
        <small className={styles.hint}>{locked.note}</small>
      </div>
    );
  }

  const modeOptions = [
    ...(allowNone ? [{ value: NO_APPOINTMENT, label: "ยังไม่มีนัด" }] : []),
    ...modes.map((mode) => ({ value: mode, label: APPOINTMENT_MODE_LABELS[mode] || mode, description: APPOINTMENT_MODE_HINTS[mode] })),
  ];

  const roomOptions = STUDIO_ROOMS.map((room) => {
    const label = STUDIO_ROOM_LABELS[room];
    if (!DATE_RE.test(String(current.date || ""))) return { value: room, label, description: "เลือกวันก่อน" };
    if (day.loading) return { value: room, label, description: "กำลังเช็ค…" };
    if (day.error) return { value: room, label, description: "เช็คห้องไม่ได้" };
    const ofRoom = studioRows.filter((row) => row.room === room && (!leadId || row.leadId !== leadId));
    if (!range) return { value: room, label, description: ofRoom.length ? `วันนั้นมี ${ofRoom.length} นัด` : "ว่างทั้งวัน" };
    const clashes = clashesOf(room);
    return clashes.length
      ? { value: room, label, description: `ไม่ว่าง ${appointmentTimeRange(clashes[0])}`, disabled: true }
      : { value: room, label, description: "ว่าง", tone: "teal" };
  });

  const pickedClash = studio && current.room ? clashesOf(current.room) : [];
  const timeError = current.start && current.end && !range ? "เวลาจบต้องหลังเวลาเริ่ม" : "";

  return (
    <div className={styles.wrap}>
      <OptionTiles
        value={active ? current.mode : (allowNone ? NO_APPOINTMENT : "")}
        onChange={(mode) => (mode === NO_APPOINTMENT ? onChange?.(emptyAppointment()) : patch({ mode }))}
        options={modeOptions}
        disabled={disabled}
        ariaLabel="รูปแบบนัด"
      />

      {active && (
        <div className={styles.when}>
          <label className={styles.field}>
            <span className={styles.label}>วันนัด <span className="required-mark">*</span></span>
            <DateInput value={current.date || ""} onChange={(date) => patch({ date })} disabled={disabled} ariaLabel="วันนัด" weekday />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>เริ่ม <span className="required-mark">*</span></span>
            <TimeInput value={current.start || ""} onChange={(start) => patch({ start })} disabled={disabled} ariaLabel="เวลาเริ่มนัด" minuteStep={15} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>ถึง <span className="required-mark">*</span></span>
            <TimeInput value={current.end || ""} onChange={(end) => patch({ end })} disabled={disabled} ariaLabel="เวลาจบนัด" minuteStep={15} />
          </label>
        </div>
      )}
      {timeError && <small className={styles.error}>{timeError}</small>}

      {active && studio && (
        <div className={styles.field}>
          <span className={styles.label}>ห้อง <span className="required-mark">*</span></span>
          <OptionTiles
            value={current.room || ""}
            onChange={(room) => patch({ room })}
            options={roomOptions}
            disabled={disabled}
            ariaLabel="ห้อง Studio"
          />
          {pickedClash.length > 0 && (
            <small className={styles.error}>
              {STUDIO_ROOM_LABELS[current.room]} ไม่ว่าง {appointmentTimeRange(pickedClash[0])}
              {pickedClash[0].contactName ? ` — นัดของ ${pickedClash[0].contactName}` : ""} · เลือกห้องอื่นหรือเปลี่ยนเวลา
            </small>
          )}
          {day.error && <small className={styles.error}>{day.error} — ระบบยังเช็คห้องอีกครั้งตอนกดบันทึก</small>}
          {/* ตารางของวันนั้นทั้งสามห้อง — เลือกเวลาใหม่ได้โดยไม่ต้องเดาทีละช่วง */}
          {studioRows.length > 0 && (
            <ul className={styles.day} aria-label="นัดที่ใช้ Studio วันนั้น">
              {studioRows.map((row) => (
                <li key={row.id} data-own={leadId && row.leadId === leadId ? "1" : undefined}>
                  <strong>{STUDIO_ROOM_LABELS[row.room]}</strong>
                  <span className={styles.dayTime}>{appointmentTimeRange(row)}</span>
                  <span className={styles.dayWho}>
                    {leadId && row.leadId === leadId ? "นัดของลีดนี้" : row.contactName || "นัดของลีดทีมอื่น"}
                    {row.createdByName ? ` · จองโดย ${row.createdByName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** ช่องนัดในกล่อง "นัดประชุม" ของ AE — รูปร่างที่ TransitionDialog ส่งให้ field ชนิด custom
 *  ส่งเข้า lifecycle ทาง createLeadLifecycle({ appointmentField: MeetingAppointmentField }) */
export function MeetingAppointmentField({ value, onChange, record, disabled }) {
  const current = record?.appointment || null;
  return (
    <>
      <LeadAppointmentFields
        value={value}
        onChange={onChange}
        modes={MEETING_APPOINTMENT_MODES}
        leadId={record?.id || null}
        disabled={disabled}
      />
      {/* มติข้อ 6: ลีดมีนัดรออยู่นัดเดียว — บอกก่อนกดว่านัดไหนจะถูกแทนที่ (ค่าเดิมที่เติมไว้ = ยืนยันนัดนั้นเอง) */}
      {current && (
        <small className={styles.hint}>
          {current.source === "intake" ? "เติมจากนัดที่ลูกค้าจองไว้" : "นัดที่รออยู่"}: {fmtDate(current.startAt)} {appointmentTimeRange(current)} · {appointmentPlace(current)}
          {" "}— บันทึกแล้วนัดนี้ถูกแทนที่ด้วยนัดในกล่องนี้{current.room ? " (ห้องเดิมคืนให้คนอื่นถ้าเปลี่ยนห้อง/เวลา)" : ""}
        </small>
      )}
    </>
  );
}
