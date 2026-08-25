"use client";

/* ตัวเลือก "ช่วงงวดเดือน" — ปุ่มแสดงช่วง + แผงลอยที่กดเลือกเดือนแรกแล้วเดือนสุดท้าย
 *
 * ⭐ ทำไมเป็นเดือน ไม่ใช่วัน (ต่างจาก `DayRangePicker` ของคิวลีดโดยตั้งใจ):
 * ยอดขายไม่มีความละเอียดระดับวัน — ยอดปิดบัคเก็ตเป็นเดือน (`wonMonthOf` คืน `YYYY-MM`
 * และ fallback ตัวแรกคือ `metadata.wonMonth` ที่เป็นสตริงเดือนล้วน) ส่วนเป้าและยอด
 * ย้อนหลังเก็บเป็นแถวรายเดือน ⇒ ตัวเลือกรายวันจะให้ตัวเลขที่ไม่มีทางถูก
 *
 * ⭐ ชิปทางลัดเป็นของหลัก ปฏิทินเป็นของรอง — คนใช้จริงถามว่า "ไตรมาสนี้เป็นไง"
 * กับ "12 เดือนล่าสุด" มากกว่าจะมานั่งเลือกขอบเองทุกครั้ง (กติกาเดียวกับ DayRangePicker)
 *
 * 🪤 แผงต้อง portal ไป body — ตัวนี้ไปอยู่ในแถบเครื่องมือที่มัก `overflow: hidden`
 * ถ้าเรนเดอร์ในที่ตัวเองแผงจะโดนตัด (บทเรียนเดียวกับ MonthPicker/DayRangePicker)
 *
 * ⚠️ ทุกค่าเป็นสตริง `YYYY-MM` ล้วน ไม่แปลงเป็น Date ก่อนเทียบ — เหตุผลอยู่ที่
 * `lib/datePeriods.js` (ใช้ Date แล้วเจอ timezone จนงวดเลื่อน)
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  MONTH_LABELS,
  compareMonths,
  currentMonth,
  displayYear,
  formatMonthLabel,
  isMonthInRange,
  isMonthValue,
  lastNMonths,
  monthCountInRange,
  monthRangeOfWholeYear,
  normalizeMonthRange,
  quarterRangeOfMonth,
} from "@/lib/datePeriods";
import styles from "./MonthPicker.module.css";

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 320;

/** ทางลัดที่หัวหน้าฝ่ายขายใช้จริง — อิง `now` ที่ส่งเข้ามา ไม่ใช่นาฬิกาเครื่อง
 *  (หน้าจอส่งเดือนไทยมาให้ ไม่งั้นช่วงเลื่อนตาม timezone ของเบราว์เซอร์) */
export function quickMonthRanges(now = new Date()) {
  const thisMonth = currentMonth(now);
  const year = thisMonth.slice(0, 4);
  return [
    { key: "quarter", label: "ไตรมาสนี้", ...quarterRangeOfMonth(thisMonth) },
    { key: "year", label: "ปีนี้", ...monthRangeOfWholeYear(year) },
    { key: "last12", label: "12 เดือนล่าสุด", ...lastNMonths(12, { now }) },
    { key: "prevYear", label: "ปีก่อน", ...monthRangeOfWholeYear(String(Number(year) - 1)) },
  ].filter((option) => isMonthValue(option.from) && isMonthValue(option.to));
}

