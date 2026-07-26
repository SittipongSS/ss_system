"use client";

import { CalendarDays } from "lucide-react";
import Select from "@/components/ui/Select";
import {
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

export default function MonthPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  readOnly = false,
  pastYears = 3,
  futureYears = 3,
  calendar = "buddhist",
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
  const year = selected.slice(0, 4);
  const locked = disabled || readOnly;
  const monthLocked = locked || Boolean(onAllMonths && allMonths);
  const years = yearOptionsForMonth(selected, { min, max, pastYears, futureYears });
  const months = monthsForYear(year, { min, max });
  const canUseToday = isMonthInRange(today, { min, max });

  const change = (next) => {
    if (locked) return;
    onChange?.(clampMonth(next, { min, max, fallback: selected }));
  };

  const changeYear = (nextYear) => {
    const candidate = `${nextYear}-${selected.slice(5, 7)}`;
    const available = monthsForYear(nextYear, { min, max });
    change(available.includes(candidate) ? candidate : available[0]);
  };

  const handleKeyDown = (event) => {
    if (locked || monthLocked || (event.key !== "PageUp" && event.key !== "PageDown")) return;
    event.preventDefault();
    const direction = event.key === "PageUp" ? -1 : 1;
    change(addMonths(selected, direction * (event.shiftKey ? 12 : 1)));
  };

  return (
    <div
      className={`${styles.root} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      onKeyDown={handleKeyDown}
    >
      <Select
        className={`${styles.year} premium-select`}
        value={year}
        onChange={(event) => changeYear(event.target.value)}
        aria-label="ปี"
        disabled={locked}
      >
        {years.map((optionYear) => (
          <option key={optionYear} value={String(optionYear)}>
            {displayYear(optionYear, calendar)}
          </option>
        ))}
      </Select>
      <Select
        className={`${styles.month} premium-select`}
        value={selected}
        disabled={monthLocked}
        onChange={(event) => change(event.target.value)}
        aria-label="เดือน"
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonthLabel(month, { calendar })}
          </option>
        ))}
      </Select>
      {showCurrentShortcut && canUseToday ? (
        <button
          type="button"
          className={`btn ghost sm ${styles.shortcut}`}
          onClick={() => {
            onAllMonths?.(false);
            change(today);
          }}
          disabled={locked || (!allMonths && selected === today)}
          aria-label={`${currentShortcutLabel} ${formatMonthLabel(today, { calendar })}`}
        >
          <CalendarDays size={14} aria-hidden="true" />
          {currentShortcutLabel}
        </button>
      ) : null}
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
    </div>
  );
}
