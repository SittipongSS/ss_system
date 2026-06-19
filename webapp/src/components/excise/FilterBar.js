"use client";
import { Search } from "lucide-react";

// Unified toolbar: segmented status filter + search + caller extras (export
// buttons, date pickers, …). Lives in the Workspace `toolbar` slot.
//
//   filters      [{ key, label }]  — segmented chips (optional)
//   activeFilter / onFilter        — controlled segmented value
//   search / onSearch              — controlled search text
//   children                       — extra controls, pushed to the right
export default function FilterBar({
  filters,
  activeFilter,
  onFilter,
  search,
  onSearch,
  searchPlaceholder = "ค้นหา...",
  children,
}) {
  return (
    <div className="toolbar">
      {filters && (
        <div className="segmented">
          {filters.map((f) => (
            <button
              key={f.key}
              className={activeFilter === f.key ? "active" : ""}
              onClick={() => onFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {onSearch && (
        <div className="search-glass" style={{ width: 240 }}>
          <Search size={18} color="var(--text-3)" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
      )}

      <div className="spacer" />
      {children}
    </div>
  );
}
