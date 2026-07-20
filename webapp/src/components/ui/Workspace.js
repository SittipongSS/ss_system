"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";

// Canonical shell for every application module. Sales management established
// the visual hierarchy; keeping it here prevents module-specific drift.
export default function Workspace({
  icon,
  title,
  subtitle,
  headerRight,
  back,
  backActions,
  rail,
  toolbar,
  loading,
  hideHeader = false,
  className = "",
  children,
}) {
  return (
    <section className={`ui-workspace ${className}`.trim()}>
      {(back || backActions) && (
        <div className="ui-workspace-back-row">
          {back && (
            <Link href={back.href} className="ui-workspace-back">
              <ArrowLeft size={16} aria-hidden="true" /> {back.label}
            </Link>
          )}
          {backActions && <div className="ui-workspace-back-actions">{backActions}</div>}
        </div>
      )}

      {!hideHeader && (
        <header className="premium-header ui-workspace-header">
          <div className="header-content">
            <h1>
              {icon && <span className="premium-header-icon">{icon}</span>} {title}
            </h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerRight && <div className="ui-workspace-header-actions">{headerRight}</div>}
        </header>
      )}

      {rail && <div className="ui-workspace-rail">{rail}</div>}
      {toolbar && <div className="ui-workspace-toolbar">{toolbar}</div>}
      {loading ? <SkeletonRows rows={6} /> : children}
    </section>
  );
}

// Compatibility export for older pages. New loading surfaces use skeletons.
export function Spinner() {
  return <SkeletonRows rows={6} />;
}

export function WorkspaceSection({
  icon,
  title,
  subtitle,
  actions,
  children,
  bodyClassName = "",
  className = "",
}) {
  return (
    <section className={`ui-section ${className}`.trim()}>
      {(icon || title || actions) && (
        <header className="ui-section-header">
          <div className="ui-section-title">
            {icon}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="ui-section-actions">{actions}</div>}
        </header>
      )}
      <div className={`ui-section-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

export function MetricStrip({ children, className = "", ...props }) {
  return <section className={`ui-metric-strip ${className}`.trim()} {...props}>{children}</section>;
}

export function Metric({
  as: Element = "div",
  icon,
  label,
  value,
  note,
  tone,
  active = false,
  className = "",
  ...props
}) {
  return (
    <Element
      className={`ui-metric ${tone ? `is-${tone}` : ""} ${active ? "is-active" : ""} ${className}`.trim()}
      {...props}
    >
      <span className="ui-metric-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value ?? "-"}</strong>
        {note && <em>{note}</em>}
      </span>
    </Element>
  );
}
