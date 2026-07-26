"use client";

import Button from "./Button";

// สถานะว่างกลางของระบบ — ไอคอน + ข้อความ (+ ปุ่มทำงาน) อยู่กึ่งกลางในกล่อง glass-panel
// props:
//   icon     : lucide icon component (ไม่บังคับ)
//   onClick  : ถ้ามี → ทั้งกล่องเป็นปุ่มกด (ใช้คู่ dashed เป็นการ์ด "เพิ่ม")
//   dashed   : ขอบประ + hover (การ์ดเพิ่มแบบกดได้)
//   action   : { label, onClick } → ปุ่มแยกด้านล่างข้อความ (ใช้เมื่อกล่องไม่ได้กดทั้งใบ)
//   plain    : ไม่ครอบ glass-panel (เช่นใช้ในกล่องที่มีพื้นหลังอยู่แล้ว)
export default function EmptyState({ icon: Icon, children, onClick, dashed = false, action, plain = false, className = "", style }) {
  const Tag = onClick ? "button" : "div";
  const cls = [
    !plain && "glass-panel",
    "empty-state",
    dashed && "dashed",
    className,
  ].filter(Boolean).join(" ");
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cls} style={style}>
      {Icon && <Icon size={26} className="es-icon" />}
      <div>{children}</div>
      {action && !onClick && (
        <Button tone="primary" size="sm" className="es-action" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Tag>
  );
}
