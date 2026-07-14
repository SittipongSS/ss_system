"use client";
import Select from "@/components/ui/Select";

// สถานะงาน PM (ขั้นตอนโครงการ + งานส่วนตัว) — สี + ป้าย (เต็ม/สั้น) แหล่งเดียว
// ใช้ร่วมทั้งหน้า timeline ของโครงการและ My Work แทน dropdown ○◷✓ ที่ copy ซ้ำหลายจุด
export const TASK_STATUS_META = {
  Pending:       { color: "var(--text-3)", glyph: "○", full: "รอดำเนินการ", short: "รอ" },
  "In Progress": { color: "var(--accent)", glyph: "◷", full: "กำลังทำ",     short: "ทำอยู่" },
  Completed:     { color: "var(--green)",  glyph: "✓", full: "เสร็จแล้ว",   short: "เสร็จ" },
};

const ORDER = ["Pending", "In Progress", "Completed"];

// สีประจำสถานะ (ใช้ได้ทั้ง dot/ขอบการ์ด/ไอคอน) — แทน map ที่เคย copy ในแต่ละหน้า
export const taskStatusColor = (s) => TASK_STATUS_META[s]?.color || "var(--text-3)";

// dropdown เลือกสถานะ — onChange ส่งค่าสถานะใหม่ (string) ตรง ๆ
// variant: "full" = "○ รอดำเนินการ" (หน้า timeline) · "short" = "รอ" (My Work)
export default function StatusSelect({ value, onChange, variant = "full", style, ...rest }) {
  const options = ORDER.map((k) => {
    const m = TASK_STATUS_META[k];
    return { value: k, label: variant === "short" ? m.short : `${m.glyph} ${m.full}` };
  });
  return (
    <Select
      value={value}
      tone={taskStatusColor(value)}
      options={options}
      style={{ minWidth: variant === "full" ? 148 : undefined, ...style }}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
      {...rest}
    />
  );
}
