"use client";
// หน้ารวมเรื่องสอบถาม–ตอบกลับ (Sale ↔ RD) — ฝั่งขายเห็นตาม scope ดีลของตัวเอง,
// ฝ่ายผู้ตอบ (rd) เห็นทุกเรื่องของฝ่ายตน. คิวเรียงตามวันที่ RD รับปากว่าจะตอบ.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock3, MessageCircleQuestion, Plus } from "lucide-react";
import SaWorkspace, { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import InquiryCreateModal from "@/components/salesPlanning/InquiryCreateModal";
import { InquiryStatusBadge, inquiryDueTone } from "@/components/salesPlanning/inquiryUi";
import { compareInquiryUrgency } from "@/lib/inquiries";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useRole } from "@/lib/roleContext";
import { can } from "@/lib/permissions";

const FILTERS = [
  { key: "active", label: "ค้างอยู่" },
  { key: "open", label: "รอตอบ" },
  { key: "answered", label: "ตอบแล้ว" },
  { key: "closed", label: "ปิดเรื่อง" },
  { key: "", label: "ทั้งหมด" },
];

export default function InquiriesPage() {
  const role = useRole();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [todayISO, setTodayISO] = useState(null);
  useEffect(() => {
    const d = new Date();
    setTodayISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/sales-planning/inquiries${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โหลดรายการไม่สำเร็จ");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // เรื่องรอตอบขึ้นก่อน ในกลุ่มเดียวกันเรียงตามความเร่ง (ยังไม่มีผู้รับ → ใกล้ครบกำหนด)
  const sorted = useMemo(() => {
    const rank = { open: 0, answered: 1, closed: 2 };
    return [...rows].sort((a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      || compareInquiryUrgency(a, b)
      || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [rows]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sorted, { resetKey: `${filter}` });

  const canCreate = can(role, "salesplan:edit");
  const summary = useMemo(() => ({
    total: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    answered: rows.filter((row) => row.status === "answered").length,
    // เลยกำหนด = เลยวันที่ RD รับปากไว้ (เรื่องที่ยังไม่มีผู้รับยังไม่มีกำหนด)
    overdue: rows.filter((row) => row.status === "open" && row.committedDueDate && todayISO && row.committedDueDate < todayISO).length,
  }), [rows, todayISO]);

  return (
    <SaWorkspace
      icon={<MessageCircleQuestion size={22} />}
      title="สอบถาม RD"
      subtitle="ข้อสอบถามจากฝ่ายขายถึงฝ่ายวิจัยและพัฒนา — RD ระบุวันที่จะตอบตอนรับเรื่อง"
      headerRight={canCreate ? (
        <button type="button" className="btn btn-accent" onClick={() => setCreateOpen(true)}>
          <Plus size={15} aria-hidden="true" /> สอบถาม RD
        </button>
      ) : null}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        <SaMetricStrip>
          <SaMetric icon={<Activity />} label="ทั้งหมด" value={summary.total} note="ตามสิทธิ์ที่มองเห็น" />
          <SaMetric icon={<Clock3 />} label="รอตอบ" value={summary.open} note="คิวที่ยังเปิดอยู่" tone={summary.open ? "warning" : "good"} />
          <SaMetric icon={<CheckCircle2 />} label="ตอบแล้ว" value={summary.answered} note="รอปิดหรือดำเนินการต่อ" />
          <SaMetric icon={<AlertTriangle />} label="เลยกำหนด" value={summary.overdue} note="ต้องติดตามทันที" tone={summary.overdue ? "danger" : "good"} />
        </SaMetricStrip>

        <SaSection
          icon={<MessageCircleQuestion size={17} />}
          title="คิวสอบถาม RD"
          subtitle="เรียงเรื่องที่รอตอบและใกล้ครบกำหนดขึ้นก่อน"
          actions={<div className="segmented">{FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={filter === f.key ? "active" : ""}>{f.label}</button>
          ))}</div>}
        >
          <div className="premium-glass-table table-responsive">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>เลขที่</th><th>เรื่อง</th><th>ดีล / ลูกค้า</th><th>ผู้ถาม</th><th>ผู้รับเรื่อง</th><th>วันที่ตอบ</th><th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 18, color: "var(--text-3)" }}>กำลังโหลด...</td></tr>
              ) : sorted.length ? pageRows.map((row) => {
                const due = inquiryDueTone(row, todayISO);
                return (
                  <tr key={row.id} className="premium-row">
                    <td className="mono"><Link href={`/sa/inquiries/${row.id}`} className="linklike">{row.code || row.id}</Link></td>
                    <td>
                      <Link href={`/sa/inquiries/${row.id}`} className="linklike" style={{ fontWeight: 600 }}>{row.title}</Link>
                      {row.urgent && <span className="ui-badge" style={{ color: "var(--red)", marginLeft: 6 }}>ด่วน</span>}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.dealId ? <Link href={`/sales-planning/deals/${row.dealId}`} className="linklike">เปิดดีล</Link> : <span style={{ color: "var(--text-3)" }}>-</span>}
                    </td>
                    <td>{row.requesterName || "-"}</td>
                    <td>{row.assigneeName || <span style={{ color: "var(--text-3)" }}>ยังไม่มีผู้รับ</span>}</td>
                    <td className="mono">
                      <div>SA คาดหวัง: {row.requestedDueDate ? fmtDate(row.requestedDueDate) : "-"}</div>
                      <div>RD จะตอบ: {row.committedDueDate ? fmtDate(row.committedDueDate) : <span style={{ color: "var(--text-3)" }}>ยังไม่รับเรื่อง</span>}</div>
                      {due && <span className="ui-badge" style={{ color: due.color }}>{due.label}</span>}
                    </td>
                    <td><InquiryStatusBadge status={row.status} /></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7} style={{ padding: 18, color: "var(--text-3)" }}>
                  ไม่มีเรื่องสอบถาม{canCreate ? " — กด \"สอบถาม RD\" เพื่อส่งคำถามแรก" : ""}
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
          {!loading && sorted.length > 0 && (
            <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          )}
          {!loading && sorted.length > 0 && (
          <div style={{ marginTop: 12, color: "var(--text-3)", fontSize: 12 }}>
            {sorted.length} เรื่อง · อัปเดตล่าสุด {fmtDateTime(sorted[0]?.updatedAt || sorted[0]?.createdAt)}
          </div>
          )}
        </SaSection>
      </div>

      <InquiryCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />
    </SaWorkspace>
  );
}
