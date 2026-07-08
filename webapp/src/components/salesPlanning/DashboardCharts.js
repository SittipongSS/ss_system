"use client";

import { useMemo, useState } from "react";
import { BarChart3, Layers, Target } from "lucide-react";
import { coveragePct, SALES_TEAMS } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";

// Dashboard / chart tab for the sales-planning overview. Renders hand-rolled
// responsive SVG bar charts (the app has no charting library) comparing the
// three series — เป้า (target) / คาดการณ์ (forecast) / Won (actual) — by month,
// by year total, and by team.

const SERIES = [
  { key: "target", label: "เป้า", color: "var(--blue)" },
  { key: "forecast", label: "คาดการณ์", color: "var(--amber)" },
  { key: "won", label: "Won", color: "var(--green)" },
];

// Round an axis maximum up to a clean 1/2/2.5/5 × 10ⁿ step so gridlines land on
// readable numbers instead of arbitrary pixel values.
function niceMax(value) {
  if (!value || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * pow;
}

// ป้ายแกนกราฟ — ใช้รูปแบบเงินย่อกลางตามกฎทั้งระบบ (฿x.xxK / ฿x.xxM).
const compactMoney = (value) => fmtMoneyCompact(value);
const money = (value) => fmtMoney(value);

function Legend() {
  return (
    <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-2)" }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: s.color, display: "inline-block" }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Grouped vertical bar chart. `data` = [{ label, target, forecast, won }].
function GroupedBarChart({ data, height = 320 }) {
  const W = 960;
  const H = height;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const rawMax = Math.max(
    1,
    ...data.flatMap((d) => SERIES.map((s) => Number(d[s.key] || 0)))
  );
  const max = niceMax(rawMax);

  const groups = data.length || 1;
  const groupW = plotW / groups;
  const barW = Math.max(4, Math.min(26, (groupW * 0.72) / SERIES.length));
  const clusterW = barW * SERIES.length;

  const gridLines = 4;
  const ticks = Array.from({ length: gridLines + 1 }, (_, i) => (max / gridLines) * i);

  const y = (v) => padT + plotH - (v / max) * plotH;

  const hasData = data.some((d) => SERIES.some((s) => Number(d[s.key] || 0) > 0));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="กราฟเทียบเป้า คาดการณ์ และ Won"
        style={{ display: "block", minWidth: Math.max(520, groups * 46) }}
      >
        {/* y grid + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="mono">
              {compactMoney(t)}
            </text>
          </g>
        ))}

        {/* bars */}
        {data.map((d, gi) => {
          const gx = padL + gi * groupW + (groupW - clusterW) / 2;
          return (
            <g key={d.label ?? gi}>
              {SERIES.map((s, si) => {
                const v = Number(d[s.key] || 0);
                const bx = gx + si * barW;
                const bh = v > 0 ? Math.max(1, plotH - (y(v) - padT)) : 0;
                return (
                  <rect key={s.key} x={bx} y={y(v)} width={barW - 2} height={bh} rx="2" fill={s.color}>
                    <title>{`${d.label} · ${s.label}: ${money(v)}`}</title>
                  </rect>
                );
              })}
              <text x={padL + gi * groupW + groupW / 2} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="var(--text-2)">
                {d.label}
              </text>
            </g>
          );
        })}

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--text-3)">
            ยังไม่มีข้อมูล
          </text>
        )}
      </svg>
    </div>
  );
}

function totalsFor(source) {
  return SERIES.reduce((acc, s) => {
    acc[s.key] = Number(source?.total?.[s.key] || 0);
    return acc;
  }, {});
}

function monthSeries(source, months, monthLabels) {
  return months.map((m, i) => {
    const cell = source?.months?.[m] || {};
    return {
      label: monthLabels[i],
      target: Number(cell.target || 0),
      forecast: Number(cell.forecast || 0),
      won: Number(cell.won || 0),
    };
  });
}

function Panel({ icon, title, badge, children }) {
  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {badge}
        <div className="spacer" />
        <Legend />
      </div>
      {children}
    </section>
  );
}

export default function DashboardCharts({ rows, months, monthLabels, year }) {
  const [teamKey, setTeamKey] = useState("all");

  // Source for the monthly view: all-team summary or a single team's row.
  const teamRowMap = useMemo(() => {
    const map = new Map();
    for (const r of rows.teamRows || []) map.set(r.team, r);
    return map;
  }, [rows.teamRows]);

  const activeSource = teamKey === "all" ? rows.monthRows?.[0] : teamRowMap.get(teamKey);
  const monthData = useMemo(() => monthSeries(activeSource, months, monthLabels), [activeSource, months, monthLabels]);

  // Year totals per team, seeded from SALES_TEAMS so all three always show.
  const teamData = useMemo(
    () =>
      SALES_TEAMS.map((t) => {
        const src = teamRowMap.get(t);
        return { label: t, ...totalsFor(src) };
      }),
    [teamRowMap]
  );

  const yearTotals = totalsFor(activeSource);
  const cov = coveragePct(yearTotals.won, yearTotals.target);
  const fcCov = coveragePct(yearTotals.forecast, yearTotals.target);
  const teamLabel = teamKey === "all" ? "ทุกทีม" : `ทีม ${teamKey}`;

  const covColor = cov == null ? "var(--text-3)" : cov >= 100 ? "var(--green)" : cov >= 70 ? "var(--amber)" : "var(--red)";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>เลือกทีม</span>
        <div className="segmented" role="group" aria-label="เลือกทีม">
          <button type="button" className={teamKey === "all" ? "active" : ""} aria-pressed={teamKey === "all"} onClick={() => setTeamKey("all")}>
            ทุกทีม
          </button>
          {SALES_TEAMS.map((t) => (
            <button key={t} type="button" className={teamKey === t ? "active" : ""} aria-pressed={teamKey === t} onClick={() => setTeamKey(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Year total summary for the selected team */}
      <section className="kpi-grid">
        {SERIES.map((s) => (
          <div key={s.key} className="glass-panel" style={{ padding: 16, minHeight: 100 }}>
            <div className="flex items-center gap-2" style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
              {s.label} · รวมปี {year}
            </div>
            <div className="font-mono tabular-nums" style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
              {money(yearTotals[s.key])}
            </div>
          </div>
        ))}
        <div className="glass-panel" style={{ padding: 16, minHeight: 100 }}>
          <div className="flex items-center gap-2" style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>
            <Target size={14} aria-hidden="true" /> ความคืบหน้าต่อเป้า
          </div>
          <div className="font-mono tabular-nums" style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: covColor }}>
            {cov == null ? "-" : `${cov}%`}
          </div>
          <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>
            คาดการณ์ {fcCov == null ? "-" : `${fcCov}%`} ของเป้า
          </div>
        </div>
      </section>

      <Panel
        icon={<BarChart3 size={17} aria-hidden="true" />}
        title={`เทียบรายเดือน ${year} — ${teamLabel}`}
        badge={<span className="ui-badge" style={{ color: "var(--text-3)" }}>12 เดือน</span>}
      >
        <GroupedBarChart data={monthData} />
      </Panel>

      <Panel
        icon={<Layers size={17} aria-hidden="true" />}
        title={`เทียบรายทีม — รวมปี ${year}`}
        badge={<span className="ui-badge" style={{ color: "var(--text-3)" }}>{SALES_TEAMS.join(" · ")}</span>}
      >
        <GroupedBarChart data={teamData} height={300} />
      </Panel>
    </div>
  );
}
