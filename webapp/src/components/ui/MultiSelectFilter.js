"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";

// ปุ่มกรองแบบเลือกได้หลายค่า (multi-select) ใช้ร่วมกันในแถบเครื่องมือ
// props:
//   label    : ป้ายปุ่ม (เช่น "ประเภท", "สถานะ")
//   icon     : ไอคอน lucide (optional) แสดงหน้า label
//   options  : [{ value, label }]
//   selected : string[] ค่าที่ถูกเลือกอยู่
//   onChange : (next: string[]) => void
//   single   : true = เลือกได้ค่าเดียว (เลือกใหม่แทนค่าเดิม / กดซ้ำเพื่อยกเลิก) แล้วปิดเมนู
// ว่าง = ไม่กรอง (แสดงทุกค่า). ปุ่มจะ "ติดสี" เมื่อมีการเลือก เพื่อให้เห็นชัด
export default function MultiSelectFilter({ label, icon: Icon, options, selected, onChange, single = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = selected.length > 0;
  const selectedLabel = single && active ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : null;
  const toggle = (value) => {
    if (single) {
      onChange(selected.includes(value) ? [] : [value]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        title={`กรองตาม${label} (เลือกได้หลายค่า)`}
        style={{
          height: "var(--ctl-h)",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          fontWeight: 500,
          border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
          background: active ? "var(--accent-soft)" : "var(--panel)",
          color: active ? "var(--accent)" : "var(--text-2)",
        }}
      >
        {Icon && <Icon size={14} />}
        {label}
        {active && (
          single ? (
            <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-fg)", borderColor: "transparent" }}>{selectedLabel}</span>
          ) : (
            <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-fg)", borderColor: "transparent", minWidth: "18px", justifyContent: "center" }}>{selected.length}</span>
          )
        )}
        <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div
          className="glass-panel"
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, padding: "6px", minWidth: "180px", maxHeight: "320px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "8px", fontSize: "12px", color: "var(--text-3)" }}>ไม่มีตัวเลือก</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", width: "100%",
                    padding: "7px 8px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                    fontSize: "13px", border: "none",
                    background: checked ? "var(--accent-soft)" : "transparent",
                    color: checked ? "var(--accent)" : "var(--text)",
                    fontWeight: checked ? 600 : 400,
                  }}
                >
                  <span style={{ width: "16px", height: "16px", borderRadius: single ? "50%" : "4px", border: checked ? "none" : "1.5px solid var(--border)", background: checked ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {checked && (single ? <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-fg)" }} /> : <Check size={12} color="var(--accent-fg)" strokeWidth={3} />)}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                </button>
              );
            })
          )}
          {active && (
            <button type="button" className="btn ghost" onClick={() => onChange([])} style={{ fontSize: "12px", color: "var(--text-3)", justifyContent: "flex-start", marginTop: "2px" }}>
              <X size={12} /> ล้าง{label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
