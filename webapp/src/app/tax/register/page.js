"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Search, Pencil, Trash2, Filter, LayoutGrid, Table2, ChevronRight } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import Modal from "@/components/Modal";
import EditRegistrationModal from "@/components/EditRegistrationModal";
import ConfirmModal from "@/components/tax/ConfirmModal";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import TaxStageRail from "@/components/tax/TaxStageRail";
import StagePill from "@/components/tax/StagePill";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { TRACK1, deptOf } from "@/lib/tax/status";

// SA excise-registration workspace (Track 1). Pick a master FG product + a
// customer and submit for excise registration; LG approves on /tax/approve-
// register. Redesigned: stage rail + card/table responsive list. Logic
// (submit / edit / delete, API, permissions) is unchanged.
export default function ExciseWorkspace() {
  const role = useRole();
  const dept = deptOf(role);
  const canEdit = useCan("products:edit");
  const [regs, setRegs] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/excise-registrations"));
  const [products, setProducts] = useState(() => apiCache.get("/api/products") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/customers") ?? []);
  const [userName, setUserName] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productId: "", customerId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const doDelete = async () => {
    try {
      const res = await fetch(`/api/excise-registrations/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) { setDeleteTarget(null); await fetchRegs(); }
      else alert((await res.json().catch(() => ({}))).error || "ไม่สามารถลบได้");
    } catch {
      alert("Error deleting");
    }
  };

  const counts = {
    rejected: regs.filter((r) => r.status === "rejected").length,
    pending_legal: regs.filter((r) => r.status === "pending_legal").length,
    approved: regs.filter((r) => r.status === "approved").length,
  };

  const q = search.trim().toLowerCase();
  const filtered = regs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.fgCode, r.productName, r.brandName, r.customerName].some((v) => (v || "").toLowerCase().includes(q));
  });

  const sort = useSortableTable(filtered, {
    fgCode: (r) => r.fgCode || "",
    customer: (r) => r.customerName || "",
    tax: (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0)),
    approval: (r) => r.approvalNumber || "",
    status: (r) => r.status || "",
  });

  const pq = productSearch.trim().toLowerCase();
  const productOptions = pq
    ? products.filter((p) => [p.fgCode, p.productDescription, p.brandName].some((v) => (v || "").toLowerCase().includes(pq)))
    : products;
  const selectedProduct = products.find((p) => p.id === form.productId);

  const taxPerUnit = (r) => (r.isExciseTaxable === false ? 0 : (r.exciseTax || 0) + (r.localTax || 0));
  const open = (r) => (window.location.href = `/tax/register/${r.id}`);

  const headerRight = (
    <>
      <span className="ui-badge">{regs.length} รายการ</span>
      {canEdit && (
        <button onClick={openForm} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={16} /> ยื่นขึ้นทะเบียน
        </button>
      )}
    </>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="search-glass" style={{ width: "240px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา FG / ชื่อ / ลูกค้า..." />
      </div>
      <div className="spacer" />
      <span className="toolbar-label"><Filter size={14} /> กรอง</span>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" style={{ width: "auto" }}>
        <option value="all">ทุกสถานะ</option>
        <option value="pending_legal">รออนุมัติ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="rejected">ตีกลับ</option>
      </select>
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <TaxWorkspace
      icon={<ClipboardCheck size={22} />}
      title="ยื่นขึ้นทะเบียนสินค้า"
      subtitle="เลือกสินค้าจากฐานข้อมูลกลาง + ผูกลูกค้า แล้วยื่นขึ้นทะเบียนภาษีสรรพสามิต"
      headerRight={headerRight}
      loading={loading}
      rail={<TaxStageRail track={TRACK1} dept={dept} counts={counts} />}
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {search || statusFilter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sort.sorted.map((r) => (
            <div key={r.id} onClick={() => open(r)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text)] font-mono text-sm">{r.fgCode}</div>
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5 truncate">{r.productName} ({r.brandName})</div>
                </div>
                <StagePill status={r.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-2)] truncate">{r.customerName}</span>
                <span className="font-mono text-[var(--text-2)]">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] font-mono text-[var(--text-3)]">{r.approvalNumber || "ยังไม่มีเลขอนุมัติ"}</span>
                {canEdit ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditTarget(r)} className="btn-icon" title="แก้ไข"><Pencil size={15} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} className="btn-icon danger" title="ลบ"><Trash2 size={15} /></button>
                  </div>
                ) : <ChevronRight size={16} className="text-[var(--text-3)]" />}
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
                  <SortTh label="รหัสสินค้า (FG Code)" sortKey="fgCode" sort={sort} />
                  <SortTh label="ลูกค้า" sortKey="customer" sort={sort} />
                  <SortTh label="ภาษี/ชิ้น" sortKey="tax" sort={sort} className="num" />
                  <SortTh label="เลขที่อนุมัติ" sortKey="approval" sort={sort} />
                  <SortTh label="สถานะ" sortKey="status" sort={sort} />
                  <th style={{ width: "80px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {sort.sorted.map((r) => (
                  <tr key={r.id} onClick={() => open(r)} className="clickable-row">
                    <td>
                      <div className="font-semibold text-[var(--text)] font-mono">{r.fgCode}</div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5">{r.productName} ({r.brandName})</div>
                    </td>
                    <td className="text-[var(--text-2)]">{r.customerName}</td>
                    <td className="num font-mono text-[var(--text-2)]">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r))}</td>
                    <td className="font-mono text-[var(--text-3)] text-xs">{r.approvalNumber || "-"}</td>
                    <td><StagePill status={r.status} /></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditTarget(r)} className="btn-icon" title="แก้ไข"><Pencil size={15} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} className="btn-icon danger" title="ลบ"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
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
              <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} required className="premium-select w-full" size={6}>
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
              <select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} required className="premium-select w-full">
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
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="ลบรายการขึ้นทะเบียน"
        message={`ยืนยันการลบทะเบียนของ ${deleteTarget?.fgCode || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
      />
    </TaxWorkspace>
  );
}
