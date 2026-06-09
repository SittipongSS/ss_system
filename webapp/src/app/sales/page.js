"use client";
import { useEffect, useState } from "react";
import { Truck, Plus } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import Modal from "@/components/Modal";
import OrderDetailModal from "@/components/OrderDetailModal";

export default function SalesDashboard() {
  const canAct = useCan("sales:act");
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/products") && apiCache.has("/api/orders")),
  );
  const [userName, setUserName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const emptyForm = {
    quotationRef: "",
    poReference: "",
    deliveryDate: "",
    remarks: "",
    items: [{ productId: "", quantity: "" }],
  };
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setItem = (idx, patch) =>
    setFormData((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const addItem = () =>
    setFormData((f) => ({ ...f, items: [...f.items, { productId: "", quantity: "" }] }));
  const removeItem = (idx) =>
    setFormData((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const fetchData = async () => {
    try {
      const [resProducts, resOrders] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/orders"),
      ]);
      if (resProducts.ok && resOrders.ok) {
        const [p, o] = await Promise.all([resProducts.json(), resOrders.json()]);
        apiCache.set("/api/products", p);
        apiCache.set("/api/orders", o);
        setProducts(p);
        setOrders(o);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "Sales User");
    fetchData();
  }, []);

  const formatMoney = (amount) =>
    amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    const items = formData.items
      .filter((it) => it.productId && it.quantity)
      .map((it) => ({ productId: it.productId, quantity: it.quantity }));
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

  const handleReceive = async (id, isExempt) => {
    let receiptNumber = null;
    if (!isExempt) {
      receiptNumber = window.prompt("กรุณากรอก เลขที่ Invoice/Receipt/Tax Invoice ของ S&S:");
      if (!receiptNumber) return;
    } else {
      if (!confirm("ออเดอร์นี้ได้รับยกเว้นภาษี ยืนยันว่ารับเงินแล้ว?")) return;
    }

    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "received", receiptNumber }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const errData = await res.json();
        alert("เกิดข้อผิดพลาด: " + (errData.error || "ไม่สามารถทำรายการได้"));
      }
    } catch (err) {
      alert("Error updating status");
    }
  };

  const approvedProducts = products.filter((p) => p.status === "approved");
  const pendingOrders = orders.filter((o) => o.status === "pending");

  return (
    <>
      <div
        className="premium-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <Truck size={22} />
            </span>{" "}
            เคลียร์ภาษี / จัดส่ง
          </h1>
          <p>บันทึก PO และยืนยันการเคลียร์ภาษีสรรพสามิตล่วงหน้า</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill danger">รอรับเงิน {pendingOrders.length} รายการ</div>
          {canAct && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-1.5">
              <Plus size={16} /> สร้างรอบจัดส่ง
            </button>
          )}
        </div>
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
              รายการ PO รอรับเงิน ({pendingOrders.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Ref/Date</th>
                  <th className="text-center">จำนวนรายการ</th>
                  <th className="num">ยอดภาษีรวม</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-10 text-[var(--text-3)]">
                      ไม่มีออเดอร์รอรับเงิน
                    </td>
                  </tr>
                ) : (
                  pendingOrders.map((o) => {
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
                          {o.poReference && (
                            <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">PO: {o.poReference}</div>
                          )}
                          <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">ส่ง: {o.deliveryDate}</div>
                          <div className="text-[11px] text-[var(--accent)] font-semibold mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {o.assignee}
                          </div>
                        </td>
                        <td className="text-center font-bold text-base font-mono text-[var(--text-2)] ">{itemCount}</td>
                        <td className="num font-bold text-[var(--red)] text-lg font-mono">
                          {isExempt ? (
                            <span className="status-pill success text-xs font-sans">ยกเว้นภาษี 0.00 บาท</span>
                          ) : (
                            formatMoney(o.totalTax)
                          )}
                        </td>
                        <td className="text-center">
                          {canAct ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReceive(o.id, isExempt); }}
                              className="btn btn-primary flex items-center gap-1.5 mx-auto"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              {isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว"}
                            </button>
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

      {/* Create shipment batch modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="สร้างรอบจัดส่งใหม่ (Create Shipment Batch)" size="lg">
        <div className="flex justify-end mb-4">
          <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
            Assignee: {userName}
          </span>
        </div>
        <form onSubmit={handleCreateOrder} className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
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
              {formData.items.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={it.productId}
                    onChange={(e) => setItem(idx, { productId: e.target.value })}
                    required
                    className="premium-select flex-1"
                  >
                    <option value="">-- เลือกสินค้า (เฉพาะที่อนุมัติแล้ว) --</option>
                    {approvedProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fgCode} | {p.productDescription} ({p.customerName})
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
              ))}
            </div>
          </div>

          <div className="form-group col-span-3">
            <label>หมายเหตุ (Remarks)</label>
            <input type="text" name="remarks" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="ข้อมูลเพิ่มเติม" className="premium-input w-full" />
          </div>
          <div className="col-span-3 flex justify-end gap-2 mt-2 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary px-8">
              {isSubmitting ? "กำลังสร้างออเดอร์..." : "สร้างใบสั่งซื้อ"}
            </button>
          </div>
        </form>
      </Modal>

      <OrderDetailModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}
