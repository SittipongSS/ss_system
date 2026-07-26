"use client";

import { BarChart3, CalendarDays, FileText, FolderKanban, LayoutGrid, ListTodo, Table2 } from "lucide-react";
import Segmented from "@/components/ui/Segmented";

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
  const options = modes.map((mode) => {
        const descriptor = typeof mode === "string" ? { value: mode, ...VIEW_META[mode] } : mode;
        return descriptor?.value ? {
          ...descriptor,
          title: descriptor.title || `มุมมอง ${descriptor.label}`,
          ariaLabel: descriptor.ariaLabel || `มุมมอง ${descriptor.label}`,
        } : null;
      }).filter(Boolean);
  return (
    <Segmented
      className="ui-view-switcher"
      options={options}
      value={value}
      onChange={onChange}
      showLabels={showLabels}
      ariaLabel={ariaLabel}
    />
  );
}
