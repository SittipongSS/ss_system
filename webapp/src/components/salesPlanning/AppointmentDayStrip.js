"use client";
// ── แถบวันนัด 2 สัปดาห์ (แบบ ก · มติเจ้าของ 06/11/2026) ──
// แต่ละวันมีเส้นเล็ก 3 เส้น = Studio 01 · 02 · 03 ถูกจองไปแค่ไหน (เฉพาะโหมด Studio) และ "ว่างกี่ ชม."
// ⇒ ลูกค้าถามว่า "วันไหนว่าง" ตอบได้จากแถบนี้โดยไม่ต้องเปลี่ยนวันทีละวัน
// ⚠️ เสาร์–อาทิตย์/วันหยุดขึ้นว่าวันหยุดแต่ **ยังกดได้** — บล็อกแล้วนัดวันที่เปิดพิเศษลงไม่ได้ (ทางตัน)
// วันที่ไกลกว่าแถบเลือกจาก "วันอื่น" (DateInput ตัวกลาง) แล้วจะโผล่เป็นชิปท้ายแถบ

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import { fmtDayMonth } from "@/lib/format";
import { dayOccupancy, weekdayOf } from "@/lib/sales/appointmentGrid";
import styles from "./LeadAppointmentFields.module.css";

const WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const freeLabel = (minutes) => {
  const hours = minutes / 60;
  return `ว่าง ${Number.isInteger(hours) ? hours : hours.toFixed(1)} ชม.`;
};

export default function AppointmentDayStrip({
  days = [],            // stripDays()
  value = "",           // วันที่เลือก (YYYY-MM-DD)
  onChange,
  rows = [],            // นัดของทั้งแถบ (ใช้วาดความแน่น)
  showRooms = false,    // เส้นห้อง — เฉพาะโหมด Studio
  leadId = null,
  loading = false,
  disabled = false,
}) {
  const [picking, setPicking] = useState(false);
  const inStrip = days.some((day) => day.date === value);
  const extra = value && !inStrip ? { date: value, weekday: weekdayOf(value), extra: true } : null;

  const renderDay = (day) => {
    const occupancy = showRooms ? dayOccupancy(rows, day.date, { leadId }) : null;
    const off = day.weekend || day.holiday;
    const label = `${WEEKDAYS[day.weekday]} ${fmtDayMonth(day.date)}${day.holiday ? ` · ${day.holiday}` : off ? " · วันหยุด" : ""}`
      + (occupancy ? ` · ${occupancy.full ? "เต็มทุกห้อง" : freeLabel(occupancy.freeMinutes)}` : "");
    return (
      <button
        key={day.date}
        type="button"
        className={styles.day}
        aria-pressed={day.date === value}
        aria-label={label}
        title={label}
        data-off={off ? "1" : undefined}
        data-today={day.today ? "1" : undefined}
        disabled={disabled}
        onClick={() => { setPicking(false); onChange?.(day.date); }}
      >
        <span className={styles.dayWeek}>{day.today ? "วันนี้" : WEEKDAYS[day.weekday]}</span>
        <span className={styles.dayDate}>{fmtDayMonth(day.date)}</span>
        {occupancy ? (
          <>
            <span className={styles.dayBars} aria-hidden="true">
              {occupancy.rooms.map((share, index) => (
                <i key={index} data-fill={Math.round(share * 10)} />
              ))}
            </span>
            <span className={styles.dayFree}>
              {loading ? "กำลังเช็ค…" : off && occupancy.freeMinutes === 27 * 60 ? (day.holiday || "วันหยุด")
                : occupancy.full ? "เต็มทุกห้อง" : freeLabel(occupancy.freeMinutes)}
            </span>
          </>
        ) : (
          <span className={styles.dayFree}>{day.holiday || (off ? "วันหยุด" : " ")}</span>
        )}
      </button>
    );
  };

  return (
    <div className={styles.strip}>
      <div className={styles.days} role="group" aria-label="วันนัด">
        {days.map(renderDay)}
        {extra && renderDay(extra)}
        <button
          type="button"
          className={`${styles.day} ${styles.dayMore}`}
          aria-expanded={picking}
          disabled={disabled}
          onClick={() => setPicking((open) => !open)}
        >
          <CalendarDays size={15} aria-hidden="true" />
          <span>วันอื่น</span>
        </button>
      </div>
      {picking && (
        <div className={styles.otherDay}>
          <span className={styles.label}>เลือกวันที่ไกลกว่า 2 สัปดาห์</span>
          <DateInput
            value={value || ""}
            onChange={(date) => { if (date) { onChange?.(date); setPicking(false); } }}
            disabled={disabled}
            ariaLabel="วันนัด"
            weekday
          />
        </div>
      )}
    </div>
  );
}
