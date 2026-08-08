"use client";
// ── แผ่นเลือก — ชุดตัวเลือกตายตัว 2–4 ตัว เห็นครบโดยไม่ต้องเปิดดรอปดาวน์ ──
//
// กติกาคอนโทรล design v2 (มติผู้ใช้ 2026-08-08: "ไม่จำเป็นต้องใช้ dropdown
// ทุกอย่าง … อยากให้ผู้ใช้ใช้ง่ายกว่า") — dropdown ซ่อนจำนวนตัวเลือกไว้จนกว่า
// จะกด ชุดเล็กตายตัวจึงต้องกางให้เห็นแล้วจิ้มทีเดียวจบ
//
// ญาติร่วมภาษา: ปุ่มเลือกฝ่ายในฟอร์มเปิดคำร้อง (requestForm.module.css
// `.deptOption` — มติเดียวกันตั้งแต่ 2026-08-04) · ตอน wave ค่อยย้ายฝั่งนั้น
// มาใช้ตัวนี้ ไม่รีบทำในคอมมิตเดียวกับที่ primitive เพิ่งเกิด
//
// `tone` ต่อตัวเลือก: "amber" | "blue" | "teal" — ชุดสีเดียวกับ badge
// (เช่น DEAL_TYPE_COLORS) · ไม่ส่ง = โทนกลาง
export default function OptionTiles({
  value,
  onChange,
  options = [],   // [{ value, label, description?, tone?, disabled? }]
  disabled = false,
  ariaLabel,
}) {
  return (
    <div className="option-tiles" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-on={value === option.value ? "1" : undefined}
          data-tone={option.tone}
          className="option-tile"
          disabled={disabled || option.disabled}
          onClick={() => onChange?.(option.value)}
        >
          <span className="option-tile-title">{option.label}</span>
          {option.description ? (
            <span className="option-tile-sub">{option.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
