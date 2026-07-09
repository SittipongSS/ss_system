"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, FolderKanban, LayoutDashboard, LineChart, Maximize2, Minimize2, Target, XCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useTeam } from "@/lib/roleContext";
import { KpiCard, MONTH_LABELS, MonthPicker, forecastBadge, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import DashboardCharts from "@/components/salesPlanning/DashboardCharts";
import { SALES_FEATURES } from "@/lib/salesPlanning";
import { fmtDateTime, fmtMoney } from "@/lib/format";

const OVERVIEW_TABS = [
  { key: "tables", label: "ตาราง" },
  { key: "dashboard", label: "แดชบอร์ด" },
];

const money = (value) => fmtMoney(value);
const pctFmt = (value) => (value == null ? "–" : `${value}%`);

// แถวตัวเลขที่โชว์ต่อช่อง (ตามลำดับบนลงล่าง) พร้อมป้ายชื่อ + สี.
//   FC 20/50/80/100 = มูลค่าโครงการเปิด แยกตามระดับโอกาสปิด (probability)
//   FC Total       = ผลรวม FC ทุกระดับ (= มูลค่าโครงการเปิดทั้งหมด)
//   AT (Actual)    = ยอดปิดจริง (won)
//   FC คงเหลือ      = เป้าที่ยังต้องปิดอีก = Target − AT (ไม่ต่ำกว่า 0)
//   %              = ความสำเร็จ = AT / Target
const METRICS = [
  { key: "target", label: "Target", color: "var(--text)" },
  { key: "fc20", label: "FC 20%", color: "var(--text-3)" },
  { key: "fc50", label: "FC 50%", color: "var(--amber)" },
  { key: "fc80", label: "FC 80%", color: "var(--teal)" },
  { key: "fc100", label: "FC 100%", color: "var(--green)" },
  { key: "fcTotal", label: "FC Total", color: "var(--blue)" },
  { key: "won", label: "AT", color: "var(--violet)" },
  { key: "remaining", label: "FC คงเหลือ", color: "var(--amber)" },
  { key: "pct", label: "%", color: "var(--text-2)", fmt: pctFmt },
];

const FC_KEYS = ["fc20", "fc50", "fc80", "fc100"];

function deriveMetrics(cell) {
  const target = Number(cell?.target || 0);
  const won = Number(cell?.won || 0); // AT (ยอดปิดจริง)
  const fc20 = Number(cell?.fc20 || 0);
  const fc50 = Number(cell?.fc50 || 0);
  const fc80 = Number(cell?.fc80 || 0);
  const fc100 = Number(cell?.fc100 || 0);
  const fcTotal = fc20 + fc50 + fc80 + fc100; // = มูลค่าโครงการเปิดทั้งหมด
  const remaining = Math.max(0, target - won); // FC คงเหลือ = เป้าที่ยังต้องปิด
  const pct = target > 0 ? Math.round((won / target) * 100) : null;
  return { target, fc20, fc50, fc80, fc100, fcTotal, won, remaining, pct };
}

function metricCell(row, month) {
  const cell = row.months?.[month] || {};
  return {
    target: Number(cell.target || 0),
    won: Number(cell.won || 0),
    forecast: Number(cell.forecast || 0),
    fc20: Number(cell.fc20 || 0),
    fc50: Number(cell.fc50 || 0),
    fc80: Number(cell.fc80 || 0),
    fc100: Number(cell.fc100 || 0),
  };
}

function blankCell() {
  return { target: 0, won: 0, forecast: 0, fc20: 0, fc50: 0, fc80: 0, fc100: 0 };
}

function addMetric(target, month, value) {
  if (!target.months[month]) target.months[month] = blankCell();
  const cell = target.months[month];
  for (const k of ["target", "won", "forecast", ...FC_KEYS]) {
    cell[k] += Number(value[k] || 0);
    target.total[k] += Number(value[k] || 0);
  }
}

function buildYearRows(yearDashboards) {
  const monthSummary = {
    id: "year-summary",
    label: "รวมรายเดือน",
    sublabel: "ทุกทีม",
    team: null,
    months: {},
    total: blankCell(),
  };
  const owners = new Map();
  const teams = new Map();
  // แตก byForecast (array ระดับ FC) เป็นฟิลด์ fc20..fc100 ของ cell
  const fcFields = (fcArr) => {
    const byLevel = {};
    for (const b of fcArr || []) byLevel[b.level] = Number(b.value || 0);
    return { fc20: byLevel[20] || 0, fc50: byLevel[50] || 0, fc80: byLevel[80] || 0, fc100: byLevel[100] || 0 };
  };
  const fcFromObj = (fc) => ({ fc20: Number(fc?.[20] || 0), fc50: Number(fc?.[50] || 0), fc80: Number(fc?.[80] || 0), fc100: Number(fc?.[100] || 0) });

  for (const dashboard of yearDashboards) {
    const month = dashboard.month;
    const totals = dashboard.totals || {};
    addMetric(monthSummary, month, {
      target: totals.targetAmount || 0,
      won: totals.wonValue || 0,
      forecast: totals.weightedForecast || 0,
      ...fcFields(dashboard.byForecast),
    });

    for (const row of dashboard.byOwner || []) {
      const key = row.ownerId || `${row.team || "none"}:${row.ownerName || "ไม่ระบุ"}`;
      if (!owners.has(key)) {
        owners.set(key, {
          id: key,
          label: row.ownerName || "ไม่ระบุ",
          sublabel: row.team || "-",
          team: row.team || "ไม่ระบุทีม",
          months: {},
          total: blankCell(),
        });
      }
      addMetric(owners.get(key), month, {
        target: row.target,
        won: row.won,
        forecast: row.weighted,
        ...fcFromObj(row.fc),
      });
    }

    for (const row of dashboard.byTeam || []) {
      const key = row.team || "ไม่ระบุทีม";
      if (!teams.has(key)) {
        teams.set(key, {
          id: key,
          label: key,
          sublabel: "ทีม",
          team: key,
          months: {},
          total: blankCell(),
        });
      }
      addMetric(teams.get(key), month, {
        target: row.target,
        won: row.won,
        forecast: row.weighted,
        ...fcFromObj(row.fc),
      });
    }
  }

  const ownerRows = [...owners.values()].sort((a, b) => String(a.team).localeCompare(String(b.team)) || b.total.won - a.total.won);
  const teamRows = [...teams.values()].sort((a, b) => b.total.won - a.total.won || String(a.label).localeCompare(String(b.label)));
  return { monthRows: [monthSummary], ownerRows, teamRows };
}

// รวมทุกแถวเป็นแถวเดียว (มูลค่ารวมต่อเดือน + ทั้งปี) สำหรับแถวสรุปท้ายตาราง.
function sumRows(rows) {
  const total = { id: "grand-total", label: "รวมทั้งหมด", months: {}, total: blankCell() };
  const keys = ["target", "won", "forecast", ...FC_KEYS];
  for (const r of rows) {
    for (const [m, v] of Object.entries(r.months || {})) {
      if (!total.months[m]) total.months[m] = blankCell();
      for (const k of keys) total.months[m][k] += Number(v[k] || 0);
    }
    for (const k of keys) total.total[k] += Number(r.total?.[k] || 0);
  }
  return total;
}

function YearGrid({ title, rows, months, grouped = false, showTotal = false, empty = "ยังไม่มีข้อมูล" }) {
  const groups = grouped
    ? rows.reduce((acc, row) => {
        const key = row.team || "ไม่ระบุทีม";
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {})
    : { all: rows };

  if (!rows.length) {
    return (
      <section className="glass-panel" style={{ padding: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <div style={{ marginTop: 12, color: "var(--text-3)" }}>{empty}</div>
      </section>
    );
  }

  const colCount = 2 + months.length + 1; // รายการ + ค่า + เดือน + รวมปี

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        <BarChart3 size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
          {METRICS.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-2)" }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: m.color, display: "inline-block" }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div className="fz-box premium-glass-table sales-overview-grid" style={{ "--fz-c1w": "170px", "--fz-c2w": "118px" }}>
        <table className="fz-table w-full text-sm" style={{ minWidth: 1880 }}>
          <thead>
            <tr>
              <th className="fz-c1" style={{ width: 160, minWidth: 160 }}>รายการ</th>
              <th className="fz-c2" style={{ width: 96, minWidth: 96 }}>ค่า</th>
              {months.map((month, i) => <th key={month} className="num">{MONTH_LABELS[i]}</th>)}
              <th className="fz-cr num">รวมปี</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, groupRows]) => (
              <Fragment key={group}>
                {grouped && (
                  <tr key={`${group}-group`}>
                    <td colSpan={colCount} style={{ background: "var(--panel-2)", color: "var(--text-2)", fontWeight: 700 }}>
                      ทีม {group}
                    </td>
                  </tr>
                )}
                {groupRows.map((row) => {
                  const monthMetrics = months.map((month) => deriveMetrics(metricCell(row, month)));
                  const totalMetrics = deriveMetrics(row.total);
                  return (
                    <Fragment key={row.id}>
                      {METRICS.map((m, mi) => (
                        <tr key={`${row.id}-${m.key}`} className="premium-row" style={mi === 0 ? { borderTop: "2px solid var(--border)" } : undefined}>
                          {mi === 0 && (
                            <td className="fz-c1" rowSpan={METRICS.length} style={{ verticalAlign: "top", width: 160, minWidth: 160 }}>
                              <strong>{row.label}</strong>
                              {row.sublabel && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{row.sublabel}</span>}
                            </td>
                          )}
                          <td className="fz-c2" style={{ whiteSpace: "nowrap", color: "var(--text-2)" }}>
                            <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: m.color, marginRight: 6, verticalAlign: "middle" }} />
                            {m.label}
                          </td>
                          {monthMetrics.map((mm, ci) => (
                            <td key={months[ci]} className="num mono" style={{ color: mm[m.key] ? m.color : "var(--text-3)" }}>
                              {(m.fmt || money)(mm[m.key])}
                            </td>
                          ))}
                          <td className="fz-cr num mono" style={{ fontWeight: 700, color: totalMetrics[m.key] ? m.color : "var(--text-3)" }}>
                            {(m.fmt || money)(totalMetrics[m.key])}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          {showTotal && rows.length > 0 && (() => {
            const totalRow = sumRows(rows);
            const monthMetrics = months.map((month) => deriveMetrics(metricCell(totalRow, month)));
            const totalMetrics = deriveMetrics(totalRow.total);
            return (
              <tfoot>
                {METRICS.map((m, mi) => (
                  <tr key={`grand-${m.key}`} className="fz-total-row" style={{ background: "var(--panel-2)", borderTop: mi === 0 ? "2px solid var(--border)" : undefined }}>
                    {mi === 0 && (
                      <td className="fz-c1" rowSpan={METRICS.length} style={{ verticalAlign: "top", fontWeight: 800, width: 160, minWidth: 160 }}>
                        รวมทั้งหมด
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: 12, fontWeight: 400 }}>ทุกรายการ</span>
                      </td>
                    )}
                    <td className="fz-c2" style={{ whiteSpace: "nowrap", color: "var(--text-2)" }}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: m.color, marginRight: 6, verticalAlign: "middle" }} />
                      {m.label}
                    </td>
                    {monthMetrics.map((mm, ci) => (
                      <td key={months[ci]} className="num mono" style={{ fontWeight: 700, color: mm[m.key] ? m.color : "var(--text-3)" }}>
                        {(m.fmt || money)(mm[m.key])}
                      </td>
                    ))}
                    <td className="fz-cr num mono" style={{ fontWeight: 800, color: totalMetrics[m.key] ? m.color : "var(--text-3)" }}>
                      {(m.fmt || money)(totalMetrics[m.key])}
                    </td>
                  </tr>
                ))}
              </tfoot>
            );
          })()}
        </table>
      </div>
    </section>
  );
}

export default function SalesPlanningOverviewPage() {
  const canReview = useCan("salesplan:review");
  const team = useTeam();
  const currentMonth = thisMonth();
  const [month, setMonth] = useState(currentMonth);
  const [allMonths, setAllMonths] = useState(false); // รวมทั้งปีในการ์ด KPI/FC
  const [tab, setTab] = useState("tables");
  const year = month.slice(0, 4);

  // ── ดูเต็มจอ (fullscreen) ของกล่องภาพรวม ───────────────────────────
  const fsRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) fsRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const [yearDashboards, setYearDashboards] = useState([]);
  const [sahamitRisk, setSahamitRisk] = useState(null);
  const [forecastReview, setForecastReview] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const months = useMemo(() => monthsForYear(year), [year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboards, sahamitRiskRes, reviewRes] = await Promise.all([
        Promise.all(months.map(async (m) => {
          const res = await fetch(`/api/sales-planning/dashboard?month=${encodeURIComponent(m)}`);
          if (!res.ok) throw new Error((await res.json()).error || "โหลดภาพรวมไม่สำเร็จ");
          return res.json();
        })),
        SALES_FEATURES.sahamitRisk ? fetch(`/api/sales-planning/sahamit-risk?month=${encodeURIComponent(month)}`) : Promise.resolve(null),
        SALES_FEATURES.forecastReview ? fetch(`/api/sales-planning/forecast-reviews?month=${encodeURIComponent(month)}`) : Promise.resolve(null),
      ]);
      setYearDashboards(dashboards);
      setSahamitRisk(sahamitRiskRes?.ok ? await sahamitRiskRes.json() : null);
      const nextReview = reviewRes?.ok ? await reviewRes.json() : null;
      setForecastReview(nextReview);
      setReviewNotes(nextReview?.notes || "");
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [months, month]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDashboard = yearDashboards.find((d) => d.month === month) || yearDashboards[0] || null;
  const rows = useMemo(() => buildYearRows(yearDashboards), [yearDashboards]);

  // รวมทั้งปี (โหมด "ทุกเดือน"): บวก KPI + byForecast ข้ามทุกเดือนในปีที่เลือก.
  const yearAggregate = useMemo(() => {
    const t = { targetAmount: 0, weightedForecast: 0, pipelineValue: 0, wonValue: 0, openDeals: 0, saTarget: 0 };
    const fc = { 20: 0, 50: 0, 80: 0, 100: 0 };
    const fcCount = { 20: 0, 50: 0, 80: 0, 100: 0 };
    let targetRows = 0;
    for (const d of yearDashboards) {
      const dt = d.totals || {};
      t.targetAmount += Number(dt.targetAmount || 0);
      t.weightedForecast += Number(dt.weightedForecast || 0);
      t.pipelineValue += Number(dt.pipelineValue || 0);
      t.wonValue += Number(dt.wonValue || 0);
      t.openDeals += Number(dt.openDeals || 0);
      t.saTarget += Number(dt.saTarget || 0);
      targetRows += d.targets?.length || 0;
      for (const b of d.byForecast || []) { fc[b.level] += Number(b.value || 0); fcCount[b.level] += Number(b.count || 0); }
    }
    t.targetGap = t.targetAmount - t.wonValue;
    const byForecast = [20, 50, 80, 100].map((l) => ({ level: l, value: fc[l], count: fcCount[l] }));
    return { totals: t, byForecast, targetRows };
  }, [yearDashboards]);

  const saveForecastReview = async (status) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/forecast-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewMonth: month, team, status, notes: reviewNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "save forecast review failed");
      await load();
    } catch (e) {
      setError(e.message || "save forecast review failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totals = (allMonths ? yearAggregate.totals : selectedDashboard?.totals) || {};
  const targetRows = allMonths ? yearAggregate.targetRows : (selectedDashboard?.targets?.length || 0);
  const byForecast = allMonths ? yearAggregate.byForecast : selectedDashboard?.byForecast;
  const periodLabel = allMonths ? `ทั้งปี ${year}` : `เดือน ${month}`;
  const sahamitRiskRows = (sahamitRisk?.rows || []).filter((row) => row.risk).slice(0, 8);
  const headerRight = (
    <>
      <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
      <button type="button" className="btn" onClick={toggleFullscreen} title={isFs ? "ออกจากเต็มจอ" : "ดูเต็มจอ"}>
        {isFs ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />} {isFs ? "ออกเต็มจอ" : "เต็มจอ"}
      </button>
      <Link className="btn" href="/sa/deals"><FolderKanban size={15} aria-hidden="true" /> โครงการ</Link>
      <Link className="btn" href="/sa/targets"><Target size={15} aria-hidden="true" /> เป้าหมาย</Link>
    </>
  );

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าโครงการ เพื่อผลักไปสู่ Won โดย PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={headerRight}
    >
      <div
        ref={fsRef}
        className="flex flex-col gap-5"
        style={isFs ? { background: "var(--bg)", padding: 20, height: "100vh", overflow: "auto" } : undefined}
      >
        {isFs && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>บริหารงานขาย — ภาพรวม ({periodLabel})</h1>
            <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={toggleFullscreen}>
              <Minimize2 size={15} aria-hidden="true" /> ออกเต็มจอ
            </button>
          </div>
        )}
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        <div className="tabs-header" role="tablist" aria-label="มุมมองภาพรวม">
          {OVERVIEW_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`tab-btn ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <div aria-busy={loading}>
            <DashboardCharts rows={rows} months={months} monthLabels={MONTH_LABELS} year={year} />
          </div>
        )}

        {tab === "tables" && (
        <>
        <section className="kpi-grid" aria-busy={loading}>
          <KpiCard icon={<Target size={16} aria-hidden="true" />} label={allMonths ? "เป้าทั้งปี" : "เป้าเดือนที่เลือก"} value={money(totals.targetAmount)} hint={`${targetRows} รายการ`} />
          <KpiCard icon={<BarChart3 size={16} aria-hidden="true" />} label="คาดการณ์" value={money(totals.weightedForecast)} hint="มูลค่าโครงการเปิดที่คาดว่าจะปิดให้เป็น Won" />
          <KpiCard icon={<ClipboardList size={16} aria-hidden="true" />} label="มูลค่าโครงการเปิด" value={money(totals.pipelineValue)} hint={`โครงการเปิด ${totals.openDeals || 0} รายการ`} />
          <KpiCard icon={<LineChart size={16} aria-hidden="true" />} label="Won" value={money(totals.wonValue)} hint={`ส่วนต่าง ${money(totals.targetGap)}`} />
          {SALES_FEATURES.sahamitRisk && sahamitRisk?.enabled && (
            <KpiCard
              icon={<AlertTriangle size={16} aria-hidden="true" />}
              label="ความเสี่ยง FC สหมิตร"
              value={sahamitRisk.summary?.risk || 0}
              hint={`ตรวจ ${sahamitRisk.summary?.total || 0} SKU-เดือน`}
            />
          )}
        </section>

        {!!byForecast?.length && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>โครงการเปิด แยกตามโอกาสปิด (FC%)</h2>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>{periodLabel}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {byForecast.map((b) => (
                <div key={b.level} className="glass-panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>{forecastBadge(b.level)}</div>
                  <div className="font-mono tabular-nums" style={{ fontSize: 18, fontWeight: 800 }}>{money(b.value)}</div>
                  <div style={{ color: "var(--text-3)", fontSize: 12 }}>{b.count} โครงการ</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <YearGrid title={`ภาพรวมรายเดือน ${year}`} rows={rows.monthRows} months={months} />
        <YearGrid title="รายบุคคล (จัดกลุ่มตามทีม)" rows={rows.ownerRows} months={months} grouped showTotal />
        <YearGrid title="รายทีม" rows={rows.teamRows} months={months} showTotal />

        {SALES_FEATURES.forecastReview && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={17} aria-hidden="true" style={{ color: forecastReview?.status === "approved" ? "var(--green)" : "var(--text-3)" }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ทบทวน forecast เดือน {month}</h2>
              <span className="ui-badge" style={{ color: forecastReview?.status === "rejected" ? "var(--red)" : forecastReview?.status === "approved" ? "var(--green)" : "var(--text-3)" }}>
                {{ approved: "อนุมัติแล้ว", rejected: "ตีกลับ" }[forecastReview?.status] || "ร่าง"}
              </span>
              <div className="spacer" />
              <span className="mono tabular-nums" style={{ color: "var(--text-3)", fontSize: 12 }}>
                {forecastReview?.dealCount || 0} โครงการ · {money(forecastReview?.summaryAmount)}
              </span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: canReview ? "minmax(220px, 1fr) auto" : "1fr", alignItems: "end" }}>
              <label>
                หมายเหตุการทบทวน
                <textarea
                  className="premium-input"
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  disabled={!canReview}
                  placeholder="บันทึกของหัวหน้าสำหรับ forecast เดือนนี้"
                />
              </label>
              {canReview && (
                <div className="flex items-center gap-2">
                  <button type="button" className="btn" onClick={() => saveForecastReview("rejected")} disabled={submitting}>
                    <XCircle size={15} aria-hidden="true" /> ตีกลับ
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => saveForecastReview("approved")} disabled={submitting}>
                    <CheckCircle2 size={15} aria-hidden="true" /> อนุมัติ
                  </button>
                </div>
              )}
            </div>
            {forecastReview?.reviewedByName && (
              <div style={{ marginTop: 8, color: "var(--text-3)", fontSize: 12 }}>
                ทบทวนล่าสุดโดย {forecastReview.reviewedByName} {forecastReview.reviewedAt ? `เมื่อ ${fmtDateTime(forecastReview.reviewedAt)}` : ""}
              </div>
            )}
          </section>
        )}

        {SALES_FEATURES.sahamitRisk && sahamitRisk?.enabled && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={17} aria-hidden="true" style={{ color: sahamitRiskRows.length ? "var(--amber)" : "var(--green)" }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ตรวจย้อน FC สหมิตร เดือน {month}</h2>
              <span className="ui-badge" style={{ color: sahamitRiskRows.length ? "var(--amber)" : "var(--green)", borderColor: "currentColor" }}>
                {sahamitRiskRows.length ? `FC ช้า ${sahamitRiskRows.length}` : "ปกติ"}
              </span>
              <div className="spacer" />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>lead time {sahamitRisk.leadTimeDays || 90} วันทำการ</span>
            </div>
            {sahamitRiskRows.length ? (
              <div className="premium-glass-table table-responsive">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>FG</th>
                      <th>เดือนที่ต้องใช้</th>
                      <th>ต้องปิดภายใน</th>
                      <th>FC ล่าสุด</th>
                      <th className="num">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sahamitRiskRows.map((row) => (
                      <tr key={`${row.fgCode}-${row.warehouseNeedMonth}`} className="premium-row">
                        <td>
                          <strong className="mono">{row.fgCode}</strong>
                          <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{row.productName || "-"}</span>
                        </td>
                        <td className="mono">{row.warehouseNeedMonth}</td>
                        <td className="mono">{row.requiredConfirmMonth || "-"}</td>
                        <td className="mono" style={{ color: "var(--amber)", fontWeight: 700 }}>{row.latestFcReceivedMonth || "-"}</td>
                        <td className="num mono">{Number(row.qty || 0).toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                FC ล่าสุดของ Sahamit ยังไม่ช้ากว่าเดือนที่ควร confirm สำหรับเดือนที่เลือก
              </div>
            )}
          </section>
        )}
        </>
        )}
      </div>
    </Workspace>
  );
}
