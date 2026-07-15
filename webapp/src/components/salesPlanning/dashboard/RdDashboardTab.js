"use client";
// แท็บ "แดชบอร์ด RD" — ศูนย์งานของฝ่ายวิจัยและพัฒนา วัดแยกจาก KPI ฝ่ายขาย:
//   การ์ดสรุป SLA ตอบข้อสอบถาม + คิวเรื่องค้าง + ตารางรายคน (คะแนนงานสูตรกลาง
//   เดียวกับ KPI งานฝ่ายขาย + มิติการตอบคำถาม)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Clock, ListTodo, MessageCircleQuestion, AlertTriangle } from "lucide-react";
import { KpiCard } from "@/components/salesPlanning/ui";
import { InquiryStatusBadge, inquiryDueTone } from "@/components/salesPlanning/inquiryUi";
import { fmtDate } from "@/lib/format";

// ช่วงวัดจากเดือนที่เลือกบนหัวแดชบอร์ด ('YYYY-MM' → วันแรก/วันสุดท้ายของเดือน)
function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default function RdDashboardTab({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [todayISO, setTodayISO] = useState(null);
  useEffect(() => {
    const d = new Date();
    setTodayISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const range = monthRange(month);
      const qs = range ? `?from=${range.from}&to=${range.to}` : "";
      const res = await fetch(`/api/sales-planning/rd-kpi${qs}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "โหลด KPI ฝ่าย RD ไม่สำเร็จ");
      setData(payload);
    } catch (e) {
      setError(e.message || "โหลด KPI ฝ่าย RD ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const inq = data?.inquirySummary;
  const tasks = data?.taskSummary;
  const queue = useMemo(() => data?.openQueue || [], [data]);

  if (error) {
    return <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>;
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={loading}>
      {/* ── การ์ดสรุป: ซ้าย = SLA ตอบข้อสอบถาม · ขวา = งานของฝ่าย ── */}
      <section className="kpi-grid">
        <KpiCard
          icon={<MessageCircleQuestion size={16} aria-hidden="true" />}
          label="รอตอบตอนนี้"
          value={inq ? inq.openNow : "-"}
          hint={inq ? `ยังไม่มีผู้รับ ${inq.unassignedOpen} เรื่อง` : ""}
        />
        <KpiCard
          icon={<AlertTriangle size={16} aria-hidden="true" />}
          label="เลยกำหนดตอบ"
          value={<span style={{ color: inq?.overdueNow ? "var(--red)" : "var(--green)" }}>{inq ? inq.overdueNow : "-"}</span>}
          hint="SLA ตอบกลับ 3 วันทำการ"
        />
        <KpiCard
          icon={<CheckCircle2 size={16} aria-hidden="true" />}
          label="ตอบแล้ว (ช่วงที่เลือก)"
          value={inq ? inq.answered : "-"}
          hint={inq ? `ตอบทันกำหนด ${inq.onTimePct}% · รับเรื่องใหม่ ${inq.createdInPeriod}` : ""}
        />
        <KpiCard
          icon={<Clock size={16} aria-hidden="true" />}
          label="เวลาตอบเฉลี่ย"
          value={inq && inq.avgResponseDays != null ? `${inq.avgResponseDays} วันทำการ` : "-"}
          hint="นับจากวันส่งคำถามถึงคำตอบแรก"
        />
        <KpiCard
          icon={<ListTodo size={16} aria-hidden="true" />}
          label="งานของฝ่าย (ช่วงที่เลือก)"
          value={tasks ? `${tasks.completed}/${tasks.total}` : "-"}
          hint={tasks ? `เสร็จตรงเวลา ${tasks.onTimePct}% · ค้าง ${tasks.active} (เลยกำหนด ${tasks.overdue})` : ""}
        />
      </section>

      {/* ── คิวเรื่องค้างตอบ (action queue) ── */}
      <section className="glass-panel" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircleQuestion size={17} aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>คิวข้อสอบถามค้าง</h2>
          <Link href="/sa/inquiries" className="linklike" style={{ marginLeft: "auto", fontSize: 12.5 }}>ดูทั้งหมด</Link>
        </div>
        {queue.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {queue.map((q) => {
              const due = inquiryDueTone(q, todayISO);
              return (
                <li key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                  <InquiryStatusBadge status={q.status} />
                  {q.urgent && <span className="ui-badge" style={{ color: "var(--red)" }}>ด่วน</span>}
                  <Link href={`/sa/inquiries/${q.id}`} className="linklike" style={{ fontWeight: 600 }}>
                    {q.code ? `${q.code} · ` : ""}{q.title}
                  </Link>
                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                    โดย {q.requesterName || "-"} · ผู้รับ {q.assigneeName || "ยังไม่มี"}
                  </span>
                  {q.dueDate && (
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: due?.color || "var(--text-3)" }}>
                      กำหนดตอบ {fmtDate(q.dueDate)}{due ? ` · ${due.label}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ padding: 12, color: "var(--text-3)", fontSize: 13 }}>{loading ? "กำลังโหลด..." : "ไม่มีเรื่องค้าง — ตอบครบทุกเรื่องแล้ว 🎉"}</div>
        )}
      </section>

      {/* ── ตารางรายคน: SLA ตอบ + คะแนนงาน (สูตรกลางเดียวกับ KPI งานฝ่ายขาย) ── */}
      <section className="glass-panel" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={17} aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>KPI รายคน — ฝ่าย RD</h2>
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>
            คะแนนงาน = เสร็จ {data?.weights?.completion ?? 40} + ตรงเวลา {data?.weights?.onTime ?? 40} + ความยาก {data?.weights?.difficulty ?? 20}
          </span>
        </div>
        <div className="premium-glass-table table-responsive">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th className="num">ตอบแล้ว</th>
                <th className="num">ทัน SLA</th>
                <th className="num">เวลาตอบเฉลี่ย</th>
                <th className="num">รอตอบ</th>
                <th className="num">งานเสร็จ/ทั้งหมด</th>
                <th className="num">ตรงเวลา</th>
                <th className="num">คะแนนงาน</th>
              </tr>
            </thead>
            <tbody>
              {(data?.people || []).length ? data.people.map((p) => (
                <tr key={p.userId} className="premium-row">
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="num mono">{p.inquiries.answered}</td>
                  <td className="num mono">{p.inquiries.answered ? `${p.inquiries.onTimePct}%` : "-"}</td>
                  <td className="num mono">{p.inquiries.avgResponseDays != null ? `${p.inquiries.avgResponseDays} วัน` : "-"}</td>
                  <td className="num mono">
                    {p.inquiries.openNow}
                    {p.inquiries.overdueNow > 0 && <span style={{ color: "var(--red)" }}> ({p.inquiries.overdueNow} เลยกำหนด)</span>}
                  </td>
                  <td className="num mono">{p.completed}/{p.total}</td>
                  <td className="num mono">{p.completed ? `${p.onTimePct}%` : "-"}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{p.total ? p.score : "-"}</td>
                </tr>
              )) : (
                <tr><td colSpan={8} style={{ padding: 16, color: "var(--text-3)" }}>{loading ? "กำลังโหลด..." : "ยังไม่มีผู้ใช้ฝ่าย RD ในระบบ"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
