"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/format";

// Edit an existing order (quotation-based). Quotation is the primary reference;
// PO is optional. Editable only while pending or rejected. When the order was
// rejected by LG, saving resubmits it (status → received) back into LG's queue.
export default function EditOrderModal({ open, onClose, onSaved, order, products = [] }) {
  const [form, setForm] = useState({ quotationRef: "", poReference: "", deliveryDate: "", remarks: "" });
  const [items, setItems] = useState([{ productId: "", quantity: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && order) {
      setForm({
        quotationRef: order.quotationRef === "-" ? "" : order.quotationRef || "",
        poReference: order.poReference || "",
        deliveryDate: order.deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(order.deliveryDate) ? order.deliveryDate.slice(0, 10) : "",
        remarks: order.remarks === "-" ? "" : order.remarks || "",
      });
      const seeded = (order.items || []).map((it) => ({
        productId: it.productId || it.product?.id || "",
        quantity: String(it.quantity ?? ""),
      }));
      setItems(seeded.length ? seeded : [{ productId: "", quantity: "" }]);
      setError(null);
    }
  }, [open, order?.id]);

  if (!order) return null;
  const isResubmit = order.status === "rejected";
  // The customer is fixed on edit. Show only that customer's approved products.
  // (snapshot fields fall back to the first line item for legacy orders.)
  const custName = order.customerName || order.items?.[0]?.product?.customerName || "";
  const custTax = order.customerTaxId || order.items?.[0]?.product?.taxId || "";
  const approved = products.filter(
    (p) =>
      p.status === "approved" &&
      (((custName && p.customerName === custName) || (custTax && p.taxId === custTax)) ||
        (!custName && !custTax)),
  );

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { productId: "", quantity: "" }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    const cleanItems = items.filter((it) => it.productId && it.quantity).map((it) => ({ productId: it.productId, quantity: it.quantity }));
    if (cleanItems.length === 0) {
      setError("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { ...form, items: cleanItems };
    if (isResubmit) body.status = "received"; // resubmit to LG
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved?.();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={isResubmit ? `แก้ไขและส่งกลับ — ${order.quotationRef || order.id}` : `แก้ไขใบสั่งซื้อ — ${order.quotationRef || order.id}`}
      size="lg"
    >
      <form onSubmit={submit}>
        {(custName || custTax) && (
          <div className="mx-4 mt-4 text-xs bg-[var(--panel-2)] rounded-lg p-3">
            <span className="text-[var(--text-3)]">ลูกค้า: </span>
            <span className="font-semibold text-[var(--text)]">{custName || "-"}</span>
            {custTax && <span className="text-[var(--text-3)] font-mono ml-2">({custTax})</span>}
          </div>
        )}
        {isResubmit && order.rejectionReason && (
          <div className="mx-4 mt-4 text-xs bg-[var(--red-soft)] border border-[var(--border)] rounded-lg p-3">
            <span className="text-[var(--red)] font-semibold">เหตุผลที่ถูกตีกลับ: </span>
            <span className="text-[var(--text-2)]">{order.rejectionReason}</span>
          </div>
        )}

        <div className="p-4 grid gap-[16px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="form-group">
            <label>เลขที่ใบเสนอราคา <span className="text-[var(--red)]">*</span></label>
            <input type="text" value={form.quotationRef} required
              onChange={(e) => setForm({ ...form, quotationRef: e.target.value })}
              className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>PO Reference <span className="text-[var(--text-3)] text-xs">(ไม่บังคับ)</span></label>
            <input type="text" value={form.poReference}
              onChange={(e) => setForm({ ...form, poReference: e.target.value })}
              className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>วันที่คาดว่าจะส่ง</label>
            <input type="date" value={form.deliveryDate}
              onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
              className="premium-input w-full" />
          </div>

          <div className="col-span-3">
            <div className="flex items-center justify-between mb-2">
              <label className="!mb-0">รายการสินค้า <span className="text-[var(--red)]">*</span></label>
              <button type="button" onClick={addItem} className="btn btn-sm flex items-center gap-1"><Plus size={14} /> เพิ่มรายการ</button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const prod = approved.find((p) => p.id === it.productId);
                const taxPerUnit = prod ? (prod.isExciseTaxable === false ? 0 : (prod.exciseTax || 0) + (prod.localTax || 0)) : 0;
                return (
                  <div key={idx}>
                    <div className="flex gap-2 items-start">
                      <select value={it.productId} required onChange={(e) => setItem(idx, { productId: e.target.value })} className="premium-select flex-1">
                        <option value="">-- เลือกสินค้า (เฉพาะที่อนุมัติแล้ว) --</option>
                        {approved.map((p) => (
                          <option key={p.id} value={p.id}>{p.fgCode} | {p.productDescription} ({p.customerName})</option>
                        ))}
                      </select>
                      <input type="number" value={it.quantity} required min="1" placeholder="จำนวน"
                        onChange={(e) => setItem(idx, { quantity: e.target.value })}
                        className="premium-input w-28 font-mono" />
                      <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}
                        className="btn px-3 text-[var(--red)] disabled:opacity-30" title="ลบรายการ">✕</button>
                    </div>
                    {prod && (
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
            <input type="text" value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="premium-input w-full" />
          </div>

          {error && <div className="col-span-3 text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4 pt-3 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-6 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : isResubmit ? "บันทึกและส่งกลับให้ LG" : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
