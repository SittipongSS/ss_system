"use client";

/* งวดของหน้ารายงาน/รายการ — ตัวกลางของ "รายเดือน | ช่วงวัน" (มติผู้ใช้ 2026-09-22 "ทุกหน้าตัวคุมชุดเดียว")
 * ผู้ใช้: รายงานยอดขาย (/sa/targets/report) · ลีด (/sa/leads) · ดีล (/sa/deals)
 *
 * ⭐ ค่าจำไว้ด้วย useStickyState (คีย์ผูก pathname) ⇒ กดย้อนกลับมาเจองวดเดิม · เข้าใหม่ = ค่าตั้งต้น
 * ⭐ `period` ผ่าน `parseReportPeriod` ตัวเดียวกับ server ⇒ querystring (`query`) ที่ส่งไป API ข้อมูล
 *    และไฟล์ Excel เป็นงวดเดียวกันเสมอ — จอกับไฟล์ไม่มีทางคนละงวด
 *
 * ⚠️ ค่าที่อ่านไม่ออก (ค้างใน storage จากรุ่นเก่า) ตกไปที่ค่าตั้งต้นของหน้า — ไม่ใช่งวดเพี้ยนเงียบ ๆ
 */

import { useMemo } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { businessDayKey, currentMonth } from "@/lib/datePeriods";
import { defaultDayRange, parseReportPeriod, reportPeriodLabel, reportPeriodQuery } from "@/lib/sales/reportPeriod";

/**
 * @param defaultAllMonths ค่าตั้งต้นของติ๊ก "ทุกเดือน" (รายงาน/ดีล = true · ลีด = false ตามเดิมของหน้า)
 * @param now              นาฬิกาที่หน้าจับไว้ตอน mount (ไม่อ่านใหม่ทุกเรนเดอร์)
 */
export default function useReportPeriod({ defaultAllMonths = false, now } = {}) {
  const clock = now || new Date();
  const today = businessDayKey(clock.toISOString());
  const thisMonth = currentMonth(clock);

  const [mode, setMode] = useStickyState("periodMode", "month");
  const [month, setMonth] = useStickyState("month", thisMonth);
  const [allMonths, setAllMonths] = useStickyState("allMonths", defaultAllMonths);
  const [range, setRange] = useStickyState("range", defaultDayRange(today));

  const period = useMemo(() => {
    const input = mode === "range"
      ? { mode: "range", from: range?.from, to: range?.to }
      : allMonths
        ? { mode: "year", year: String(month || thisMonth).slice(0, 4) }
        : { mode: "month", month: month || thisMonth };
    const parsed = parseReportPeriod(input, { today });
    if (!parsed.error) return parsed;
    // ค่าที่ค้างอ่านไม่ออก = กลับค่าตั้งต้นของโหมดนั้น
    return mode === "range"
      ? parseReportPeriod({ mode: "range", ...defaultDayRange(today) }, { today })
      : parseReportPeriod({ mode: "month", month: thisMonth }, { today });
  }, [mode, range?.from, range?.to, allMonths, month, thisMonth, today]);

  return {
    mode, setMode,
    month: month || thisMonth, setMonth,
    allMonths: Boolean(allMonths), setAllMonths,
    range: period.mode === "range" ? { from: period.from, to: period.to } : (range || defaultDayRange(today)), setRange,
    period,
    query: reportPeriodQuery(period),
    label: reportPeriodLabel(period),
    today,
    thisMonth,
  };
}
