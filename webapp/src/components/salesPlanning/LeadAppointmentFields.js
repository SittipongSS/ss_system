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
import TimeInput from "@/components/ui/TimeInput";
import AppointmentDayStrip from "@/components/salesPlanning/AppointmentDayStrip";
import RoomTimeline from "@/components/salesPlanning/RoomTimeline";
import { apiJson } from "@/lib/apiFetch";
import { cachedFetchJson } from "@/lib/apiCache";
import { businessDate } from "@/lib/businessDate";
import { fmtDate } from "@/lib/format";
import {
  APPOINTMENT_MODE_HINTS, APPOINTMENT_MODE_LABELS, INTAKE_APPOINTMENT_MODES, MEETING_APPOINTMENT_MODES, NO_APPOINTMENT,
  STUDIO_MODE, STUDIO_ROOM_LABELS,
  appointmentPlace, appointmentTimeRange, emptyAppointment, hasAppointmentInput,
} from "@/lib/sales/leadAppointments";
import {
  GRID_CLOSE, GRID_STEP, STRIP_DAYS, addDays, clashIn, hhmm, minutesOf, stripDays, thaiMinutes,
} from "@/lib/sales/appointmentGrid";
import styles from "./LeadAppointmentFields.module.css";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATIONS = [60, 90, 120];
const durationLabel = (minutes) => (minutes < 60 ? `${minutes} นาที` : `${minutes / 60} ชม.`);
const WEEKDAYS_FULL = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** นัดที่ยังไม่ปิดในช่วงวัน [from, to] — แถบวันทั้งแถบในคำขอเดียว · ปิด = ไม่ยิง */
function useAppointmentsRange(from, to, enabled) {
  const key = enabled && DATE_RE.test(String(from || "")) && DATE_RE.test(String(to || "")) ? `${from}|${to}` : "";
  const [state, setState] = useState({ key: "", rows: [], error: "" });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const [f, t] = key.split("|");
    const url = f === t ? `/api/sales-planning/leads/appointments?date=${f}` : `/api/sales-planning/leads/appointments?from=${f}&to=${t}`;
    apiJson(url, { fallbackError: "เช็คห้องว่างไม่สำเร็จ" })
      .then((rows) => { if (alive) setState({ key, rows: Array.isArray(rows) ? rows : [], error: "" }); })
      .catch((err) => { if (alive) setState({ key, rows: [], error: err.message || "เช็คห้องว่างไม่สำเร็จ" }); });
    return () => { alive = false; };
  }, [key]);
  const ready = !!key && state.key === key;
  return { rows: ready ? state.rows : [], loading: !!key && !ready, error: ready ? state.error : "" };
}

