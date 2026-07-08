"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, FolderKanban, LayoutDashboard, LineChart, RefreshCcw, Target, XCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useTeam } from "@/lib/roleContext";
import { KpiCard, MONTH_LABELS, MonthPicker, money, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import DashboardCharts from "@/components/salesPlanning/DashboardCharts";
import { SALES_FEATURES } from "@/lib/salesPlanning";
import { fmtDateTime } from "@/lib/format";

const OVERVIEW_TABS = [
  { key: "tables", label: "ตาราง" },
  { key: "dashboard", label: "แดชบอร์ด" },
];

// แถวตัวเลขที่โชว์ต่อช่อง (ตามลำดับบนลงล่าง) พร้อมป้ายชื่อ + สี.
// forecast (จาก API) = FC ของดีลที่ยังเปิด (ไม่รวมดีลที่แพ้).
//   FC เต็ม   = won + forecast(เปิด)                (เป้าหมายที่คาดว่าจะทำได้ทั้งเดือน)
//   FC คงเหลือ = FC เต็ม − Actual(won) = forecast(เปิด)  (ส่วนที่ยังต้องปิดต่อ)
const METRICS = [
  { key: "target", label: "เป้า", color: "var(--text)" },
  { key: "full", label: "FC เต็ม", color: "var(--blue)" },
  { key: "won", label: "Actual", color: "var(--green)" },
  { key: "remaining", label: "FC คงเหลือ", color: "var(--amber)" },
];

function deriveMetrics(cell) {
  const target = Number(cell?.target || 0);
  const won = Number(cell?.won || 0);
  const open = Number(cell?.forecast || 0);
  const full = won + open;
  return { target, full, won, remaining: full - won };
}

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

// รวมทุกแถวเป็นแถวเดียว (มูลค่ารวมต่อเดือน + ทั้งปี) สำหรับแถวสรุปท้ายตาราง.
function sumRows(rows) {
  const total = { id: "grand-total", label: "รวมทั้งหมด", months: {}, total: { target: 0, won: 0, forecast: 0 } };
  for (const r of rows) {
    for (const [m, v] of Object.entries(r.months || {})) {
      if (!total.months[m]) total.months[m] = { target: 0, won: 0, forecast: 0 };
      total.months[m].target += Number(v.target || 0);
      total.months[m].won += Number(v.won || 0);
      total.months[m].forecast += Number(v.forecast || 0);
    }
    total.total.target += Number(r.total?.target || 0);
    total.total.won += Number(r.total?.won || 0);
    total.total.forecast += Number(r.total?.forecast || 0);
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
      <div className="fz-box premium-glass-table" style={{ "--fz-c1w": "160px" }}>
        <table className="fz-table w-full text-sm" style={{ minWidth: 1180 }}>
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
                              {money(mm[m.key])}
                            </td>
                          ))}
                          <td className="fz-cr num mono" style={{ fontWeight: 700, color: totalMetrics[m.key] ? m.color : "var(--text-3)" }}>
                            {money(totalMetrics[m.key])}
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
                  <tr key={`grand-${m.key}`} style={{ background: "var(--panel-2)", borderTop: mi === 0 ? "2px solid var(--border)" : undefined }}>
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
                        {money(mm[m.key])}
                      </td>
                    ))}
                    <td className="fz-cr num mono" style={{ fontWeight: 800, color: totalMetrics[m.key] ? m.color : "var(--text-3)" }}>
                      {money(totalMetrics[m.key])}
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
