"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { displayDateToIso, isoDateToDisplay } from "@/lib/format";

const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

const isoFromParts = (year, monthIndex, day) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function calendarCells(year, monthIndex) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, monthIndex, 1 - mondayOffset));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
      day: date.getUTCDate(),
      iso: isoFromParts(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    };
  });
}

function formatTypedDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DateInput({ value = "", onChange, className = "", style, min, max, disabled, required, name, id, ariaLabel, title }) {
  const [text, setText] = useState(() => isoDateToDisplay(value));
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const initial = String(value || "").match(/^(\d{4})-(\d{2})-/);
  const today = new Date();
  const [view, setView] = useState(() => ({
    year: initial ? Number(initial[1]) : today.getFullYear(),
    monthIndex: initial ? Number(initial[2]) - 1 : today.getMonth(),
  }));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!focused) setText(isoDateToDisplay(value));
  }, [value, focused]);

  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const moveMonth = (delta) => setView((current) => {
    const date = new Date(Date.UTC(current.year, current.monthIndex + delta, 1));
    return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
  });

  const openCalendar = () => {
    const selected = String(value || "").match(/^(\d{4})-(\d{2})-/);
    if (selected) setView({ year: Number(selected[1]), monthIndex: Number(selected[2]) - 1 });
    setOpen((current) => !current);
  };

  const choose = (iso) => {
    if ((min && iso < min) || (max && iso > max)) return;
    onChange?.(iso);
    setText(isoDateToDisplay(iso));
    setOpen(false);
  };

  const cells = calendarCells(view.year, view.monthIndex);

  const update = (nextText) => {
    const formatted = formatTypedDate(nextText);
    setText(formatted);
    if (!formatted) onChange?.("");
    else {
      const iso = displayDateToIso(formatted);
      if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange?.(iso);
    }
  };

  return (
    <span ref={rootRef} className={`date-input-wrap ${className}`.trim()} style={style}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        className="premium-input date-input-text"
        value={text}
        placeholder="DD/MM/YYYY"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        required={required}
        onFocus={() => setFocused(true)}
        onChange={(event) => update(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const iso = displayDateToIso(text);
          setText(iso ? isoDateToDisplay(iso) : isoDateToDisplay(value));
        }}
      />
      <button type="button" className="date-input-picker" disabled={disabled} aria-label="เปิดปฏิทิน รูปแบบวัน/เดือน/ปี" aria-expanded={open} onClick={openCalendar}>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      {open && (
        <span className="date-calendar" role="dialog" aria-label="เลือกวันที่ วัน เดือน ปี">
          <span className="date-calendar-header">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="เดือนก่อน"><ChevronLeft size={18} /></button>
            <strong>{MONTHS_TH[view.monthIndex]} {view.year}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="เดือนถัดไป"><ChevronRight size={18} /></button>
          </span>
          <span className="date-calendar-weekdays">{DAYS_TH.map((day) => <span key={day}>{day}</span>)}</span>
          <span className="date-calendar-grid">
            {cells.map((cell) => {
              const outside = cell.monthIndex !== view.monthIndex;
              const unavailable = (min && cell.iso < min) || (max && cell.iso > max);
              return (
                <button
                  type="button"
                  key={cell.iso}
                  className={`${outside ? "outside" : ""}${cell.iso === value ? " selected" : ""}`}
                  disabled={unavailable}
                  onClick={() => choose(cell.iso)}
                  aria-label={`${String(cell.day).padStart(2, "0")}/${String(cell.monthIndex + 1).padStart(2, "0")}/${cell.year}`}
                >{cell.day}</button>
              );
            })}
          </span>
          <span className="date-calendar-footer">
            <span>รูปแบบ DD/MM/YYYY</span>
            <button
              type="button"
              disabled={(min && isoFromParts(today.getFullYear(), today.getMonth(), today.getDate()) < min) || (max && isoFromParts(today.getFullYear(), today.getMonth(), today.getDate()) > max)}
              onClick={() => choose(isoFromParts(today.getFullYear(), today.getMonth(), today.getDate()))}
            >วันนี้</button>
          </span>
        </span>
      )}
    </span>
  );
}
