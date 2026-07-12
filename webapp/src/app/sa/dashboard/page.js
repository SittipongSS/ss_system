"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, FolderKanban, LayoutDashboard, LineChart, Maximize2, Minimize2, Minus, Plus, Target, X, XCircle, Trophy, Activity, Layers } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useTeam, useRole } from "@/lib/roleContext";
import { canSeeTaskKpi } from "@/lib/permissions";
import { KpiCard, MONTH_LABELS, MonthPicker, dealTypeBadge, forecastBadge, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import DashboardCharts from "@/components/salesPlanning/DashboardCharts";
import DealDrillDownModal from "@/components/salesPlanning/DealDrillDownModal";
import { DEAL_TYPES, SALES_FEATURES, teamRank } from "@/lib/salesPlanning";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import SalesKpiDashboard from "@/components/pm/SalesKpiDashboard";
import MyDashboardTab from "@/components/salesPlanning/dashboard/MyDashboardTab";
import KpiLeadsTab from "@/components/salesPlanning/dashboard/KpiLeadsTab";

const DASHBOARD_TABS = [
  { key: "my", label: "แดชบอร์ดของฉัน" },
  { key: "overview", label: "ภาพรวมระบบ" },
  { key: "task_kpi", label: "KPI งาน" },
  { key: "lead_kpi", label: "KPI ลีด" },
];

// ดูเต็มจอสำหรับ element เดียว (คืน ref + สถานะ + ปุ่ม toggle). ใช้ซ้ำได้ทุกตาราง.
function useFullscreen() {
  const ref = useRef(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggle = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement === ref.current) document.exitFullscreen?.();
    else ref.current?.requestFullscreen?.();
  };
  return { ref, isFs, toggle };
}

// ปุ่มดูเต็มจอ (ไอคอน + ข้อความ) — ใช้ในหัวแต่ละตาราง.
function FullscreenButton({ isFs, onToggle }) {
  return (
    <button type="button" className="btn ghost sm" onClick={onToggle} title={isFs ? "ออกจากเต็มจอ" : "ดูเต็มจอ"} style={{ marginLeft: "auto" }}>
      {isFs ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />} {isFs ? "ออกเต็มจอ" : "เต็มจอ"}
    </button>
  );
}

