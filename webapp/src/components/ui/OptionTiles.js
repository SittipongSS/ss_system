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
// `tone` ต่อตัวเลือก: "amber" | "blue" | "teal" | "violet" — ชุดสีเดียวกับ badge
// (เช่น DEAL_TYPE_COLORS) · ไม่ส่ง = โทนกลาง
//
// `multiple` = ติ๊กได้หลายอัน (`value` เป็นอาร์เรย์ · `onChange` คืนอาร์เรย์ใหม่)
// ใช้กับชุดตายตัวที่ตอบได้มากกว่าหนึ่ง เช่น **ทีมที่ผู้ใช้สังกัด** (ODM/KA/SV) —
// คนเดียวอยู่ได้หลายทีม (มติผู้ใช้ 2026-08-11) · โหมดนี้เป็น checkbox ไม่ใช่ radio
// จึงคืนลำดับตาม `options` เสมอ ไม่ใช่ตามลำดับที่กด — ป้ายบนหน้าจอจะได้ไม่สลับที่
export default function OptionTiles({
  value,
  onChange,
  options = [],   // [{ value, label, description?, tone?, disabled? }]
  multiple = false,
  disabled = false,
  ariaLabel,
}) {
  const selected = multiple ? (Array.isArray(value) ? value : []) : null;
  const isOn = (option) => (multiple ? selected.includes(option.value) : value === option.value);
  const pick = (option) => {
    if (!multiple) return onChange?.(option.value);
    const next = selected.includes(option.value)
      ? selected.filter((v) => v !== option.value)
      : [...selected, option.value];
    onChange?.(options.map((o) => o.value).filter((v) => next.includes(v)));
  };

  return (
    <div className="option-tiles" role={multiple ? "group" : "radiogroup"} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={multiple ? "checkbox" : "radio"}
          aria-checked={isOn(option)}
          data-on={isOn(option) ? "1" : undefined}
          data-tone={option.tone}
          className="option-tile"
          disabled={disabled || option.disabled}
          onClick={() => pick(option)}
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
