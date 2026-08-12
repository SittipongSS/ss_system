"use client";

import { Target, TrendingUp, LineChart, Percent, CalendarClock, ArrowUpRight } from "lucide-react";
import UiKpiCard from "@/components/ui/KpiCard";
import { yearSummary } from "@/lib/sales/performanceMath";
import { money, pctFmt } from "./shared";

// การ์ด KPI 6 ใบของมุมมองที่เลือก (บริษัท/ทีม/คน) — ตัวเลขระดับ "ทั้งปี + YTD".
// ทบสะสม YTD = Actual YTD − Target YTD (ติดลบ = ต้องทบเข้าเดือนถัดไป);
// เมื่อปิดโหมดทบยอด ป้ายเปลี่ยนเป็น "ผลต่างสะสมเทียบเป้า" (ตัวเลขเดียวกัน คนละการตีความ).
//
// คณิตอยู่ที่ `yearSummary` ที่เดียว — คอลัมน์โหมดปีของตารางติดตามใช้ตัวเดียวกัน
// (เคยเขียนสูตรซ้ำในตารางสรุปที่ลบไปแล้ว แล้วเลขสองจุดหลุดจากกันได้เงียบ ๆ)

export default function PerformanceKpiCards({ row, lastYear, label, year, ytdCount, carry }) {
  const { targetYear, targetYtd, actualYtd, gap, achv, remainMonths, needPerMonth, yoy } =
    yearSummary(row, { ytdCount, lastYearActual: lastYear });

  const gapLabel = carry ? "ยอดทบสะสม (YTD)" : "ผลต่างสะสมเทียบเป้า (YTD)";
  const gapHint = gap >= 0
    ? `เกินเป้าสะสม${carry ? " — ไม่มียอดทบ" : ""}`
    : carry ? `ต้องทบเข้าเดือนถัดไป ${money(-gap)}` : `ต่ำกว่าเป้าสะสม ${money(-gap)}`;

  const cards = [
    { icon: <Target size={18} />, label: `Target ทั้งปี ${year}`, value: money(targetYear), hint: label },
    { icon: <LineChart size={18} />, label: "Actual YTD", value: money(actualYtd), hint: `เทียบเป้า YTD ${money(targetYtd)}`, color: "var(--green)" },
    { icon: <TrendingUp size={18} />, label: gapLabel, value: `${gap >= 0 ? "+" : ""}${money(gap)}`, hint: gapHint, color: gap >= 0 ? "var(--green)" : "var(--red)" },
    { icon: <Percent size={18} />, label: "% Achievement (YTD)", value: pctFmt(achv), color: achv == null ? undefined : achv >= 100 ? "var(--green)" : achv >= 70 ? "var(--amber)" : "var(--red)" },
    {
      icon: <CalendarClock size={18} />,
      label: `ต้องทำเฉลี่ย/เดือน (อีก ${remainMonths} เดือน)`,
      value: needPerMonth == null ? "–" : money(needPerMonth),
      hint: needPerMonth === 0 ? "ปิดเป้าทั้งปีแล้ว 🎉" : "เพื่อปิดเป้าทั้งปี",
    },
    {
      icon: <ArrowUpRight size={18} />,
      label: "การเติบโต YoY (YTD)",
      value: yoy == null ? "–" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`,
      hint: yoy == null ? `ไม่มียอดปี ${year - 1} ช่วงเดียวกัน` : `เทียบปี ${year - 1} ช่วงเดียวกัน`,
      color: yoy == null ? undefined : yoy >= 0 ? "var(--green)" : "var(--red)",
    },
  ];

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
      {cards.map((c) => (
        <UiKpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} hint={c.hint} color={c.color} interactive={false} />
      ))}
    </div>
  );
}
