"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LineChart, FileText, ChevronRight, AlertCircle, Clock } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/excise/KpiCard";
import { useApiList } from "@/lib/excise/useApiList";
import { poRollupStatus } from "@/lib/sahamit/po";
import DashboardCharts from "@/components/sahamit/DashboardCharts";

// SAHAMIT command center — ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109), เฉพาะทีม Key Account.
// สรุป FC / PO รายรอบ.
export default function SahamitOverview() {
  const router = useRouter();
  const { data: rounds, loading: l1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2 } = useApiList("/api/sahamit/po");
  const { data: coverages, loading: l3 } = useApiList("/api/sahamit/coverage");

  const latestRound = rounds.reduce((m, r) => Math.max(m, r.roundNo || 0), 0);
  
  // PO metrics
  const activePos = pos.filter((p) => poRollupStatus(p) !== "cancelled");
  const followUp = pos.filter((p) => ["open", "partial"].includes(poRollupStatus(p)));
  
  // Recent POs for mini-table (limit 5)
  const recentFollowUps = [...followUp].sort((a, b) => new Date(a.poDate || 0) - new Date(b.poDate || 0)).slice(0, 5);
  
  // Recent FC for activity
  const recentFCs = [...rounds].sort((a, b) => new Date(b.receivedDate || 0) - new Date(a.receivedDate || 0)).slice(0, 3);

  // Success rate estimation (Fulfilled vs Total)
  const fulfilledPos = pos.filter((p) => poRollupStatus(p) === "fulfilled");
  const fulfillmentRate = activePos.length > 0 ? Math.round((fulfilledPos.length / activePos.length) * 100) : 0;

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม (Dashboard)"
      subtitle="งานสหมิตร · ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
      loading={l1 || l2 || l3}
    >
      <div className="flex flex-col gap-6">
        {/* KPI Metrics */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <LineChart size={16} /> สถิติสำคัญ
            <Link href="/sahamit/reconcile" className="flex items-center hover:opacity-80" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)", transition: "opacity 0.2s" }}>
              กระทบยอด (FC vs PO) <ChevronRight size={14} />
            </Link>
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <KpiCard label="FC รอบล่าสุด" value={latestRound ? `#${latestRound}` : "-"} tone="info" icon={LineChart} onClick={() => router.push("/sahamit/forecast")} />
            <KpiCard label="PO ทั้งหมด (กำลังเดิน)" value={activePos.length} tone="accent" icon={FileText} onClick={() => router.push("/sahamit/po")} />
            <KpiCard label="PO ที่ต้องติดตาม" value={followUp.length} tone="warning" onClick={() => router.push("/sahamit/po")} />
            <KpiCard label="Fulfillment Rate" value={`${fulfillmentRate}%`} tone={fulfillmentRate >= 80 ? "success" : "warning"} hint="เทียบ PO ทั้งหมดกับที่ส่งมอบเสร็จสิ้น" onClick={() => router.push("/sahamit/po")} />
          </div>
        </section>

        {/* Interactive Charts */}
        <section>
          <DashboardCharts rounds={rounds} pos={pos} coverages={coverages} />
        </section>

        {/* Urgent Actions & Activities */}
        <section className="form-grid" style={{ gridTemplateColumns: "2fr 1fr", gap: "24px", alignItems: "start" }}>
          
          {/* Follow-up POs */}
          <div className="glass-panel" style={{ padding: "0", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={16} style={{ color: "var(--amber)" }} />
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>PO ที่ต้องการการติดตาม (ด่วน)</h3>
              <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 8px", fontSize: "12px" }} onClick={() => router.push("/sahamit/po")}>ดูทั้งหมด</button>
            </div>
            
            {recentFollowUps.length > 0 ? (
              <table className="premium-table" style={{ borderTop: "none" }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: "20px" }}>เลขที่ PO</th>
                    <th>วันที่รับ PO</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFollowUps.map(p => (
                    <tr key={p.id} onClick={() => router.push(`/sahamit/po?q=${p.poNumber}`)} style={{ cursor: "pointer" }} className="hover-row">
                      <td style={{ paddingLeft: "20px", fontWeight: 500, color: "var(--accent)" }}>{p.poNumber}</td>
                      <td>{p.poDate || "-"}</td>
                      <td>
                        <span className={`status-pill ${poRollupStatus(p) === "open" ? "warning" : "info"}`}>
                          {poRollupStatus(p) === "open" ? "รอผลิต" : "ทยอยส่ง"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state" style={{ padding: "32px", fontSize: "13px" }}>ไม่มี PO ค้างส่งที่ต้องติดตาม เยี่ยมมาก!</div>
            )}
          </div>

          {/* Recent Activities (FC) */}
          <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Clock size={16} style={{ color: "var(--text-3)" }} />
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>การอัปเดต FC ล่าสุด</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {recentFCs.map(fc => (
                <div key={fc.id} style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "12px", borderBottom: "1px dashed var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 500, fontSize: "13px", color: "var(--text)", cursor: "pointer" }} onClick={() => router.push("/sahamit/forecast")}>
                      นำเข้ารอบ FC ที่ #{fc.roundNo}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{fc.receivedDate || "-"}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-2)" }}>ครอบคลุม {fc.coverMonths?.length || 0} เดือน</span>
                </div>
              ))}
              {recentFCs.length === 0 && <div className="empty-state" style={{ padding: "20px 0" }}>ไม่มีประวัติการนำเข้า FC</div>}
            </div>
          </div>

        </section>
      </div>
    </Workspace>
  );
}
