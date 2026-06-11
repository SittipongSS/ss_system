"use client";
import { useEffect, useState } from "react";
import { FileText, Plus, Pencil } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import Modal from "@/components/Modal";
import OrderDetailModal from "@/components/OrderDetailModal";
import ReceiveModal from "@/components/ReceiveModal";
import EditOrderModal from "@/components/EditOrderModal";

export default function SalesDashboard() {
  const canAct = useCan("sales:act");
  const [registrations, setRegistrations] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/excise-registrations") && apiCache.has("/api/orders")),
  );
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);

  const emptyForm = {
    customerId: "",
    quotationRef: "",
    poReference: "",
    deliveryDate: "",
    remarks: "",
    items: [{ registrationId: "", quantity: "" }],
  };
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setItem = (idx, patch) =>
    setFormData((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const addItem = () =>
    setFormData((f) => ({ ...f, items: [...f.items, { registrationId: "", quantity: "" }] }));
  const removeItem = (idx) =>
    setFormData((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const fetchData = async () => {
    try {
      const [resRegs, resOrders] = await Promise.all([
        fetch("/api/excise-registrations"),
        fetch("/api/orders"),
      ]);
      if (resRegs.ok && resOrders.ok) {
        const [p, o] = await Promise.all([resRegs.json(), resOrders.json()]);
        apiCache.set("/api/excise-registrations", p);
        apiCache.set("/api/orders", o);
        setRegistrations(p);
        setOrders(o);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
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
    if (!formData.customerId) {
      alert("กรุณาเลือกลูกค้า");
      return;
    }
    const items = formData.items
      .filter((it) => it.registrationId && it.quantity)
      .map((it) => ({ registrationId: it.registrationId, quantity: it.quantity }));
    if (items.length === 0) {
      alert("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: formData.customerId,
          quotationRef: formData.quotationRef,
          poReference: formData.poReference,
          deliveryDate: formData.deliveryDate,
          remarks: formData.remarks,
          items,
          assignee: userName,
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
  // Form shows only the selected customer's approved registrations (1 order = 1 customer).
  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const formRegs = selectedCustomer
    ? approvedRegs.filter((r) => r.customerId === selectedCustomer.id)
    : [];
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const rejectedOrders = orders.filter((o) => o.status === "rejected");
  const list = activeTab === "pending" ? pendingOrders : rejectedOrders;

  return (
    <>
      <div
        className="premium-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <FileText size={22} />
            </span>{" "}
            ยื่นชำระภาษี
          </h1>
          <p>บันทึกรายการยื่นชำระ / PO รับเงิน และส่งให้ฝ่ายกฎหมายอนุมัติชำระภาษี</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill danger">รอรับเงิน {pendingOrders.length} รายการ</div>
          {canAct && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-1.5">
              <Plus size={16} /> ยื่นชำระ
            </button>
          )}
        </div>
      </div>

      <div className="tabs-header">
        <button onClick={() => setActiveTab("pending")} className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}>
          รอรับเงิน ({pendingOrders.length})
        </button>
        <button onClick={() => setActiveTab("rejected")} className={`tab-btn ${activeTab === "rejected" ? "active" : ""}`}>
          ถูกตีกลับ ({rejectedOrders.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <div className="glass-panel">
          <div className="px-4 py-3.5 border-b border-[var(--border)] flex justify-between items-center">
            <h3 className="font-semibold text-sm text-[var(--text)] ">
              {activeTab === "pending" ? "รายการรอรับเงิน" : "รายการที่ถูกตีกลับให้แก้ไข"} ({list.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Ref/Date</th>
                  <th className="text-center">จำนวนรายการ</th>
                  <th className="num">ยอดภาษีรวม</th>
                  {activeTab === "rejected" && <th>เหตุผลที่ตีกลับ</th>}
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === "rejected" ? 5 : 4} className="text-center py-10 text-[var(--text-3)]">
                      {activeTab === "pending" ? "ไม่มีออเดอร์รอรับเงิน" : "ไม่มีรายการที่ถูกตีกลับ"}
                    </td>
                  </tr>
                ) : (
                  list.map((o) => {
                    const isExempt = (o.totalTax || 0) === 0;
                    const itemCount = o.items?.length || 0;
                    return (
                      <tr
                        key={o.id}
                        className="clickable-row hover:bg-[var(--red-soft)]"
                        onClick={() => setSelectedOrder(o)}
                      >
                        <td>
                          <div className="font-semibold text-[var(--text)] ">{o.quotationRef}</div>
                          <div className="text-[11px] text-[var(--accent)] mt-0.5">{o.customerName || o.items?.[0]?.registration?.customerName || "-"}</div>
                          {o.poReference && (
                            <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>
                          )}
                          <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">ส่ง: {o.deliveryDate}</div>
                          <div className="text-[11px] text-[var(--accent)] font-semibold mt-1">{o.assignee}</div>
                        </td>
                        <td className="text-center font-bold text-base font-mono text-[var(--text-2)] ">{itemCount}</td>
                        <td className="num font-bold text-[var(--red)] text-lg font-mono">
                          {isExempt ? (
                            <span className="status-pill success text-xs font-sans">ยกเว้นภาษี 0.00 บาท</span>
                          ) : (
                            fmtMoney(o.totalTax)
                          )}
                        </td>
                        {activeTab === "rejected" && (
                          <td className="text-xs text-[var(--red)] max-w-[240px] whitespace-normal">{o.rejectionReason || "-"}</td>
                        )}
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          {canAct ? (
                            activeTab === "pending" ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => setEditTarget(o)} className="btn px-3 flex items-center gap-1 text-[var(--text-2)]" title="แก้ไข">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => setReceiveTarget(o)} className="btn btn-primary px-4">
                                  {isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว"}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setEditTarget(o)} className="btn btn-primary px-4 flex items-center gap-1.5 mx-auto">
                                <Pencil size={14} /> แก้ไขและส่งกลับ
                              </button>
                            )
                          ) : (
                            <span className="text-[var(--text-3)] text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create order modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="ยื่นชำระภาษีใหม่ (New Payment Request)" size="lg">
        <div className="flex justify-end mb-4">
          <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
            Assignee: {userName}
          </span>
        </div>
        <form onSubmit={handleCreateOrder} className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="form-group col-span-3">
            <label>ลูกค้า <span className="text-[var(--red)]">*</span></label>
            <select
              value={formData.customerId}
              required
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value, items: [{ registrationId: "", quantity: "" }] })}
              className="premium-select w-full"
            >
              <option value="">-- เลือกลูกค้า --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.arCode} : {c.name}</option>
              ))}
            </select>
            <span className="text-[11px] text-[var(--text-3)] mt-1">เลือกลูกค้าก่อน รายการสินค้าจะแสดงเฉพาะของลูกค้ารายนี้</span>
          </div>
          <div className="form-group">
            <label>เลขที่ใบเสนอราคา <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="quotationRef" value={formData.quotationRef} onChange={(e) => setFormData({ ...formData, quotationRef: e.target.value })} required placeholder="เช่น QT-2026-001" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>PO Reference <span className="text-[var(--text-3)] text-xs">(ไม่บังคับ)</span></label>
            <input type="text" name="poReference" value={formData.poReference} onChange={(e) => setFormData({ ...formData, poReference: e.target.value })} placeholder="เลขที่ใบสั่งซื้อลูกค้า" className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>วันที่คาดว่าจะส่ง (Expected Date)</label>
            <input type="date" name="deliveryDate" value={formData.deliveryDate} onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })} className="premium-input w-full" />
          </div>

          {/* Line items */}
          <div className="col-span-3">
            <div className="flex items-center justify-between mb-2">
              <label className="!mb-0">รายการสินค้า <span className="text-[var(--red)]">*</span></label>
              <button type="button" onClick={addItem} className="btn btn-sm flex items-center gap-1">
                <Plus size={14} /> เพิ่มรายการ
              </button>
            </div>
            <div className="space-y-2">
              {formData.items.map((it, idx) => {
                const reg = formRegs.find((r) => r.id === it.registrationId);
                const taxPerUnit = reg
                  ? (reg.isExciseTaxable === false ? 0 : (reg.exciseTax || 0) + (reg.localTax || 0))
                  : 0;
                return (
                  <div key={idx}>
                    <div className="flex gap-2 items-start">
                      <select
                        value={it.registrationId}
                        onChange={(e) => setItem(idx, { registrationId: e.target.value })}
                        required
                        className="premium-select flex-1"
                      >
                        <option value="">{selectedCustomer ? "-- เลือกสินค้า (เฉพาะที่อนุมัติแล้ว) --" : "-- เลือกลูกค้าก่อน --"}</option>
                        {formRegs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.fgCode} | {r.productName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={it.quantity}
                        onChange={(e) => setItem(idx, { quantity: e.target.value })}
                        required
                        min="1"
                        placeholder="จำนวน"
                        className="premium-input w-28 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={formData.items.length === 1}
                        className="btn px-3 text-[var(--red)] disabled:opacity-30"
                        title="ลบรายการ"
                      >
                        ✕
                      </button>
                    </div>
                    {reg && (
                      <div className="flex gap-4 mt-1 ml-1 text-[11px] text-[var(--text-3)] font-mono">
                        <span>
                          ภาษี/ชิ้น:{" "}
                          <span className="font-semibold text-[var(--text-2)]">
                            {taxPerUnit > 0 ? fmtMoney(taxPerUnit) : "ยกเว้น"}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-group col-span-3">
            <label>หมายเหตุ (Remarks)</label>
            <input type="text" name="remarks" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="ข้อมูลเพิ่มเติม" className="premium-input w-full" />
          </div>
          <div className="col-span-3 flex justify-end gap-2 mt-2 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary px-8">
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกรายการยื่นชำระ"}
            </button>
          </div>
        </form>
      </Modal>

      <ReceiveModal open={!!receiveTarget} order={receiveTarget} onClose={() => setReceiveTarget(null)} onConfirmed={fetchData} />
      <EditOrderModal open={!!editTarget} order={editTarget} registrations={registrations} onClose={() => setEditTarget(null)} onSaved={fetchData} />
      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </>
  );
}
