"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

// Edit a master product's catalog/spec fields. Customer linkage + excise
// approval are NOT here — they live on the registration (/excise).
const FIELDS = [
  "fgCode", "productDescription", "brandName",
  "volume", "volumeUnit", "costPrice", "retailPriceIncVat",
];

export default function EditProductModal({ open, onClose, onSaved, product, brandOptions = [] }) {
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

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title={`แก้ไขสินค้า — ${product.fgCode}`} size="lg">
      <form onSubmit={submit}>
        <div className="p-4 space-y-5">
          <div>
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">ข้อมูลสินค้า</h3>
            <div className="form-grid cols-2" style={{ gap: "14px" }}>
              <div className="col-span-2 form-group">
                <label>ลูกค้าเจ้าของสินค้า</label>
                <input
                  type="text"
                  value={product.customerName || "-"}
                  readOnly
                  disabled
                  className="premium-input w-full bg-[var(--panel-2)] text-[var(--text-2)] cursor-not-allowed"
                />
                <span className="text-[11px] text-[var(--text-3)]">
                  เปลี่ยนเจ้าของได้ที่ขั้นตอนการขึ้นทะเบียนสรรพสามิต
                </span>
              </div>
              <div className="col-span-2">
                {field("fgCode", "รหัสสินค้า (FG Code)")}
                
                {(() => {
                  const cat = getCategoryInfo(form.fgCode);
                  if (!form.fgCode) {
                    return <span className="text-[11px] text-[var(--text-3)]">เฉพาะหมวด 01-002 เท่านั้นที่ระบบคิดภาษีสรรพสามิตอัตโนมัติ</span>;
                  }
                  if (!cat.code) {
                    return <div className="mt-1 text-[11px] text-[var(--text-3)] italic">รูปแบบรหัส FG ไม่ถูกต้อง (ไม่พบโครงสร้างหมวดหมู่ XX-YYY)</div>;
                  }
                  if (!cat.found) {
                    if (productTypes.length === 0) return null; // Still loading
                    return <div className="mt-1 text-[11px] text-[var(--red)] bg-[var(--red-soft)] p-2 rounded border border-[var(--border)]">พบหมวดหมู่ <strong>{cat.code}</strong> แต่ไม่มีในฐานข้อมูล</div>;
                  }
                  
                  const isExcise = cat.code === "01-002";
                  return (
                    <div className={`mt-1 p-2 text-[11px] rounded border border-[var(--border)] flex flex-col gap-0.5 ${isExcise ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--text-2)]"}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono bg-white/50 px-1 rounded text-[9px] font-bold">{cat.code}</span>
                        <span className="font-semibold">{cat.typeInfo.nameTh || cat.typeInfo.nameEn}</span>
                      </div>
                      <div className="opacity-80 pl-1 text-[10px]">
                        กลุ่มหลัก: {cat.typeInfo.mainCategoryName}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {field("productDescription", "รายละเอียดสินค้า")}
              {field("brandName", "ชื่อแบรนด์", "text", { list: "edit-brand-options", placeholder: "เลือกแบรนด์ของลูกค้า หรือพิมพ์ใหม่" })}
              <datalist id="edit-brand-options">
                {brandOptions.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">ข้อมูลบรรจุภัณฑ์และราคา</h3>
            <div className="form-grid cols-3" style={{ gap: "14px" }}>
              <div className="form-group">
                <label>ปริมาตร/น้ำหนักบรรจุ</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={form.volume ?? ""}
                    onChange={(e) => set("volume", e.target.value)}
                    className="premium-input flex-1 font-mono"
                    min="0.01"
                    step="0.01"
                  />
                  <select
                    value={form.volumeUnit || "ml"}
                    onChange={(e) => set("volumeUnit", e.target.value)}
                    className="premium-select"
                    style={{ width: "80px" }}
                  >
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="oz">oz</option>
                    <option value="L">L</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>
              {field("costPrice", "ราคาโรงงาน (บาท)", "number", { min: "0", step: "0.01" })}
              {field("retailPriceIncVat", "ราคาขายปลีก (รวม VAT)", "number", { min: "0", step: "0.01" })}
            </div>
          </div>

          {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4 pt-3 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn" disabled={submitting}>ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-6 disabled:opacity-50">
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
