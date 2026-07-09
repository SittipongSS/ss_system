"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, ListTodo, RefreshCw, Trophy, Users } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Select from "@/components/ui/Select";
import SkeletonRows from "@/components/ui/Skeleton";

const today = new Date();
const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

function fmtPct(value) {
  return `${Number(value || 0).toLocaleString("th-TH")}%`;
}

function Stat({ icon, label, value, hint, color = "var(--accent)" }) {
  return (
    <div className="glass-panel" style={{ padding: 16, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 12, fontWeight: 700 }}>
        {icon} {label}
      </div>
      <div className="mono tabular-nums" style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function ScoreBadge({ value }) {
  const n = Number(value || 0);
  const color = n >= 80 ? "var(--green)" : n >= 60 ? "var(--blue)" : n >= 40 ? "var(--amber)" : "var(--red)";
  return <span className="ui-badge mono tabular-nums" style={{ color }}>{n}</span>;
}

export default function SalesTaskKpiPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [team, setTeam] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const q = new URLSearchParams({ from, to });
    if (team) q.set("team", team);
    return q.toString();
  }, [from, to, team]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/task-kpi?${query}`);
      const text = await res.text();
      let d = {};
      try { d = text ? JSON.parse(text) : {}; } catch { d = {}; }
      if (!res.ok) throw new Error(d.error || "โหลด KPI ไม่สำเร็จ");
      setData(d);
      if (d.scope === "team" && d.team) setTeam(d.team);
    } catch (e) {
      setError(e.message || "โหลด KPI ไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const rows = data?.rows || [];
  const teams = data?.teams || [];
  const canPickTeam = data?.scope === "all";

  return (
    <Workspace
      icon={<BarChart3 size={22} />}
      title="KPI งานขาย"
      subtitle="วัดผลจากงานที่มอบหมายใน Sales Task Management ตามช่วงวันที่และ scope ของผู้ใช้"
      back={{ href: "/sa/tasks", label: "กลับไปงาน" }}
      headerRight={(
        <>
          <Link href="/sa/tasks" className="btn ghost"><ListTodo size={15} /> งาน</Link>
          <button type="button" className="btn" onClick={load} disabled={loading}><RefreshCw size={15} /> รีเฟรช</button>
        </>
      )}
    >
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <span className="toolbar-label"><CalendarDays size={14} /> ช่วงวันที่</span>
        <input type="date" className="premium-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <input type="date" className="premium-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        {canPickTeam && (
          <Select compact value={team} onChange={(e) => setTeam(e.target.value)} title="กรองทีม">
            <option value="">ทุกทีม</option>
            {(data?.availableTeams || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
      </div>

      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? <SkeletonRows /> : (
        <div className="flex flex-col gap-5">
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Stat icon={<ListTodo size={16} />} label="งานทั้งหมด" value={summary.total || 0} hint={`${summary.people || 0} คน`} />
            <Stat icon={<Trophy size={16} />} label="เสร็จแล้ว" value={summary.completed || 0} hint={`อัตราเสร็จ ${fmtPct(summary.completionPct)}`} color="var(--green)" />
            <Stat icon={<CalendarDays size={16} />} label="ตรงเวลา" value={fmtPct(summary.onTimePct)} hint={`${summary.completedOnTime || 0}/${summary.completedWithDue || 0} งานที่มีกำหนด`} color="var(--blue)" />
            <Stat icon={<BarChart3 size={16} />} label="คะแนนรวม" value={<ScoreBadge value={summary.score} />} hint="40% เสร็จ + 40% ตรงเวลา + 20% ความยาก" color="var(--amber)" />
          </section>

          {teams.length > 1 && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <Users size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>สรุปรายทีม</h2>
              </div>
              <div className="premium-glass-table table-responsive">
                <table className="premium-table">
                  <thead><tr><th>ทีม</th><th className="num">คน</th><th className="num">งาน</th><th className="num">เสร็จ</th><th className="num">% เสร็จ</th><th className="num">% ตรงเวลา</th><th className="num">คะแนน</th></tr></thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr key={t.team} className="premium-row">
                        <td style={{ fontWeight: 700 }}>{t.team}</td>
                        <td className="num">{t.people}</td>
                        <td className="num">{t.total}</td>
                        <td className="num">{t.completed}</td>
                        <td className="num">{fmtPct(t.completionPct)}</td>
                        <td className="num">{fmtPct(t.onTimePct)}</td>
                        <td className="num"><ScoreBadge value={t.score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <Users size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>รายคน</h2>
            </div>
            <div className="premium-glass-table table-responsive">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>ผู้รับผิดชอบ</th><th>ทีม</th><th className="num">งาน</th><th className="num">กำลังทำ</th><th className="num">เลยกำหนด</th><th className="num">เสร็จ</th><th className="num">% เสร็จ</th><th className="num">% ตรงเวลา</th><th className="num">ความยาก</th><th className="num">คะแนน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className="premium-row">
                      <td style={{ fontWeight: 700 }}>{r.name}<div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>{r.role || "-"}</div></td>
                      <td>{r.team || "-"}</td>
                      <td className="num">{r.total}</td>
                      <td className="num">{r.active}</td>
                      <td className="num" style={{ color: r.overdue ? "var(--red)" : undefined }}>{r.overdue}</td>
                      <td className="num">{r.completed}</td>
                      <td className="num">{fmtPct(r.completionPct)}</td>
                      <td className="num">{fmtPct(r.onTimePct)}</td>
                      <td className="num">{fmtPct(r.difficultyPct)}</td>
                      <td className="num"><ScoreBadge value={r.score} /></td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-3)", padding: 18 }}>ไม่มีข้อมูลในช่วงวันที่นี้</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Workspace>
  );
}
