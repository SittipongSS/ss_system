"use client";
import { useEffect, useState } from "react";
import { ReceiptText, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import Modal from "@/components/Modal";
import ProductStatusPill from "@/components/ProductStatusPill";
import EditRegistrationModal from "@/components/EditRegistrationModal";

// SA excise-registration workspace. Pick a master FG product + a customer and
// submit it for excise tax registration (LG approves on /legal). The product
// catalog itself lives in the master database (/products).
export default function ExciseWorkspace() {
  const canEdit = useCan("products:edit");
  const [regs, setRegs] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/excise-registrations"));
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);
  const [userName, setUserName] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productId: "", customerId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [editTarget, setEditTarget] = useState(null);

  const fetchRegs = async () => {
    try {
      const res = await fetch("/api/excise-registrations");
      if (res.ok) {
        const d = await res.json();
        apiCache.set("/api/excise-registrations", d);
        setRegs(d);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    fetchRegs();
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => { setProducts(d || []); apiCache.set("/api/products", d); }).catch(() => {});
    fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).then((d) => { setCustomers(d || []); apiCache.set("/api/customers", d); }).catch(() => {});
  }, []);

  const openForm = () => {
    setForm({ productId: "", customerId: "" });
    setFormError(null);
    setProductSearch("");
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.productId || !form.customerId) {
      setFormError("กรุณาเลือกสินค้าและลูกค้า");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/excise-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, assignee: userName }),
      });
      if (res.ok) {
        setShowForm(false);
        await fetchRegs();
      } else {
        const d = await res.json().catch(() => ({}));
        setFormError(d.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      setFormError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSubmitting(false);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm("ยืนยันการลบรายการขึ้นทะเบียนนี้?")) return;
    try {
      const res = await fetch(`/api/excise-registrations/${id}`, { method: "DELETE" });
      if (res.ok) await fetchRegs();
      else alert((await res.json()).error || "ไม่สามารถลบได้");
    } catch {
      alert("Error deleting");
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = regs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.fgCode, r.productName, r.brandName, r.customerName].some((v) => (v || "").toLowerCase().includes(q));
  });

  const pq = productSearch.trim().toLowerCase();
  const productOptions = pq
    ? products.filter((p) => [p.fgCode, p.productDescription, p.brandName].some((v) => (v || "").toLowerCase().includes(pq)))
    : products;
  const selectedProduct = products.find((p) => p.id === form.productId);

  const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><ReceiptText size={22} /></span> ยื่นขึ้นทะเบียนสินค้า
          </h1>
          <p>เลือกสินค้าจากฐานข้อมูลกลาง + ผูกลูกค้า แล้วยื่นขึ้นทะเบียนภาษีสรรพสามิต</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill ok">ทั้งหมด {regs.length} รายการ</div>
          {canEdit && (
            <button onClick={openForm} className="btn btn-primary flex items-center gap-1.5">
              <Plus size={16} /> ยื่นขึ้นทะเบียน
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
          <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-sm text-[var(--text)]">รายการขึ้นทะเบียน ({filtered.length})</h3>
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" style={{ height: 34, fontSize: "12.5px" }}>
                <option value="all">ทุกสถานะ</option>
                <option value="pending_legal">รออนุมัติ</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ตีกลับ</option>
              </select>
              <div className="search-glass">
                <Search size={18} color="var(--text-3)" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา FG / ชื่อ / ลูกค้า..." />
              </div>
            </div>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า (FG Code)</th>
                  <th>ลูกค้า</th>
                  <th className="num">ภาษี/ชิ้น</th>
                  <th>เลขที่อนุมัติ</th>
                  <th>สถานะ</th>
                  <th style={{ width: "80px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-10 text-[var(--text-3)]">{search || statusFilter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} onClick={() => (window.location.href = `/tax/register/${r.id}`)} className="clickable-row">
                      <td>
                        <div className="font-semibold text-[var(--text)] font-mono">{r.fgCode}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-0.5">{r.productName} ({r.brandName})</div>
                      </td>
                      <td className="text-[var(--text-2)]">{r.customerName}</td>
                      <td className="num font-mono text-[var(--text-2)]">
                        {r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}
                      </td>
                      <td className="font-mono text-[var(--text-3)] text-xs">{r.approvalNumber || "-"}</td>
                      <td><ProductStatusPill status={r.status} /></td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditTarget(r)} className="btn px-2 py-1 text-[var(--text-2)] hover:text-[var(--accent)] bg-transparent border-none" title="แก้ไข">
                              <Pencil size={15} />
                            </button>
                            <button onClick={(e) => handleDelete(e, r.id)} className="btn px-2 py-1 text-[var(--text-3)] hover:text-[var(--red)] bg-transparent border-none" title="ลบ">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit registration modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="ยื่นขึ้นทะเบียนสินค้า (Excise Registration)" size="lg">
        <form onSubmit={submit}>
          <div className="p-4 space-y-5">
            <div>
              <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">1. เลือกสินค้าจากฐานข้อมูล (Master FG)</h3>
              <div className="search-glass mb-2" style={{ width: "100%" }}>
                <Search size={18} color="var(--text-3)" />
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
                  <option value="" disabled>ไม่พบสินค้า — สร้างที่ระบบฐานข้อมูลก่อน</option>
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
              <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">2. เลือกลูกค้า (Customer)</h3>
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

            {formError && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{formError}</div>}
          </div>

          <div className="flex justify-end gap-2 px-4 pb-4 pt-3 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowForm(false)} className="btn" disabled={submitting}>ยกเลิก</button>
            <button type="submit" disabled={submitting} className="btn btn-primary px-8 disabled:opacity-50">
              {submitting ? "กำลังบันทึก..." : "ยื่นขึ้นทะเบียน"}
            </button>
          </div>
        </form>
      </Modal>

      <EditRegistrationModal open={!!editTarget} onClose={() => setEditTarget(null)} onSaved={fetchRegs} registration={editTarget} />
    </>
  );
}
