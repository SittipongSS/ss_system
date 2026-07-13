"use client";

import { BarChart3, CalendarDays, FileText, FolderKanban, LayoutGrid, ListTodo, Table2 } from "lucide-react";

export const VIEW_META = {
  list: { icon: ListTodo, label: "รายการ" },
  table: { icon: Table2, label: "ตาราง" },
  document: { icon: FileText, label: "Gantt" },
  board: { icon: FolderKanban, label: "บอร์ด" },
  calendar: { icon: CalendarDays, label: "ปฏิทิน" },
  matrix: { icon: LayoutGrid, label: "ความสำคัญ" },
  kpi: { icon: BarChart3, label: "KPI" },
};

export default function ViewSwitcher({ value, onChange, modes, showLabels = false, ariaLabel = "มุมมอง" }) {
  return (
    <div className="segmented ui-view-switcher" role="group" aria-label={ariaLabel}>
      {modes.map((mode) => {
        const descriptor = typeof mode === "string" ? { value: mode, ...VIEW_META[mode] } : mode;
        if (!descriptor?.value) return null;
        const Icon = descriptor.icon;
        const active = value === descriptor.value;
        return (
          <button
            key={descriptor.value}
            type="button"
            onClick={() => onChange(descriptor.value)}
            className={active ? "active" : ""}
            title={`มุมมอง ${descriptor.label}`}
            aria-label={`มุมมอง ${descriptor.label}`}
            aria-pressed={active}
          >
            {Icon ? <Icon size={15} /> : null}
            {showLabels ? <span>{descriptor.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