export default function MonthRangePicker({
  from,
  to,
  onChange,
  now = new Date(),
  min,
  max,
  disabled = false,
  ariaLabel = "เลือกช่วงเดือน",
  className = "",
}) {
  const range = normalizeMonthRange({ from, to });
  const today = currentMonth(now);

  const [open, setOpen] = useState(false);
  // เดือนแรกที่กดค้างไว้ระหว่างเลือก — ยังไม่คอมมิตจนกว่าจะกดเดือนที่สอง
  const [pending, setPending] = useState(null);
  const [viewYear, setViewYear] = useState(() => Number((range?.from || today).slice(0, 4)));
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);

  const quick = useMemo(() => quickMonthRanges(now), [now]);
  const activeQuick = quick.find((q) => q.from === range?.from && q.to === range?.to)?.key || null;

  useEffect(() => {
    if (open) setViewYear(Number((range?.from || today).slice(0, 4)));
    // ตั้งปีที่กำลังดูตอน "เปิด" เท่านั้น — ไม่งั้นเลื่อนไปดูปีอื่นแล้วเด้งกลับทุกครั้งที่ค่าขยับ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setOpen(false);
        setPending(null);
      }
    };
    const key = (event) => { if (event.key === "Escape") { setOpen(false); setPending(null); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw <= 640) {
        setPanelStyle({ position: "fixed", left: 12, right: 12, top: 12, width: "auto", maxHeight: "calc(100vh - 24px)", overflowY: "auto" });
        return;
      }
      const gap = 6;
      const left = Math.max(8, Math.min(rect.left, vw - PANEL_WIDTH - 8));
      const opensUp = rect.bottom + gap + PANEL_HEIGHT > vh && rect.top > PANEL_HEIGHT + gap;
      const top = opensUp ? Math.max(8, rect.top - PANEL_HEIGHT - gap) : Math.min(rect.bottom + gap, vh - PANEL_HEIGHT - 8);
      setPanelStyle({ position: "fixed", left, top: Math.max(8, top), width: PANEL_WIDTH, transform: "none" });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const commit = (next) => {
    const normalized = normalizeMonthRange(next);
    if (!normalized) return;
    setPending(null);
    setOpen(false);
    onChange?.(normalized);
  };

  const pick = (month) => {
    if (!pending) { setPending(month); return; }
    commit({ from: pending, to: month });
  };

  const label = range
    ? `${formatMonthLabel(range.from)} – ${formatMonthLabel(range.to)}`
    : "เลือกช่วงเดือน";
  const count = range ? monthCountInRange(range.from, range.to) : 0;

  const inRange = (month) => {
    if (pending) return false;
    if (!range) return false;
    return compareMonths(month, range.from) > 0 && compareMonths(month, range.to) < 0;
  };
  const isEdge = (month) => (pending ? month === pending : (month === range?.from || month === range?.to));

  const panel = open && panelStyle ? (
    <span ref={panelRef} className={styles.panel} role="dialog" aria-label={ariaLabel} style={panelStyle}>
      <span className={`choice-chips ${styles.rangeQuick}`}>
        {quick.map((q) => (
          <button
            type="button"
            key={q.key}
            className="choice-chip"
            data-on={activeQuick === q.key ? "" : undefined}
            onClick={() => commit(q)}
          >
            {q.label}
          </button>
        ))}
      </span>

      <span className={styles.panelHeader}>
        <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="ปีก่อนหน้า">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>{displayYear(viewYear)}</strong>
        <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="ปีถัดไป">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </span>

      <span className={styles.panelGrid}>
        {MONTH_LABELS.map((monthLabel, index) => {
          const month = `${viewYear}-${String(index + 1).padStart(2, "0")}`;
          const classes = [
            month === today && !isEdge(month) ? styles.isToday : "",
            isEdge(month) ? styles.isSelected : "",
            inRange(month) ? styles.isInRange : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={month}
              className={classes}
              disabled={!isMonthInRange(month, { min, max })}
              aria-pressed={isEdge(month) || inRange(month)}
              onClick={() => pick(month)}
            >
              {monthLabel}
            </button>
          );
        })}
      </span>

      <span className={styles.panelFooter}>
        {/* บอกเสมอว่ากำลังรอคลิกที่เท่าไร — ไม่งั้นคนกดครั้งเดียวแล้วงงว่าทำไมยังไม่เปลี่ยน
            และเลือกข้ามปีต้องกดลูกศรปีระหว่างสองคลิก จึงต้องเขียนไว้ให้เห็น */}
        <span>
          {pending
            ? `เลือกเดือนสุดท้าย (เปลี่ยนปีได้ก่อนกด) — เริ่มที่ ${formatMonthLabel(pending)}`
            : "เลือกเดือนแรกของช่วง"}
        </span>
        {pending ? (
          <button type="button" onClick={() => setPending(null)}>ยกเลิกที่เลือกค้าง</button>
        ) : null}
      </span>
    </span>
  ) : null;

  return (
    <span ref={rootRef} className={`${styles.root} ${className}`.trim()}>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <CalendarRange size={15} aria-hidden="true" />
        <span className={styles.triggerLabel}>{label}</span>
        {count > 0 ? <span className={styles.triggerCount}>({count} เดือน)</span> : null}
        <ChevronDown size={14} aria-hidden="true" className={styles.triggerCaret} />
      </Button>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </span>
  );
}
