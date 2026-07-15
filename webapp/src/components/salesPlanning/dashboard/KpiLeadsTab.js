"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Filter, PhoneCall, CalendarClock } from "lucide-react";
import { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import { CHANNEL_GROUP_LABELS, LEAD_CHANNEL_LABELS } from "@/lib/sales/leads";
import { fmtName, fmtPercent } from "@/lib/format";

const pct = (hit, total) => (total ? fmtPercent((hit / total) * 100) : "-");

export default function KpiLeadsTab({ month, teamFilter }) {
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ month });
      if (teamFilter && teamFilter !== "all") q.set("team", teamFilter);
      const res = await fetch(`/api/sales-planning/leads/kpi?${q.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลด KPI ลีดไม่สำเร็จ");
      setKpi(await res.json());
    } catch (e) {
      setError(e.message || "โหลด KPI ลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, teamFilter]);

  useEffect(() => { load(); }, [load]);

  const f = kpi?.funnel || {};
  const sla = kpi?.sla || {};

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
      )}

      <SaMetricStrip aria-busy={loading}>
        <SaMetric icon={<Inbox />} label="ลีดเข้า" value={f.total ?? "-"} note={`เดือน ${kpi?.month || month}`} />
        <SaMetric icon={<Filter />} label="SLA คัดกรอง ≤1 วันทำการ" value={pct(sla.screen?.hit, sla.screen?.checked)} note={`ทัน ${sla.screen?.hit ?? 0}/${sla.screen?.checked ?? 0} · ค้าง ${sla.screen?.pending ?? 0}`} tone={(sla.screen?.pending ?? 0) ? "warning" : "good"} />
        <SaMetric icon={<PhoneCall />} label="SLA ติดต่อกลับ ≤1 วันทำการ" value={pct(sla.contact?.hit, sla.contact?.checked)} note={`ทัน ${sla.contact?.hit ?? 0}/${sla.contact?.checked ?? 0} · ค้าง ${sla.contact?.pending ?? 0}`} tone={(sla.contact?.pending ?? 0) ? "warning" : "good"} />
        <SaMetric icon={<CalendarClock />} label="Conversion" value={pct(f.qualified, f.total)} note={`ลีด ${f.total ?? 0} → นัด ${f.meeting ?? 0} → เปิดลูกค้า ${f.qualified ?? 0}`} />
      </SaMetricStrip>

      {/* Funnel */}
      <SaSection icon={<Filter size={17} />} title="Funnel ลีด → ลูกค้า" subtitle="ติดตามการเปลี่ยนผ่านของลีดในแต่ละขั้น">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          {[["เข้า", f.total], ["คัดกรองแล้ว", f.screened], ["มอบหมายแล้ว", f.assigned], ["ติดต่อแล้ว", f.contacted], ["นัดประชุม", f.meeting], ["เปิดลูกค้า", f.qualified], ["ไม่ไปต่อ", f.disqualified], ["ตีกลับ", f.bounced]].map(([label, v]) => (
            <SaMetric
              key={label}
              label={label}
              value={v ?? 0}
              note="จำนวนลีด"
            />
          ))}
        </div>
      </SaSection>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Marketing: กรอกรายวัน */}
        <SaSection icon={<Inbox size={17} />} title="การกรอกลีด (Marketing KPI)" subtitle="ปริมาณลีดแยกตามผู้กรอก">
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
        </SaSection>

        {/* ช่องทาง */}
        <SaSection icon={<CalendarClock size={17} />} title="แยกตามช่องทาง" subtitle="ผลลัพธ์ของลีดจากแต่ละช่องทาง">
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
        </SaSection>
      </div>

      {/* AE: SLA ติดต่อ + ผลต่อคน */}
      <SaSection icon={<PhoneCall size={17} />} title="รายผู้รับผิดชอบ (AE KPI)" subtitle="SLA และผลลัพธ์แยกตาม AE">
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
      </SaSection>
    </div>
  );
}
