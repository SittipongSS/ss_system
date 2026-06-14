"use client";
import { useEffect, useState } from "react";
import { ReceiptText, Search, LayoutGrid, Table2 } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDate } from "@/lib/format";
import OrderDetailModal from "@/components/OrderDetailModal";
import FileTaxModal from "@/components/FileTaxModal";
import RejectModal from "@/components/RejectModal";
import ConfirmModal from "@/components/tax/ConfirmModal";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import TaxStageRail from "@/components/tax/TaxStageRail";
import StagePill from "@/components/tax/StagePill";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { TRACK2, deptOf } from "@/lib/tax/status";

// LG tax-filing workspace (Track 2): received → filing → complete (+ rejected).
// Redesigned: stage rail (LG lane highlighted, clickable filter) + card/table
// responsive list. Modals/API unchanged.
export default function LegalTax() {
  const role = useRole();
  const dept = deptOf(role);
  const canApprove = useCan("legal:approve");
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/orders"));
  const [statusFilter, setStatusFilter] = useState("received");
  const [search, setSearch] = useState("");
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [fileTarget, setFileTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [startTarget, setStartTarget] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const o = await res.json();
        apiCache.set("/api/orders", o);
        setOrders(o);
      }
    } catch (err) {
      console.error("Error fetching orders", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const patch = async (id, body, errMsg) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { fetchData(); return true; }
    const d = await res.json().catch(() => ({}));
    alert("เกิดข้อผิดพลาด: " + (d.error || errMsg || "ไม่สามารถทำรายการได้"));
    return false;
  };

  const doStartFiling = async () => {
    const ok = await patch(startTarget.id, { status: "filing" });
    if (ok) setStartTarget(null);
  };
  const handleSetDue = (id, value) => patch(id, { taxDueDate: value });
  const handleReject = async (reason) => {
    const ok = await patch(rejectTarget.id, { status: "rejected", rejectionReason: reason });
    if (ok) setRejectTarget(null);
  };

  const counts = {
    pending: orders.filter((o) => o.status === "pending").length,
    received: orders.filter((o) => o.status === "received").length,
    filing: orders.filter((o) => o.status === "filing").length,
    complete: orders.filter((o) => o.status === "complete").length,
  };
  const rejectedCount = orders.filter((o) => o.status === "rejected").length;

  const q = search.trim().toLowerCase();
  const list = orders.filter((o) => {
    if (o.status !== statusFilter) return false;
    if (!q) return true;
    return [o.quotationRef, o.poReference, o.customerName, o.exciseReceiptNumber].some((v) => (v || "").toLowerCase().includes(q));
  });
  const sort = useSortableTable(list, {
    ref: (o) => o.quotationRef || "",
    customer: (o) => o.customerName || "",
    itemCount: (o) => o.items?.length || 0,
    totalTax: (o) => o.totalTax || 0,
    taxDueDate: (o) => (o.taxDueDate ? new Date(o.taxDueDate).getTime() : null),
    receipt: (o) => o.exciseReceiptNumber || "",
    rejectionReason: (o) => o.rejectionReason || "",
  });

  const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));

  const FILTERS = [
    { key: "received", label: `รอยื่น (${counts.received})` },
    { key: "filing", label: `กำลังยื่น (${counts.filing})` },
    { key: "complete", label: `ชำระแล้ว (${counts.complete})` },
    { key: "rejected", label: `ตีกลับ (${rejectedCount})` },
  ];

  const rowActions = (o) => {
    if (!canApprove) return o.status === "complete" ? <span className="status-pill success text-xs">ชำระแล้ว</span> : <span className="text-[var(--text-3)] text-xs">รอฝ่ายกฎหมาย</span>;
    const isExempt = (o.totalTax || 0) === 0;
    if (o.status === "received") {
      return (
        <>
          {isExempt
            ? <button onClick={() => setFileTarget(o)} className="btn btn-primary px-4">ยืนยันชำระ</button>
            : <button onClick={() => setStartTarget(o)} className="btn btn-primary px-4">เริ่มยื่น</button>}
          <button onClick={() => setRejectTarget(o)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
        </>
      );
    }
    if (o.status === "filing") {
      return (
        <>
          <button onClick={() => setFileTarget(o)} className="btn btn-primary px-4">บันทึกชำระภาษี</button>
          <button onClick={() => setRejectTarget(o)} className="btn px-3 text-[var(--red)]">ตีกลับ</button>
        </>
      );
    }
    if (o.status === "complete") return <span className="status-pill success text-xs">ชำระแล้ว</span>;
    return null;
  };

  const headerRight = (
    <span className="ui-badge warn">
      รอดำเนินการ <strong className="font-mono ml-1">{counts.received + counts.filing}</strong>
    </span>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="segmented">
        {FILTERS.map((f) => (
          <button key={f.key} className={statusFilter === f.key ? "active" : ""} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="spacer" />
      <div className="search-glass" style={{ width: "220px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา Ref / PO / ลูกค้า / ใบเสร็จ..." />
      </div>
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <TaxWorkspace
      icon={<ReceiptText size={22} />}
      title="อนุมัติชำระภาษี"
      subtitle="ตรวจอนุมัติและยื่นชำระภาษีสรรพสามิต พร้อมบันทึกใบเสร็จกรมสรรพสามิต"
      headerRight={headerRight}
      loading={loading}
      rail={<TaxStageRail track={TRACK2} dept={dept} counts={counts} onStage={(k) => setStatusFilter(k)} />}
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {search ? "ไม่พบรายการที่ค้นหา" : "ไม่มีรายการในสถานะนี้"}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sort.sorted.map((o) => (
            <div key={o.id} onClick={() => setSelectedOrder(o)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text)] text-sm">{o.quotationRef}</div>
                  <div className="text-[11px] text-[var(--accent)] mt-0.5 truncate">{o.customerName || "-"}</div>
                </div>
                <StagePill status={o.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-3)]">{o.items?.length || 0} รายการ</span>
                <span className="font-mono font-bold text-[var(--red)]">{taxText(o)}</span>
              </div>
              {o.status === "received" && (
                <div className="flex items-center gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[var(--text-3)]">กำหนดยื่น:</span>
                  <input type="date" value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""} onChange={(e) => handleSetDue(o.id, e.target.value)} disabled={!canApprove} className="premium-input text-xs" style={{ maxWidth: 150 }} />
                </div>
              )}
              {o.status === "complete" && (
                <div className="text-[11px] font-mono text-[var(--text-2)]">ใบเสร็จ: {o.exciseReceiptNumber || "ยกเว้น"}{o.filedAt && ` · ${fmtDate(o.filedAt)}`}</div>
              )}
              {o.status === "rejected" && o.rejectionReason && (
                <div className="text-[11px] text-[var(--red)] bg-[var(--red-soft)] rounded px-2 py-1">{o.rejectionReason}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
                {rowActions(o)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel">
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="เลขที่ใบเสนอราคา" sortKey="ref" sort={sort} />
                  <SortTh label="ลูกค้า" sortKey="customer" sort={sort} />
                  <SortTh label="รายการ" sortKey="itemCount" sort={sort} className="text-center" />
                  <SortTh label="ยอดภาษีรวม" sortKey="totalTax" sort={sort} className="num" />
                  {statusFilter === "received" && <SortTh label="กำหนดยื่น" sortKey="taxDueDate" sort={sort} />}
                  {statusFilter === "complete" && <SortTh label="ใบเสร็จสรรพสามิต" sortKey="receipt" sort={sort} />}
                  {statusFilter === "rejected" && <SortTh label="เหตุผล" sortKey="rejectionReason" sort={sort} />}
                  {statusFilter !== "rejected" && <th className="text-center">Action</th>}
                </tr>
              </thead>
              <tbody>
                {sort.sorted.map((o) => (
                  <tr key={o.id} className="clickable-row" onClick={() => setSelectedOrder(o)}>
                    <td>
                      <div className="font-semibold text-[var(--text)]">{o.quotationRef}</div>
                      {o.poReference && <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>}
                    </td>
                    <td className="text-[var(--accent)] text-sm">{o.customerName || "-"}</td>
                    <td className="text-center font-mono font-semibold">{o.items?.length || 0}</td>
                    <td className="num font-mono font-bold text-[var(--red)]">{taxText(o)}</td>
                    {statusFilter === "received" && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="date" value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""} onChange={(e) => handleSetDue(o.id, e.target.value)} disabled={!canApprove} className="premium-input text-xs" style={{ maxWidth: 150 }} />
                      </td>
                    )}
                    {statusFilter === "complete" && (
                      <td className="font-mono text-xs text-[var(--text-2)]">
                        {o.exciseReceiptNumber || "ยกเว้น"}
                        {o.filedAt && <div className="text-[var(--text-3)]">{fmtDate(o.filedAt)}</div>}
                      </td>
                    )}
                    {statusFilter === "rejected" && <td className="text-xs text-[var(--red)]">{o.rejectionReason || "-"}</td>}
                    {statusFilter !== "rejected" && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">{rowActions(o)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
      <FileTaxModal open={!!fileTarget} order={fileTarget} onClose={() => setFileTarget(null)} onFiled={fetchData} />
      <RejectModal open={!!rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={handleReject} title="ตีกลับใบสั่งซื้อให้แก้ไข" entityLabel="ใบสั่งซื้อนี้" />
      <ConfirmModal
        open={!!startTarget}
        onClose={() => setStartTarget(null)}
        onConfirm={doStartFiling}
        title="เริ่มยื่นภาษี"
        message={`เริ่มดำเนินการยื่นภาษีสำหรับ ${startTarget?.quotationRef || "รายการนี้"}?`}
        confirmLabel="เริ่มยื่น"
        danger={false}
      />
    </TaxWorkspace>
  );
}
