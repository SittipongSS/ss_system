"use client";

import { useRef } from "react";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";

function descriptorOf(option) {
  if (typeof option === "string" || typeof option === "number") {
    return { value: option, label: String(option) };
  }
  return option;
}

// ป้ายจำนวนของตัวเลือก — `count` เป็นตัวเลข ไม่ใช่ข้อความที่ผู้เรียกต่อเอง
//
// ⚠️ ห้ามกลับไปยัดเลขในป้ายชื่อ (`ต้องทำ (12)`) แบบเดิม สองเหตุผล:
//   1. เลขอยู่ในสตริง ⇒ 1 หลักกับ 2 หลักกว้างไม่เท่ากัน พอตัวเลขเปลี่ยนแถบทั้งแถบขยับ
//      ที่นี่กันด้วย min-width + tabular-nums ของ .seg-count
//   2. เลขในวงเล็บอ่านเป็น "ส่วนขยายของชื่อ" ไม่ใช่ "จำนวนที่ค้างอยู่"
// `count == null` (ยังโหลดไม่เสร็จ) = ไม่มีป้าย · `0` = มีป้ายขึ้นเลขศูนย์
// ไม่ซ่อน ไม่งั้นแถบขยับตอนข้อมูลมาถึง
function countLabel(count) {
  return count > 99 ? "99+" : String(count);
}

// `selection="radio"` — แถบเป็น "เลือกหนึ่งจากชุด" ที่เป็นค่าของฟอร์ม (ไม่ใช่ตัวกรอง/มุมมอง): กล่องห่อเป็น radiogroup · ปุ่มเป็น radio +
// aria-checked ⇒ โปรแกรมอ่านจอบอก "ปุ่มตัวเลือก 1 จาก 2" ผู้ใช้คีย์บอร์ดรู้ว่าลูกศรไปตัวเลือกถัดไป (Tab ลงตัวที่เลือกอยู่ตัวเดียวตามแบบ
// radiogroup · WAI-ARIA APG) · ไม่ส่ง = รูปเดิมทุกตัวอักษร (role="group" + aria-pressed) ⇒ แถบที่มีอยู่ทั้งระบบได้ DOM เดิม
// ใช้คู่กับ `activationMode="manual"` ได้ (ลูกศรย้ายโฟกัสอย่างเดียว เลือกด้วย Space/Enter/คลิก — ค่าที่เปลี่ยนสิ่งที่จะบันทึก)
export default function Segmented({
  options = [],
  value,
  onChange,
  ariaLabel = "ตัวเลือก",
  className = "",
  showLabels = true,
  activationMode = "automatic",
  selection = "toggle",
}) {
  const radio = selection === "radio";
  const buttonsRef = useRef([]);
  const items = options.map(descriptorOf).filter((option) => option?.value !== undefined);
  const hasSelectedOption = items.some((option) => option.value === value && !option.disabled);
  const firstEnabledIndex = items.findIndex((option) => !option.disabled);

  const moveFocus = (event, currentIndex) => {
    const nextIndex = nextEnabledIndex(items, currentIndex, event.key);
    if (nextIndex < 0) return;
    event.preventDefault();
    buttonsRef.current[nextIndex]?.focus();
    if (activationMode === "automatic") onChange?.(items[nextIndex].value);
  };

  return (
    <div className={`segmented ${className}`.trim()} role={radio ? "radiogroup" : "group"} aria-label={ariaLabel}>
      {items.map((option, index) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(node) => { buttonsRef.current[index] = node; }}
            type="button"
            className={`${active ? "active" : ""} ${!showLabels ? "icon" : ""}`.trim()}
            onClick={() => onChange?.(option.value)}
            onKeyDown={(event) => moveFocus(event, index)}
            role={radio ? "radio" : undefined}
            aria-checked={radio ? active : undefined}
            aria-pressed={radio ? undefined : active}
            /* โทนของตัวเลือกเดี่ยว (เช่น "danger" = ค่าที่เลือกไว้แต่ใช้ไม่ได้แล้ว) — ส่งเป็น data attribute ให้ผู้เรียกแต่งใน
               CSS module ของตัวเอง · ไม่ส่ง = ไม่มี attribute ⇒ ทุกแถบเดิมได้ DOM เดิม */
            data-tone={option.tone}
            aria-label={option.ariaLabel
              || (!showLabels ? option.label : undefined)
              || (option.count != null && typeof option.label === "string"
                ? `${option.label} ${option.count} รายการ`
                : undefined)}
            title={option.title}
            disabled={option.disabled}
            tabIndex={active || (!hasSelectedOption && index === firstEnabledIndex) ? 0 : -1}
          >
            {Icon ? <Icon size={option.iconSize || 15} aria-hidden="true" /> : null}
            {showLabels ? <span>{option.label}</span> : null}
            {showLabels && option.count != null
              ? <span className="seg-count">{countLabel(option.count)}</span>
              : null}
          </button>
        );
      })}
    </div>
  );
}
