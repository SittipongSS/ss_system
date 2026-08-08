"use client";
// ── ชิปเลือกหนึ่ง — รายการไดนามิกสั้น (≤6) เห็นครบแล้วจิ้มเลย ─────────────
//
// กติกาคอนโทรล v2 (มติผู้ใช้ 2026-08-08): รายการสั้น เช่น แบรนด์ของลูกค้า
// (มัก 1–3 ตัว) ไม่ควรซ่อนในดรอปดาวน์ · **เกิน 6 ตัวผู้เรียกถอยไป
// SearchableSelect เอง** — fallback เป็นการตัดสินใจของช่องนั้น ไม่ใช่ของชิป
// · AE ไม่ใช้ชิป (มติผู้ใช้: ชื่อยาว คนเยอะ)
//
// ญาติร่วมภาษา: ชิป Scentotype/Performance ในแบบฟอร์ม PDR (`.tierChip`)
// — ฝั่งนั้นเป็น multi-select ของ ChipPicker ใน PdrForm ตัวนี้เป็น single
//
// `data-ghost` = ตัวเลือกเชิง "ไม่ระบุ" เส้นประ (ผู้เรียกส่ง `ghost: true`)
export default function ChoiceChips({
  value,
  onChange,
  options = [],   // [{ value, label, ghost?, disabled? }]
  disabled = false,
  ariaLabel,
}) {
  return (
    <div className="choice-chips" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-on={value === option.value ? "1" : undefined}
          data-ghost={option.ghost ? "1" : undefined}
          className="choice-chip"
          disabled={disabled || option.disabled}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
