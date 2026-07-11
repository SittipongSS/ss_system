"use client";

// หน้า KPI (/sa/kpi — Sales Revamp เฟส C v1): KPI ลีดทั้งเส้น — จำนวนกรอกรายวัน
// ต่อคน (Marketing), SLA คัดกรอง/ติดต่อกลับ (วันทำการ), conversion funnel,
// แยกช่องทาง + รายผู้รับผิดชอบ. เฟส G จะเติม FC accuracy / %Target.
import { useCallback, useEffect, useState } from "react";
import { LineChart, Inbox, Filter, PhoneCall, CalendarClock } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan } from "@/lib/roleContext";
import { KpiCard, MonthPicker, thisMonth } from "@/components/salesPlanning/ui";
import { CHANNEL_GROUP_LABELS, LEAD_CHANNEL_LABELS } from "@/lib/sales/leads";
import { fmtName } from "@/lib/format";

const pct = (hit, total) => (total ? `${Math.round((hit / total) * 100)}%` : "-");

export default function SalesKpiPage() {
  const canViewPlan = useCan("salesplan:view");
  const canLead = useCan("salesplan:lead");
  const canView = canViewPlan || canLead;
  const [month, setMonth] = useState(thisMonth());
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/kpi?month=${encodeURIComponent(month)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลด KPI ไม่สำเร็จ");
      setKpi(await res.json());
    } catch (e) {
      setError(e.message || "โหลด KPI ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  if (!canView) {
    return (
      <Workspace icon={<LineChart size={22} />} title="KPI">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Workspace>
    );
  }

  const f = kpi?.funnel || {};
  const sla = kpi?.sla || {};

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="บริหารงานขาย — KPI"
      subtitle="วัดจาก timestamp อัตโนมัติ (SLA = วันทำการ อิงปฏิทินวันหยุดจริง) — ไม่มีการกรอกมือ"
      back={{ href: "/sa", label: "กลับไปภาพรวม" }}
      headerRight={<MonthPicker value={month} onChange={setMonth} />}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        <section className="kpi-grid" aria-busy={loading}>
          <KpiCard icon={<Inbox size={16} aria-hidden="true" />} label="ลีดเข้า" value={f.total ?? "-"} hint={`เดือน ${kpi?.month || month}`} />
          <KpiCard icon={<Filter size={16} aria-hidden="true" />} label="SLA คัดกรอง ≤1 วันทำการ" value={pct(sla.screen?.hit, sla.screen?.checked)} hint={`ทัน ${sla.screen?.hit ?? 0}/${sla.screen?.checked ?? 0} · ค้างคิว ${sla.screen?.pending ?? 0}`} />
          <KpiCard icon={<PhoneCall size={16} aria-hidden="true" />} label="SLA ติดต่อกลับ ≤1 วันทำการ" value={pct(sla.contact?.hit, sla.contact?.checked)} hint={`ทัน ${sla.contact?.hit ?? 0}/${sla.contact?.checked ?? 0} · ค้างติดต่อ ${sla.contact?.pending ?? 0}`} />
          <KpiCard icon={<CalendarClock size={16} aria-hidden="true" />} label="Conversion" value={pct(f.qualified, f.total)} hint={`ลีด ${f.total ?? 0} → นัด ${f.meeting ?? 0} → เปิดลูกค้า ${f.qualified ?? 0}`} />
        </section>

        {/* Funnel */}
        <section className="glass-panel" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>Funnel ลีด → ลูกค้า</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            {[["เข้า", f.total], ["คัดกรองแล้ว", f.screened], ["มอบหมายแล้ว", f.assigned], ["ติดต่อแล้ว", f.contacted], ["นัดประชุม", f.meeting], ["เปิดลูกค้า", f.qualified], ["ไม่ไปต่อ", f.disqualified], ["ตีกลับ", f.bounced]].map(([label, v]) => (
              <div key={label} className="bg-[var(--panel-2)] rounded-xl border border-[var(--border)] transition-all hover:shadow-md hover:border-gray-300" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 600 }}>{label}</div>
                <div className="font-mono tabular-nums text-[var(--accent)]" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{v ?? 0}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {/* Marketing: กรอกรายวัน */}
          <section className="glass-panel" style={{ padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>การกรอกลีด (Marketing KPI)</h2>
            <div className="premium-glass-table table-responsive">
              <table className="w-full text-sm">
                <thead><tr><th>ผู้กรอก</th><th className="num">ลีด</th><th className="num">วันที่กรอก</th><th className="num">เฉลี่ย/วัน</th></tr></thead>
                <tbody>
                  {(kpi?.byCreator || []).map((c) => (
                    <tr key={c.createdBy || c.name} className="premium-row">
                      <td>{c.name}</td>
                      <td className="num mono">{c.count}</td>
                      <td className="num mono">{c.days}</td>
                      <td className="num mono">{c.perDay}</td>
                    </tr>
                  ))}
                  {!(kpi?.byCreator || []).length && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* ช่องทาง */}
          <section className="glass-panel" style={{ padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>แยกตามช่องทาง</h2>
            <div className="premium-glass-table table-responsive">
              <table className="w-full text-sm">
                <thead><tr><th>ช่องทาง</th><th>กลุ่ม</th><th className="num">ลีด</th><th className="num">เปิดลูกค้า</th></tr></thead>
                <tbody>
                  {(kpi?.byChannel || []).map((c) => (
                    <tr key={c.channel} className="premium-row">
                      <td>{LEAD_CHANNEL_LABELS[c.channel] || c.channel}</td>
                      <td>{CHANNEL_GROUP_LABELS[c.group] || c.group}</td>
                      <td className="num mono">{c.count}</td>
                      <td className="num mono">{c.qualified}</td>
                    </tr>
                  ))}
                  {!(kpi?.byChannel || []).length && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* AE: SLA ติดต่อ + ผลต่อคน */}
        <section className="glass-panel" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>รายผู้รับผิดชอบ (AE KPI)</h2>
          <div className="premium-glass-table table-responsive">
            <table className="w-full text-sm">
              <thead><tr><th>AE</th><th>ทีม</th><th className="num">รับมอบ</th><th className="num">ติดต่อแล้ว</th><th className="num">SLA ทัน</th><th className="num">นัด</th><th className="num">เปิดลูกค้า</th></tr></thead>
              <tbody>
                {(kpi?.byAssignee || []).map((a) => (
                  <tr key={a.assigneeId} className="premium-row">
                    <td>{fmtName({ name: a.name })}</td>
                    <td>{a.team || "-"}</td>
                    <td className="num mono">{a.assigned}</td>
                    <td className="num mono">{a.contacted}</td>
                    <td className="num mono">{pct(a.slaHit, a.contacted)}</td>
                    <td className="num mono">{a.meetings}</td>
                    <td className="num mono">{a.qualified}</td>
                  </tr>
                ))}
                {!(kpi?.byAssignee || []).length && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Workspace>
  );
}
