"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, Activity, CalendarDays, Inbox, AlertTriangle, ArrowRight, FolderKanban, BarChart3 } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/format";
import { forecastBadge, KpiCard } from "@/components/salesPlanning/ui";
import { LEAD_STATUS_LABELS } from "@/lib/sales/leads";

function ProgressBar({ value, total, color = "var(--violet)" }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div style={{ width: "100%", height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.5s ease-out" }} />
    </div>
  );
}

export default function MyDashboardTab({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/sales-planning/my-dashboard?month=${encodeURIComponent(month)}`);
        if (!res.ok) throw new Error((await res.json()).error || "โหลดข้อมูลไม่สำเร็จ");
        setData(await res.json());
      } catch (e) {
        setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month]);

  const target = data?.target || 0;
  const wonValue = data?.wonValue || 0;
  const pipelineValue = data?.pipelineValue || 0;
  const targetGap = data?.targetGap || 0;
  const actionLeads = data?.actionLeads || [];
  const openDealsCount = data?.openDealsCount || 0;
  const byForecast = data?.byForecast || [];

  const pctTarget = target > 0 ? Math.round((wonValue / target) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
          {error}
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Section: My Target */}
        <section className="glass-panel" style={{ padding: 20 }} aria-busy={loading}>
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-[var(--accent)]" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>เป้าหมายยอดขาย (Target vs Actual)</h2>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between items-end mb-1">
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>ยอดปิดได้จริง (Won)</span>
                <span className="font-mono" style={{ fontSize: 24, fontWeight: 800, color: "var(--violet)" }}>{fmtMoney(wonValue)}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] text-[var(--text-3)] font-mono">
                <span>Target: {fmtMoney(target)}</span>
                <span>Gap: {targetGap > 0 ? fmtMoney(targetGap) : "0"}</span>
              </div>
              <ProgressBar value={wonValue} total={target} color="var(--violet)" />
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "var(--text-2)", textAlign: "right" }}>
                {pctTarget}% สำเร็จ
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <KpiCard
                label="ไปป์ไลน์ที่เปิดอยู่"
                icon={<FolderKanban size={16} />}
                value={fmtMoney(pipelineValue)}
                hint={`จาก ${openDealsCount} ดีล`}
                color="var(--violet)"
                interactive={false}
              />
              <KpiCard
                label="Weighted Forecast"
                icon={<BarChart3 size={16} />}
                value={fmtMoney(data?.weightedForecast || 0)}
                color="var(--blue)"
                interactive={false}
              />
            </div>
          </div>
        </section>

        {/* Section: Daily Action Items */}
        <section className="glass-panel flex flex-col" style={{ padding: 20 }} aria-busy={loading}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[var(--red)]" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>สิ่งที่ต้องดำเนินการ (Action Items)</h2>
            </div>
            {actionLeads.length > 0 && <span className="ui-badge" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{actionLeads.length} ลีด</span>}
          </div>
          
          <div className="flex-1 overflow-auto">
            {actionLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-3)] opacity-60 min-h-[150px]">
                <Inbox size={40} className="mb-2" />
                <span style={{ fontSize: 14 }}>ไม่มีลีดที่ต้องติดต่อด่วนในขณะนี้</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {actionLeads.map(l => (
                  <div key={l.id} className="flex flex-col gap-1.5 p-3 rounded-lg border border-[var(--border)]" style={{ background: "var(--bg)" }}>
                    <div className="flex items-center justify-between">
                      <Link href={`/sa/leads/${l.id}`} className="font-semibold text-[14px] text-[var(--text)] hover:text-[var(--accent)] hover:underline flex items-center gap-1.5">
                        {l.company || l.contactName} <ArrowRight size={14} />
                      </Link>
                      <span className="ui-badge" style={{ fontSize: 10 }}>{LEAD_STATUS_LABELS[l.status] || l.status}</span>
                    </div>
                    <div className="text-[12px] text-[var(--text-2)] flex items-center gap-1.5">
                      {l.status === 'meeting' ? (
                        <><CalendarDays size={12} className="text-[var(--amber)]" /> นัดหมาย: {fmtDate(l.meetingAt)}</>
                      ) : (
                        <><AlertTriangle size={12} className="text-[var(--red)]" /> รอการติดต่อกลับ (SLA 1 วัน)</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border)] flex justify-end">
            <Link href="/sa/leads" className="btn sm">ไปหน้าลีดทั้งหมด</Link>
          </div>
        </section>
      </div>

      {/* Section: My Pipeline by FC */}
      <section className="glass-panel" style={{ padding: 20 }} aria-busy={loading}>
        <div className="flex items-center gap-2 mb-4">
          <FolderKanban size={18} className="text-[var(--accent)]" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ไปป์ไลน์ของฉัน (เปิดอยู่ แยกตามโอกาสปิด)</h2>
        </div>
        
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {byForecast.map((b) => (
            <KpiCard
              key={b.level}
              icon={<Activity size={16} />}
              label={`FC ${b.level}%`}
              color={b.level === 100 ? "var(--green)" : b.level === 80 ? "var(--teal)" : b.level === 50 ? "var(--amber)" : "var(--text-3)"}
              value={fmtMoney(b.value)}
              hint={`จำนวน ${b.count} ดีล`}
              interactive={false}
            />
          ))}
        </div>
        
        {openDealsCount === 0 && !loading && (
           <div className="text-center p-8 text-[var(--text-3)] text-sm">คุณยังไม่มีดีลที่เปิดอยู่ในขณะนี้</div>
        )}
        
        <div className="mt-5 flex justify-end">
           <Link href="/sa/deals" className="btn sm">ดูดีลทั้งหมด</Link>
        </div>
      </section>

    </div>
  );
}
