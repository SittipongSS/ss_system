"use client";

/* ตัวเลือกงวด "รายเดือน | ช่วงวัน" ตัวกลาง (มติผู้ใช้ 2026-09-22 "ทุกหน้าตัวคุมชุดเดียว")
 *   รายเดือน = MonthPicker เดือนเดียว · ติ๊ก "ทุกเดือน" = ทุกเดือนของปีนั้น
 *   ช่วงวัน  = DayRangePicker (ชิป 7 วันล่าสุด · 14 วัน · สัปดาห์นี้ · สัปดาห์ก่อน · เดือนนี้)
 * ใช้คู่กับ `useReportPeriod` — ส่ง state ทั้งก้อนมาที่ `state`
 *
 * ⭐ เพดานช่วงวัน (MAX_RANGE_DAYS) ตัดสินที่นี่ครั้งเดียว — เกินแล้วคงช่วงเดิมและบอกผ่าน `onRangeError`
 *    (เดิมหน้ารายงานเงียบ ๆ ตกไปเป็นทั้งปีทั้งที่ปุ่มยังเป็น "ช่วงวัน")
 */

import Segmented from "@/components/ui/Segmented";
import DayRangePicker from "@/components/ui/DayRangePicker";
import MonthPicker from "@/components/ui/MonthPicker";
import { daysInRange } from "@/lib/datePeriods";
import { MAX_RANGE_DAYS } from "@/lib/sales/reportPeriod";

export const PERIOD_MODE_OPTIONS = [
  { value: "month", label: "รายเดือน" },
  { value: "range", label: "ช่วงวัน" },
];

export default function ReportPeriodControl({
  state,
  markedDays = [],
  markedLabel,
  minMonth,
  onRangeError,
  ariaLabel = "หน่วยของงวด",
}) {
  return (
    <>
      <Segmented ariaLabel={ariaLabel} value={state.mode} onChange={state.setMode} options={PERIOD_MODE_OPTIONS} />
      {state.mode === "range" ? (
        <DayRangePicker
          from={state.range.from}
          to={state.range.to}
          today={state.today}
          markedDays={markedDays}
          markedLabel={markedLabel}
          onChange={(next) => {
            if (daysInRange(next.from, next.to).length > MAX_RANGE_DAYS) {
              onRangeError?.("ช่วงวันยาวเกิน 5 ปี — เลือกให้สั้นลง (ดูยาวกว่านั้นให้ใช้ \"รายเดือน · ทุกเดือน\" ทีละปี)");
              return;
            }
            onRangeError?.("");
            state.setRange(next);
          }}
        />
      ) : (
        <MonthPicker
          value={state.month}
          onChange={state.setMonth}
          allMonths={state.allMonths}
          onAllMonths={state.setAllMonths}
          min={minMonth}
        />
      )}
    </>
  );
}
