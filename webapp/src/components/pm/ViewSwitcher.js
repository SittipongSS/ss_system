"use client";
import { ListTodo, Table2, FileText, FolderKanban, CalendarDays, LayoutGrid, BarChart3 } from "lucide-react";

// ไอคอน + ป้ายมาตรฐานของมุมมอง PM — แหล่งเดียว ใช้ร่วมทุกหน้า
// (My Work: list/table · Project detail: list/table/document ·
//  Tasks: list/table/board/calendar/matrix)
export const VIEW_META = {
  list:     { icon: ListTodo,     label: "List" },
  table:    { icon: Table2,       label: "Table" },
  document: { icon: FileText,     label: "Gantt" },
  board:    { icon: FolderKanban, label: "บอร์ด" },
  calendar: { icon: CalendarDays, label: "ปฏิทิน" },
  matrix:   { icon: LayoutGrid,   label: "ความสำคัญ" },
  kpi:      { icon: BarChart3,    label: "KPI" },
};

// segmented แบบ icon-only — รับรายการ mode ที่จะแสดง
export default function ViewSwitcher({ value, onChange, modes }) {
  return (
    <div className="segmented">
      {modes.map((m) => {
        const meta = VIEW_META[m];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`icon ${value === m ? "active" : ""}`}
            title={`มุมมอง ${meta.label}`}
            aria-label={`มุมมอง ${meta.label}`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
