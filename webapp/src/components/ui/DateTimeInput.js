"use client";

import { useState } from "react";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import { resolveDateTimeEdit, splitDateTime } from "@/lib/ui/dateTimeValue";

export default function DateTimeInput({ value = "", onChange, disabled, className = "", style, dateAriaLabel = "วันที่", timeAriaLabel = "เวลา" }) {
  const { date, time } = splitDateTime(value);

  /* เวลาที่กรอกไว้ก่อนจะมีวันที่ — ISO ต้องมีทั้งวันและเวลา จึงยังประกอบค่ารวมไม่ได้
     แต่ห้ามทิ้งของที่ผู้ใช้พิมพ์ (เหตุผลเต็ม + เทสต์อยู่ที่ lib/ui/dateTimeValue.js)
     ผลพลอยได้: ล้างวันที่แล้วเลือกวันใหม่ ได้เวลาเดิมคืน ไม่ต้องพิมพ์ซ้ำ */
  const [pendingTime, setPendingTime] = useState("");
  const keptTime = time || pendingTime;

  const emit = (nextDate, nextTime) => {
    const next = resolveDateTimeEdit(nextDate, nextTime);
    setPendingTime(next.pendingTime);
    onChange?.(next.value);
  };

  return (
    <span className={`datetime-input ${className}`.trim()} style={style}>
      <DateInput value={date} onChange={(nextDate) => emit(nextDate, keptTime)} disabled={disabled} ariaLabel={dateAriaLabel} />
      <TimeInput
        value={keptTime.slice(0, 5)}
        disabled={disabled}
        ariaLabel={timeAriaLabel}
        onChange={(nextTime) => emit(date, nextTime)}
      />
    </span>
  );
}
