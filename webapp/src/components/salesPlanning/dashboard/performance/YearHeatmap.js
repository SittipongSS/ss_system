"use client";

import { CalendarRange } from "lucide-react";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { moneyCompact } from "./shared";

// ภาพรวมทั้งปี — ± เทียบเป้ารายเดือน ทุกคนพร้อมกัน (heatmap).
// เขียว = เกินเป้าเดือนนั้น · แดง = ขาด · เดือนที่ยังไม่จบ/ไม่มีเป้า = จาง.
// คลิกชื่อ → เจาะรายคนด้านล่าง (เหมือนบอร์ดเช้า).

function cellStyle(diff, hasTarget, isClosed) {
  if (!isClosed || !hasTarget) return { color: "var(--text-3)", opacity: 0.6 };
  const tone = diff >= 0 ? "var(--green)" : "var(--red)";
  // เข้มตามขนาดผลต่าง (เพดาน 28% ให้อ่านตัวเลขออกทั้ง light/dark)
  const mag = Math.min(28, 8 + Math.round(Math.abs(diff) / 50000));
  return {
    color: tone,
    fontWeight: 600,
    background: `color-mix(in srgb, ${tone} ${mag}%, transparent)`,
    borderRadius: 6,
  };
}

export default function YearHeatmap({ matrix, year, closedCount, onDrill }) {
  if (!matrix.people.length) return null;
  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
        <CalendarRange size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ภาพรวมทั้งปี {year} — ± เทียบเป้ารายเดือน</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-3)", fontSize: 12.5 }}>
        เขียว = เกินเป้าเดือนนั้น · แดง = ขาด · คลิกชื่อเพื่อเจาะรายคน
      </p>
      <div className="fz-box premium-glass-table" style={{ "--fz-c1w": "150px" }}>
        <table className="fz-table w-full" style={{ minWidth: 900, fontSize: 12.5 }}>
          <thead>
            <tr>
              <th className="fz-c1">พนักงาน</th>
              {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.people.map((p) => (
              <tr key={p.id} className="premium-row">
                <td className="fz-c1" style={{ cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => onDrill({ scope: "person", person: p.id })} title="คลิกเพื่อเจาะรายคน">
                  <strong>{p.name}</strong>
                  {p.team && <span style={{ display: "block", color: "var(--text-3)", fontSize: 11, fontWeight: 400 }}>{p.team}</span>}
                </td>
                {MONTH_LABELS.map((_, i) => {
                  const diff = Number(p.actual[i] || 0) - Number(p.target[i] || 0);
                  const hasTarget = Number(p.target[i] || 0) > 0;
                  const isClosed = i < closedCount;
                  return (
                    <td key={i} className="num mono" style={{ padding: "6px 8px" }}>
                      <span style={{ display: "inline-block", padding: "2px 6px", ...cellStyle(diff, hasTarget, isClosed) }}>
                        {!isClosed ? "–" : hasTarget || Number(p.actual[i] || 0) > 0 ? `${diff >= 0 ? "+" : ""}${moneyCompact(diff)}` : "–"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
