"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

  // แผงเปิดผ่าน portal + position:fixed แบบเดียวกับ ui-select-menu — ถ้าวางเป็น
  // absolute ในการ์ด แผงโดน overflow:hidden ของการ์ด (เช่น SaSection) ตัดทิ้ง
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(window.innerWidth * 0.94, 420);
      // ใช้ความสูงจริงของแผง (effect รันหลัง portal mount แล้ว) — ประมาณการ 348
      // เป็นแค่ fallback; ถ้าเดาสูงเกินจะพลิกขึ้นบนทั้งที่ข้างล่างมีที่พอ
      const panelHeight = panelRef.current?.offsetHeight || Math.min(348, window.innerHeight - 16);
      const roomBelow = window.innerHeight - rect.bottom;
      const above = roomBelow < panelHeight + 12 && rect.top > roomBelow;
      const style = {
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        zIndex: 10050,
        // จอเตี้ย: จำกัดสูงตามพื้นที่ฝั่งที่เปิด แล้วให้ pane ข้างในเลื่อนเอง
        maxHeight: Math.max(120, (above ? rect.top : roomBelow) - 14),
      };
      // พลิกขึ้นบน: ยึด "ขอบล่างแผง" ไว้เหนือปุ่มด้วย bottom — ถ้าคำนวณ top จาก
      // ความสูงประมาณการ แผงจริงที่เตี้ยกว่า (กลุ่มตัวกรองน้อย) จะลอยห่างจากปุ่ม
      if (above) style.bottom = window.innerHeight - rect.top + 6;
      else style.top = rect.bottom + 6;
      setPanelStyle(style);
    };
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    place();
    // วัดซ้ำหลังแผงได้ width จริง — รอบแรกวัดตอนยังไม่จัดตำแหน่ง ความสูงอาจคลาดจากการตัดบรรทัด
    const raf = requestAnimationFrame(place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const active = count > 0;
  const activeGroup = groups.find((g) => g.key === activeKey) || groups[0];

  const toggle = (group, value) => {
    const sel = group.selected;
    if (group.single) group.onChange(sel.includes(value) ? [] : [value]);
    else group.onChange(sel.includes(value) ? sel.filter((v) => v !== value) : [...sel, value]);
  };

  return (
    <div ref={ref} className="ui-filter-root" style={{ position: "relative" }}>
      <button
        type="button"
        className={`btn ui-filter-trigger ${active ? "active" : ""}`.trim()}
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
          <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-fg)", borderColor: "transparent", minWidth: "18px", justifyContent: "center" }}>{count}</span>
        )}
        <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="glass-panel ui-filter-popover" style={{ ...panelStyle, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                    className={`ui-filter-group ${isActive ? "active" : ""}`.trim()}
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
                    {n > 0 && <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-fg)", borderColor: "transparent", minWidth: "18px", justifyContent: "center" }}>{n}</span>}
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
                      className={`ui-filter-option ${checked ? "selected" : ""}`.trim()}
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
                        {checked && (round ? <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-fg)" }} /> : <Check size={12} color="var(--accent-fg)" strokeWidth={3} />)}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