/** วันหยุดบริษัท (ทะเบียนกลาง) — ป้ายบนแถบวัน · โหลดไม่ได้ = ไม่มีป้าย ไม่ล้มฟอร์ม */
function useHolidays(enabled) {
  const [map, setMap] = useState(() => new Map());
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    cachedFetchJson("/api/holidays")
      .then((rows) => { if (alive) setMap(new Map((Array.isArray(rows) ? rows : []).map((row) => [row.date, row.name || "วันหยุด"]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return map;
}

/** แถวสรุปนัดอ่านอย่างเดียว — ฟอร์มแก้ลีดเมื่อ AE ยืนยันนัดนี้เป็นนัดประชุมแล้ว */
export function AppointmentSummary({ appointment }) {
  if (!appointment) return null;
  return (
    <span className={styles.summaryText}>
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
  const active = hasAppointmentInput(current) && !locked;
  const studio = current.mode === STUDIO_MODE;
  const patch = (next) => onChange?.({ ...current, ...next });

  /* "วันนี้" ตามนาฬิกาไทย (memory thai-time-display) · ตรึงตอน mount — ฟอร์มที่เปิดข้ามเที่ยงคืนยังใช้แถบเดิมได้ */
  const [today] = useState(() => businessDate());
  const [nowMinutes] = useState(() => thaiMinutes(new Date().toISOString()));
  const holidays = useHolidays(active);
  const days = useMemo(() => stripDays(today, { holidayOf: (date) => holidays.get(date) || null }), [today, holidays]);
  const stripEnd = addDays(today, STRIP_DAYS - 1);
  const strip = useAppointmentsRange(today, stripEnd, active && studio);
  const outsideStrip = DATE_RE.test(String(current.date || "")) && (current.date < today || current.date > stripEnd);
  const single = useAppointmentsRange(current.date, current.date, active && studio && outsideStrip);
  const rows = useMemo(() => [...strip.rows, ...single.rows], [strip.rows, single.rows]);
  const dayLoading = outsideStrip ? single.loading : strip.loading;
  const dayError = outsideStrip ? single.error : strip.error;

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

  const start = minutesOf(current.start);
  const end = minutesOf(current.end);
  const hasRange = start != null && end != null && end > start;
  const selection = studio && current.room && hasRange && DATE_RE.test(String(current.date || ""))
    ? { room: current.room, start, end } : null;
  const clash = selection ? clashIn(rows, current.date, selection.room, selection.start, selection.end, { leadId }) : null;
  const pickRange = ({ room, start: s, end: e }) => patch({ room, start: hhmm(s), end: hhmm(e) });
  const setDuration = (minutes) => { if (start != null) patch({ end: hhmm(start + minutes) }); };
  const durationFits = (minutes) => {
    if (start == null || start + minutes > 24 * 60) return false;
    if (!studio || !current.room || !DATE_RE.test(String(current.date || ""))) return true;
    return !clashIn(rows, current.date, current.room, start, start + minutes, { leadId });
  };

  const dateLabel = DATE_RE.test(String(current.date || ""))
    ? `${WEEKDAYS_FULL[new Date(`${current.date}T00:00:00Z`).getUTCDay()]} ${fmtDate(current.date)}` : "";
  const problem = start != null && end != null && end <= start ? "เวลาจบต้องหลังเวลาเริ่ม"
    : clash ? `${STUDIO_ROOM_LABELS[clash.room]} ไม่ว่าง ${hhmm(clash.start)}–${hhmm(clash.end)}${clash.contactName ? ` — นัดของ ${clash.contactName}` : ""} · เลือกช่องอื่นในตาราง`
      : "";
  const missing = !current.date ? "เลือกวันจากแถบด้านบน"
    : studio && !current.room ? "กดช่องว่างในตารางเพื่อเลือกห้องและเวลา"
      : start == null || end == null ? "ระบุเวลาเริ่มและเวลาจบ" : "";

  return (
    <div className={styles.wrap}>
      <OptionTiles
        value={hasAppointmentInput(current) ? current.mode : (allowNone ? NO_APPOINTMENT : "")}
        onChange={(mode) => (mode === NO_APPOINTMENT ? onChange?.(emptyAppointment())
          : patch({ mode, room: mode === STUDIO_MODE ? current.room : "" }))}
        options={modeOptions}
        disabled={disabled}
        ariaLabel="รูปแบบนัด"
      />

      {active && (
        <div className={styles.field}>
          <span className={styles.label}>
            วันนัด <span className="required-mark">*</span>
            {studio && <span className={styles.soft}>เส้นเล็ก 3 เส้นใต้วันที่ = Studio 01 · 02 · 03 ถูกจองไปแค่ไหน</span>}
          </span>
          <AppointmentDayStrip
            days={days}
            value={current.date || ""}
            onChange={(date) => patch({ date })}
            rows={strip.rows}
            showRooms={studio}
            leadId={leadId}
            loading={strip.loading}
            disabled={disabled}
          />
        </div>
      )}

      {active && studio && DATE_RE.test(String(current.date || "")) && (
        <div className={styles.field}>
          <span className={styles.label}>ห้องและเวลา <span className="required-mark">*</span></span>
          {dayError ? (
            <small className={styles.error}>{dayError} — ยังเลือกเวลาเองได้ที่แถวสรุปข้างล่าง ระบบเช็คห้องอีกครั้งตอนกดบันทึก</small>
          ) : dayLoading ? (
            <small className={styles.hint}>กำลังโหลดนัดของวันนั้น…</small>
          ) : (
            <RoomTimeline
              rows={rows}
              date={current.date}
              leadId={leadId}
              selection={selection}
              onSelect={pickRange}
              pastBefore={current.date === today ? nowMinutes : null}
              disabled={disabled}
            />
          )}
        </div>
      )}

      {active && (
        <div className={styles.summary} data-empty={missing ? "1" : undefined} data-bad={problem ? "1" : undefined}>
          <div className={styles.summaryWhat}>
            {missing && !problem ? (
              <>
                <b>{dateLabel || "ยังไม่ได้เลือกวัน"}</b>
                <small>{missing}</small>
              </>
            ) : (
              <>
                <b>
                  {dateLabel} · {current.start}–{current.end}
                  {studio && current.room ? ` · ${STUDIO_ROOM_LABELS[current.room]}` : ` · ${APPOINTMENT_MODE_LABELS[current.mode]}`}
                </b>
                <small>{problem || `${hasRange ? durationLabel(end - start) : ""}${studio ? " · ห้องว่าง จองได้" : ""}`}</small>
              </>
            )}
          </div>
          <div className={styles.fine}>
            <label className={styles.fineField}>
              <span>เริ่ม</span>
              <TimeInput value={current.start || ""} onChange={(v) => patch({ start: v })} disabled={disabled} ariaLabel="เวลาเริ่มนัด" minuteStep={15} />
            </label>
            <label className={styles.fineField}>
              <span>ถึง</span>
              <TimeInput value={current.end || ""} onChange={(v) => patch({ end: v })} disabled={disabled} ariaLabel="เวลาจบนัด" minuteStep={15} />
            </label>
            <div className={styles.durations} role="group" aria-label="ความยาวนัด">
              {DURATIONS.map((minutes) => {
                const fits = durationFits(minutes);
                return (
                  <button
                    key={minutes}
                    type="button"
                    className={styles.duration}
                    aria-pressed={hasRange && end - start === minutes}
                    disabled={disabled || !fits}
                    title={start == null ? "เลือกเวลาเริ่มก่อน" : fits ? `จบ ${hhmm(start + minutes)}` : "ยาวเท่านี้ไม่ได้ — ชนนัดถัดไปในห้องนี้"}
                    onClick={() => setDuration(minutes)}
                  >
                    {durationLabel(minutes)}
                  </button>
                );
              })}
            </div>
            {(current.start || current.end || current.room) && (
              <button type="button" className={styles.clear} disabled={disabled}
                onClick={() => patch({ start: "", end: "", room: studio ? "" : current.room })}>
                ล้างเวลา
              </button>
            )}
          </div>
          {studio && start != null && start + GRID_STEP > GRID_CLOSE && (
            <small className={styles.hint}>เวลานี้อยู่นอกตาราง 09:00–18:00 — ระบบยังเช็คห้องชนให้ตอนกดบันทึก</small>
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