const money = (value) => fmtMoney(value);
// % ความสำเร็จ (AT/Target) — ทศนิยม 2 ตำแหน่งเสมอ เช่น 87.50%
const pctFmt = (value) => (value == null ? "–" : `${Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

// แถวตัวเลขที่โชว์ต่อช่อง (ตามลำดับบนลงล่าง) พร้อมป้ายชื่อ + สี.
//   FC 20/50/80/100 = มูลค่าคาดการณ์ของดีลที่ "ยังเปิด" แยกตามระดับโอกาสปิด
//   FC Total       = มูลค่าคาดการณ์ทั้งเดือน = เปิด + ปิดได้ (AT) + แพ้ (Lost)
//   AT (Actual)    = ยอดปิดจริง (won)
//   FC คงเหลือ      = FC Total − AT − Lost = ยอดที่ยังเปิดอยู่ (= ผลรวม FC 20..100)
//   %              = ความสำเร็จ = AT / Target
// detail:true = แถวย่อย FC ตามระดับ % — ซ่อนได้เมื่อ "ย่อ FC" (เหลือ FC Total)
const METRICS = [
  { key: "target", label: "Target", color: "var(--text)" },
  { key: "fc20", label: "FC 20%", color: "var(--text-3)", detail: true },
  { key: "fc50", label: "FC 50%", color: "var(--amber)", detail: true },
  { key: "fc80", label: "FC 80%", color: "var(--teal)", detail: true },
  { key: "fc100", label: "FC 100%", color: "var(--green)", detail: true },
  { key: "fcTotal", label: "FC Total", color: "var(--blue)" },
  { key: "won", label: "AT", color: "var(--violet)" },
  { key: "remaining", label: "FC คงเหลือ", color: "var(--amber)" },
  { key: "pct", label: "%", color: "var(--text-2)", fmt: pctFmt },
];

const FC_KEYS = ["fc20", "fc50", "fc80", "fc100"];

function deriveMetrics(cell) {
  const target = Number(cell?.target || 0);
  const won = Number(cell?.won || 0); // AT (ยอดปิดจริง)
  const lost = Number(cell?.lost || 0); // มูลค่าคาดการณ์ของดีลที่แพ้
  const fc20 = Number(cell?.fc20 || 0);
  const fc50 = Number(cell?.fc50 || 0);
  const fc80 = Number(cell?.fc80 || 0);
  const fc100 = Number(cell?.fc100 || 0);
  const fcOpen = fc20 + fc50 + fc80 + fc100; // ยอดคาดการณ์ของดีลที่ยังเปิด
  const fcTotal = fcOpen + won + lost;       // FC ทั้งเดือน = เปิด + ปิดได้ + แพ้
  const remaining = fcTotal - won - lost;    // FC คงเหลือ = ยอดที่ยังเปิดอยู่ (= fcOpen)
  const pct = target > 0 ? Math.round((won / target) * 10000) / 100 : null;
  return { target, fc20, fc50, fc80, fc100, fcTotal, won, remaining, pct };
}

function metricCell(row, month) {
  const cell = row.months?.[month] || {};
  return {
    target: Number(cell.target || 0),
    won: Number(cell.won || 0),
    lost: Number(cell.lost || 0),
    forecast: Number(cell.forecast || 0),
    fc20: Number(cell.fc20 || 0),
    fc50: Number(cell.fc50 || 0),
    fc80: Number(cell.fc80 || 0),
    fc100: Number(cell.fc100 || 0),
  };
}

const CELL_KEYS = ["target", "won", "lost", "forecast", ...FC_KEYS];

function blankCell() {
  return Object.fromEntries(CELL_KEYS.map((k) => [k, 0]));
}

function addMetric(target, month, value) {
  if (!target.months[month]) target.months[month] = blankCell();
  const cell = target.months[month];
  for (const k of CELL_KEYS) {
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
      lost: totals.lostForecast || 0,
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
        lost: row.lost,
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
        lost: row.lost,
        forecast: row.weighted,
        ...fcFromObj(row.fc),
      });
    }
  }

  // จัดลำดับทีมตามมาตรฐาน KA → ODM → SV (แล้วค่อยเรียงยอด/ชื่อภายในทีม)
  const ownerRows = [...owners.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team) || b.total.won - a.total.won);
  const teamRows = [...teams.values()].sort((a, b) => teamRank(a.team) - teamRank(b.team) || String(a.label).localeCompare(String(b.label)));
  return { monthRows: [monthSummary], ownerRows, teamRows };
}

// รวมทุกแถวเป็นแถวเดียว (มูลค่ารวมต่อเดือน + ทั้งปี) สำหรับแถวสรุปท้ายตาราง.
function sumRows(rows) {
  const total = { id: "grand-total", label: "รวมทั้งหมด", months: {}, total: blankCell() };
  const keys = CELL_KEYS;
  for (const r of rows) {
    for (const [m, v] of Object.entries(r.months || {})) {
      if (!total.months[m]) total.months[m] = blankCell();
      for (const k of keys) total.months[m][k] += Number(v[k] || 0);
    }
    for (const k of keys) total.total[k] += Number(r.total?.[k] || 0);
  }
  return total;
}

function YearGrid({ title, rows, months, grouped = false, showTotal = false, empty = "ยังไม่มีข้อมูล", onCellClick }) {
  const { ref: fsRef, isFs, toggle } = useFullscreen();
  const [showFc, setShowFc] = useState(false); // ย่อ FC (default) = โชว์ FC Total; ขยาย = แตกราย %
  const [scale, setScale] = useState(1); // สเกลตาราง (ปุ่ม +/-) 0.6–1.4
  const metrics = showFc ? METRICS : METRICS.filter((m) => !m.detail);
  const changeScale = (delta) => setScale((s) => Math.round(Math.min(1.4, Math.max(0.6, s + delta)) * 10) / 10);
  const scaleControl = (
    <div className="flex items-center" style={{ gap: 2 }}>
      <button type="button" className="btn ghost sm" onClick={() => changeScale(-0.1)} disabled={scale <= 0.6} aria-label="ย่อสเกลตาราง" title="ย่อสเกล"><Minus size={14} aria-hidden="true" /></button>
      <button type="button" className="btn ghost sm" onClick={() => setScale(1)} title="สเกลปกติ" style={{ minWidth: 44 }}>{Math.round(scale * 100)}%</button>
      <button type="button" className="btn ghost sm" onClick={() => changeScale(0.1)} disabled={scale >= 1.4} aria-label="ขยายสเกลตาราง" title="ขยายสเกล"><Plus size={14} aria-hidden="true" /></button>
    </div>
  );
  // เพิ่มความสูง "กรอบ" ที่ครอบตาราง (ให้เห็นแถวได้มากขึ้นก่อนต้องเลื่อน).
  // ค่าเริ่มต้น 0 = ใช้ max-height เดิม (calc(100dvh - 230px)); เพิ่มทีละ 80px.
  const [boxH, setBoxH] = useState(0);
  const changeBoxH = (d) => setBoxH((h) => Math.min(400, Math.max(0, h + d)));
  const boxMaxHeight = isFs ? "none" : `calc(100dvh - ${230 - boxH}px)`;
  const boxHControl = (
    <div className="flex items-center" style={{ gap: 2 }}>
      <button type="button" className="btn ghost sm" onClick={() => changeBoxH(-80)} disabled={boxH <= 0} aria-label="ลดความสูงกรอบ" title="ลดความสูงกรอบตาราง"><Minus size={14} aria-hidden="true" /></button>
      <span style={{ fontSize: 11, color: "var(--text-3)" }} title="ความสูงกรอบตาราง">สูงกรอบ</span>
      <button type="button" className="btn ghost sm" onClick={() => changeBoxH(80)} disabled={boxH >= 400} aria-label="เพิ่มความสูงกรอบ" title="เพิ่มความสูงกรอบตาราง"><Plus size={14} aria-hidden="true" /></button>
    </div>
  );
  const fcToggle = (
    <button type="button" className="btn ghost sm" onClick={() => setShowFc((v) => !v)} title={showFc ? "ย่อ FC (โชว์ยอดรวม)" : "ขยาย FC (แตกตาม %)"}>
      {showFc ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />} {showFc ? "ย่อ FC" : "ขยาย FC"}
    </button>
  );
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
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
          <FullscreenButton isFs={isFs} onToggle={toggle} />
        </div>
        <div style={{ marginTop: 12, color: "var(--text-3)" }}>{empty}</div>
      </section>
    );
  }

  const colCount = 2 + months.length + 1; // รายการ + ค่า + เดือน + รวมปี

  return (
    <section ref={fsRef} className="glass-panel" style={isFs ? { padding: 20, background: "var(--bg)", height: "100vh", overflow: "auto" } : { padding: 16 }}>
      <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        <BarChart3 size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {scaleControl}
          {boxHControl}
          {fcToggle}
          <FullscreenButton isFs={isFs} onToggle={toggle} />
        </div>
        <div className="flex items-center gap-3" style={{ flexWrap: "wrap", width: "100%" }}>
          {metrics.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-2)" }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: m.color, display: "inline-block" }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div className="fz-box premium-glass-table sales-overview-grid" style={{ "--fz-c1w": "170px", "--fz-c2w": "118px", zoom: scale, maxHeight: boxMaxHeight }}>
        <table className="fz-table interactive-grid w-full text-sm" style={{ minWidth: 1880 }}>
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
                      {metrics.map((m, mi) => (
                        <tr key={`${row.id}-${m.key}`} className="premium-row" style={mi === 0 ? { borderTop: "2px solid var(--border)" } : undefined}>
                          {mi === 0 && (
                            <td className="fz-c1" rowSpan={metrics.length} style={{ verticalAlign: "top", width: 160, minWidth: 160 }}>
                              <strong>{row.label}</strong>
                              {row.sublabel && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{row.sublabel}</span>}
                            </td>
                          )}
                          <td className="fz-c2" style={{ whiteSpace: "nowrap", color: "var(--text-2)" }}>
                            <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: m.color, marginRight: 6, verticalAlign: "middle" }} />
                            {m.label}
                          </td>
                          {monthMetrics.map((mm, ci) => {
                            const val = mm[m.key];
                            const interactive = onCellClick && m.key !== "target" && val > 0;
                            return (
                              <td 
                                key={months[ci]} 
                                className={`num mono ${interactive ? "cell-interactive" : ""}`} 
                                style={{ color: val ? m.color : "var(--text-3)" }}
                                onClick={() => interactive && onCellClick(row, months[ci], m.key)}
                              >
                                {(m.fmt || money)(val)}
                              </td>
                            );
                          })}
                          <td 
                            className={`fz-cr num mono ${onCellClick && m.key !== "target" && totalMetrics[m.key] > 0 ? "cell-interactive" : ""}`} 
                            style={{ fontWeight: 700, color: totalMetrics[m.key] ? m.color : "var(--text-3)" }}
                            onClick={() => onCellClick && m.key !== "target" && totalMetrics[m.key] > 0 && onCellClick(row, null, m.key)}
                          >
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
                {metrics.map((m, mi) => (
                  <tr key={`grand-${m.key}`} className="fz-total-row" style={{ background: "var(--panel-2)", borderTop: mi === 0 ? "2px solid var(--border)" : undefined }}>
                    {mi === 0 && (
                      <td className="fz-c1" rowSpan={metrics.length} style={{ verticalAlign: "top", fontWeight: 800, width: 160, minWidth: 160 }}>
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
  const canTarget = useCan("salesplan:target");
  const team = useTeam();
  const role = useRole();
  // KPI งาน = single source canSeeTaskKpi (admin / sales head / senior_ae oversight
  // + viewer read-only monitor). ตรงกับ guard ของ /api/sales-planning/task-kpi.
  const canSeeKpi = canSeeTaskKpi(role);
  const currentMonth = thisMonth();
  const [month, setMonth] = useState(currentMonth);
  const [allMonths, setAllMonths] = useState(false); // รวมทั้งปีในการ์ด KPI/FC
  const [tab, setTab] = useState("my");
  const year = month.slice(0, 4);
  const [yearDashboards, setYearDashboards] = useState([]);
  const [sahamitRisk, setSahamitRisk] = useState(null);
  const [forecastReview, setForecastReview] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [drillDownFilter, setDrillDownFilter] = useState(null);
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
    const ty = Object.fromEntries(DEAL_TYPES.map((k) => [k, { type: k, fcTotal: 0, actual: 0, fcRemaining: 0, openCount: 0, wonCount: 0 }]));
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
      for (const b of d.byType || []) {
        const acc = ty[b.type];
        if (!acc) continue;
        acc.fcTotal += Number(b.fcTotal || 0);
        acc.actual += Number(b.actual || 0);
        acc.fcRemaining += Number(b.fcRemaining || 0);
        acc.openCount += Number(b.openCount || 0);
        acc.wonCount += Number(b.wonCount || 0);
      }
    }
    t.targetGap = t.targetAmount - t.wonValue;
    const byForecast = [20, 50, 80, 100].map((l) => ({ level: l, value: fc[l], count: fcCount[l] }));
    const byType = DEAL_TYPES.map((k) => ty[k]);
    return { totals: t, byForecast, byType, targetRows };
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
  const byType = allMonths ? yearAggregate.byType : selectedDashboard?.byType;

  const filteredOwnerRows = useMemo(() => {
    if (!rows.ownerRows) return [];
    if (teamFilter === "all") return rows.ownerRows;
    return rows.ownerRows.filter(r => r.team === teamFilter);
  }, [rows.ownerRows, teamFilter]);

  const handleChartTeamClick = (t) => {
    setTeamFilter(t);
    setTab("tables");
    setTimeout(() => {
      document.querySelector('.sales-overview-grid')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleCellClick = (row, m, metricKey) => {
    if (metricKey === "target") return;
    setDrillDownFilter({
      month: m,
      ownerId: row.id.includes(":") || row.id === "grand-total" ? null : row.id,
      team: row.team,
      metric: metricKey,
      label: row.label
    });
  };
  const periodLabel = allMonths ? `ทั้งปี ${year}` : `เดือน ${month}`;
  const sahamitRiskRows = (sahamitRisk?.rows || []).filter((row) => row.risk).slice(0, 8);
  const headerRight = (
    <>
      <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
      <Link className="btn" href="/sa/deals"><FolderKanban size={15} aria-hidden="true" /> โครงการ</Link>
      {canTarget && <Link className="btn" href="/sa/targets"><Target size={15} aria-hidden="true" /> เป้าหมาย</Link>}
    </>
  );

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าดีล เพื่อผลักไปสู่ Won — โครงการ PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        <div className="tabs-header" role="tablist" aria-label="มุมมองภาพรวม">
          {DASHBOARD_TABS.filter((t) => {
            if (t.key === "overview" && !canReview && !canTarget) return false; // Basic filter for overview
            if (t.key === "task_kpi" && !canSeeKpi) return false;
            return true;
          }).map((t) => (
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

        {tab === "my" && (
          <MyDashboardTab month={month} />
        )}

        {tab === "lead_kpi" && (
          <KpiLeadsTab month={month} />
        )}

        {tab === "task_kpi" && canSeeKpi && (
          <div style={{ marginTop: "16px" }}>
            <SalesKpiDashboard />
          </div>
        )}

        {tab === "overview" && (
          <>
          <div aria-busy={loading}>
            <DashboardCharts rows={rows} months={months} monthLabels={MONTH_LABELS} year={year} teamKey={teamFilter} onTeamKeyChange={handleChartTeamClick} />
          </div>

        <section className="kpi-grid mt-5" aria-busy={loading}>
          <KpiCard icon={<Target size={16} aria-hidden="true" />} label={allMonths ? "เป้าทั้งปี" : "เป้าเดือนที่เลือก"} value={money(totals.targetAmount)} hint={`${targetRows} รายการ`} color="var(--text)" />
          <KpiCard icon={<BarChart3 size={16} aria-hidden="true" />} label="คาดการณ์" value={money(totals.weightedForecast)} hint="มูลค่าดีลเปิดที่คาดว่าจะปิดให้เป็น Won" color="var(--blue)" />
          <KpiCard icon={<FolderKanban size={16} aria-hidden="true" />} label="มูลค่าดีลเปิด" value={money(totals.pipelineValue)} hint={`ดีลเปิด ${totals.openDeals || 0} รายการ`} color="var(--violet)" />
          <KpiCard icon={<Trophy size={16} aria-hidden="true" />} label="Won" value={money(totals.wonValue)} hint={`ส่วนต่าง ${money(totals.targetGap)}`} color="var(--green)" />
          {SALES_FEATURES.sahamitRisk && sahamitRisk?.enabled && (
            <KpiCard
              icon={<AlertTriangle size={16} aria-hidden="true" />}
              label="ความเสี่ยง FC สหมิตร"
              value={sahamitRisk.summary?.risk || 0}
              hint={`ตรวจ ${sahamitRisk.summary?.total || 0} SKU-เดือน`}
              color="var(--amber)"
            />
          )}
        </section>

        {!!byType?.length && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>แยกตามประเภทดีล</h2>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>{periodLabel}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {byType.map((b) => (
                <KpiCard
                  key={b.type}
                  icon={<Layers size={16} />}
                  label={b.type}
                  badge={dealTypeBadge(b.type)}
                  color={b.type === "SCENT" ? "var(--amber)" : b.type === "NPD" ? "var(--blue)" : "var(--teal)"}
                  value={money(b.fcTotal)}
                  hint={
                    <div className="flex flex-col gap-1">
                      <span>Actual {money(b.actual)} · FC คงเหลือ {money(b.fcRemaining)}</span>
                      <span>{b.wonCount} won · {b.openCount} เปิด</span>
                    </div>
                  }
                  interactive={false}
                />
              ))}
            </div>
          </section>
        )}

        {!!byForecast?.length && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ดีลเปิด แยกตามโอกาสปิด (FC%)</h2>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>{periodLabel}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {byForecast.map((b) => (
                <KpiCard
                  key={b.level}
                  icon={<Activity size={16} />}
                  label={`FC ${b.level}%`}
                  color={b.level === 100 ? "var(--green)" : b.level === 80 ? "var(--teal)" : b.level === 50 ? "var(--amber)" : "var(--text-3)"}
                  value={money(b.value)}
                  hint={`${b.count} ดีล`}
                  interactive={false}
                />
              ))}
            </div>
          </section>
        )}

        <YearGrid title={`ภาพรวมเดือน ${year}`} rows={rows.monthRows} months={months} onCellClick={handleCellClick} />
        
        {teamFilter !== "all" && (
          <div style={{ marginTop: 16, marginBottom: -8, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn-clear-filter" onClick={() => setTeamFilter("all")}>
              <X size={14} aria-hidden="true" /> เลิกกรองทีม ({teamFilter})
            </button>
          </div>
        )}
        <YearGrid title="รายบุคคล (จัดกลุ่มตามทีม)" rows={filteredOwnerRows} months={months} grouped showTotal onCellClick={handleCellClick} />
        <YearGrid title="รายทีม" rows={rows.teamRows} months={months} showTotal onCellClick={handleCellClick} />

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
      
      {drillDownFilter && (
        <DealDrillDownModal 
          filter={drillDownFilter} 
          onClose={() => setDrillDownFilter(null)} 
        />
      )}
    </Workspace>
  );
}
