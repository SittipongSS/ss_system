"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// SearchableSelect กลางของระบบ — dropdown ที่พิมพ์ค้นหาได้ ใช้สไตล์เดียวกับ <Select>
// (trigger = .premium-input + ลูกศร chevron, เมนูลอยใต้ช่อง). รวม pattern เดิม
// (SearchableSelect ของ FG + SearchableTextSelect ของแบรนด์) ให้เป็นตัวเดียว
//
// options: [{ value, label, search?, render? }]
//   value  : ค่าที่ส่งกลับผ่าน onChange เมื่อเลือก
//   label  : ข้อความที่โชว์ในช่องเมื่อถูกเลือก (และ default ของ search/เมนู)
//   search : ข้อความใช้กรอง (ไม่ใส่ = ใช้ label)
//   render : JSX ที่จะแสดงในเมนู (ไม่ใส่ = ใช้ label)
// allowFreeText: พิมพ์ค่าใหม่เองได้ (เช่น แบรนด์) — onChange ส่งข้อความที่พิมพ์ทันที
// size: "md" (13px) | "sm" (12px, สูง 30px)
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  allowFreeText = false,
  emptyText,
  size = "md",
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected ? selected.label : allowFreeText ? value || "" : "";

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return options
      .filter((o) => String(o.search ?? o.label ?? "").toLowerCase().includes(s))
      .slice(0, 50);
  }, [options, search]);

  const fs = size === "sm" ? "12px" : "13px";

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          className="premium-input w-full"
          value={open ? search : selectedLabel}
          disabled={disabled}
          placeholder={placeholder || "ค้นหา..."}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            onChange(allowFreeText ? e.target.value : "");
          }}
          onFocus={() => {
            setSearch(allowFreeText ? value || "" : "");
            setOpen(true);
          }}
          style={{ paddingRight: "28px", fontSize: fs, ...(size === "sm" ? { height: "30px" } : {}) }}
        />
        <ChevronDown
          size={16}
          style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }}
        />
      </div>
      {open && !disabled && (
        <div
          style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", maxHeight: "220px", overflowY: "auto", zIndex: 50, marginTop: "4px", boxShadow: "0 8px 24px rgba(0,0,0,0.16)" }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "7px 10px", fontSize: fs, color: "var(--text-3)" }}>
              {emptyText || (allowFreeText ? "ไม่พบรายการ (พิมพ์เพื่อเพิ่มใหม่)" : "ไม่พบรายการ")}
            </div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                onMouseDown={(e) => e.preventDefault()} // กัน blur ก่อนคลิกติด
                onClick={() => { onChange(o.value); setSearch(""); setOpen(false); }}
                style={{ padding: "7px 10px", fontSize: fs, cursor: "pointer", borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {o.render || o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
