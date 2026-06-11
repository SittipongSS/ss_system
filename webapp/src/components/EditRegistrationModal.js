"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Modal from "@/components/Modal";
import { apiCache } from "@/lib/apiCache";
import { fmtMoney } from "@/lib/format";

export default function EditRegistrationModal({ open, onClose, onSaved, registration }) {
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);
  const [loadingOpts, setLoadingOpts] = useState(!apiCache.has("/api/products") || !apiCache.has("/api/customers"));

  const [form, setForm] = useState({ productId: "", customerId: "" });
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      if (loadingOpts) {
        Promise.all([
          fetch("/api/products").then(r => r.ok ? r.json() : []),
          fetch("/api/customers").then(r => r.ok ? r.json() : [])
        ]).then(([p, c]) => {
          setProducts(p || []);
          setCustomers(c || []);
          apiCache.set("/api/products", p);
          apiCache.set("/api/customers", c);
          setLoadingOpts(false);
        });
      }
      
      if (registration) {
        setForm({
          productId: registration.productId || "",
          customerId: registration.customerId || ""
        });
        setProductSearch("");
        setError(null);
      }
    }
  }, [open, registration, loadingOpts]);

  if (!open || !registration) return null;

  const pq = productSearch.trim().toLowerCase();
  const productOptions = pq
    ? products.filter((p) => [p.fgCode, p.productDescription, p.brandName].some((v) => (v || "").toLowerCase().includes(pq)))
    : products;
  const selectedProduct = products.find((p) => p.id === form.productId);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.productId || !form.customerId) {
      setError("กรุณาเลือกสินค้าและลูกค้า");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/excise-registrations/${registration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
    <Modal open={open} onClose={() => !submitting && onClose()} title="แก้ไขรายการขึ้นทะเบียนสินค้า" size="lg">
      {loadingOpts ? (
        <div className="p-12 flex justify-center text-[var(--text-3)] text-sm">กำลังโหลดข้อมูล...</div>
      ) : (
        <form onSubmit={submit}>
          <div className="p-4 space-y-5">
            <div>
              <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">1. แก้ไขสินค้า (Master FG)</h3>
              <div className="search-bar mb-2" style={{ maxWidth: "100%" }}>
                <Search size={15} className="icon-l" />
                <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="ค้นหา FG / ชื่อสินค้า / แบรนด์..." />
              </div>
              <select
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                required
                className="premium-select w-full"
                size={6}
              >
                {productOptions.length === 0 ? (
                  <option value="" disabled>ไม่พบสินค้า</option>
                ) : (
                  productOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.fgCode} | {p.productDescription} ({p.brandName})</option>
                  ))
                )}
              </select>
              {selectedProduct && (
                <div className="mt-2 text-[11px] text-[var(--text-3)] font-mono flex gap-4">
                  <span>ปริมาตร: {selectedProduct.volume} ml</span>
                  <span>ราคาขายปลีก: {fmtMoney(selectedProduct.retailPriceIncVat || 0)}</span>
                  <span>ภาษี/ชิ้น: {selectedProduct.isExciseTaxable === false ? "ยกเว้น" : fmtMoney((selectedProduct.exciseTax || 0) + (selectedProduct.localTax || 0))}</span>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">2. แก้ไขลูกค้า (Customer)</h3>
              <select
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                required
                className="premium-select w-full"
              >
                <option value="">-- เลือกลูกค้า --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.arCode} : {c.name}</option>
                ))}
              </select>
            </div>

            {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}
          </div>

          <div className="flex justify-end gap-2 px-4 pb-4 pt-3 border-t border-[var(--border)]">
            <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
            <button type="submit" disabled={submitting} className="btn btn-primary px-8 disabled:opacity-50">
              {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
