"use client";

import DateInput from "@/components/ui/DateInput";

export default function DateTimeInput({ value = "", onChange, disabled, className = "", style, dateAriaLabel = "วันที่", timeAriaLabel = "เวลา" }) {
  const [date = "", time = ""] = String(value || "").split("T");
  const emit = (nextDate, nextTime) => onChange?.(nextDate ? `${nextDate}T${nextTime || "00:00"}` : "");
  return (
    <span className={`datetime-input ${className}`.trim()} style={style}>
      <DateInput value={date} onChange={(nextDate) => emit(nextDate, time)} disabled={disabled} ariaLabel={dateAriaLabel} />
      <input
        type="time"
        className="premium-input datetime-time"
        value={time.slice(0, 5)}
        disabled={disabled}
        aria-label={timeAriaLabel}
        onChange={(event) => emit(date, event.target.value)}
      />
    </span>
  );
}
