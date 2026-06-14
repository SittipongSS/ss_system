"use client";
import { forwardRef } from "react";

// Select กลางของระบบ — ครอบ native <select> ด้วยสไตล์ .premium-select เดียวกันทั้งเว็บ
// แทนการเขียน inline style (fontSize/width/padding/height) ซ้ำ ๆ ในแต่ละจุด
// props:
//   compact   : ใช้ในแถบเครื่องมือ (ฟอนต์ 12px, กว้างตามเนื้อหา)
//   tone      : สีสถานะแบบ dynamic (เช่นสีของสถานะงาน) — ลงสีตัวอักษร/ขอบ/พื้น
//   fullWidth : กว้างเต็มคอนเทนเนอร์ (ฟอร์ม)
//   options   : [{ value, label, disabled }] หรือจะส่ง <option> เป็น children เองก็ได้
const Select = forwardRef(function Select(
  { compact = false, tone, fullWidth = false, options, children, className = "", style, ...rest },
  ref,
) {
  const toneStyle = tone
    ? {
        color: tone,
        borderColor: `color-mix(in srgb, ${tone} 45%, var(--border))`,
        // ใช้ backgroundColor (ไม่ใช่ background) เพื่อไม่ลบลูกศร dropdown ที่มาจาก background-image ใน CSS
        backgroundColor: `color-mix(in srgb, ${tone} 10%, var(--panel))`,
      }
    : null;
  const cls = [
    "premium-select",
    compact && "compact",
    tone && "tone",
    fullWidth && "w-full",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <select ref={ref} className={cls} style={{ ...toneStyle, ...style }} {...rest}>
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  );
});

export default Select;
