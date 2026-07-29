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

/* ViewSwitcher = Segmented ที่รู้จักชื่อ/ไอคอนของมุมมองมาตรฐาน — **ไม่มีหน้าตาของตัวเอง**
   เดิมส่ง className="ui-view-switcher" ไปให้ globals ประกาศความสูง/สีทับอีกชุด ห่างจาก
   .segmented > button ไป 2,360 บรรทัด ผลคือปุ่ม active ของตัวสลับมุมมองใช้ `color: #fff`
   ตายตัวแทน var(--accent-fg) → ธีมมืดวัดได้ 2.77:1 (AA ต้องการ 4.5) ขณะที่ segmented
   ตัวอื่นบนหน้าเดียวกันได้ 6.44:1 · อย่าเติมคลาสหน้าตาให้ตัวนี้อีก ถ้าต้องการรูปแบบใหม่
   ให้เพิ่มเป็น variant ของ .segmented เพื่อให้ทุกตัวสลับได้หน้าตาเดียวกัน */
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
      options={options}
      value={value}
      onChange={onChange}
      showLabels={showLabels}
      ariaLabel={ariaLabel}
    />
  );
}
