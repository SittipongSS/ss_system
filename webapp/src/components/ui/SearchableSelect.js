"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    return options
      .filter((option) => !needle || String(option.search ?? option.label ?? "").toLocaleLowerCase("th").includes(needle))
      .slice(0, 100);
  }, [options, search]);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
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
    };
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    place();
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [filtered.length, open, searchEnabled]);

  const choose = (option) => {
    onChange?.(option.value);
    setSearch("");
    setOpen(false);
    triggerRef.current?.focus();
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
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`ui-select-value ${selectedLabel ? "" : "placeholder"}`.trim()}>{selectedLabel || placeholder || "— เลือก —"}</span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="ui-select-menu ui-searchable-menu" style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {searchEnabled ? (
            <label className="ui-select-search">
              <Search size={15} aria-hidden="true" />
              <input
                autoFocus
                value={search}
                placeholder="ค้นหา..."
                onChange={(event) => {
                  setSearch(event.target.value);
                  if (allowFreeText) onChange?.(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filtered.length) choose(filtered[0]);
                  if (event.key === "Escape") setOpen(false);
                }}
              />
            </label>
          ) : null}
          <div className="ui-select-options">
            {filtered.length ? filtered.map((option) => {
              const isSelected = String(option.value) === String(value ?? "");
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`ui-select-option ${isSelected ? "selected" : ""}`.trim()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onClick={() => choose(option)}
                >
                  <span>{option.render || option.label}</span>
                  {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              );
            }) : (
              <div className="ui-select-empty">
                {emptyText || (allowFreeText ? "ไม่พบรายการ — ใช้ข้อความที่พิมพ์ได้" : "ไม่พบรายการ")}
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
