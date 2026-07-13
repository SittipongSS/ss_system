"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import Select from "@/components/ui/Select";
import AddBrandButton from "@/components/master/AddBrandButton";
import { brandSelectOptions } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";

const today = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export default function SalesProjectCreateModal({ open, onClose, onSuccess, editingId = null, initialData = null, customers = [], categories = [] }) {
  const [users, setUsers] = useState([]);
  const [extraBrands, setExtraBrands] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", customerId: "", brand: "", mainCode: "", typeCode: "",
    productMainCategory: "", productSubCategory: "", startDate: today(), dueDate: "",
    aeOwner: "", preparedBy: "", aeSupervisor: "",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setExtraBrands([]);
    const categoryCode = initialData?.productMainCategory || "";
    const [mainCode = "", typeCode = ""] = categoryCode.split("-");
    setForm({
      name: initialData?.name || "", customerId: initialData?.customerId || "", brand: initialData?.metadata?.brand || "",
      mainCode, typeCode, productMainCategory: categoryCode, productSubCategory: initialData?.productSubCategory || "",
      startDate: initialData?.startDate || today(), dueDate: initialData?.dueDate || "", aeOwner: initialData?.aeOwner || "",
      preparedBy: initialData?.preparedBy || "", aeSupervisor: initialData?.aeSupervisor || "",
    });
    fetch("/api/pm/assignable-users")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setUsers(rows || []))
      .catch(() => setUsers([]));
  }, [open, initialData]);

  const brandOptions = useMemo(() => {
    const customer = customers.find((row) => row.id === form.customerId);
    const merged = [...brandSelectOptions(customer?.brands || []), ...brandSelectOptions(extraBrands)];
    const unique = [...new Map(merged.map((option) => [option.value, option])).values()];
    if (form.brand && !unique.some((option) => option.value === form.brand)) unique.unshift({ value: form.brand, label: form.brand });
    return unique;
  }, [customers, form.customerId, extraBrands, form.brand]);
  const userName = (u) => (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "").trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("กรุณาระบุชื่อโครงการ");
    if (!form.customerId) return setError("กรุณาเลือกลูกค้า");
    if (!form.startDate) return setError("กรุณาระบุวันที่เริ่มโครงการ");
    setSubmitting(true);
    setError("");
    try {
      const customer = customers.find((row) => row.id === form.customerId);
      const res = await fetch(editingId ? `/api/pm/projects/${editingId}` : "/api/sa/projects", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customerName: customer?.name || null,
          metadata: { ...(initialData?.metadata || {}), brand: form.brand, containerOnly: true },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างโครงการไม่สำเร็จ");
      onSuccess?.(data);
    } catch (err) {
      setError(err.message || "สร้างโครงการไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editingId ? "แก้ไขโครงการ" : "สร้างโครงการใหม่"} size="lg">
      <form onSubmit={submit}>
        <p style={{ marginTop: 0, color: "var(--text-3)", fontSize: 13 }}>
          ข้อมูลระดับโครงการใช้ร่วมกันทุกดีล ส่วนไทม์ไลน์และเอกสารจะมาจากดีลที่ผูกไว้
        </p>
        <div className="pm-form-grid gap-[18px]">
          <div className="form-group col-span-2">
            <label>ชื่อโครงการ <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="premium-input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>{CUSTOMER_NAME_LABEL} <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={(customerId) => setForm((f) => ({ ...f, customerId, brand: "" }))}
              options={customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.arCode} — ${c.name}` : c.name, search: `${c.arCode || ""} ${c.name}` }))}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
            />
          </div>
          <div className="form-group">
            <label>แบรนด์ (อังกฤษ · ไทย)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><SearchableSelect entity="brand" disabled={!form.customerId} value={form.brand} onChange={(brand) => setForm((f) => ({ ...f, brand }))} options={brandOptions} placeholder={form.customerId ? "เลือกแบรนด์..." : "เลือกลูกค้าก่อน"} /></div>
              <AddBrandButton customerId={form.customerId} disabled={!form.customerId} onAdded={(brand) => { setExtraBrands((rows) => [...rows, brand]); setForm((f) => ({ ...f, brand: brand.th || brand.en })); }} />
            </div>
          </div>
          <ProductCategorySelect
            categories={categories}
            value={form.productMainCategory}
            mainValue={form.mainCode}
            subValue={form.typeCode}
            onChange={(productMainCategory, meta) => setForm((f) => ({ ...f, mainCode: meta.mainCode, typeCode: meta.typeCode, productMainCategory, productSubCategory: meta.category?.nameTh || meta.category?.nameEn || "" }))}
          />
          <div className="form-group">
            <label>วันที่เริ่มโครงการ <span style={{ color: "var(--red)" }}>*</span></label>
            <DateInput value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} className="w-full" />
          </div>
          <div className="form-group">
            <label>วันที่สิ้นสุด</label>
            <DateInput value={form.dueDate} onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))} className="w-full" />
          </div>
          <div className="form-group col-span-2"><label>ผู้รับผิดชอบ (AE)</label><Select fullWidth value={form.aeOwner} onChange={(e) => setForm((f) => ({ ...f, aeOwner: e.target.value }))}><option value="">— ไม่ระบุ —</option>{users.filter((u) => ["ae", "senior_ae", "ae_supervisor"].includes(u.role)).map((u) => <option key={u.id} value={userName(u)}>{userName(u)}</option>)}</Select></div>
          <div className="form-group"><label>Account Coordinator</label><Select fullWidth value={form.preparedBy} onChange={(e) => setForm((f) => ({ ...f, preparedBy: e.target.value }))}><option value="">— ไม่ระบุ —</option>{users.filter((u) => u.role === "ac").map((u) => <option key={u.id} value={userName(u)}>{userName(u)}</option>)}</Select></div>
          <div className="form-group"><label>AE Supervisor</label><Select fullWidth value={form.aeSupervisor} onChange={(e) => setForm((f) => ({ ...f, aeSupervisor: e.target.value }))}><option value="">— ไม่ระบุ —</option>{users.filter((u) => u.role === "ae_supervisor").map((u) => <option key={u.id} value={userName(u)}>{userName(u)}</option>)}</Select></div>
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้างโครงการ"}</button>
        </div>
      </form>
    </Modal>
  );
}
