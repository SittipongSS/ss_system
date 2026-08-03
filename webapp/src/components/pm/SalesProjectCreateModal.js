"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import BusinessLineSelect from "@/components/ui/BusinessLineSelect";
import PersonSelect, { personIdByName } from "@/components/ui/PersonSelect";
import { personFullName } from "@/lib/ui/personName";
import { brandSelectOptions } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL, CUSTOMER_PICKER_EMPTY_HINT } from "@/lib/uiLabels";
import { cachedFetchJson } from "@/lib/apiCache";
import { useRole } from "@/lib/roleContext";

const today = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export default function SalesProjectCreateModal({ open, onClose, onSuccess, editingId = null, initialData = null, customers = [], categories = [] }) {
  const [users, setUsers] = useState([]);
  // ล็อกช่องผู้รับผิดชอบตามตำแหน่งผู้สร้าง (มติผู้ใช้): AE/Senior→ผู้ดูแล, AC→ผู้ประสานงาน,
  // AE Supervisor→ผู้ตรวจสอบ; role อื่นเลือกได้. ล็อกเฉพาะตอนสร้างใหม่.
  const role = useRole();
  const [myId, setMyId] = useState("");
  const [fallbackName, setFallbackName] = useState("");
  useEffect(() => {
    try {
      setMyId(localStorage.getItem("userId") || "");
      setFallbackName(localStorage.getItem("userName") || "");
    } catch { /* ssr */ }
  }, []);
  /* ช่องนี้เก็บ **ชื่อเต็ม** ลง DB — ห้ามใช้ `localStorage.userName` ตรง ๆ เพราะเป็น
     ชื่อย่อ แล้ว `personIdByName` ข้างล่างจะจับคู่ไม่ได้ (ดูคอมเมนต์เดียวกันที่
     ProjectFormModal) */
  const myName = useMemo(
    () => personFullName(users.find((u) => u.id === myId)) || fallbackName,
    [users, myId, fallbackName],
  );
  const lockPeopleField = (!editingId && myName)
    ? ((role === "ae" || role === "senior_ae") ? "aeOwner"
      : role === "ac" ? "preparedBy"
      : role === "ae_supervisor" ? "aeSupervisor" : null)
    : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", customerId: "", brand: "", line: "", mainCode: "", typeCode: "",
    productMainCategory: "", productSubCategory: "", startDate: today(), dueDate: "",
    aeOwner: "", preparedBy: "", aeSupervisor: "",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    const categoryCode = initialData?.productMainCategory || "";
    const [mainCode = "", typeCode = ""] = categoryCode.split("-");
    setForm({
      name: initialData?.name || "", customerId: initialData?.customerId || "", brand: initialData?.metadata?.brand || "", line: initialData?.line || "",
      mainCode, typeCode, productMainCategory: categoryCode, productSubCategory: initialData?.productSubCategory || "",
      startDate: initialData?.startDate || today(), dueDate: initialData?.dueDate || "", aeOwner: initialData?.aeOwner || "",
      preparedBy: initialData?.preparedBy || "", aeSupervisor: initialData?.aeSupervisor || "",
    });
    cachedFetchJson("/api/pm/assignable-users")
      .then((rows) => setUsers(rows || []))
      .catch(() => setUsers([]));
  }, [open, initialData]);

  const brandOptions = useMemo(() => {
    const customer = customers.find((row) => row.id === form.customerId);
    const unique = [...new Map(brandSelectOptions(customer?.brands || []).map((option) => [option.value, option])).values()];
    if (form.brand && !unique.some((option) => option.value === form.brand)) unique.unshift({ value: form.brand, label: form.brand });
    return unique;
  }, [customers, form.customerId, form.brand]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("กรุณาระบุชื่อโครงการ");
    if (!form.customerId) return setError("กรุณาเลือกลูกค้า");
    if (!form.startDate) return setError("กรุณาระบุวันที่เริ่มโครงการ");
    // บังคับเลือกสายธุรกิจ — ทั้งตอนสร้างและตอนแก้ (โครงการเก่าที่ยังว่างจะได้เคลียร์
    // ตัวเองตอนมีคนแตะ ไม่ต้องมีงานกวาดแยก) · ดู mig 0191 ว่าทำไมไม่ใช้ default แทน
    if (!form.line) return setError("กรุณาเลือกสายธุรกิจ (สินค้า / บริการ)");
    setSubmitting(true);
    setError("");
    try {
      const customer = customers.find((row) => row.id === form.customerId);
      const res = await fetch(editingId ? `/api/pm/projects/${editingId}` : "/api/sa/projects", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(lockPeopleField ? { [lockPeopleField]: myName } : {}), // บังคับช่องที่ล็อก = ผู้สร้าง
          // ตัวตนของผู้ดูแลเดินคู่ชื่อเสมอ (mig 0190) — ชื่อไว้พิมพ์เอกสาร id ไว้แจ้งเตือน
          // จับคู่ไม่ได้ (ใบเก่าที่เก็บชื่อย่อ) = คง id เดิมไว้ ห้ามล้างเป็น null
          aeOwnerId: personIdByName(users, lockPeopleField === "aeOwner" ? myName : form.aeOwner)
            ?? initialData?.aeOwnerId ?? null,
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
        <p style={{ marginTop: 0, color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
          ข้อมูลระดับโครงการใช้ร่วมกันทุกดีล ส่วนไทม์ไลน์และเอกสารจะมาจากดีลที่ผูกไว้
        </p>
        <div className="pm-form-grid gap-[18px]">
          <div className="form-group col-span-2">
            <label>ชื่อโครงการ <span className="text-[var(--red)]">*</span></label>
            <input className="premium-input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>{CUSTOMER_NAME_LABEL} <span className="text-[var(--red)]">*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={(customerId) => setForm((f) => ({ ...f, customerId, brand: "" }))}
              options={customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.arCode} — ${c.name}` : c.name, search: `${c.arCode || ""} ${c.name}` }))}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              emptyText={CUSTOMER_PICKER_EMPTY_HINT}
            />
          </div>
          <div className="form-group">
            <label>แบรนด์ (อังกฤษ · ไทย)</label>
            <SearchableSelect entity="brand" disabled={!form.customerId} value={form.brand} onChange={(brand) => setForm((f) => ({ ...f, brand }))} options={brandOptions} placeholder={form.customerId ? "เลือกแบรนด์..." : "เลือกลูกค้าก่อน"} emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ — เพิ่มที่หน้าข้อมูลลูกค้า" />
          </div>
          {/* สายธุรกิจ (mig 0191) — ตัดสินว่าโครงการนี้ "จบยังไง" ⇒ เลือกแม่แบบไทม์ไลน์
              ⚠️ วางไว้ก่อนหมวดสินค้าเพราะเป็นคำถามที่กว้างกว่า ตอบก่อนแล้วที่เหลือตามมา */}
          <div className="form-group col-span-2">
            <label>สายธุรกิจ <span className="text-[var(--red)]">*</span></label>
            <BusinessLineSelect required value={form.line} onChange={(line) => setForm((f) => ({ ...f, line }))} />
          </div>
          <ProductCategorySelect
            categories={categories}
            value={form.productMainCategory}
            mainValue={form.mainCode}
            subValue={form.typeCode}
            onChange={(productMainCategory, meta) => setForm((f) => ({ ...f, mainCode: meta.mainCode, typeCode: meta.typeCode, productMainCategory, productSubCategory: meta.category?.nameTh || meta.category?.nameEn || "" }))}
          />
          <div className="form-group">
            <label>วันที่เริ่มโครงการ <span className="text-[var(--red)]">*</span></label>
            <DateInput value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} className="w-full" />
          </div>
          <div className="form-group">
            <label>วันที่สิ้นสุด</label>
            <DateInput value={form.dueDate} onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))} className="w-full" />
          </div>
          <div className="form-group col-span-2"><label>ผู้ดูแล (AE){lockPeopleField === "aeOwner" ? " · ล็อกเป็นคุณ" : ""}</label><PersonSelect by="name" users={users.filter((u) => ["ae", "senior_ae", "ae_supervisor"].includes(u.role))} value={lockPeopleField === "aeOwner" ? myName : form.aeOwner} disabled={lockPeopleField === "aeOwner"} ariaLabel="ผู้ดูแล (AE)" onChange={(aeOwner) => setForm((f) => ({ ...f, aeOwner }))} /></div>
          <div className="form-group"><label>ผู้ประสานงาน (AC){lockPeopleField === "preparedBy" ? " · ล็อกเป็นคุณ" : ""}</label><PersonSelect by="name" users={users.filter((u) => u.role === "ac")} value={lockPeopleField === "preparedBy" ? myName : form.preparedBy} disabled={lockPeopleField === "preparedBy"} ariaLabel="ผู้ประสานงาน (AC)" onChange={(preparedBy) => setForm((f) => ({ ...f, preparedBy }))} /></div>
          <div className="form-group"><label>ผู้ตรวจสอบ (AE Supervisor){lockPeopleField === "aeSupervisor" ? " · ล็อกเป็นคุณ" : ""}</label><PersonSelect by="name" users={users.filter((u) => u.role === "ae_supervisor")} value={lockPeopleField === "aeSupervisor" ? myName : form.aeSupervisor} disabled={lockPeopleField === "aeSupervisor"} ariaLabel="ผู้ตรวจสอบ (AE Supervisor)" onChange={(aeSupervisor) => setForm((f) => ({ ...f, aeSupervisor }))} /></div>
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: "var(--fs-7)" }}>{error}</p>}
        <div className="form-action-bar">
          <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้างโครงการ"}</button>
        </div>
      </form>
    </Modal>
  );
}
