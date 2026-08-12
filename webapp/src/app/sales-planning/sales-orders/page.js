"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleDollarSign, ClipboardCheck, ClipboardList, Search } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney } from "@/lib/format";

const STATUS = { draft: "ฉบับร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" };
function statusBadge(status, className = "") {
  const color = { draft: "var(--text-3)", pending_approval: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--red)" }[status] || "var(--text-3)";
  // ขอบ/พื้นมาจาก .ui-badge ที่ derive จาก currentColor อยู่แล้ว — ตั้ง color พอ
  return <span className={["ui-badge", className].filter(Boolean).join(" ")} style={{ color }}>{STATUS[status] || status}</span>;
}

export default function SalesOrdersPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  /* ⭐ `?count=salesOrders` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายนับ "ใบของฉันที่ถูก
     ตีกลับ" ⇒ กรองด้วยธง `_waitingOnMe` จาก server ไม่ใช่ status='rejected' เฉย ๆ
     (ใบที่คนอื่นโดนตีกลับก็ status เดียวกัน แต่ไม่ใช่ของค้างของเรา) */
  const navCountParam = useSearchParams().get("count") || "";
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(navCountParam === "salesOrders");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/sales-orders");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โหลดใบสั่งขายไม่สำเร็จ");
      setRows(data);
    } catch (err) {
      setError(err.message || "โหลดใบสั่งขายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // รอยต่อ SO อนุมัติ → ใบยื่นชำระภาษี. ใช้ endpoint เดิมของโมดูลภาษี (?available=1)
  // ซึ่งกรอง "อนุมัติแล้ว + ยังไม่มีใบยื่น + มีสินค้าสรรพสามิตจริง" ให้ครบแล้ว —
  // ห้ามนับเองที่นี่ ไม่งั้น SO ที่ขายของนอกพิกัดจะค้างในตัวเลขตลอดกาล
  // ไม่มีสิทธิ์ sales:act (403) หรือยิงไม่ผ่าน = ไม่ต้องมีแถบเตือน ไม่ใช่เรื่องของคนดูอย่างเดียว
  const [awaitingFiling, setAwaitingFiling] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/tax/orders/from-sales-order?available=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && data?.schemaReady) setAwaitingFiling((data.salesOrders || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (waitingOnMeOnly && !row._waitingOnMe) return false;
      if (status !== "all" && row.status !== status) return false;
      return !q || [row.orderNumber, row.customerName, row.deal?.title, row.quotation?.quoteNumber]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [query, rows, status, waitingOnMeOnly]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, { resetKey: `${query}|${status}|${waitingOnMeOnly}` });

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending_approval").length,
    approved: rows.filter((row) => row.status === "approved").length,
    actual: rows.reduce((sum, row) => sum + (row.status === "approved" ? Number(row.actualAmount) || 0 : 0), 0),
  }), [rows]);

  if (!canView) return <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย"><div className="glass-panel" style={{ padding: 16 }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div></SaWorkspace>;

  return (
    <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย" subtitle="สร้างจาก QT Won ตรวจสอบเอกสาร และนับ Actual หลัง AE Supervisor อนุมัติเท่านั้น">
      <div className="flex flex-col gap-4">
        {error && <div className="glass-panel" role="alert" style={{ padding: 14, color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}

        {awaitingFiling > 0 && (
          <StatusNotice
            tone="warning"
            title={`ใบสั่งขาย ${awaitingFiling} ใบรอออกใบยื่นชำระภาษี`}
            action={<Link href="/tax/filings" className="linklike">เปิดหน้ายื่นชำระ</Link>}
          >
            อนุมัติแล้วและมีสินค้าสรรพสามิตอยู่ในใบ แต่ยังไม่ได้สร้างใบยื่นต่อกรมสรรพสามิต
          </StatusNotice>
        )}

        <SaMetricStrip>
          <SaMetric icon={<ClipboardList />} label="ใบสั่งขายทั้งหมด" value={summary.total} note="เอกสารในขอบเขตที่คุณดูได้" />
          <SaMetric icon={<ClipboardCheck />} label="รอตรวจอนุมัติ" value={summary.pending} note="รอ AE Supervisor ดำเนินการ" tone={summary.pending ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="อนุมัติแล้ว" value={summary.approved} note="เอกสารที่ถูกนับเป็น Actual" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="Actual ก่อน VAT" value={fmtMoney(summary.actual)} note="รวมเฉพาะ SO ที่อนุมัติแล้ว" tone="good" />
        </SaMetricStrip>

        <SaSection icon={<ClipboardList size={17} />} title="รายการใบสั่งขาย" subtitle="ค้นหา ตรวจเอกสาร และติดตามขั้นตอนอนุมัติจากจุดเดียว" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          <div className="toolbar">
            <div className="search-glass" style={{ width: 330 }}><Search size={16} color="var(--text-3)" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข SO / QT / ลูกค้า / ดีล" /></div>
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันลงมือ ×</Button>
            )}
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="premium-select" style={{ width: 170 }}>
              <option value="all">ทุกสถานะ</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <div className="spacer" />
          </div>
          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead><tr><th>เลขที่ SO</th><th>ลูกค้า / ดีล</th><th>อ้างอิง QT</th><th>วันที่ SO</th><th>กำหนดชำระ</th><th className="num">Actual ก่อน VAT</th><th>สถานะ</th></tr></thead>
              <tbody>
                {pageRows.map((row) => (
                  <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                    <td><Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono"><strong>{row.orderNumber}</strong></Link></td>
                    <td>{row.customerName || "-"}<span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{row.deal?.title || "-"}</span></td>
                    <td><Link prefetch={false} href={`/sa/quotations/${row.quotationId}`} className="linklike mono">{row.quotation?.quoteNumber || "-"}</Link></td>
                    <td>{fmtDate(row.orderDate)}</td>
                    <td>{fmtDate(row.paymentDueDate)}</td>
                    {/* ใบที่ยังไม่อนุมัติเคยโชว์ 0.00 ซึ่งอ่านเหมือน "ใบนี้ไม่มีมูลค่า" —
                        โชว์ยอดจริงแต่หรี่สีลง + บอกเหตุ ว่ายังไม่ถูกนับเป็น Actual */}
                    <td className="num mono" style={row.status === "approved" ? undefined : { color: "var(--text-3)" }} title={row.status === "approved" ? undefined : "ยังไม่นับเป็น Actual จนกว่าจะอนุมัติ"}>
                      {fmtMoney(row.actualAmount)}
                    </td>
                    <td>{statusBadge(row.status, "ui-badge-cell ui-badge-w-doc")}</td>
                  </DetailRow>
                ))}
                {!filtered.length && !loading && <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีใบสั่งขาย — เปิด QT ที่ Won แล้วกดสร้าง SO เพื่อตรวจสอบและยื่นอนุมัติ</td></tr>}
              </tbody>
            </table></TableScroll>
          </div>
          {filtered.length > 0 && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
      </div>
    </SaWorkspace>
  );
}
