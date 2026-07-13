"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import { fmtMoney } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

const blankItem = () => ({ registrationId: "", quantity: "" });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Per-unit tax = ราคาถอด VAT × 8.8% (excise 8% + local 0.8%), rounded ONCE to 2
// decimals, then × qty — so ภาษี/ชิ้น × จำนวน = ยอดรวม exactly. Same rule the
// order API uses to store the totals.
const regTax = (r) => (r && r.isExciseTaxable !== false ? r2((r.exciseTax || 0) + (r.localTax || 0)) : 0);

// Create a new tax-filing order, or edit/resubmit an existing one. Lines bind an
// approved registration of the chosen customer + quantity. The excise tax is
// ad valorem and snapshotted at registration time (from the product retail
// price) — the per-unit tax comes from the registration, so the filing form does
// not ask for a sale price. Backend POST/PATCH contracts unchanged.
export default function OrderFormModal({ open, onClose, onSaved, order, registrations = [], customers = [], products = [], userName }) {
  const editing = !!order;
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({ quotationRef: "", poReference: "", deliveryDate: "", remarks: "" });
  const [items, setItems] = useState([blankItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(order.customerId || "");
      setForm({
        quotationRef: order.quotationRef === "-" ? "" : order.quotationRef || "",
        poReference: order.poReference || "",
        deliveryDate: order.deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(order.deliveryDate) ? order.deliveryDate.slice(0, 10) : "",
        remarks: order.remarks === "-" ? "" : order.remarks || "",
      });
      setItems((order.items || []).map((it) => ({
        registrationId: it.registrationId || "", quantity: String(it.quantity || ""),
      })) || [blankItem()]);
    } else {
      setCustomerId("");
      setForm({ quotationRef: "", poReference: "", deliveryDate: "", remarks: "" });
      setItems([blankItem()]);
    }
    setError(null);
  }, [open, order?.id]);

  // Only the chosen customer's approved registrations are selectable — no
  // customer picked yet means an empty list (pick a customer first).
  const approvedRegs = useMemo(
    () => (customerId ? registrations.filter((r) => r.status === "approved" && r.customerId === customerId) : []),
    [registrations, customerId],
  );

  // Sale price (retail incl VAT) is pulled from the master product via the
  // registration's productId — shown read-only for reference, never entered.
  const priceOf = (reg) => products.find((p) => p.id === reg?.productId)?.retailPriceIncVat || 0;

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (i) => setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));

  const totalTax = items.reduce((s, it) => {
    const r = approvedRegs.find((x) => x.id === it.registrationId);
    return s + regTax(r) * (parseInt(it.quantity) || 0);
  }, 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) { setError("กรุณาเลือกลูกค้า"); return; }
    const clean = items
      .filter((it) => it.registrationId && it.quantity)
      .map((it) => ({ registrationId: it.registrationId, quantity: it.quantity }));
    if (!clean.length) { setError("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ"); return; }
    setBusy(true);
    setError(null);
    try {
      let res;
      if (editing) {
        const body = { ...form, items: clean };
        if (order.status === "rejected") body.status = "received"; // resubmit
        res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch("/api/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, ...form, items: clean, assignee: userName }),
        });
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "บันทึกไม่สำเร็จ");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = editing
    ? (order.status === "rejected" ? "แก้ไขและส่งกลับ" : "แก้ไขใบยื่นชำระ")
    : "ยื่นชำระภาษีใหม่";

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} size="lg">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          {editing && order.status === "rejected" && order.rejectionReason && (
            <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">
              เหตุผลที่ตีกลับ: {order.rejectionReason}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group col-span-2">
              <label>{CUSTOMER_NAME_LABEL} <span style={{ color: "var(--red)" }}>*</span></label>
              {editing ? (
                <input className="premium-input w-full" value={order.customerName || "-"} disabled />
              ) : (
                <SearchableSelect
                  entity="customer"
                  value={customerId}
                  onChange={(v) => { setCustomerId(v); setItems([blankItem()]); }}
                  placeholder="ค้นหารหัส / ชื่อลูกค้า..."
                  options={customers.map((c) => ({ value: c.id, label: `${c.arCode} : ${c.name}`, search: `${c.arCode} ${c.name}` }))}
                />
              )}
            </div>
            <div className="form-group">
              <label>เลขที่ใบเสนอราคา <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="premium-input w-full" value={form.quotationRef} required
                onChange={(e) => setForm((f) => ({ ...f, quotationRef: e.target.value }))} placeholder="เช่น QT-2026-001" />
            </div>
            <div className="form-group">
              <label>PO Reference</label>
              <input className="premium-input w-full" value={form.poReference}
                onChange={(e) => setForm((f) => ({ ...f, poReference: e.target.value }))} placeholder="เลขที่ใบสั่งซื้อลูกค้า" />
            </div>
            <div className="form-group">
              <label>วันที่คาดว่าจะส่ง</label>
              <DateInput className="w-full" value={form.deliveryDate}
                onChange={(value) => setForm((f) => ({ ...f, deliveryDate: value }))} />
            </div>
            <div className="form-group">
              <label>หมายเหตุ</label>
              <input className="premium-input w-full" value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="ข้อมูลเพิ่มเติม" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ margin: 0 }}>รายการสินค้า <span style={{ color: "var(--red)" }}>*</span></label>
              <button type="button" onClick={addItem} className="btn btn-secondary flex items-center gap-1" style={{ height: 30 }}>
                <Plus size={14} /> เพิ่มรายการ
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => {
                const reg = approvedRegs.find((r) => r.id === it.registrationId);
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex gap-2 items-start">
                      <div style={{ flex: 1 }}>
                        <SearchableSelect
                          entity="product"
                          value={it.registrationId}
                          onChange={(v) => setItem(idx, { registrationId: v })}
                          placeholder={customerId ? "เลือกสินค้า (อนุมัติแล้ว)" : "เลือกลูกค้าก่อน"}
                          options={approvedRegs.map((r) => ({ value: r.id, label: `${r.fgCode} | ${r.productName}`, search: `${r.fgCode} ${r.productName}` }))}
                          emptyText="ไม่มีสินค้าที่อนุมัติแล้วของลูกค้านี้"
                        />
                      </div>
                      <input type="number" min="1" placeholder="จำนวน" className="premium-input font-mono" style={{ width: 110 }}
                        value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} required />
                      <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}
                        className="btn-icon danger" title="ลบรายการ"><X size={15} /></button>
                    </div>
                    {reg && (
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 2 }} className="font-mono flex gap-4 flex-wrap">
                        <span>ราคาขาย/ชิ้น: {priceOf(reg) > 0 ? fmtMoney(priceOf(reg)) : "-"}</span>
                        <span>ภาษี/ชิ้น: {regTax(reg) > 0 ? fmtMoney(regTax(reg)) : "ยกเว้น"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end" style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-3)" }}>ยอดชำระภาษีสรรพสามิตรวม (ไม่รวมภาษีมูลค่าเพิ่ม):&nbsp;</span>
            <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{fmtMoney(totalTax)}</span>
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-6" disabled={busy}>
            {busy ? "กำลังบันทึก..." : editing ? (order.status === "rejected" ? "บันทึกและส่งกลับ" : "บันทึกการแก้ไข") : "บันทึกรายการยื่นชำระ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
