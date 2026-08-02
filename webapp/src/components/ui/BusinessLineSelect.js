"use client";

// ── ช่องเลือกสายธุรกิจของโครงการ (mig 0191) ──────────────────────────────
//
// ⚠️ **ยกเป็น component เดียว** เพราะโครงการมีฟอร์มสร้าง/แก้อยู่ **สองตัว**:
//   · SalesProjectCreateModal  — หน้า /sa/projects (เส้นทางหลัก)
//   · ProjectFormModal          — หน้าดีล /sales-planning/deals
// ทั้งคู่เขียนลง `projects` ตารางเดียวกัน · ถ้าปล่อยให้แต่ละฟอร์มเขียน
// <option> เอง ตัวเลือกจะเพี้ยนหากันแน่นอน (กฎใน AGENTS.md)
//
// ⭐ ค่าว่าง = "ยังไม่ระบุ" เป็นสถานะที่ถูกต้อง ไม่ใช่ข้อผิดพลาด — คอลัมน์นี้
// ไม่มี default โดยเจตนา (ดูหัว mig 0191: `projects.type` มี default 'NPD'
// แล้วโครงการทั้ง 11 ใบบน prod เป็น NPD หมด) · ตัวนับบนหน้ารวมโครงการเป็น
// ตัวทวงแทน ไม่ใช่การเดาค่าให้
import Select from "@/components/ui/Select";
import {
  BUSINESS_LINES,
  BUSINESS_LINE_LABELS,
  BUSINESS_LINE_HINTS,
} from "@/lib/master/businessLines";

export default function BusinessLineSelect({
  value = "",
  onChange,
  disabled = false,
  className = "",
  ariaLabel = "สายธุรกิจ",
}) {
  return (
    <Select
      fullWidth
      name="line"
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {/* ⚠️ ตัวเลือกแรกไม่ใช่ค่าตั้งต้นที่ "ปลอดภัย" — มันคือสถานะที่ต้องมีคนมาเลือก */}
      <option value="">— ยังไม่ระบุ —</option>
      {/* 🪤 ข้อความต้องเป็น **สตริงเดียว** — `{a} ({b})` ที่มีลูกหลายตัวใน <option>
          React จะ join ด้วยคอมม่า ได้ "สายสินค้า, (,ส่งมอบของแล้วจบ,)" บน DOM จริง
          (วัดในเบราว์เซอร์แล้ว ไม่ใช่เดา) · eslint กับ test ไม่จับ เห็นตอนเปิดหน้าเท่านั้น */}
      {BUSINESS_LINES.map((line) => (
        <option key={line} value={line}>
          {`${BUSINESS_LINE_LABELS[line]} (${BUSINESS_LINE_HINTS[line]})`}
        </option>
      ))}
    </Select>
  );
}
