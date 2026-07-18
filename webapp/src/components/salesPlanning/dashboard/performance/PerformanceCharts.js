"use client";

import { useMemo, useRef, useState } from "react";
import { BarChart3, TrendingUp, Sigma } from "lucide-react";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { yoySeries, cumulativeSeries } from "@/lib/sales/performanceMath";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";
import { SeriesLegend } from "./shared";

// กราฟของแท็บผลงานขาย — SVG เขียนเอง (แอปไม่มี chart library, แพตเทิร์นเดียวกับ
// DashboardCharts เดิม): เทียบ Target/Forecast/Actual + เส้นประ Actual ปีก่อน,
// การเติบโต YoY รายเดือน, และยอดสะสม.

const SERIES = [
  { key: "target", label: "Target", color: "var(--blue)" },
  { key: "forecast", label: "Forecast", color: "var(--amber)" },
  { key: "actual", label: "Actual", color: "var(--green)" },
];

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

function niceMax(value) {
  if (!value || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * pow;
}

// รวม 12 เดือนเป็นงวดตาม period (month/quarter/year) — null-aware (ทุกช่อง null = null)
function toPeriod(arr, period) {
  if (period === "month") return [...arr];
  const size = period === "quarter" ? 3 : 12;
  const out = [];
  for (let i = 0; i < 12; i += size) {
    const chunk = arr.slice(i, i + size).filter((v) => v != null);
    out.push(chunk.length ? chunk.reduce((a, b) => a + b, 0) : null);
  }
  return out;
}

function labelsFor(period, year) {
  if (period === "month") return MONTH_LABELS;
  if (period === "quarter") return QUARTER_LABELS;
  return [String(year)];
}

// กราฟแท่งกลุ่ม T/F/A + เส้นประปีก่อนซ้อนทับ. data = [{label, target, forecast, actual, lastYear}]
function GroupedBarsWithLine({ data, height = 320, onHover, onLeave }) {
  const W = 960, H = height, padL = 58, padR = 16, padT = 16, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rawMax = Math.max(1, ...data.flatMap((d) => [...SERIES.map((s) => Number(d[s.key] || 0)), Number(d.lastYear || 0)]));
  const max = niceMax(rawMax);
  const groups = data.length || 1;
  const groupW = plotW / groups;
  const barW = Math.max(5, Math.min(28, (groupW * 0.7) / SERIES.length));
  const clusterW = barW * SERIES.length;
  const y = (v) => padT + plotH - (v / max) * plotH;
  const cx = (gi) => padL + gi * groupW + groupW / 2;
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 4) * i);
  const hasLastYear = data.some((d) => d.lastYear != null && d.lastYear > 0);
  const linePts = data
    .map((d, gi) => (d.lastYear == null ? null : `${cx(gi)},${y(d.lastYear)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="กราฟเทียบ Target Forecast Actual" style={{ display: "block", minWidth: Math.max(420, groups * 46) }} onMouseLeave={onLeave}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">{fmtMoneyCompact(t)}</text>
          </g>
        ))}
        {data.map((d, gi) => {
          const gx = padL + gi * groupW + (groupW - clusterW) / 2;
          return (
            <g key={d.label ?? gi}>
              {SERIES.map((s, si) => {
                const v = Number(d[s.key] || 0);
                const bh = v > 0 ? Math.max(1, plotH - (y(v) - padT)) : 0;
                return (
                  <rect
                    key={s.key}
                    x={gx + si * barW}
                    y={y(v)}
                    width={barW - 2}
                    height={bh}
                    rx="2"
                    fill={s.color}
                    onMouseMove={(e) => onHover && onHover(e, d.label, s.label, s.color, v)}
                  />
                );
              })}
              <text x={cx(gi)} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="var(--text-2)">{d.label}</text>
            </g>
          );
        })}
        {hasLastYear && linePts && (
          <polyline points={linePts} fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="5 4" />
        )}
      </svg>
    </div>
  );
}

// กราฟแท่งมีเครื่องหมาย (YoY %) — แกนศูนย์กลาง เขียวบวก/แดงลบ, เดือนไม่มีฐาน = เว้น
function SignedBarChart({ data, height = 260, onHover, onLeave }) {
  const W = 960, H = height, padL = 50, padR = 16, padT = 14, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rawMax = Math.max(10, ...data.map((d) => Math.abs(d.value ?? 0)));
  const max = niceMax(rawMax);
  const zeroY = padT + plotH / 2;
  const y = (v) => zeroY - (v / max) * (plotH / 2);
  const groupW = plotW / (data.length || 1);
  const barW = Math.max(8, Math.min(30, groupW * 0.5));
  const hasData = data.some((d) => d.value != null);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="กราฟการเติบโต YoY" style={{ display: "block", minWidth: 420 }} onMouseLeave={onLeave}>
        {[max, max / 2, 0, -max / 2, -max].map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={t === 0 ? "0" : "3 3"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">{t > 0 ? "+" : ""}{Math.round(t)}%</text>
          </g>
        ))}
        {data.map((d, gi) => {
          const x = padL + gi * groupW + (groupW - barW) / 2;
          const v = d.value;
          return (
            <g key={d.label}>
              {v != null && (
                <rect
                  x={x}
                  y={v >= 0 ? y(v) : zeroY}
                  width={barW}
                  height={Math.max(1, Math.abs(y(v) - zeroY))}
                  rx="2"
                  fill={v >= 0 ? "var(--green)" : "var(--red)"}
                  onMouseMove={(e) => onHover && onHover(e, d.label, "YoY", v >= 0 ? "var(--green)" : "var(--red)", v, true)}
                />
              )}
              <text x={x + barW / 2} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="var(--text-2)">{d.label}</text>
            </g>
          );
        })}
        {!hasData && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--text-3)">ไม่มียอดปีก่อนให้เทียบ — กรอกได้ที่หน้า "ยอดขายรายเดือนปีก่อน"</text>}
      </svg>
    </div>
  );
}

// กราฟเส้นสะสม: Actual สะสม (เขียวทึบ) vs เส้นทาง Target (น้ำเงินประ) vs Actual ปีก่อน (เทาประ)
function CumulativeChart({ cum, height = 280, onHover, onLeave }) {
  const W = 960, H = height, padL = 58, padR = 16, padT = 14, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = [...cum.targetCum, ...cum.actualCum, ...(cum.lastYearCum || [])].filter((v) => v != null);
  const max = niceMax(Math.max(1, ...all));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const x = (i) => padL + (plotW / 11) * i;
  const pts = (arr) => (arr || []).map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 4) * i);
  const lines = [
    { key: "target", pts: pts(cum.targetCum), color: "var(--blue)", dash: "5 4", w: 2 },
    { key: "lastYear", pts: pts(cum.lastYearCum), color: "var(--text-3)", dash: "5 4", w: 2 },
    { key: "actual", pts: pts(cum.actualCum), color: "var(--green)", dash: "0", w: 3 },
  ];

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="กราฟยอดสะสม" style={{ display: "block", minWidth: 420 }} onMouseLeave={onLeave}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">{fmtMoneyCompact(t)}</text>
          </g>
        ))}
        {MONTH_LABELS.map((m, i) => (
          <text key={m} x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="var(--text-2)">{m}</text>
        ))}
        {lines.map((l) => l.pts && <polyline key={l.key} points={l.pts} fill="none" stroke={l.color} strokeWidth={l.w} strokeDasharray={l.dash} />)}
        {(cum.actualCum || []).map((v, i) =>
          v == null ? null : (
            <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="var(--green)"
              onMouseMove={(e) => onHover && onHover(e, MONTH_LABELS[i], "Actual สะสม", "var(--green)", v)} />
          ))}
      </svg>
    </div>
  );
}

function Panel({ icon, title, desc, legend, children }) {
  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <div className="spacer" />
        {legend}
      </div>
      {desc && <p style={{ margin: "4px 0 10px", color: "var(--text-3)", fontSize: 12.5 }}>{desc}</p>}
      {children}
    </section>
  );
}

export default function PerformanceCharts({ row, lastYear, label, year, ytdCount, period }) {
  const [tooltip, setTooltip] = useState(null);
  // พิกัด tooltip อ้างกรอบนอกตัวเดียว (ไม่ใช่ svg แต่ละตัว) — ชาร์ตล่างจะได้ไม่เพี้ยน
  const wrapRef = useRef(null);
  const onHover = (e, l, series, color, value, isPct = false) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: l, series, color, value, isPct });
  };
  const onLeave = () => setTooltip(null);

  const mainData = useMemo(() => {
    const labels = labelsFor(period, year);
    const t = toPeriod(row.target, period);
    const f = toPeriod(row.forecast, period);
    const a = toPeriod(row.actual, period);
    // ปีก่อนโชว์เฉพาะเมื่อมียอด (ไม่งั้นเส้นแบนศูนย์ทำให้อ่านผิด)
    const ly = lastYear && lastYear.some((v) => Number(v || 0) > 0) ? toPeriod(lastYear, period) : null;
    return labels.map((lb, i) => ({ label: lb, target: t[i] || 0, forecast: f[i] || 0, actual: a[i] || 0, lastYear: ly ? ly[i] : null }));
  }, [row, lastYear, period, year]);

  const yoyData = useMemo(() => {
    const yoy = yoySeries(row.actual, lastYear, ytdCount);
    return MONTH_LABELS.map((m, i) => ({ label: m, value: yoy[i] }));
  }, [row, lastYear, ytdCount]);

  const cum = useMemo(() => cumulativeSeries(row.target, row.actual, lastYear && lastYear.some((v) => Number(v || 0) > 0) ? lastYear : null, ytdCount), [row, lastYear, ytdCount]);

  return (
    <div ref={wrapRef} className="flex flex-col gap-4" style={{ position: "relative" }}>
      <Panel
        icon={<BarChart3 size={17} aria-hidden="true" />}
        title={`Target vs Forecast vs Actual — ${label}`}
        legend={<SeriesLegend items={[...SERIES.map((s) => ({ label: s.label, color: s.color })), { label: `Actual ${year - 1}`, color: "var(--text-3)", dashed: true }]} />}
      >
        <GroupedBarsWithLine data={mainData} onHover={onHover} onLeave={onLeave} />
      </Panel>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(430px, 100%), 1fr))" }}>
        <Panel
          icon={<TrendingUp size={17} aria-hidden="true" />}
          title="การเติบโต YoY (%)"
          desc={`Actual ${year} เทียบ Actual ${year - 1} เดือนเดียวกัน (เฉพาะเดือนที่มียอดทั้งสองปี)`}
        >
          <SignedBarChart data={yoyData} onHover={onHover} onLeave={onLeave} />
        </Panel>
        <Panel
          icon={<Sigma size={17} aria-hidden="true" />}
          title="ยอดสะสม (Cumulative)"
          desc={`Actual สะสม ${year} เทียบเส้นทาง Target และ Actual ${year - 1}`}
          legend={<SeriesLegend items={[{ label: "Actual สะสม", color: "var(--green)" }, { label: "เส้นทาง Target", color: "var(--blue)", dashed: true }, { label: `Actual ${year - 1}`, color: "var(--text-3)", dashed: true }]} />}
        >
          <CumulativeChart cum={cum} onHover={onHover} onLeave={onLeave} />
        </Panel>
      </div>

      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y, position: "absolute" }}>
          <div className="chart-tooltip-header">{tooltip.label}</div>
          <div className="chart-tooltip-row">
            <span><span className="chart-tooltip-color" style={{ background: tooltip.color }} />{tooltip.series}</span>
            <span className="font-mono" style={{ fontWeight: 700 }}>
              {tooltip.isPct ? `${tooltip.value >= 0 ? "+" : ""}${tooltip.value.toFixed(1)}%` : fmtMoney(tooltip.value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
