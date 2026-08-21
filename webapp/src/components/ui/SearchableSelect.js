"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { searchableForEntity } from "@/lib/uiRules";

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder,
  disabled,
  allowFreeText = false,
  emptyText,
  size = "md",
  searchable = true,
  searchPlaceholder = "ค้นหา...",
  entity,
  className = "",
  ariaLabel,
}) {
  const searchEnabled = searchableForEntity(entity, searchable);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const selected = options.find((option) => String(option.value) === String(value ?? ""));
  const selectedLabel = selected ? selected.label : allowFreeText ? value || "" : "";
  // ⚠️ เพดานนี้เคยตัดที่ 100 **เงียบ ๆ** — ชุดที่ยาวกว่านั้น (หมวดสินค้า = 105 แถว
  // บน prod) จะหายท้ายลิสต์โดยไม่มีอะไรบอก · ตอนนี้ตัดที่ 200 และ **บอกว่าตัด**
  const { rows, hidden } = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    const matched = options.filter((option) => (
      // หัวกลุ่มไม่ถูกกรองด้วยคำค้น — มันเป็นป้ายบอกตำแหน่ง ไม่ใช่ตัวเลือก
      // (หัวที่ไม่เหลือลูกจะถูกตัดทิ้งในขั้นถัดไป ไม่ใช่ปล่อยค้างเป็นหัวลอย)
      option.group
      || !needle
      || String(option.search ?? option.label ?? "").toLocaleLowerCase("th").includes(needle)
    ));
    // ตัดหัวกลุ่มที่ไม่เหลือลูกแล้ว — หัวลอยคือคำโกหกว่ากลุ่มนั้นมีของให้เลือก
    const pruned = matched.filter((option, i) => {
      if (!option.group) return true;
      const next = matched[i + 1];
      return !!next && !next.group;
    });
    return { rows: pruned.slice(0, 200), hidden: Math.max(0, pruned.length - 200) };
  }, [options, search]);
  const filtered = rows;
  // Enter = เลือกตัวแรกที่ "เลือกได้จริง" ไม่ใช่หัวกลุ่ม
  const firstSelectable = filtered.find((option) => !option.group);

  const placeMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const roomBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(320, Math.max(80, filtered.length * 38 + (searchEnabled ? 48 : 0)));
    const above = roomBelow < estimatedHeight + 12 && rect.top > roomBelow;
    setMenuStyle({
      position: "fixed",
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 220) - 8)),
      top: above ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
      width: Math.max(rect.width, 220),
      maxHeight: above ? Math.max(140, rect.top - 16) : Math.max(140, roomBelow - 14),
    });
  }, [filtered.length, searchEnabled]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    placeMenu();
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, placeMenu]);

  const choose = (option) => {
    onChange?.(option.value);
    setSearch("");
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ui-select ui-searchable-select ${size === "sm" ? "compact" : ""} ${open ? "open" : ""} ${className}`.trim()}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) placeMenu();
          setOpen((current) => !current);
        }}
      >
        <span className={`ui-select-value ${selectedLabel ? "" : "placeholder"}`.trim()}>{selectedLabel || placeholder || "— เลือก —"}</span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="ui-select-menu ui-searchable-menu" style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {searchEnabled ? (
            <label className="ui-select-search">
              <Search size={15} aria-hidden="true" />
              <input autoComplete="off"
                autoFocus
                value={search}
                placeholder={searchPlaceholder}
                onChange={(event) => {
                  setSearch(event.target.value);
                  if (allowFreeText) onChange?.(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && firstSelectable) choose(firstSelectable);
                  if (event.key === "Escape") setOpen(false);
                }}
              />
            </label>
          ) : null}
          <div className="ui-select-options">
            {filtered.length ? filtered.map((option) => {
              // หัวกลุ่ม = ป้ายบอกตำแหน่ง ไม่ใช่ปุ่ม — ต้องไม่โฟกัสได้และไม่มี role="option"
              // ไม่งั้นคนใช้คีย์บอร์ดจะเดินไปเจอ "ตัวเลือก" ที่กดแล้วไม่มีอะไรเกิดขึ้น
              if (option.group) {
                return (
                  <div key={String(option.value)} className="ui-select-group" role="presentation">
                    {option.label}
                  </div>
                );
              }
              const isSelected = String(option.value) === String(value ?? "");
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`ui-select-option ${isSelected ? "selected" : ""}`.trim()}
                  onClick={() => choose(option)}
                >
                  <span>{option.render || option.label}</span>
                  {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              );
            }) : (
              <div className="ui-select-empty">
                {/* emptyText รับฟังก์ชันได้ด้วย — ผู้เรียกจะได้ตอบ "ทำไมของที่ค้นไม่อยู่ในลิสต์"
                    ตรงจุดที่ผู้ใช้ถามจริง ไม่ใช่ข้อความคงที่ที่ไม่รู้ว่าเขาค้นอะไร */}
                {typeof emptyText === "function"
                  ? emptyText(search.trim())
                  : emptyText || (allowFreeText ? "ไม่พบรายการ — ใช้ข้อความที่พิมพ์ได้" : "ไม่พบรายการ")}
              </div>
            )}
            {/* ⚠️ ตัดแล้วต้องบอก — ลิสต์ที่ถูกตัดเงียบ ๆ อ่านเหมือน "ไม่มีของชิ้นนั้น" */}
            {hidden > 0 && (
              <div className="ui-select-empty">
                ยังมีอีก {hidden} รายการ — พิมพ์เพื่อค้นให้แคบลง
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
