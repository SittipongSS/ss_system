"use client";
import { Search } from "lucide-react";

// Unified list controls: segmented status filter + search + caller extras (date
// pickers, FilterPopover, …). Lives in the ListPanel `toolbar` slot and returns a
// **fragment** — ListPanel wraps `.toolbar` itself (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md
// §รายการ — ListPanel) ⇒ ห้ามห่อ `<div className="toolbar">` ซ้ำที่นี่ (ด่าน LP3)
// ช่องค้นหาไม่ตั้งความกว้างเอง — `.search-glass` คุม min(300px, 100%) ให้ทุกหน้าเท่ากัน
//
//   filters      [{ key, label }]  — segmented chips (optional)
//   activeFilter / onFilter        — controlled segmented value
//   search / onSearch              — controlled search text
//   searchLabel                    — aria-label ของช่องค้นหา (placeholder ไม่ใช่ชื่อที่โปรแกรมอ่านจอใช้)
//   children                       — extra controls, pushed to the right
export default function FilterBar({
  filters,
  activeFilter,
  onFilter,
  search,
  onSearch,
  searchPlaceholder = "ค้นหา...",
  searchLabel = "ค้นหารายการ",
  children,
}) {
  return (
    <>
      {filters && (
        <div className="segmented">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={activeFilter === f.key ? "active" : ""}
              onClick={() => onFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {onSearch && (
        <div className="search-glass">
          <Search size={18} color="var(--text-3)" aria-hidden="true" />
          <input autoComplete="off"
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        </div>
      )}

      <div className="spacer" />
      {children}
    </>
  );
}
