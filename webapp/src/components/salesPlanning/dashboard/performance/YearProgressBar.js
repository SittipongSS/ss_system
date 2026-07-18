"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Target } from "lucide-react";
import { windowStat, periodKindOf } from "@/lib/sales/performanceMath";
import { money, pctFmt, SeriesLegend } from "./shared";

// แถบความคืบหน้าเทียบเป้า — ทั้งบริษัท (ส่วนบนสุดของแท็บผลงานขาย).
// Actual (เขียว) + Forecast (ส้ม) ซ้อนในแถบเดียว เทียบตำแหน่งขีด "เป้า(+ทบ)".
// สลับหน้าต่างเวลา เดือนนี้/ไตรมาสนี้/ทั้งปี ได้ — ปีอื่นที่ไม่ใช่ปีปัจจุบันมีแต่ "ทั้งปี".
// สวิตช์ "ทบยอด" อยู่ที่นี่เพราะมีผลทั้งแท็บ (ทุกตาราง/กราฟด้านล่าง).

const WINDOWS = [
  { key: "month", label: "เดือนนี้" },
  { key: "quarter", label: "ไตรมาสนี้" },
  { key: "year", label: "ทั้งปี" },
];

export default function YearProgressBar({ matrix, year, now, closedCount, carryOn, onCarryChange, historyHref }) {
  const [win, setWin] = useState("year");
  const isCurrentYear = year === now.year;
  const activeWin = isCurrentYear ? win : "year";

  const range =
    activeWin === "month"
      ? { startIdx: now.monthIdx, endIdx: now.monthIdx }
      : activeWin === "quarter"
        ? { startIdx: Math.floor(now.monthIdx / 3) * 3, endIdx: Math.floor(now.monthIdx / 3) * 3 + 2 }
        : { startIdx: 0, endIdx: 11 };

  const stat = windowStat(matrix.company, { ...range, carryOn, closedCount });
  const kind = periodKindOf({ year, ...range }, now);
  const scale = Math.max(stat.mustClose, stat.actual + stat.forecast, 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <Target size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ความคืบหน้าเทียบเป้า — ทั้งบริษัท</h2>
        <div className="spacer" />
        <SeriesLegend
          items={[
            { label: "Actual", color: "var(--green)" },
            { label: "Forecast", color: "var(--amber)" },
          ]}
        />
        <div className="segmented" role="group" aria-label="ช่วงเวลา">
          {WINDOWS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={activeWin === o.key ? "active" : ""}
              disabled={!isCurrentYear && o.key !== "year"}
              onClick={() => setWin(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {/* นโยบายทบยอด: เปิด = เดือนขาดเป้าทบเข้างวดถัดไป (ขีดเป้าเลื่อนตาม) — มีผลทั้งแท็บ */}
        <div className="segmented" role="group" aria-label="โหมดทบยอด" title="เปิด = ยอดที่ขาดทบเข้างวดถัดไป · ปิด = เทียบเป้าปกติรายงวด">
          <button type="button" className={carryOn ? "active" : ""} onClick={() => onCarryChange(true)}>ทบยอด</button>
          <button type="button" className={!carryOn ? "active" : ""} onClick={() => onCarryChange(false)}>เป้าปกติ</button>
        </div>
        {historyHref && (
          <Link href={historyHref} className="btn ghost sm" title="กรอกยอดขายจริงรายเดือนของปีก่อน เพื่อให้กราฟ YoY เทียบได้">
            <History size={14} aria-hidden="true" /> ยอดปีก่อน
          </Link>
        )}
      </div>

      <div style={{ position: "relative", marginTop: 22 }}>
        <div
          role="img"
          aria-label={`Actual ${money(stat.actual)} · Forecast ${money(stat.forecast)} เทียบต้องปิด ${money(stat.mustClose)}`}
          style={{
            display: "flex", overflow: "hidden", height: 14,
            borderRadius: 8, background: "var(--panel-2)", border: "1px solid var(--border)",
          }}
        >
          <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)", transition: "width .3s" }} />
          <i style={{ display: "block", height: "100%", width: w(stat.forecast), background: "var(--amber)", opacity: 0.75, transition: "width .3s" }} />
        </div>
        {stat.mustClose > 0 && (
          <span style={{ position: "absolute", top: -5, height: 24, width: 3, left: w(stat.mustClose), transform: "translateX(-50%)", background: "var(--text)", borderRadius: 2 }}>
            <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {carryOn && stat.carry > 0 ? "เป้า+ทบ" : "เป้า"}
            </span>
          </span>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-3)" }}>
        Actual {money(stat.actual)} ({pctFmt(stat.pct)}) · Forecast {money(stat.forecast)} · ต้องปิด {money(stat.mustClose)}
        {carryOn && stat.carry > 0 && <> (เป้า {money(stat.target)} + ทบยกมา {money(stat.carry)})</>}
        {kind !== "past" && stat.projected < stat.mustClose && <> · คาดขาด {money(stat.mustClose - stat.projected)}</>}
      </div>
    </section>
  );
}
