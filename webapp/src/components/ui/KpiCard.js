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
  const content = (
    <>
      <div className="ui-kpi-heading">
        <span className="ui-kpi-label">{badge || <>{iconNode}{label ? <span>{label}</span> : null}</>}</span>
      </div>
      <div className="ui-kpi-value-row">
        <div className="ui-kpi-value">{typeof value === "number" ? fmtNumber(value) : value}</div>
        {taxValue !== undefined ? <div className="ui-kpi-tax">{fmtMoney(taxValue)}</div> : null}
      </div>
      {hint ? <div className="ui-kpi-hint">{hint}</div> : null}
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
