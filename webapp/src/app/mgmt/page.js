"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ListTodo, CheckCircle2, Clock3, Circle, AlertTriangle } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import KpiCard from "@/components/excise/KpiCard";
import { TASK_STATUS_LABELS, toBuddhistYear } from "@/lib/mgmt/constants";

const nowYear = new Date().getFullYear();
const YEAR_OPTIONS = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];

const STATUS_TONE = { done: "var(--green)", in_progress: "var(--blue)", todo: "var(--text-3)", cancelled: "var(--red)" };
const fmtDue = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

export default function MgmtOverviewPage() {
  const role = useRole();
  const canMgmt = useCan("mgmt:view");
  const router = useRouter();
  const [year, setYear] = useState(nowYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role && !canMgmt) router.replace("/home");
  }, [role, canMgmt, router]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/mgmt/overview?year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  const counts = data?.counts || { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
  const percent = data?.percent || 0;
  const donut = useMemo(() => {
    const seg = [["done", counts.done], ["in_progress", counts.in_progress], ["todo", counts.todo]];
    const total = seg.reduce((s, [, n]) => s + n, 0) || 1;
    let acc = 0;
    const stops = seg.map(([k, n]) => {
      const from = (acc / total) * 100; acc += n;
      const to = (acc / total) * 100;
      return `${STATUS_TONE[k]} ${from}% ${to}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [counts]);

  if (role && !canMgmt) return null;

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><LayoutDashboard size={22} /></span>{" "}
            ภาพรวมงานบริหาร
          </h1>
          <p>ภาพรวมการติดตามงาน แยกตามแผนก และงานด่วนที่ต้องจัดการ</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="premium-input" style={{ width: 120 }}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {toBuddhistYear(y)}</option>)}
          </select>
          <div className="pill ok">{percent}% เสร็จ</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-3)" }}>กำลังโหลด...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
            <KpiCard label="ทั้งหมด" value={data?.total || 0} tone="neutral" icon={ListTodo} />
            <KpiCard label="เสร็จสมบูรณ์" value={counts.done} hint={`${percent}%`} tone="success" icon={CheckCircle2} />
            <KpiCard label="กำลังดำเนิน" value={counts.in_progress} tone="info" icon={Clock3} />
            <KpiCard label="รอเริ่ม" value={counts.todo} tone="neutral" icon={Circle} />
            <KpiCard label="งานด่วน" value={(data?.urgent || []).length} tone="danger" icon={AlertTriangle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div className="glass-panel" style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>ความคืบหน้าตามแผนก</div>
              {(data?.progressByDept || []).length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>ยังไม่มีข้อมูล</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.progressByDept.map((d) => {
                    const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
                    return (
                      <div key={d.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, width: 56, color: "var(--text-2)" }}>{d.code}</span>
                        <span style={{ flex: 1, height: 9, background: "var(--panel-2)", borderRadius: 6, overflow: "hidden" }}>
                          <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-3)", width: 44, textAlign: "right" }}>{d.done}/{d.total}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="glass-panel" style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>สัดส่วนสถานะ</div>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 96, height: 96, borderRadius: "50%", background: donut, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {["done", "in_progress", "todo", "cancelled"].map((k) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: STATUS_TONE[k] }} />
                      {TASK_STATUS_LABELS[k]} <b style={{ marginLeft: 4 }}>{counts[k]}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="var(--red)" /> งานด่วน — ยังไม่เสร็จ
            </div>
            {(data?.urgent || []).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: "18px 0" }}>ไม่มีงานด่วนที่ค้างอยู่ 🎉</div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 110px", gap: 8, fontSize: 12, color: "var(--text-3)", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>รายการ</span><span>แผนก</span><span>ผู้รับผิดชอบ</span><span style={{ textAlign: "right" }}>กำหนดส่ง</span>
                </div>
                {data.urgent.map((t) => (
                  <div key={t.id} onClick={() => router.push("/mgmt/tasks")} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 110px", gap: 8, fontSize: 13, padding: "9px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    <span style={{ color: "var(--text-2)" }}>{t.deptCode || "—"}</span>
                    <span style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.assigneeName || "—"}</span>
                    <span style={{ textAlign: "right", color: "var(--text-2)" }}>{fmtDue(t.dueDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
