"use client";

import { Target, TrendingUp, LineChart, Percent, CalendarClock, ArrowUpRight } from "lucide-react";
import UiKpiCard from "@/components/ui/KpiCard";
import { yearSummary } from "@/lib/sales/performanceMath";
import { closedThroughLabel, money, pctFmt } from "./shared";

// การ์ด KPI 6 ใบของมุมมองที่เลือก (บริษัท/ทีม/คน) — ตัวเลขระดับ "ทั้งปี + สะสม".
// ทบสะสม = Actual − Target ของเดือนที่จบแล้ว (ติดลบ = ต้องทบเข้าเดือนถัดไป);
// เมื่อปิดโหมดทบยอด ป้ายเปลี่ยนเป็น "ผลต่างสะสมเทียบเป้า" (ตัวเลขเดียวกัน คนละการตีความ).
//
// คณิตอยู่ที่ `yearSummary` ที่เดียว — คอลัมน์โหมดปีของตารางติดตามใช้ตัวเดียวกัน
// (เคยเขียนสูตรซ้ำในตารางสรุปที่ลบไปแล้ว แล้วเลขสองจุดหลุดจากกันได้เงียบ ๆ)
//
// ⚠️ **ทุกใบที่เทียบเป้า/ปีก่อน ต้องมีป้ายบอกฐานว่านับถึงเดือนไหน** — ตัวเลขพวกนี้
// นับเฉพาะเดือนที่จบแล้ว ไม่รวมเดือนที่กำลังวิ่ง (ดูเหตุผลใน `yearSummary`)
// ส่วนใบ "Actual สะสม" เป็นข้อเท็จจริงล้วน จึงรวมเดือนที่วิ่งอยู่ด้วย

export default function PerformanceKpiCards({ row, lastYear, label, year, closedCount, ytdCount, carry }) {
  const { targetYear, actualClosed, actualYtd, gap, achv, remainMonths, needPerMonth, yoy } =
    yearSummary(row, { closedCount, ytdCount, lastYearActual: lastYear });

  const through = closedThroughLabel(closedCount);
  const running = actualYtd - actualClosed; // ยอดของเดือนที่ยังวิ่งอยู่
  const gapLabel = carry ? `ยอดทบสะสม (${through})` : `ผลต่างสะสมเทียบเป้า (${through})`;
  const gapHint = achv == null
    ? "ยังไม่มีเดือนที่จบให้เทียบ"
    : gap >= 0
      ? `เกินเป้าสะสม${carry ? " — ไม่มียอดทบ" : ""}`
      : carry ? `ต้องทบเข้าเดือนถัดไป ${money(-gap)}` : `ต่ำกว่าเป้าสะสม ${money(-gap)}`;

  const cards = [
    { icon: <Target size={18} />, label: `Target ทั้งปี ${year}`, value: money(targetYear), hint: label },
    {
      icon: <LineChart size={18} />,
      label: "Actual สะสม",
      value: money(actualYtd),
      // แยกให้เห็นว่าเท่าไรมาจากเดือนที่ปิดแล้ว เท่าไรคือเดือนที่ยังวิ่ง — เลขสองฐาน
      // ในแถบเดียวกันจะได้ไม่ชวนสงสัยว่าทำไมใบอื่นได้ตัวเลขคนละชุด
      hint: closedCount >= 12 || running <= 0 ? `รวมทั้งหมด (${through})` : `จบแล้ว ${money(actualClosed)} + เดือนนี้ ${money(running)}`,
      color: "var(--green)",
    },
    { icon: <TrendingUp size={18} />, label: gapLabel, value: achv == null ? "–" : `${gap >= 0 ? "+" : ""}${money(gap)}`, hint: gapHint, color: achv == null ? undefined : gap >= 0 ? "var(--green)" : "var(--red)" },
    {
      icon: <Percent size={18} />,
      label: `% Achievement (${through})`,
      value: pctFmt(achv),
      hint: achv == null ? "ยังไม่มีเดือนที่จบให้เทียบ" : `Actual ${money(actualClosed)} เทียบเป้า ${money(actualClosed - gap)}`,
      color: achv == null ? undefined : achv >= 100 ? "var(--green)" : achv >= 70 ? "var(--amber)" : "var(--red)",
    },
    {
      icon: <CalendarClock size={18} />,
      // เดือนที่ยังวิ่งนับเป็น "ยังเหลือ" — ยังขายได้อยู่ ไม่ใช่เดือนที่หมดสิทธิ์แล้ว
      label: `ต้องทำเฉลี่ย/เดือน (อีก ${remainMonths} เดือน)`,
      value: needPerMonth == null ? "–" : money(needPerMonth),
      hint: needPerMonth === 0 ? "ปิดเป้าทั้งปีแล้ว 🎉" : "เพื่อปิดเป้าทั้งปี · รวมเดือนนี้ที่ยังขายได้",
    },
    {
      icon: <ArrowUpRight size={18} />,
      label: `การเติบโต YoY (${through})`,
      value: yoy == null ? "–" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`,
      hint: yoy == null ? `ไม่มียอดปี ${year - 1} ช่วงเดียวกัน` : `เทียบปี ${year - 1} เดือนเดียวกัน`,
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
