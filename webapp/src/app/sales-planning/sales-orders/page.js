"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CircleDollarSign, ClipboardCheck, ClipboardList, Search } from "lucide-react";
import SaWorkspace, { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import DetailRow from "@/components/ui/DetailRow";
import Select from "@/components/ui/Select";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney } from "@/lib/format";

const STATUS = { draft: "ฉบับร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" };
function statusBadge(status) {
  const color = { draft: "var(--text-3)", pending_approval: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--red)" }[status] || "var(--text-3)";
  return <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>{STATUS[status] || status}</span>;
}

export default function SalesOrdersPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/sales-orders");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โหลด Sale Order ไม่สำเร็จ");
      setRows(data);
    } catch (err) {
      setError(err.message || "โหลด Sale Order ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      return !q || [row.orderNumber, row.customerName, row.deal?.title, row.quotation?.quoteNumber]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [query, rows, status]);

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending_approval").length,
    approved: rows.filter((row) => row.status === "approved").length,
    actual: rows.reduce((sum, row) => sum + (row.status === "approved" ? Number(row.actualAmount) || 0 : 0), 0),
  }), [rows]);

  if (!canView) return <SaWorkspace icon={<ClipboardList size={22} />} title="Sale Order"><div className="glass-panel" style={{ padding: 16 }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div></SaWorkspace>;

  return (
    <SaWorkspace icon={<ClipboardList size={22} />} title="Sale Order" subtitle="สร้างจาก QT Won ตรวจสอบเอกสาร และนับ Actual หลัง AE Supervisor อนุมัติเท่านั้น">
      <div className="flex flex-col gap-4">
        {error && <div className="glass-panel" role="alert" style={{ padding: 14, color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}

        <SaMetricStrip>
          <SaMetric icon={<ClipboardList />} label="Sale Order ทั้งหมด" value={summary.total} note="เอกสารในขอบเขตที่คุณดูได้" />
          <SaMetric icon={<ClipboardCheck />} label="รอตรวจอนุมัติ" value={summary.pending} note="รอ AE Supervisor ดำเนินการ" tone={summary.pending ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="อนุมัติแล้ว" value={summary.approved} note="เอกสารที่ถูกนับเป็น Actual" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="Actual ก่อน VAT" value={fmtMoney(summary.actual)} note="รวมเฉพาะ SO ที่อนุมัติแล้ว" tone="good" />
        </SaMetricStrip>

        <SaSection icon={<ClipboardList size={17} />} title="รายการ Sale Order" subtitle="ค้นหา ตรวจเอกสาร และติดตามขั้นตอนอนุมัติจากจุดเดียว" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 330 }}><Search size={16} color="var(--text-3)" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข SO / QT / ลูกค้า / ดีล" /></div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="premium-select" style={{ width: 170 }}>
              <option value="all">ทุกสถานะ</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <div className="spacer" />
          </div>
          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead><tr><th>เลขที่ SO</th><th>ลูกค้า / ดีล</th><th>อ้างอิง QT</th><th>วันที่ SO</th><th className="num">Actual ก่อน VAT</th><th>สถานะ</th></tr></thead>
              <tbody>
                {filtered.map((row) => (
                  <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                    <td><Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono"><strong>{row.orderNumber}</strong></Link></td>
                    <td>{row.customerName || "-"}<span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{row.deal?.title || "-"}</span></td>
                    <td><Link prefetch={false} href={`/sa/quotations/${row.quotationId}`} className="linklike mono">{row.quotation?.quoteNumber || "-"}</Link></td>
                    <td>{fmtDate(row.orderDate)}</td><td className="num mono">{fmtMoney(row.status === "approved" ? row.actualAmount : 0)}</td><td>{statusBadge(row.status)}</td>
                  </DetailRow>
                ))}
                {!filtered.length && !loading && <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มี Sale Order — เปิด QT ที่ Won แล้วกดสร้าง SO เพื่อตรวจสอบและยื่นอนุมัติ</td></tr>}
              </tbody>
            </table>
          </div>
        </SaSection>
      </div>
    </SaWorkspace>
  );
}
