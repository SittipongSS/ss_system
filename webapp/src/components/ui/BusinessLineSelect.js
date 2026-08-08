"use client";

// ── ช่องเลือกสายธุรกิจของโครงการ (mig 0191) ──────────────────────────────
//
// ⚠️ **ยกเป็น component เดียว** เพราะทุกฟอร์มโครงการเขียนลง `projects.line`
// ตารางเดียวกัน · ปล่อยให้แต่ละฟอร์มวาดตัวเลือกเองเมื่อไร มันจะเพี้ยนหากัน
// (กฎใน AGENTS.md)
//
// เป็น **แผ่นเลือก (OptionTiles)** ไม่ใช่ดรอปดาวน์ — ตัวเลือกตายตัว 2 ตัว
// ตามกติกาคอนโทรล (docs/form-design-rules.md §3: ชุดเล็กต้องเห็นครบแล้วจิ้ม)
// ป้ายสั้นตามมติ 2026-08-02: ไม่ใส่คำอธิบายในตัวเลือก — ความหมายอยู่ในเอกสาร
//
// ⭐ ค่าว่าง = "ยังไม่ระบุ" เป็นสถานะที่ถูกต้อง ไม่ใช่ข้อผิดพลาด — คอลัมน์นี้
// ไม่มี default โดยเจตนา (ดูหัว mig 0191: `projects.type` มี default 'NPD'
// แล้วโครงการทั้ง 11 ใบบน prod เป็น NPD หมด) · แผ่นเลือกตรงเจตนานี้กว่าดรอปดาวน์:
// ยังไม่กด = ไม่มีแผ่นไหนติดสี ไม่มีค่าแอบเลือกให้ · ตัวบังคับจริงอยู่ที่ฟอร์มและ API
import OptionTiles from "@/components/ui/OptionTiles";
import { BUSINESS_LINES, BUSINESS_LINE_HINTS, BUSINESS_LINE_LABELS } from "@/lib/master/businessLines";

export default function BusinessLineSelect({
  value = "",
  onChange,
  disabled = false,
  className = "",
  ariaLabel = "สายธุรกิจ",
}) {
  return (
    <div className={className || undefined}>
      <OptionTiles
        value={value || ""}
        onChange={(line) => onChange?.(line)}
        disabled={disabled}
        ariaLabel={ariaLabel}
        options={BUSINESS_LINES.map((line) => ({
          value: line,
          label: BUSINESS_LINE_LABELS[line] || line,
          // บรรทัดรองแบบเดียวกับแผ่นประเภทดีล (มติผู้ใช้ 2026-08-08: แผ่นเลือก
          // ทุกที่ต้องหน้าตาภาษาเดียวกัน) — ใจความ "งานนี้จบยังไง" จาก mig 0191
          description: BUSINESS_LINE_HINTS[line],
        }))}
      />
    </div>
  );
}
