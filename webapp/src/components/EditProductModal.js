"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";

// Edit a master product's catalog/spec fields, including its owning customer.
// (Excise APPROVAL still lives on the registration.) Layout/styling mirrors the
// "add product" form on /database/products so both forms feel like one system.
const FIELDS = [
  "customerId",
  "fgCode", "productDescription", "brandName",
  "volume", "volumeUnit", "costPrice", "retailPriceIncVat",
];

export default function EditProductModal({ open, onClose, onSaved, product, brandOptions = [], customers = [] }) {
  const [form, setForm] = useState({});
  const [productTypes, setProductTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && product) {
      const seed = {};
      for (const k of FIELDS) seed[k] = product[k] ?? "";
      setForm(seed);
      setError(null);

      // Fetch product types if not already fetched
      if (productTypes.length === 0) {
        fetch("/api/master/product-types")
          .then(res => res.json())
          .then(data => setProductTypes(data))
          .catch(err => console.error("Failed to fetch product types", err));
      }
    }
  }, [open, product?.id]);

  const getCategoryInfo = (fgCode) => {
    if (!fgCode) return null;
    const m = fgCode.match(/(\d{2})-(\d{3})/);
    if (!m) return { found: false, code: null };
    const code = `${m[1]}-${m[2]}`;
    const typeInfo = productTypes.find(t => `${t.mainCategoryCode}-${t.typeCode}` === code);
    return { found: !!typeInfo, code, typeInfo };
  };

  if (!product) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Brand suggestions follow the selected customer's brands[] (fall back to the
  // parent-supplied list while customers aren't loaded). Changing the customer
  // clears the brand — the brand list is scoped per customer, same as the add form.
  const selCustomer = customers.find((c) => c.id === form.customerId);
  const brandOptionList = selCustomer
    ? [...new Set((selCustomer.brands || []).map((b) => (b || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    : brandOptions;

  const handleCustomerChange = (v) => setForm((f) => ({ ...f, customerId: v, brandName: "" }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
      ...form,
      volume: form.volume === "" ? null : parseFloat(form.volume),
      costPrice: form.costPrice === "" ? null : parseFloat(form.costPrice),
      retailPriceIncVat: form.retailPriceIncVat === "" ? null : parseFloat(form.retailPriceIncVat),
    };
    try {
      const res = await fetch(`/api/master/products/${product.id}`, {
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

  const field = (k, label, type = "text", extra = {}) => (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        value={form[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        className={`premium-input w-full ${type === "number" ? "font-mono" : ""}`}
        {...extra}
      />
    </div>
  );

  const cat = getCategoryInfo(form.fgCode);
  const catBox = (() => {
    if (!form.fgCode) {
      return <span className="text-xs text-[var(--text-3)] mt-1">เฉพาะหมวด 01-002 (น้ำหอมฉีดผิวกาย) เท่านั้นที่ระบบจะคิดภาษีสรรพสามิต</span>;
    }
    if (!cat.code) {
      return <div className="mt-2 text-xs text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
    }
    if (!cat.found) {
      if (productTypes.length === 0) return null; // ยังโหลดไม่เสร็จ
      return <div className="mt-2 text-xs text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">พบหมวดหมู่ <strong>{cat.code}</strong> แต่ไม่มีในฐานข้อมูล (อาจพิมพ์ผิด หรือเป็นหมวดใหม่)</div>;
    }

    const isExcise = cat.code === "01-002";
    return (
      <div className={`mt-2 p-3 text-xs rounded-lg border border-[var(--border)] flex flex-col gap-1 ${isExcise ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--text-2)]"}`}>
        <div className="flex items-center gap-2">
          <span className="font-mono bg-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold">{cat.code}</span>
          <span className="font-semibold">{cat.typeInfo.nameTh || cat.typeInfo.nameEn}</span>
        </div>
        <div className="text-[11px] opacity-80 pl-1">
          กลุ่มหลัก: {cat.typeInfo.mainCategoryName}
        </div>
        <div className={`mt-1 pl-1 font-semibold ${isExcise ? "" : "text-[var(--green)]"}`}>
          {isExcise ? "⚠️ สินค้านี้เข้าข่ายต้องเสียภาษีสรรพสามิต (ระบบจะคิดภาษีอัตโนมัติ)" : "✓ สินค้านี้ได้รับการยกเว้นภาษีสรรพสามิต"}
        </div>
      </div>
    );
  })();

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title={`แก้ไขสินค้า — ${product.fgCode}`} size="lg">
      <form onSubmit={submit}>
        {/* Section 1: product */}
        <div className="mb-[22px]">
          <div className="border-b border-[var(--border)] pb-3 mb-5">
            <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลหลักสินค้า (Product Details)</h3>
          </div>
          <div className="form-grid cols-2">
            <div className="form-group col-span-2">
              <label>รหัสสินค้า (FG Code) <span className="text-[var(--red)]">*</span></label>
              <input type="text" value={form.fgCode ?? ""} onChange={(e) => set("fgCode", e.target.value)} required placeholder="FG-AAA-BB-CCC-DDDD" className="premium-input w-full font-mono text-base" />
              {catBox}
            </div>
            <div className="form-group col-span-2">
              <label>รายละเอียดสินค้า <span className="text-[var(--red)]">*</span></label>
              <input type="text" value={form.productDescription ?? ""} onChange={(e) => set("productDescription", e.target.value)} required placeholder="เช่น Midnight Bloom 50ml" className="premium-input w-full" />
            </div>
            <div className="form-group">
              <label>ลูกค้าเจ้าของสินค้า <span className="text-[var(--red)]">*</span></label>
              <Select value={form.customerId ?? ""} onChange={(e) => handleCustomerChange(e.target.value)} required fullWidth>
                <option value="" disabled>— เลือกลูกค้า —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.arCode ? `${c.arCode} — ${c.name}` : c.name}</option>
                ))}
              </Select>
              <span className="text-xs text-[var(--text-3)] mt-1">เปลี่ยนเจ้าของแล้ว สินค้าจะกลับเป็น “รออนุมัติ” ให้ตรวจซ้ำ</span>
            </div>
            <div className="form-group">
              <label>ชื่อแบรนด์ <span className="text-[var(--red)]">*</span></label>
              <SearchableSelect
                allowFreeText
                disabled={!form.customerId}
                options={brandOptionList.map((b) => ({ value: b, label: b }))}
                value={form.brandName ?? ""}
                onChange={(v) => set("brandName", v)}
                placeholder={form.customerId ? "เลือกแบรนด์ หรือพิมพ์ใหม่" : "เลือกลูกค้าก่อน"}
                emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ (พิมพ์เพื่อเพิ่มใหม่)"
              />
            </div>
          </div>
        </div>

        {/* Section 2: packaging & pricing */}
        <div className="mb-[22px]">
          <div className="border-b border-[var(--border)] pb-3 mb-5">
            <h3 className="font-semibold text-[var(--text)]">2. ข้อมูลบรรจุภัณฑ์และราคา (Packaging & Pricing)</h3>
          </div>
          <div className="form-grid cols-3">
            <div className="form-group">
              <label>ปริมาตร/น้ำหนักบรรจุ <span className="text-[var(--red)]">*</span></label>
              <div className="flex gap-2">
                <input type="number" value={form.volume ?? ""} onChange={(e) => set("volume", e.target.value)} required min="0.01" step="0.01" className="premium-input flex-1 font-mono" />
                <Select value={form.volumeUnit || "ml"} onChange={(e) => set("volumeUnit", e.target.value)} style={{ width: "80px" }}>
                  <option value="ml">ml</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="oz">oz</option>
                  <option value="L">L</option>
                  <option value="pcs">pcs</option>
                </Select>
              </div>
            </div>
            {field("costPrice", "ราคาโรงงาน (บาท)", "number", { min: "0", step: "0.01" })}
            <div className="form-group">
              <label>ราคาขายปลีก <span className="text-[10px] font-normal text-[var(--text-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded ml-1">รวม VAT</span></label>
              <input type="number" value={form.retailPriceIncVat ?? ""} onChange={(e) => set("retailPriceIncVat", e.target.value)} min="0" step="0.01" className="premium-input w-full font-mono" />
            </div>
          </div>
        </div>

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2 mb-4">{error}</div>}

        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
