"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import AddBrandButton from "@/components/master/AddBrandButton";
import { brandThList } from "@/lib/master/brands";

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
    productMainCategory: "", productSubCategory: "", startDate: today(),
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
      startDate: initialData?.startDate || today(), aeOwner: initialData?.aeOwner || "",
      preparedBy: initialData?.preparedBy || "", aeSupervisor: initialData?.aeSupervisor || "",
    });
    fetch("/api/pm/assignable-users")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setUsers(rows || []))
      .catch(() => setUsers([]));
  }, [open, initialData]);

  const brandOptions = useMemo(() => {
    const customer = customers.find((row) => row.id === form.customerId);
    return [...new Set([...brandThList(customer?.brands || []), ...extraBrands])];
  }, [customers, form.customerId, extraBrands]);
  const mainOptions = useMemo(() => {
    const map = new Map();
    for (const row of categories) {
      if (row.mainCategoryCode && !map.has(row.mainCategoryCode)) {
        map.set(row.mainCategoryCode, row.mainCategoryNameTh || row.mainCategoryNameEn || row.mainCategoryCode);
      }
    }
    return [...map].map(([code, name]) => ({ code, name }));
  }, [categories]);
  const subOptions = useMemo(
    () => categories.filter((row) => row.mainCategoryCode === form.mainCode && row.typeCode),
    [categories, form.mainCode],
  );
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
          <div className="form-group col-span-2">
            <label>บริษัทลูกค้า <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={(customerId) => setForm((f) => ({ ...f, customerId, brand: "" }))}
              options={customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.arCode} — ${c.name}` : c.name, search: `${c.arCode || ""} ${c.name}` }))}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
            />
          </div>
          <div className="form-group col-span-2">
            <label>แบรนด์</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><SearchableSelect entity="brand" disabled={!form.customerId} value={form.brand} onChange={(brand) => setForm((f) => ({ ...f, brand }))} options={brandOptions.map((brand) => ({ value: brand, label: brand }))} placeholder={form.customerId ? "เลือกแบรนด์..." : "เลือกลูกค้าก่อน"} /></div>
              <AddBrandButton customerId={form.customerId} disabled={!form.customerId} onCreated={(brand) => { setExtraBrands((rows) => [...rows, brand]); setForm((f) => ({ ...f, brand })); }} />
            </div>
          </div>
          <div className="form-group">
            <label>หมวดหลัก</label>
            <Select fullWidth value={form.mainCode} onChange={(e) => setForm((f) => ({ ...f, mainCode: e.target.value, typeCode: "", productMainCategory: "", productSubCategory: "" }))}>
              <option value="">— ไม่ระบุ —</option>
              {mainOptions.map((row) => <option key={row.code} value={row.code}>{row.code} {row.name}</option>)}
            </Select>
          </div>
          <div className="form-group">
            <label>หมวดรอง</label>
            <Select fullWidth value={form.typeCode} disabled={!form.mainCode} onChange={(e) => {
              const typeCode = e.target.value;
              const row = categories.find((item) => item.mainCategoryCode === form.mainCode && item.typeCode === typeCode);
              setForm((f) => ({ ...f, typeCode, productMainCategory: typeCode ? `${f.mainCode}-${typeCode}` : "", productSubCategory: row?.nameTh || row?.nameEn || "" }));
            }}>
              <option value="">— ไม่ระบุ —</option>
              {subOptions.map((row) => <option key={row.id} value={row.typeCode}>{row.typeCode} {row.nameTh || row.nameEn || ""}</option>)}
            </Select>
          </div>
          <div className="form-group col-span-2">
            <label>วันที่เริ่มโครงการ <span style={{ color: "var(--red)" }}>*</span></label>
            <DateInput value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} className="w-full" />
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
