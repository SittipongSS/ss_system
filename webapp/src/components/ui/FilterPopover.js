"use client";
import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, ChevronDown, X, Check } from "lucide-react";

// ปุ่มเดียวยุบตัวกรองหลายตัวไว้ในแผงแบบ two-pane (ซ้าย=หมวด, ขวา=ตัวเลือก)
// props:
//   groups : [{ key, label, icon?, options:[{value,label}], selected:string[], onChange, single? }]
//   count  : จำนวนตัวกรองที่ active (badge + ติดสีปุ่ม)
//   onClear: ล้างทั้งหมด
//   label  : ป้ายปุ่ม (ดีฟอลต์ "ตัวกรอง")
export default function FilterPopover({ groups = [], count = 0, onClear, label = "ตัวกรอง" }) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(groups[0]?.key);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = count > 0;
  const activeGroup = groups.find((g) => g.key === activeKey) || groups[0];

  const toggle = (group, value) => {
    const sel = group.selected;
    if (group.single) group.onChange(sel.includes(value) ? [] : [value]);
    else group.onChange(sel.includes(value) ? sel.filter((v) => v !== value) : [...sel, value]);
  };

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
        <div className="glass-panel" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, width: "min(94vw, 420px)", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>{label}</span>
            {active && (
              <button type="button" className="btn ghost sm" onClick={onClear} style={{ color: "var(--text-3)" }} title="ล้างตัวกรองทั้งหมด">
                <X size={12} /> ล้างทั้งหมด ({count})
              </button>
            )}
          </div>

          <div style={{ display: "flex", minHeight: 0 }}>
            {/* ซ้าย: รายชื่อหมวดกรอง */}
            <div style={{ width: "42%", borderRight: "1px solid var(--border)", maxHeight: "300px", overflowY: "auto", padding: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {groups.map((g) => {
                const isActive = g.key === activeGroup?.key;
                const n = g.selected.length;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveKey(g.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px", width: "100%",
                      padding: "8px 10px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                      fontSize: "13px", border: "none",
                      background: isActive ? "var(--accent-soft)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-2)",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {g.icon && <g.icon size={14} style={{ flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                    {n > 0 && <span className="chip" style={{ background: "var(--accent)", color: "#fff", borderColor: "transparent", minWidth: "18px", justifyContent: "center" }}>{n}</span>}
                  </button>
                );
              })}
            </div>

            {/* ขวา: ตัวเลือกของหมวดที่เลือก */}
            <div style={{ flex: 1, maxHeight: "300px", overflowY: "auto", padding: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {!activeGroup || activeGroup.options.length === 0 ? (
                <div style={{ padding: "10px", fontSize: "12px", color: "var(--text-3)" }}>ไม่มีตัวเลือก</div>
              ) : (
                activeGroup.options.map((opt) => {
                  const checked = activeGroup.selected.includes(opt.value);
                  const round = activeGroup.single;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggle(activeGroup, opt.value)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px", width: "100%",
                        padding: "7px 8px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                        fontSize: "13px", border: "none",
                        background: checked ? "var(--accent-soft)" : "transparent",
                        color: checked ? "var(--accent)" : "var(--text)",
                        fontWeight: checked ? 600 : 400,
                      }}
                    >
                      <span style={{ width: "16px", height: "16px", borderRadius: round ? "50%" : "4px", border: checked ? "none" : "1.5px solid var(--border)", background: checked ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked && (round ? <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} /> : <Check size={12} color="#fff" strokeWidth={3} />)}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
