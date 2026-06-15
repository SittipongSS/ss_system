"use client";
import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, ChevronDown, X } from "lucide-react";

// ปุ่มเดียวยุบตัวกรองหลายตัวไว้ข้างใน — ลดความรกของ toolbar
// props:
//   count    : จำนวนตัวกรองที่ active (โชว์เป็น badge + ติดสีปุ่ม)
//   onClear  : ล้างตัวกรองทั้งหมด
//   label    : ป้ายปุ่ม (ดีฟอลต์ "ตัวกรอง")
//   children : ตัวกรอง (เช่น <MultiSelectFilter/> หลายตัว) จัดเรียงในแผง
export default function FilterPopover({ count = 0, onClear, label = "ตัวกรอง", children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = count > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        title="ตัวกรอง"
        style={{
          height: "var(--ctl-h)", gap: "6px", fontWeight: 500,
          border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
          background: active ? "var(--accent-soft)" : "var(--panel)",
          color: active ? "var(--accent)" : "var(--text-2)",
        }}
      >
        <SlidersHorizontal size={14} />
        {label}
        {active && (
          <span className="chip" style={{ background: "var(--accent)", color: "#fff", borderColor: "transparent", minWidth: "18px", justifyContent: "center" }}>{count}</span>
        )}
        <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div className="glass-panel" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, padding: "12px", width: "min(92vw, 280px)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>{label}</span>
            {active && (
              <button type="button" className="btn ghost sm" onClick={onClear} style={{ color: "var(--text-3)" }} title="ล้างตัวกรองทั้งหมด">
                <X size={12} /> ล้างทั้งหมด ({count})
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
