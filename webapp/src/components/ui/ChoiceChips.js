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
//
// `multiple` = ติ๊กได้หลายอัน (`value` เป็นอาร์เรย์ · `onChange` คืนอาร์เรย์ใหม่
// เรียงตาม `options` เสมอ ไม่ใช่ตามลำดับที่กด) ใช้กับตัวกรองสั้น ๆ เช่น
// "แสดงทีมไหนบ้าง" ของคนที่อยู่หลายทีม (มติผู้ใช้ 2026-08-11)
//
// `minSelected` = จำนวนน้อยสุดที่ต้องเหลือไว้ (ค่าตั้งต้น 1 ในโหมด multiple) —
// ตัวสุดท้ายจะกดปิดไม่ได้ **โดยขึ้นเป็นปุ่มที่กดไม่ลง ไม่ใช่ปล่อยให้กดแล้วว่างเปล่า**
// ตัวกรองที่เลือกครบศูนย์ = ลิสต์ว่างที่อ่านเหมือน "ไม่มีข้อมูล" ซึ่งไม่จริง
export default function ChoiceChips({
  value,
  onChange,
  options = [],   // [{ value, label, ghost?, disabled? }]
  multiple = false,
  minSelected = 1,
  disabled = false,
  ariaLabel,
}) {
  const selected = multiple ? (Array.isArray(value) ? value : []) : null;
  const isOn = (option) => (multiple ? selected.includes(option.value) : value === option.value);
  // ตัวสุดท้ายที่เหลือ = ล็อกไว้ (ดูเหตุผลที่หัวไฟล์)
  const locked = (option) => multiple && isOn(option) && selected.length <= minSelected;
  const pick = (option) => {
    if (!multiple) return onChange?.(option.value);
    if (locked(option)) return;
    const next = isOn(option)
      ? selected.filter((v) => v !== option.value)
      : [...selected, option.value];
    onChange?.(options.map((o) => o.value).filter((v) => next.includes(v)));
  };

  return (
    <div className="choice-chips" role={multiple ? "group" : "radiogroup"} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={multiple ? "checkbox" : "radio"}
          aria-checked={isOn(option)}
          data-on={isOn(option) ? "1" : undefined}
          data-ghost={option.ghost ? "1" : undefined}
          className="choice-chip"
          disabled={disabled || option.disabled || locked(option)}
          onClick={() => pick(option)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
