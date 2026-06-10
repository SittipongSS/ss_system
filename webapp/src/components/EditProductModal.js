"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

// Edit a master product's catalog/spec fields. Customer linkage + excise
// approval are NOT here — they live on the registration (/excise).
const FIELDS = [
  "fgCode", "productDescription", "brandName",
  "volume", "costPrice", "retailPriceIncVat",
];

export default function EditProductModal({ open, onClose, onSaved, product }) {
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && product) {
      const seed = {};
      for (const k of FIELDS) seed[k] = product[k] ?? "";
      setForm(seed);
      setError(null);
    }
  }, [open, product?.id]);

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
      const res = await fetch(`/api/products/${product.id}`, {
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
            <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div className="col-span-2">
                {field("fgCode", "รหัสสินค้า (FG Code)")}
                <span className="text-[11px] text-[var(--text-3)]">เฉพาะหมวด 01-002 เท่านั้นที่ระบบคิดภาษีสรรพสามิตอัตโนมัติ</span>
              </div>
              {field("productDescription", "รายละเอียดสินค้า")}
              {field("brandName", "ชื่อแบรนด์")}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-2 mb-3">ข้อมูลสรรพสามิต</h3>
            <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {field("volume", "ปริมาตร (ml)", "number", { min: "1" })}
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
