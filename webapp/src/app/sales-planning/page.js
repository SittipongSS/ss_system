"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, FolderKanban, LayoutDashboard, LineChart, RefreshCcw, Target, XCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useTeam } from "@/lib/roleContext";
import { KpiCard, MONTH_LABELS, MonthPicker, money, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import DashboardCharts from "@/components/salesPlanning/DashboardCharts";
import { SALES_FEATURES } from "@/lib/salesPlanning";

const OVERVIEW_TABS = [
  { key: "tables", label: "ตาราง" },
  { key: "dashboard", label: "แดชบอร์ด" },
];

function metricCell(row, month) {
  const cell = row.months?.[month] || {};
  return {
    target: Number(cell.target || 0),
    won: Number(cell.won || 0),
    forecast: Number(cell.forecast || 0),
  };
}

function addMetric(target, month, value) {
  if (!target.months[month]) target.months[month] = { target: 0, won: 0, forecast: 0 };
  target.months[month].target += Number(value.target || 0);
  target.months[month].won += Number(value.won || 0);
  target.months[month].forecast += Number(value.forecast || 0);
  target.total.target += Number(value.target || 0);
  target.total.won += Number(value.won || 0);
  target.total.forecast += Number(value.forecast || 0);
}

function buildYearRows(yearDashboards) {
  const monthSummary = {
    id: "year-summary",
    label: "รวมรายเดือน",
    sublabel: "ทุกทีม",
    team: null,
    months: {},
    total: { target: 0, won: 0, forecast: 0 },
  };
  const owners = new Map();
  const teams = new Map();

  for (const dashboard of yearDashboards) {
    const month = dashboard.month;
    const totals = dashboard.totals || {};
    addMetric(monthSummary, month, {
      target: totals.targetAmount || 0,
      won: totals.wonValue || 0,
      forecast: totals.weightedForecast || 0,
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
          total: { target: 0, won: 0, forecast: 0 },
        });
      }
      addMetric(owners.get(key), month, {
        target: row.target,
        won: row.won,
        forecast: row.weighted,
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
          total: { target: 0, won: 0, forecast: 0 },
        });
      }
      addMetric(teams.get(key), month, {
        target: row.target,
        won: row.won,
        forecast: row.weighted,
      });
    }
  }

  const ownerRows = [...owners.values()].sort((a, b) => String(a.team).localeCompare(String(b.team)) || b.total.won - a.total.won);
  const teamRows = [...teams.values()].sort((a, b) => b.total.won - a.total.won || String(a.label).localeCompare(String(b.label)));
  return { monthRows: [monthSummary], ownerRows, teamRows };
}

function YearGrid({ title, rows, months, grouped = false, empty = "ยังไม่มีข้อมูล" }) {
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

  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <span className="ui-badge">เป้า / Won / คาดการณ์</span>
      </div>
      <div className="premium-glass-table table-responsive">
        <table className="w-full text-sm" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>รายการ</th>
              {months.map((month, i) => <th key={month} className="num">{MONTH_LABELS[i]}</th>)}
              <th className="num">รวมปี</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, groupRows]) => (
              <Fragment key={group}>
                {grouped && (
                  <tr key={`${group}-group`}>
                    <td colSpan={14} style={{ background: "var(--panel-2)", color: "var(--text-2)", fontWeight: 700 }}>
                      ทีม {group}
                    </td>
                  </tr>
                )}
                {groupRows.map((row) => (
                  <tr key={row.id} className="premium-row">
                    <td>
                      <strong>{row.label}</strong>
                      {row.sublabel && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{row.sublabel}</span>}
                    </td>
                    {months.map((month) => {
                      const cell = metricCell(row, month);
                      const hasValue = cell.target || cell.won || cell.forecast;
                      return (
                        <td key={month} className="num mono" style={{ verticalAlign: "top", color: hasValue ? "var(--text)" : "var(--text-3)" }}>
                          <div>{money(cell.target)}</div>
                          <div style={{ color: "var(--green)" }}>{money(cell.won)}</div>
                          <div style={{ color: "var(--amber)" }}>{money(cell.forecast)}</div>
                        </td>
                      );
                    })}
                    <td className="num mono" style={{ verticalAlign: "top", fontWeight: 700 }}>
                      <div>{money(row.total.target)}</div>
                      <div style={{ color: "var(--green)" }}>{money(row.total.won)}</div>
                      <div style={{ color: "var(--amber)" }}>{money(row.total.forecast)}</div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
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
  const [tab, setTab] = useState("tables");
  const year = month.slice(0, 4);
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

  const totals = selectedDashboard?.totals || {};
  const targetRows = selectedDashboard?.targets?.length || 0;
  const sahamitRiskRows = (sahamitRisk?.rows || []).filter((row) => row.risk).slice(0, 8);
  const headerRight = (
    <>
      <MonthPicker value={month} onChange={setMonth} />
      <Link className="btn" href="/sales-planning/deals"><FolderKanban size={15} aria-hidden="true" /> โครงการ</Link>
      <Link className="btn" href="/sales-planning/targets"><Target size={15} aria-hidden="true" /> เป้าหมาย</Link>
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
    </>
  );

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าโครงการ เพื่อผลักไปสู่ Won โดย PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
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
          <KpiCard icon={<Target size={16} aria-hidden="true" />} label="เป้าเดือนที่เลือก" value={money(totals.targetAmount)} hint={`${targetRows} รายการ`} />
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

        <YearGrid title={`ภาพรวมรายเดือน ${year}`} rows={rows.monthRows} months={months} />
        <YearGrid title="รายบุคคล (จัดกลุ่มตามทีม)" rows={rows.ownerRows} months={months} grouped />
        <YearGrid title="รายทีม" rows={rows.teamRows} months={months} />

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
                ทบทวนล่าสุดโดย {forecastReview.reviewedByName} {forecastReview.reviewedAt ? `เมื่อ ${new Date(forecastReview.reviewedAt).toLocaleString("th-TH")}` : ""}
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
