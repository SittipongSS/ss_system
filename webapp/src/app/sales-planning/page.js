"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, FolderKanban, LineChart, RefreshCcw, Target, XCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useTeam } from "@/lib/roleContext";
import { KpiCard, PerfTable, money, thisMonth } from "@/components/salesPlanning/ui";
import { SALES_FEATURES } from "@/lib/salesPlanning";

export default function SalesPlanningOverviewPage() {
  const canReview = useCan("salesplan:review");
  const team = useTeam();
  const [month, setMonth] = useState(thisMonth());
  const [dashboard, setDashboard] = useState(null);
  const [sahamitRisk, setSahamitRisk] = useState(null);
  const [forecastReview, setForecastReview] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashRes, sahamitRiskRes, reviewRes] = await Promise.all([
        fetch(`/api/sales-planning/dashboard?month=${encodeURIComponent(month)}`),
        SALES_FEATURES.sahamitRisk ? fetch(`/api/sales-planning/sahamit-risk?month=${encodeURIComponent(month)}`) : Promise.resolve(null),
        SALES_FEATURES.forecastReview ? fetch(`/api/sales-planning/forecast-reviews?month=${encodeURIComponent(month)}`) : Promise.resolve(null),
      ]);
      if (!dashRes.ok) throw new Error((await dashRes.json()).error || "โหลด dashboard ไม่สำเร็จ");
      setDashboard(await dashRes.json());
      setSahamitRisk(sahamitRiskRes?.ok ? await sahamitRiskRes.json() : null);
      const nextReview = reviewRes?.ok ? await reviewRes.json() : null;
      setForecastReview(nextReview);
      setReviewNotes(nextReview?.notes || "");
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

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

  const totals = dashboard?.totals || {};
  const targetRows = dashboard?.targets?.length || 0;
  const sahamitRiskRows = (sahamitRisk?.rows || []).filter((row) => row.risk).slice(0, 8);
  const headerRight = (
    <>
      <input
        type="month"
        aria-label="เดือน forecast"
        className="premium-input"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        style={{ width: 150 }}
      />
      <Link className="btn" href="/sales-planning/deals"><FolderKanban size={15} aria-hidden="true" /> ดีล</Link>
      <Link className="btn" href="/sales-planning/targets"><Target size={15} aria-hidden="true" /> เป้าหมาย</Link>
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
    </>
  );

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="แผนงานขาย — ภาพรวม"
      subtitle="เป้า vs ยอด และมูลค่าดีลเปิด"
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        <section className="kpi-grid" aria-busy={loading}>
          <KpiCard icon={<Target size={16} aria-hidden="true" />} label="เป้า" value={money(totals.targetAmount)} hint={`${targetRows} รายการ`} />
          <KpiCard icon={<ClipboardList size={16} aria-hidden="true" />} label="มูลค่าดีลเปิด" value={money(totals.pipelineValue)} hint={`ดีลเปิด ${totals.openDeals || 0} รายการ`} />
          <KpiCard icon={<LineChart size={16} aria-hidden="true" />} label="ปิดได้ (นับยอด)" value={money(totals.wonValue)} hint={`ส่วนต่าง ${money(totals.targetGap)}`} />
          {SALES_FEATURES.sahamitRisk && sahamitRisk?.enabled && (
            <KpiCard
              icon={<AlertTriangle size={16} aria-hidden="true" />}
              label="ความเสี่ยง FC สหมิตร"
              value={sahamitRisk.summary?.risk || 0}
              hint={`ตรวจ ${sahamitRisk.summary?.total || 0} SKU-เดือน`}
            />
          )}
        </section>

        {dashboard && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>เป้า vs ยอดจริง</h2>
              <span className="ui-badge">{month}</span>
              <div className="spacer" />
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>ปิดได้ = นับยอด · คาดการณ์ = มูลค่าดีลเปิด</span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-3)" }}>รายคน (SA)</div>
                <PerfTable rows={dashboard.byOwner} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-3)" }}>รายทีม</div>
                <PerfTable rows={dashboard.byTeam} teamMode />
              </div>
            </div>
          </section>
        )}

        {SALES_FEATURES.forecastReview && (
        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={17} aria-hidden="true" style={{ color: forecastReview?.status === "approved" ? "var(--green)" : "var(--text-3)" }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ทบทวนพยากรณ์ยอด</h2>
            <span className="ui-badge" style={{ color: forecastReview?.status === "rejected" ? "var(--red)" : forecastReview?.status === "approved" ? "var(--green)" : "var(--text-3)" }}>
              {{ approved: "อนุมัติแล้ว", rejected: "ตีกลับ" }[forecastReview?.status] || "ร่าง"}
            </span>
            <div className="spacer" />
            <span className="mono tabular-nums" style={{ color: "var(--text-3)", fontSize: 12 }}>
              {forecastReview?.dealCount || 0} ดีล · {money(forecastReview?.summaryAmount)}
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
                placeholder="บันทึกของหัวหน้าสำหรับพยากรณ์เดือนนี้"
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
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ตรวจย้อน FC สหมิตร</h2>
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
      </div>
    </Workspace>
  );
}
