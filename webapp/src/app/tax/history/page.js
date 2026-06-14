"use client";
import { useEffect, useState } from "react";
import { History, Search, LayoutGrid, Table2, Trash2 } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import OrderDetailModal from "@/components/OrderDetailModal";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import StagePill from "@/components/tax/StagePill";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";

// Unified archive of both tracks: registration history + shipment/payment
// history. Redesigned: TaxWorkspace + StagePill (replaces the inline status
// ternaries) + card/table responsive + branded delete confirm.
export default function TrackingHistory() {
  const canDelete = useCan("sales:delete");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [regs, setRegs] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/excise-registrations") && apiCache.has("/api/orders")),
  );
  const [tab, setTab] = useState("products");
  const [search, setSearch] = useState("");
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  const fetchData = async () => {
    // Fetch the two tracks independently so a failure on one endpoint doesn't
    // blank the other's archive.
    const [resRegs, resOrders] = await Promise.all([
      fetch("/api/excise-registrations").catch(() => null),
      fetch("/api/orders").catch(() => null),
    ]);
    if (resRegs?.ok) { const p = await resRegs.json(); apiCache.set("/api/excise-registrations", p); setRegs(p); }
    if (resOrders?.ok) { const o = await resOrders.json(); apiCache.set("/api/orders", o); setOrders(o); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const doDeleteOrder = async () => {
    const res = await fetch(`/api/orders/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) { setDeleteTarget(null); fetchData(); }
    else { const err = await res.json().catch(() => ({})); alert(err.error || "ไม่สามารถลบข้อมูลได้"); }
  };

  const q = search.trim().toLowerCase();
  const fRegs = q ? regs.filter((r) => [r.fgCode, r.productName, r.customerName, r.assignee].some((v) => (v || "").toLowerCase().includes(q))) : regs;
  const fOrders = q ? orders.filter((o) => [o.quotationRef, o.poReference, o.customerName, o.assignee].some((v) => (v || "").toLowerCase().includes(q))) : orders;

  const regsSort = useSortableTable(fRegs, {
    createdAt: (r) => (r.createdAt ? new Date(r.createdAt).getTime() : null),
    fgCode: (r) => r.fgCode || "",
    customerName: (r) => r.customerName || "",
    status: (r) => r.status || "",
    assignee: (r) => r.assignee || "",
  });
  const ordersSort = useSortableTable(fOrders, {
    createdAt: (o) => (o.createdAt ? new Date(o.createdAt).getTime() : null),
    quotationRef: (o) => o.quotationRef || "",
    itemCount: (o) => o.items?.length || 0,
    totalTax: (o) => o.totalTax || 0,
    status: (o) => o.status || "",
    assignee: (o) => o.assignee || "",
  });

  const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));

  const toolbar = (
    <div className="toolbar">
      <div className="segmented">
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>ขึ้นทะเบียนสินค้า ({regs.length})</button>
        <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>รอบจัดส่ง / ชำระภาษี ({orders.length})</button>
      </div>
      <div className="spacer" />
      <div className="search-glass" style={{ width: "220px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา..." />
      </div>
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  const regsList = regsSort.sorted;
  const ordersList = ordersSort.sorted;
  const empty = <div className="glass-panel p-10 text-center text-[var(--text-3)]">{search ? "ไม่พบรายการที่ค้นหา" : "ไม่มีข้อมูล"}</div>;

  return (
    <TaxWorkspace
      icon={<History size={22} />}
      title="ประวัติทั้งหมด"
      subtitle="ประวัติการขึ้นทะเบียนสินค้าและประวัติรอบจัดส่ง/ชำระภาษีทั้งหมด"
      loading={loading}
      toolbar={toolbar}
    >
      {/* ── Registration history ── */}
      {tab === "products" && (
        regsList.length === 0 ? empty : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {regsList.map((r) => (
              <div key={r.id} onClick={() => (window.location.href = `/tax/register/${r.id}`)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text)] font-mono text-sm">{r.fgCode}</div>
                    <div className="text-[11px] text-[var(--text-3)] mt-0.5 truncate">{r.productName}</div>
                  </div>
                  <StagePill status={r.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-2)]">
                  <span className="truncate">{r.customerName || "-"}</span>
                  <span className="text-[var(--text-3)]">{r.assignee || "-"}</span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-3)] pt-2 border-t border-[var(--border)]">{fmtDateTime(r.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel">
            <div className="premium-table-wrapper border-none">
              <table className="premium-table">
                <thead>
                  <tr>
                    <SortTh label="วันที่ส่งคำขอ" sortKey="createdAt" sort={regsSort} />
                    <SortTh label="สินค้า (FG Code)" sortKey="fgCode" sort={regsSort} />
                    <SortTh label="ลูกค้า" sortKey="customerName" sort={regsSort} />
                    <SortTh label="สถานะล่าสุด" sortKey="status" sort={regsSort} />
                    <SortTh label="ผู้สร้างคำขอ" sortKey="assignee" sort={regsSort} />
                  </tr>
                </thead>
                <tbody>
                  {regsList.map((r) => (
                    <tr key={r.id} onClick={() => (window.location.href = `/tax/register/${r.id}`)} className="clickable-row">
                      <td className="text-[var(--text-2)] text-xs font-mono">{fmtDateTime(r.createdAt)}</td>
                      <td>
                        <div className="font-semibold text-[var(--text)] font-mono">{r.fgCode}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-1">{r.productName}</div>
                      </td>
                      <td className="text-[var(--text-2)] text-xs">{r.customerName || "-"}</td>
                      <td><StagePill status={r.status} /></td>
                      <td className="text-[var(--text-2)] text-xs">{r.assignee || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── Shipment / payment history ── */}
      {tab === "orders" && (
        ordersList.length === 0 ? empty : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ordersList.map((o) => (
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
                  <span className="font-mono font-bold text-[var(--text-2)]">{taxText(o)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <span className="text-[11px] font-mono text-[var(--text-3)]">{fmtDateTime(o.createdAt)}</span>
                  {canDelete && (
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(o); }} className="btn-icon danger" title="ลบ"><Trash2 size={15} /></button>
                  )}
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
                    <SortTh label="วันที่สร้าง Order" sortKey="createdAt" sort={ordersSort} />
                    <SortTh label="เลขที่ใบเสนอราคา" sortKey="quotationRef" sort={ordersSort} />
                    <SortTh label="จำนวนรายการ" sortKey="itemCount" sort={ordersSort} className="text-center" />
                    <SortTh label="ยอดภาษีรวม" sortKey="totalTax" sort={ordersSort} className="num" />
                    <SortTh label="สถานะ" sortKey="status" sort={ordersSort} className="text-center" />
                    <SortTh label="ผู้รับผิดชอบ" sortKey="assignee" sort={ordersSort} />
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersList.map((o) => (
                    <tr key={o.id} onClick={() => setSelectedOrder(o)} className="clickable-row">
                      <td className="text-[var(--text-2)] text-xs font-mono">{fmtDateTime(o.createdAt)}</td>
                      <td>
                        <div className="font-semibold text-[var(--text)]">{o.quotationRef}</div>
                        {o.poReference && <div className="text-[10px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>}
                      </td>
                      <td className="text-center font-mono font-bold text-[var(--text-2)]">{o.items?.length || 0}</td>
                      <td className="num font-bold font-mono text-[var(--text-2)]">{taxText(o)}</td>
                      <td className="text-center"><StagePill status={o.status} /></td>
                      <td className="text-[var(--text-2)] text-xs font-semibold">{o.assignee || "-"}</td>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        {canDelete ? (
                          <button onClick={() => setDeleteTarget(o)} className="btn-icon danger mx-auto" title="ลบรายการนี้"><Trash2 size={16} /></button>
                        ) : <span className="text-[var(--text-3)]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDeleteOrder}
        title="ลบประวัติรอบจัดส่ง"
        message={`ยืนยันการลบ ${deleteTarget?.quotationRef || "รายการนี้"} ออกจากระบบ? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
      />
    </TaxWorkspace>
  );
}
