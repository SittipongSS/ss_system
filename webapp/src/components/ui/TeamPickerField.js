"use client";
import ChoiceChips from "@/components/ui/ChoiceChips";
import { TEAM_LABELS } from "@/lib/permissions";

// ── ช่อง "งานใบนี้เข้าทีมไหน" (มติผู้ใช้ 2026-08-11 รอบสอง) ────────────────
//
// โผล่เฉพาะตอนที่มันมีคำตอบให้เลือกจริง — คนอยู่ทีมเดียว (ส่วนใหญ่ของระบบ) ไม่เห็น
// ช่องนี้เลย เพราะทีมนั้นคือคำตอบเดียวอยู่แล้ว · กติกาเดียวกับ "ทีมหลัก" ในหน้า
// ตั้งค่าผู้ใช้ ที่ถามเฉพาะตอนเลือกตั้งแต่สองทีม (docs/form-design-rules.md §3)
//
// ⚠️ `teams` = ทีมของ **คนที่จะเป็นเจ้าของงาน** ไม่ใช่ของคนกดเสมอไป — ฟอร์มดีล
// ส่งทีมของ AE ที่ถูกเลือกมา เพราะทีมของดีลตามเจ้าของ ไม่ใช่ตามคนสร้าง
//
// ⚠️ นี่เป็นแค่ *ค่าตั้งต้นที่คนเลือกได้* — ด่านจริงอยู่ที่ attributionTeam() ฝั่ง server
// ซึ่งตีค่าที่ไม่ใช่ทีมของเจ้าของทิ้งเสมอ
export default function TeamPickerField({
  teams = [],
  value,
  onChange,
  label = "ทีมเจ้าของงาน",
  hint = "ยอดและเป้าของงานใบนี้จะถูกนับเข้าทีมที่เลือก",
  disabled = false,
  className = "form-group col-span-2",
}) {
  if (teams.length < 2) return null;
  return (
    <div className={className}>
      <label>{label}</label>
      <ChoiceChips
        ariaLabel={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={teams.map((t) => ({ value: t, label: TEAM_LABELS[t] || t }))}
      />
      {hint ? <p className="text-[11px] text-[var(--text-3)] mt-1">{hint}</p> : null}
    </div>
  );
}
