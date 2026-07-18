"use client";

import { statusOf } from "@/lib/sales/performanceMath";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";

// ชิ้นส่วนเล็กที่ใช้ร่วมกันในแท็บผลงานขาย — เก็บที่เดียวให้บอร์ดเช้า/ตารางสรุป/
// แผงทบยอด แสดงสถานะและแถบความคืบหน้าหน้าตาเดียวกัน

export const money = (v) => fmtMoney(v);
export const moneyCompact = (v) => fmtMoneyCompact(v);
export const pctFmt = (v) =>
  v == null ? "–" : `${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const TONE_COLORS = {
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  muted: "var(--text-3)",
};

// ป้ายสถานะงวดจาก statusOf — ถ้าแถวไม่มีเป้าและไม่มียอด (คนไม่ถือเป้า) แสดง "–"
export function StatusPill({ stat, periodKind }) {
  if (stat.mustClose <= 0 && stat.actual <= 0) {
    return <span style={{ color: "var(--text-3)" }}>–</span>;
  }
  const s = statusOf(stat, { periodKind });
  const color = TONE_COLORS[s.tone] || TONE_COLORS.muted;
  return (
    <span
      className="ui-badge"
      style={{ color, borderColor: "color-mix(in srgb, currentColor 30%, transparent)", whiteSpace: "nowrap" }}
    >
      {s.label}
      {s.amount > 0 ? ` ${moneyCompact(s.amount)}` : ""}
    </span>
  );
}

// แถบความคืบหน้าของงวด: เขียว = Actual, ส้ม = Forecast (ต่อท้าย), ขีดเข้ม = ต้องปิด.
// สเกล = ค่ามากสุดของ (ต้องปิด, Actual+Forecast) เพื่อให้ทุกส่วนอยู่ในกรอบเสมอ.
export function ProgressBar({ stat, height = 8 }) {
  const scale = Math.max(stat.mustClose, stat.actual + stat.forecast, 1);
  const w = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div style={{ position: "relative", minWidth: 110 }}>
      <div
        style={{
          display: "flex", overflow: "hidden", height,
          borderRadius: height / 2, background: "var(--panel-2)",
          border: "1px solid var(--border)",
        }}
      >
        <i style={{ display: "block", height: "100%", width: w(stat.actual), background: "var(--green)" }} />
        <i style={{ display: "block", height: "100%", width: w(stat.forecast), background: "var(--amber)", opacity: 0.75 }} />
      </div>
      {stat.mustClose > 0 && (
        <span
          title="ต้องปิด"
          style={{
            position: "absolute", top: -3, height: height + 6, width: 2,
            left: w(stat.mustClose), transform: "translateX(-50%)",
            background: "var(--text)", borderRadius: 1,
          }}
        />
      )}
    </div>
  );
}

// legend สีสามค่า — ใช้หัวการ์ด/แผงต่าง ๆ
export function SeriesLegend({ items }) {
  return (
    <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-2)" }}>
          <span
            aria-hidden="true"
            style={{
              width: 11, height: s.line ? 3 : 11, borderRadius: 3, display: "inline-block",
              background: s.dashed ? "none" : s.color,
              borderTop: s.dashed ? `3px dashed ${s.color}` : "none",
            }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
