"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import Button from "./Button";

/* ปุ่มเลือกค่าเดี่ยวหน้าตา/ขนาดเดียวกับปุ่มตัวกรอง (ui-filter-trigger) — ชื่อ+ไอคอน
   อยู่ในปุ่มเอง ไม่มีป้ายนอกปุ่ม เปิดเมนูตัวเลือกแผงเดียว (คลาสชุด ui-select-menu)
   ใช้กับตัวควบคุมมุมมองบน toolbar ที่ต้องการปุ่มกะทัดรัด เช่น จัดกลุ่ม/เรียง
   (มติผู้ใช้ 2026-08-08 — ให้เข้าชุดกับปุ่มตัวกรองข้าง ๆ)

   props:
     icon     : lucide icon แสดงหน้าชื่อปุ่ม
     label    : ชื่อบนปุ่ม (คงที่ ไม่สลับเป็นค่าที่เลือก)
     value    : ค่าที่เลือกอยู่
     onChange : (value) => void
     options  : [{ value, label }]
     isActive : (value) => boolean — ค่าที่ "ไม่ใช่ค่าตั้งต้น" ทำปุ่มติดสี accent
                พร้อมชิปบอกค่าที่เลือก (แบบเดียวกับ badge จำนวนของปุ่มตัวกรอง)
     showValue: โชว์ชิปค่าที่เลือกเสมอแม้เป็นค่าตั้งต้น (ชิปสีกลาง จะกลายเป็น accent
                เมื่อ isActive จริง) — ใช้กับตัวควบคุมที่มีผลตลอดเวลาอย่าง "เรียง"
                ซึ่งไม่มีสถานะ "ปิด" ให้ซ่อนชิปได้
     title    : tooltip ของปุ่ม (ดีฟอลต์ = label) */
export default function MenuSelect({ icon: Icon, label, value, onChange, options = [], isActive, showValue = false, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  /* เมนูเปิดผ่าน portal + position:fixed แบบเดียวกับ FilterPopover/ui-select-menu —
     วางเป็น absolute ในการ์ดจะโดน overflow ของการ์ดตัดทิ้ง */
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 170);
      const menuHeight = menuRef.current?.offsetHeight || 220;
      const roomBelow = window.innerHeight - rect.bottom;
      const above = roomBelow < menuHeight + 12 && rect.top > roomBelow;
      const next = {
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(120, (above ? rect.top : roomBelow) - 14),
      };
      if (above) next.bottom = window.innerHeight - rect.top + 6;
      else next.top = rect.bottom + 6;
      setMenuStyle(next);
    };
    const onDown = (event) => {
      if (!ref.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    place();
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

  const active = isActive ? isActive(value) : false;
  const current = options.find((option) => option.value === value);

  return (
    <div ref={ref} className="ui-menu-root">
      <Button
        className={`ui-filter-trigger ${active ? "active" : ""}`.trim()}
        onClick={() => setOpen((v) => !v)}
        title={title || label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {Icon && <Icon size={14} />}
        {label}
        {current && (showValue || active) && (
          <span className={`chip${active ? " chip-accent" : ""}`}>{current.label}</span>
        )}
        <ChevronDown size={14} className={`ui-menu-caret${open ? " open" : ""}`} />
      </Button>

      {open && typeof document !== "undefined" && createPortal(
        <div ref={menuRef} className="ui-select-menu" style={menuStyle} role="menu">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`ui-select-option ${selected ? "selected" : ""}`.trim()}
                onClick={() => { onChange?.(option.value); setOpen(false); }}
              >
                <span>{option.label}</span>
                {selected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
