"use client";

import { Target } from "lucide-react";
import { windowStat, periodKindOf } from "@/lib/sales/performanceMath";
import { money, pctFmt, periodLabel, SeriesLegend } from "./shared";

// แถบความคืบหน้าเทียบเป้า — ทั้งบริษัท (ส่วนบนสุดของแท็บผลงานขาย).
// Actual (เขียว) + Forecast (ส้ม) ซ้อนในแถบเดียว เทียบตำแหน่งขีด "เป้า(+ทบ)".
//
// งวดมาจากแถบคุมด้านบน (`PeriodBar`) — การ์ดนี้ไม่มีตัวคุมเวลาของตัวเองแล้ว
// (2026-08-12) ของเดิมเป็น `useState` แยกที่ล็อกอยู่ที่ "ตอนนี้" และไม่เข้า URL
// จึงแสดงคนละงวดกับตารางที่อยู่ใต้มันได้โดยไม่มีอะไรบอก

export default function YearProgressBar({ matrix, year, now, closedCount, carry, win }) {
  const range = { startIdx: win.startIdx, endIdx: win.endIdx };
  const stat = windowStat(matrix.company, { ...range, carryOn: carry, closedCount });
  const kind = periodKindOf({ year, ...range }, now);
  const scale = Math.max(stat.mustClose, stat.actual + stat.forecast, 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <Target size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>
          ความคืบหน้าเทียบเป้า — ทั้งบริษัท · {periodLabel(win)}
        </h2>
        <div className="spacer" />
        <SeriesLegend
          items={[
            { label: "Actual", color: "var(--green)" },
            { label: "Forecast", color: "var(--amber)" },
          ]}
        />
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
          <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)", transition: "width var(--motion-slow)" }} />
          <i style={{ display: "block", height: "100%", width: w(stat.forecast), background: "var(--amber)", opacity: 0.75, transition: "width var(--motion-slow)" }} />
        </div>
        {stat.mustClose > 0 && (
          <span style={{ position: "absolute", top: -5, height: 24, width: 3, left: w(stat.mustClose), transform: "translateX(-50%)", background: "var(--text)", borderRadius: 2 }}>
            <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: "var(--fs-3)", color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {carry && stat.carry > 0 ? "เป้า+ทบ" : "เป้า"}
            </span>
          </span>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
        Actual {money(stat.actual)} ({pctFmt(stat.pct)}) · Forecast {money(stat.forecast)} · ต้องปิด {money(stat.mustClose)}
        {carry && stat.carry > 0 && <> (เป้า {money(stat.target)} + ทบยกมา {money(stat.carry)})</>}
        {kind !== "past" && stat.projected < stat.mustClose && <> · คาดขาด {money(stat.mustClose - stat.projected)}</>}
      </div>
    </section>
  );
}
