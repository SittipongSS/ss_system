"use client";
import { useEffect, useState } from "react";
import { FileText, Plus, Pencil, Search, LayoutGrid, Table2, ChevronRight } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import Modal from "@/components/Modal";
import OrderDetailModal from "@/components/OrderDetailModal";
import ReceiveModal from "@/components/ReceiveModal";
import EditOrderModal from "@/components/EditOrderModal";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import TaxStageRail from "@/components/tax/TaxStageRail";
import StagePill from "@/components/tax/StagePill";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { TRACK2, deptOf } from "@/lib/tax/status";

// SA payment workspace (Track 2). Create a tax-payment request from approved
// registrations, receive money, and fix bounced orders. Redesigned: stage rail
// (clickable filter) + card/table responsive list. Modals/API unchanged.
export default function SalesPayment() {
  const role = useRole();
  const dept = deptOf(role);
  const canAct = useCan("sales:act");
  const [registrations, setRegistrations] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/excise-registrations") && apiCache.has("/api/orders")),
  );
  const [userName, setUserName] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);

  const emptyForm = {
    customerId: "", quotationRef: "", poReference: "", deliveryDate: "", remarks: "",
    items: [{ registrationId: "", quantity: "" }],
  };
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setItem = (idx, patch) =>
    setFormData((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const addItem = () => setFormData((f) => ({ ...f, items: [...f.items, { registrationId: "", quantity: "" }] }));
  const removeItem = (idx) => setFormData((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const fetchData = async () => {
    // Independent fetches: registrations must still populate the create form
    // even if the orders endpoint is unavailable.
    const [resRegs, resOrders] = await Promise.all([
      fetch("/api/excise-registrations").catch(() => null),
      fetch("/api/orders").catch(() => null),
    ]);
    if (resRegs?.ok) { const p = await resRegs.json(); apiCache.set("/api/excise-registrations", p); setRegistrations(p); }
    if (resOrders?.ok) { const o = await resOrders.json(); apiCache.set("/api/orders", o); setOrders(o); }
    setLoading(false);
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const c = await res.json();
        apiCache.set("/api/customers", c);
        setCustomers(c);
      }
    } catch (err) {
      console.error("Error fetching customers", err);
    }
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "Sales User");
    fetchData();
    fetchCustomers();
  }, []);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!formData.customerId) { alert("กรุณาเลือกลูกค้า"); return; }
    const items = formData.items
      .filter((it) => it.registrationId && it.quantity)
      .map((it) => ({ registrationId: it.registrationId, quantity: it.quantity }));
    if (items.length === 0) { alert("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ"); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: formData.customerId, quotationRef: formData.quotationRef,
          poReference: formData.poReference, deliveryDate: formData.deliveryDate,
          remarks: formData.remarks, items, assignee: userName,
        }),
      });
      if (res.ok) {
        setFormData(emptyForm);
        setShowForm(false);
        await fetchData();
      } else {
        const errData = await res.json();
        alert("เกิดข้อผิดพลาด: " + (errData.error || "ไม่สามารถสร้างใบสั่งซื้อได้"));
      }
    } catch (err) {
      alert("Error creating order");
    }
    setIsSubmitting(false);
  };

  const approvedRegs = registrations.filter((r) => r.status === "approved");
  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const formRegs = selectedCustomer ? approvedRegs.filter((r) => r.customerId === selectedCustomer.id) : [];

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
    return [o.quotationRef, o.poReference, o.customerName].some((v) => (v || "").toLowerCase().includes(q));
  });
  const sort = useSortableTable(list, {
    ref: (o) => o.quotationRef || "",
    customer: (o) => o.customerName || "",
    itemCount: (o) => o.items?.length || 0,
    totalTax: (o) => o.totalTax || 0,
    status: (o) => o.status || "",
  });

  const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));
  const FILTERS = [
    { key: "pending", label: `รอรับเงิน (${counts.pending})` },
    { key: "rejected", label: `ถูกตีกลับ (${rejectedCount})` },
    { key: "complete", label: `ชำระแล้ว (${counts.complete})` },
  ];

  // Action buttons for an order, by status (SA can only act on pending/rejected).
  const rowActions = (o) => {
    if (!canAct) return null;
    const isExempt = (o.totalTax || 0) === 0;
    if (o.status === "pending") {
      return (
        <>
          <button onClick={() => setEditTarget(o)} className="btn-icon" title="แก้ไข"><Pencil size={15} /></button>
          <button onClick={() => setReceiveTarget(o)} className="btn btn-primary px-4">{isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว"}</button>
        </>
      );
    }
    if (o.status === "rejected") {
      return <button onClick={() => setEditTarget(o)} className="btn btn-primary px-4 flex items-center gap-1.5"><Pencil size={14} /> แก้ไขและส่งกลับ</button>;
    }
    return null;
  };

  const headerRight = (
    <>
      <span className="ui-badge danger">รอรับเงิน {counts.pending}</span>
      {canAct && (
        <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={16} /> ยื่นชำระ
        </button>
      )}
    </>
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
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา Ref / PO / ลูกค้า..." />
      </div>
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <TaxWorkspace
      icon={<FileText size={22} />}
      title="ยื่นชำระภาษี"
      subtitle="บันทึกรายการยื่นชำระ / PO รับเงิน และส่งให้ฝ่ายกฎหมายอนุมัติชำระภาษี"
      headerRight={headerRight}
      loading={loading}
      rail={<TaxStageRail track={TRACK2} dept={dept} counts={counts} onStage={(k) => setStatusFilter(k)} />}
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {search ? "ไม่พบรายการ" : "ไม่มีรายการในสถานะนี้"}
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
                <span className="text-[var(--text-3)]">{o.items?.length || 0} รายการ{o.deliveryDate ? ` · ส่ง ${o.deliveryDate}` : ""}</span>
                <span className="font-mono font-bold text-[var(--red)]">{taxText(o)}</span>
              </div>
              {o.status === "rejected" && o.rejectionReason && (
                <div className="text-[11px] text-[var(--red)] bg-[var(--red-soft)] rounded px-2 py-1">{o.rejectionReason}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
                {rowActions(o) || <ChevronRight size={16} className="text-[var(--text-3)]" />}
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
                  {statusFilter === "rejected" && <th>เหตุผลที่ตีกลับ</th>}
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {sort.sorted.map((o) => (
                  <tr key={o.id} className="clickable-row" onClick={() => setSelectedOrder(o)}>
                    <td>
                      <div className="font-semibold text-[var(--text)]">{o.quotationRef}</div>
                      {o.poReference && <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>}
                      {o.deliveryDate && <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">ส่ง: {o.deliveryDate}</div>}
                    </td>
                    <td className="text-[var(--accent)] text-sm">{o.customerName || "-"}</td>
                    <td className="text-center font-bold font-mono text-[var(--text-2)]">{o.items?.length || 0}</td>
                    <td className="num font-bold font-mono text-[var(--red)]">{taxText(o)}</td>
                    {statusFilter === "rejected" && <td className="text-xs text-[var(--red)] max-w-[240px] whitespace-normal">{o.rejectionReason || "-"}</td>}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">{rowActions(o) || <span className="text-[var(--text-3)] text-xs">—</span>}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create order modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="ยื่นชำระภาษีใหม่ (New Payment Request)" size="lg">
        <div className="flex justify-end mb-4">
          <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">Assignee: {userName}</span>
        </div>
        <form onSubmit={handleCreateOrder} className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="form-group col-span-3">
            <label>ลูกค้า <span className="text-[var(--red)]">*</span></label>
            <select value={formData.customerId} required onChange={(e) => setFormData({ ...formData, customerId: e.target.value, items: [{ registrationId: "", quantity: "" }] })} className="premium-select w-full">
              <option value="">-- เลือกลูกค้า --</option>
              {customers.map((c) => (<option key={c.id} value={c.id}>{c.arCode} : {c.name}</option>))}
            </select>
            <span className="text-[11px] text-[var(--text-3)] mt-1">เลือกลูกค้าก่อน รายการสินค้าจะแสดงเฉพาะของลูกค้ารายนี้</span>
          </div>
          <div className="form-group">
            <label>เลขที่ใบเสนอราคา <span className="text-[var(--red)]">*</span></label>
            <input type="text" value={formData.quotationRef} onChange={(e) => setFormData({ ...formData, quotationRef: e.target.value })} required placeholder="เช่น QT-2026-001" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>PO Reference <span className="text-[var(--text-3)] text-xs">(ไม่บังคับ)</span></label>
            <input type="text" value={formData.poReference} onChange={(e) => setFormData({ ...formData, poReference: e.target.value })} placeholder="เลขที่ใบสั่งซื้อลูกค้า" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>วันที่คาดว่าจะส่ง (Expected Date)</label>
            <input type="date" value={formData.deliveryDate} onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })} className="premium-input w-full" />
          </div>

          <div className="col-span-3">
            <div className="flex items-center justify-between mb-2">
              <label className="!mb-0">รายการสินค้า <span className="text-[var(--red)]">*</span></label>
              <button type="button" onClick={addItem} className="btn btn-sm flex items-center gap-1"><Plus size={14} /> เพิ่มรายการ</button>
            </div>
            <div className="space-y-2">
              {formData.items.map((it, idx) => {
                const reg = formRegs.find((r) => r.id === it.registrationId);
                const taxPerUnit = reg ? (reg.isExciseTaxable === false ? 0 : (reg.exciseTax || 0) + (reg.localTax || 0)) : 0;
                return (
                  <div key={idx}>
                    <div className="flex gap-2 items-start">
                      <select value={it.registrationId} onChange={(e) => setItem(idx, { registrationId: e.target.value })} required className="premium-select flex-1">
                        <option value="">{selectedCustomer ? "-- เลือกสินค้า (เฉพาะที่อนุมัติแล้ว) --" : "-- เลือกลูกค้าก่อน --"}</option>
                        {formRegs.map((r) => (<option key={r.id} value={r.id}>{r.fgCode} | {r.productName}</option>))}
                      </select>
                      <input type="number" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} required min="1" placeholder="จำนวน" className="premium-input w-28 font-mono" />
                      <button type="button" onClick={() => removeItem(idx)} disabled={formData.items.length === 1} className="btn px-3 text-[var(--red)] disabled:opacity-30" title="ลบรายการ">✕</button>
                    </div>
                    {reg && (
                      <div className="flex gap-4 mt-1 ml-1 text-[11px] text-[var(--text-3)] font-mono">
                        <span>ภาษี/ชิ้น: <span className="font-semibold text-[var(--text-2)]">{taxPerUnit > 0 ? fmtMoney(taxPerUnit) : "ยกเว้น"}</span></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-group col-span-3">
            <label>หมายเหตุ (Remarks)</label>
            <input type="text" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="ข้อมูลเพิ่มเติม" className="premium-input w-full" />
          </div>
          <div className="col-span-3 flex justify-end gap-2 mt-2 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary px-8">{isSubmitting ? "กำลังบันทึก..." : "บันทึกรายการยื่นชำระ"}</button>
          </div>
        </form>
      </Modal>

      <ReceiveModal open={!!receiveTarget} order={receiveTarget} onClose={() => setReceiveTarget(null)} onConfirmed={fetchData} />
      <EditOrderModal open={!!editTarget} order={editTarget} registrations={registrations} onClose={() => setEditTarget(null)} onSaved={fetchData} />
      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </TaxWorkspace>
  );
}
