"use client";
import { useState } from "react";
import { Plus } from "lucide-react";

// ปุ่ม "+" เพิ่มแบรนด์ใหม่เข้า customers.brands[] จากฟอร์มที่กำลังเลือกแบรนด์
// (กฎ ลูกค้า›แบรนด์›สินค้า: แบรนด์เกิดที่ลูกค้าเสมอ — ฟอร์มสินค้า/โครงการ/ดีล
// ไม่รับพิมพ์แบรนด์ลอยอีก). ยิง PATCH { addBrand } ซึ่งฝั่ง API เพิ่มแบรนด์
// อย่างเดียวโดยไม่ trigger re-approval ของลูกค้า.
// onAdded(brand, updatedCustomer) — brand = {th, en} ที่เพิ่มสำเร็จ.
export default function AddBrandButton({ customerId, onAdded, disabled }) {
  const [open, setOpen] = useState(false);
  const [th, setTh] = useState("");
  const [en, setEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => { setOpen(false); setTh(""); setEn(""); setError(""); };

  const save = async () => {
    const brand = { th: th.trim(), en: en.trim() };
    if (!brand.th && !brand.en) { setError("ระบุชื่อแบรนด์อย่างน้อย 1 ภาษา"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addBrand: brand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เพิ่มแบรนด์ไม่สำเร็จ");
      onAdded?.(brand, data);
      close();
    } catch (e) {
      setError(e.message || "เพิ่มแบรนด์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // Enter ในช่องกรอก = บันทึกแบรนด์ (กัน submit ฟอร์มแม่)
  const onKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        className="btn-icon"
        disabled={disabled || saving}
        title={disabled ? "เลือกลูกค้าก่อน" : "เพิ่มแบรนด์ใหม่ให้ลูกค้ารายนี้"}
        aria-label="เพิ่มแบรนด์ใหม่"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Plus size={16} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50,
            width: "min(280px, 78vw)", background: "var(--panel)",
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,.14)", padding: "12px",
            display: "flex", flexDirection: "column", gap: "8px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600 }}>เพิ่มแบรนด์ใหม่ให้ลูกค้ารายนี้</div>
          <input autoFocus className="premium-input text-xs w-full" placeholder="ชื่อแบรนด์ (ไทย)" value={th} onChange={(e) => setTh(e.target.value)} onKeyDown={onKey} />
          <input className="premium-input text-xs w-full" placeholder="ชื่อแบรนด์ (อังกฤษ)" value={en} onChange={(e) => setEn(e.target.value)} onKeyDown={onKey} />
          {error && <div style={{ fontSize: "11px", color: "var(--red)" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
            <button type="button" className="btn" style={{ fontSize: "12px" }} onClick={close}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" style={{ fontSize: "12px" }} disabled={saving} onClick={save}>
              {saving ? "กำลังเพิ่ม..." : "เพิ่มแบรนด์"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
