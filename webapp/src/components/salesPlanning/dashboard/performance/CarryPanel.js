"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { carryTable } from "@/lib/sales/performanceMath";
import { money, moneyCompact } from "./shared";

// แผงทบยอดย้อนหลัง (Carry-over) — โชว์เมื่อเปิดโหมดทบยอดเท่านั้น.
// เดือนไหนปิดไม่ถึงเป้า ยอดที่ขาดทบเข้าเดือนถัดไป · "เป้า + ทบ" = ยอดที่ต้องปิด
// ในเดือนนั้นถ้าจะล้างยอดทบให้หมด. กราฟแท่ง = ±รายเดือน, เส้น = ทบสะสม.

function CarryChart({ rows, height = 240 }) {
  const W = 960, H = height, padL = 58, padR = 16, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = rows.flatMap((r) => [r.diff, r.cumAfter]).filter((v) => v != null).map(Math.abs);
  const max = Math.max(1, ...vals);
  const zeroY = padT + plotH / 2;
  const y = (v) => zeroY - (v / max) * (plotH / 2);
  const groupW = plotW / 12;
  const barW = Math.max(8, Math.min(30, groupW * 0.5));
  const linePts = rows.map((r, i) => (r.cumAfter == null ? null : `${padL + i * groupW + groupW / 2},${y(r.cumAfter)}`)).filter(Boolean).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="กราฟทบยอดรายเดือน" style={{ display: "block", minWidth: 420 }}>
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth="1" />
        <text x={padL - 8} y={y(max) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">+{moneyCompact(max)}</text>
        <text x={padL - 8} y={y(-max) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">-{moneyCompact(max)}</text>
        {rows.map((r, i) => {
          const x = padL + i * groupW + (groupW - barW) / 2;
          return (
            <g key={i}>
              {r.diff != null && (
                <rect
                  x={x}
                  y={r.diff >= 0 ? y(r.diff) : zeroY}
                  width={barW}
                  height={Math.max(1, Math.abs(y(r.diff) - zeroY))}
                  rx="2"
                  fill={r.diff >= 0 ? "var(--green)" : "var(--red)"}
                >
                  <title>{`${MONTH_LABELS[i]} ${r.diff >= 0 ? "+" : ""}${money(r.diff)}`}</title>
                </rect>
              )}
              <text x={padL + i * groupW + groupW / 2} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="var(--text-2)">{MONTH_LABELS[i]}</text>
            </g>
          );
        })}
        {linePts && <polyline points={linePts} fill="none" stroke="var(--amber)" strokeWidth="2.5" />}
      </svg>
    </div>
  );
}

export default function CarryPanel({ row, label, closedCount }) {
  const rows = useMemo(() => carryTable(row, { closedCount }), [row, closedCount]);
  const hasAny = rows.some((r) => r.target > 0 || (r.actual || 0) > 0);
  if (!hasAny) return null;

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <Layers size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ทบยอดย้อนหลัง (Carry-over) — {label}</h2>
        <div className="spacer" />
        <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-2)" }}>
          <span aria-hidden="true" style={{ width: 11, height: 3, background: "var(--amber)", display: "inline-block", borderRadius: 2 }} />
          ทบสะสม (+เกิน / −ขาด)
        </span>
      </div>
      <p style={{ margin: "4px 0 10px", color: "var(--text-3)", fontSize: 12.5 }}>
        เดือนไหนปิดไม่ถึงเป้า ยอดที่ขาดจะถูกทบเข้าเดือนถัดไป · "เป้า + ทบ" = ยอดที่ต้องปิดเดือนนั้นถ้าจะล้างยอดทบให้หมด
      </p>
      <CarryChart rows={rows} />
      <div className="premium-glass-table table-responsive" style={{ marginTop: 14 }}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>เดือน</th>
              <th className="num">Target</th>
              <th className="num">ทบยกมา</th>
              <th className="num">เป้า + ทบ</th>
              <th className="num">Actual</th>
              <th className="num">± เดือนนี้</th>
              <th className="num">ทบสะสม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="premium-row" style={r.actual == null ? { opacity: 0.55 } : undefined}>
                <td>{MONTH_LABELS[i]}</td>
                <td className="num mono">{money(r.target)}</td>
                <td className="num mono" style={{ color: r.carryIn > 0 ? "var(--red)" : "var(--text-3)" }}>{r.carryIn > 0 ? money(r.carryIn) : "–"}</td>
                <td className="num mono" style={{ fontWeight: 600 }}>{money(r.mustClose)}</td>
                <td className="num mono" style={{ color: "var(--green)" }}>{r.actual == null ? "–" : money(r.actual)}</td>
                <td className="num mono" style={{ color: r.diff == null ? "var(--text-3)" : r.diff >= 0 ? "var(--green)" : "var(--red)" }}>
                  {r.diff == null ? "–" : `${r.diff >= 0 ? "+" : ""}${money(r.diff)}`}
                </td>
                <td className="num mono" style={{ fontWeight: 600, color: r.cumAfter == null ? "var(--text-3)" : r.cumAfter >= 0 ? "var(--green)" : "var(--red)" }}>
                  {r.cumAfter == null ? "–" : `${r.cumAfter >= 0 ? "+" : ""}${money(r.cumAfter)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
