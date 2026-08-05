"use client";

/* ตัวเลือกงวดเดือน — **ปุ่มเดียว** เปิดตารางเดือน 12 ช่อง
   เดิมเป็น <Select> สองอัน (ปี + เดือน) วางติดกัน ซึ่งมีปัญหาสองอย่าง:
   หนึ่ง ปีถูกแสดงซ้ำสองที่ (ช่องปี "2573" กับช่องเดือน "ต.ค. 2573")
   สอง เลือกงวดหนึ่งครั้งต้องกดสองที่ ทั้งที่มันคือค่าเดียว
   ตอนนี้ใช้แพตเทิร์นเดียวกับปฏิทินของ DateInput — ปุ่มแสดงค่า + แผงลอยผ่าน portal
   (portal จำเป็น: ตัวนี้อยู่ในแถบเครื่องมือที่มัก overflow: hidden แผงจะโดนตัด) */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  MONTH_LABELS,
  addMonths,
  clampMonth,
  currentMonth,
  displayYear,
  formatMonthLabel,
  isMonthInRange,
  monthsForYear,
  yearOptionsForMonth,
} from "@/lib/datePeriods";
import styles from "./MonthPicker.module.css";

const PANEL_WIDTH = 268;
const PANEL_HEIGHT = 250;

export default function MonthPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  readOnly = false,
  pastYears = 3,
  futureYears = 3,
  allMonths = false,
  onAllMonths,
  allMonthsLabel = "ทุกเดือน",
  showCurrentShortcut = true,
  currentShortcutLabel = "เดือนปัจจุบัน",
  ariaLabel = "เลือกงวดเดือน",
  className = "",
}) {
  const today = currentMonth();
  const selected = clampMonth(value, { min, max, fallback: today });
  const locked = disabled || readOnly;
  /* ⚠️ ติ๊ก "ทุกเดือน" = ทุกเดือน**ของปีที่เลือก** (มติ 2026-07-29) ไม่ใช่ทุกปี
     ปุ่มจึงต้องยังกดได้ตอนติ๊ก เพราะยังต้องเปลี่ยนปีได้ — เดิมปิดปุ่มทิ้งไว้
     แล้วผู้ใช้ไม่มีทางรู้เลยว่ากำลังดู "ทุกเดือนของปีไหน" */
  const showingAllMonths = Boolean(onAllMonths && allMonths);
  const canUseToday = isMonthInRange(today, { min, max });

  const [open, setOpen] = useState(false);
  // ปีที่ "กำลังดู" แยกจากปีที่เลือก — เลื่อนดูปีอื่นได้โดยยังไม่เปลี่ยนค่า
  const [viewYear, setViewYear] = useState(() => Number(selected.slice(0, 4)));
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);

  const years = yearOptionsForMonth(selected, { min, max, pastYears, futureYears });
  const firstYear = Number(years[0]);
  const lastYear = Number(years[years.length - 1]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
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
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (viewportWidth <= 480) {
        setPanelStyle({ position: "fixed", left: 12, right: 12, top: "50%", width: "auto", transform: "translateY(-50%)" });
        return;
      }
      const gap = 6;
      const left = Math.max(8, Math.min(rect.left, viewportWidth - PANEL_WIDTH - 8));
      const opensUp = rect.bottom + gap + PANEL_HEIGHT > viewportHeight && rect.top > PANEL_HEIGHT + gap;
      const top = opensUp
        ? Math.max(8, rect.top - PANEL_HEIGHT - gap)
        : Math.min(rect.bottom + gap, viewportHeight - PANEL_HEIGHT - 8);
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

  const change = (next) => {
    if (locked) return;
    onChange?.(clampMonth(next, { min, max, fallback: selected }));
  };

  // เลือกเดือนเจาะจง = เลิกโหมด "ทุกเดือน" โดยปริยาย (เจตนาชัดว่าอยากได้เดือนเดียว)
  const choose = (month) => {
    if (showingAllMonths) onAllMonths(false);
    change(month);
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
  };

  /* ตอนติ๊ก "ทุกเดือน" ไม่มีเดือนให้กด ลูกศรเลื่อนปีจึงต้อง **คอมมิตค่าเลย**
     ไม่ใช่แค่เลื่อนสิ่งที่ดูอยู่ (คงเลขเดือนเดิมไว้ ปลายทางอ่านแค่ปี) */
  const stepYear = (delta) => {
    const next = Math.min(lastYear, Math.max(firstYear, viewYear + delta));
    setViewYear(next);
    if (showingAllMonths) change(addMonths(selected, (next - Number(selected.slice(0, 4))) * 12));
  };

  // PageUp/PageDown เลื่อนงวดโดยไม่ต้องเปิดแผง (Shift = ทีละปี) — สัญญาเดิมของ component
  const handleKeyDown = (event) => {
    if (locked || (event.key !== "PageUp" && event.key !== "PageDown")) return;
    event.preventDefault();
    const direction = event.key === "PageUp" ? -1 : 1;
    // โหมดทุกเดือนเลื่อนได้เฉพาะทีละปี — เลื่อนทีละเดือนไม่มีความหมาย
    change(addMonths(selected, direction * (showingAllMonths || event.shiftKey ? 12 : 1)));
  };

  const openPanel = () => {
    if (locked) return;
    setViewYear(Number(selected.slice(0, 4)));
    setPanelStyle(null);
    setOpen((current) => !current);
  };

  const availableInView = monthsForYear(String(viewYear), { min, max });
  // ต้องบอกปีเสมอตอนโหมดทุกเดือน — "ทุกเดือน" เฉย ๆ อ่านไม่ออกว่าปีไหน
  const triggerLabel = showingAllMonths
    ? `${allMonthsLabel} ${displayYear(selected.slice(0, 4))}`
    : formatMonthLabel(selected);

  const panel = open && panelStyle ? (
    <span
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-label="เลือกงวดเดือน"
      style={panelStyle}
    >
      <span className={styles.panelHeader}>
        <button
          type="button"
          onClick={() => stepYear(-1)}
          disabled={viewYear <= firstYear}
          aria-label="ปีก่อนหน้า"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>{displayYear(viewYear)}</strong>
        <button
          type="button"
          onClick={() => stepYear(1)}
          disabled={viewYear >= lastYear}
          aria-label="ปีถัดไป"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </span>
      {showingAllMonths ? (
        <span className={styles.panelNote}>
          กำลังดู <strong>{allMonthsLabel}</strong> ของปี {displayYear(viewYear)} —
          {" "}กดเดือนใดเดือนหนึ่งเพื่อดูเฉพาะเดือนนั้น
        </span>
      ) : null}
      <span className={styles.panelGrid}>
        {MONTH_LABELS.map((label, index) => {
          const month = `${viewYear}-${String(index + 1).padStart(2, "0")}`;
          const classes = [
            month === today ? styles.isToday : "",
            // โหมดทุกเดือน = ทั้งปีถูกเลือก ไม่ใช่เดือนใดเดือนหนึ่ง
            showingAllMonths
              ? (Number(month.slice(0, 4)) === viewYear ? styles.isInRange : "")
              : (month === selected ? styles.isSelected : ""),
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={month}
              className={classes}
              disabled={!availableInView.includes(month)}
              aria-current={month === today ? "date" : undefined}
              aria-pressed={showingAllMonths ? Number(month.slice(0, 4)) === viewYear : month === selected}
              onClick={() => choose(month)}
            >
              {label}
            </button>
          );
        })}
      </span>
      {showCurrentShortcut && canUseToday ? (
        <span className={styles.panelFooter}>
          <span>{formatMonthLabel(today)}</span>
          <button
            type="button"
            disabled={selected === today && !(onAllMonths && allMonths)}
            onClick={() => {
              onAllMonths?.(false);
              choose(today);
            }}
          >
            {currentShortcutLabel}
          </button>
        </span>
      ) : null}
    </span>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      onKeyDown={handleKeyDown}
    >
      <Button
        className={styles.trigger}
        disabled={locked}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPanel}
        icon={<CalendarDays size={15} aria-hidden="true" />}
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        <ChevronDown size={14} aria-hidden="true" className={styles.triggerCaret} />
      </Button>
      {onAllMonths ? (
        <label className={styles.allMonths}>
          <input
            type="checkbox"
            checked={allMonths}
            disabled={locked}
            onChange={(event) => onAllMonths(event.target.checked)}
          />
          {allMonthsLabel}
        </label>
      ) : null}
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
