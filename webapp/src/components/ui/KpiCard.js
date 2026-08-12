"use client";

import { isValidElement } from "react";
import { fmtMoney, fmtNumber } from "@/lib/format";

const TONES = {
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
  info: "var(--blue)",
  accent: "var(--accent)",
  neutral: "var(--text-3)",
};

export default function KpiCard({
  label,
  value,
  hint,
  badge,
  icon,
  tone = "accent",
  color,
  taxValue,
  onClick,
  interactive = Boolean(onClick),
  className = "",
}) {
  const accent = color || TONES[tone] || TONES.accent;
  const Icon = icon && !isValidElement(icon) ? icon : null;
  const iconNode = Icon ? <Icon size={16} aria-hidden="true" /> : icon;
  const displayValue = typeof value === "number" ? fmtNumber(value) : value;
  /* ความยาวของค่า ส่งให้ CSS คิดขนาดฟอนต์จากความกว้างจริงของการ์ด (ดู .ui-kpi-value)
     ⚠️ ที่นี่ไม่ตัดสินขนาดเอง — เดิมเทียบ `length > 14` แล้วสลับคลาส `.compact` ซึ่งไม่รู้
     ว่าการ์ดกว้างเท่าไร เลขที่ยาว 14 พอดีจึงไม่ย่อและล้นกรอบจนถูกตัด
     ค่าที่เป็น element (ไม่ใช่ข้อความ) วัดความยาวไม่ได้ ปล่อยให้ CSS ใช้ค่าตั้งต้น */
  const valueText = typeof displayValue === "string" || typeof displayValue === "number"
    ? String(displayValue)
    : null;
  const content = (
    <>
      <div className="ui-kpi-heading">
        <span className="ui-kpi-label">
          {badge || (
            <>
              {iconNode ? <span className="ui-kpi-icon">{iconNode}</span> : null}
              {label ? <span className="ui-kpi-label-text" title={typeof label === "string" ? label : undefined}>{label}</span> : null}
            </>
          )}
        </span>
      </div>
      <div className="ui-kpi-value-row">
        <div
          className="ui-kpi-value"
          style={valueText ? { "--kpi-len": valueText.length } : undefined}
          title={typeof displayValue === "string" ? displayValue : undefined}
        >
          {displayValue}
        </div>
        {taxValue !== undefined ? <div className="ui-kpi-tax">{fmtMoney(taxValue)}</div> : null}
      </div>
      <div className={`ui-kpi-hint${hint ? "" : " is-empty"}`} aria-hidden={hint ? undefined : "true"}>{hint || "\u00A0"}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`glass-panel ui-kpi-card interactive-card ${className}`.trim()} style={{ "--kpi-accent": accent }} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <div className={`glass-panel ui-kpi-card ${interactive ? "interactive-card" : ""} ${className}`.trim()} style={{ "--kpi-accent": accent }}>
      {content}
    </div>
  );
}
