"use client";

import { CheckCircle2, ClipboardList, FileText } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import { DetailCard } from "@/components/ui/DetailPage";
import { normalizeDocumentControlActions } from "@/lib/documentControlModel";
import styles from "./DocumentControlPanel.module.css";

function DocumentAction({ action, slot, busy }) {
  if (!action || action.visible === false) return null;
  const {
    id,
    label,
    kind = slot === "danger" ? "cancel" : "open",
    variant = slot === "primary" ? "filled" : "outline",
    icon,
    href,
    external = false,
    disabled = false,
    disabledReason,
    onClick,
    title,
  } = action;
  const unavailable = busy || disabled;
  const common = {
    kind,
    label,
    icon,
    variant,
    title: disabledReason || title,
    className: styles.action,
  };

  if (href) {
    return (
      <ActionButton
        key={id}
        as="a"
        href={unavailable ? undefined : href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        aria-disabled={unavailable || undefined}
        onClick={unavailable ? (event) => event.preventDefault() : onClick}
        {...common}
      />
    );
  }

  return <ActionButton key={id} disabled={unavailable} onClick={onClick} {...common} />;
}

/* `orientation="row"` — รางแนวนอนสำหรับการ์ดที่กว้างเต็มหน้า (หัวใบรายละเอียด)
   ค่าตั้งต้นยังเป็นแนวตั้งเหมือนเดิม เพราะที่ใช้กันอยู่ทั้งหมดคือรางขวาที่แคบ
   ⚠️ ไม่ใช่คนละคอมโพเนนต์ — ขั้น/สถานะ/ป้ายชุดเดียวกัน ต่างแค่ผัง ไม่งั้นรางสองชุด
   จะเพี้ยนหากันเวลาเพิ่มสถานะใหม่ (โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้) */
export function WorkflowRail({ steps = [], label = "เส้นทางเอกสาร", orientation = "column" }) {
  if (!steps.length) return null;
  return (
    <div
      className={`${styles.workflowRail} ${orientation === "row" ? styles.workflowRailRow : ""}`.trim()}
      aria-label={label}
    >
      {steps.map((step, index) => (
        <div key={step.id || `${step.label}-${index}`} className={`${styles.workflowStep} ${styles[step.state || "pending"]}`}>
          <span className={styles.stepMarker}>
            {step.state === "done" ? <CheckCircle2 size={15} aria-hidden="true" /> : index + 1}
          </span>
          <span className={styles.stepCopy}>
            <strong>{step.label}</strong>
            {step.hint ? <small>{step.hint}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DocumentSummaryCard({
  title = "สรุปเอกสาร",
  total,
  rows = [],
  status,
  statusColor = "var(--text-3)",
  children,
  className = "",
}) {
  return (
    <section className={`${styles.panel} ${styles.summaryCard} ${className}`.trim()}>
      <div className={styles.summaryLabel}>{title}</div>
      {total !== undefined && total !== null ? <div className={styles.totalAmount}>{total}</div> : null}
      {rows.length ? (
        <dl className={styles.summaryRows}>
          {rows.map((row, index) => (
            <div key={row.id || row.label || index}>
              <dt>{row.label}</dt>
              <dd>{row.value ?? "-"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status ? (
        <div className={styles.documentStatus}>
          <span className={styles.statusDot} style={{ "--state-color": statusColor }} />
          <span><small>สถานะเอกสาร</small><strong>{status}</strong></span>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function DocumentReadinessList({ items = [], label = "ความพร้อมของเอกสาร" }) {
  if (!items.length) return null;
  return (
    <ul className={styles.readinessList} aria-label={label}>
      {items.map((item, index) => (
        <li key={item.id || item.label || index} className={item.ready ? styles.readinessReady : ""}>
          <span className={styles.readinessMarker} aria-hidden="true">
            {item.ready ? <CheckCircle2 size={14} /> : null}
          </span>
          <span>
            <strong>{item.label}</strong>
            {item.detail ? <small>{item.detail}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DocumentControlCard({
  eyebrow = "DOCUMENT CONTROL",
  title = "จัดการเอกสาร",
  status,
  statusColor = "var(--text-3)",
  statusDescription,
  workflowSteps = [],
  notices,
  evidence,
  primaryAction,
  secondaryActions = [],
  dangerActions = [],
  busy = false,
  footer,
  children,
  className = "",
}) {
  const actions = normalizeDocumentControlActions({ primaryAction, secondaryActions, dangerActions });
  const hasActions = actions.primaryAction || actions.secondaryActions.length || actions.dangerActions.length;

  return (
    <DetailCard icon={ClipboardList} eyebrow={eyebrow} title={title} meta={statusDescription} className={className}>
      {status ? (
        <div className={styles.controlStatus}>
          <span className={styles.statusDot} style={{ "--state-color": statusColor }} />
          <strong>{status}</strong>
        </div>
      ) : null}
      <WorkflowRail steps={workflowSteps} />
      {notices ? <div className={styles.notices}>{notices}</div> : null}
      {evidence ? <div className={styles.evidence}>{evidence}</div> : null}
      {children}
      {hasActions ? (
        <div className={styles.actionStack}>
          {actions.primaryAction ? <DocumentAction action={actions.primaryAction} slot="primary" busy={busy} /> : null}
          {actions.secondaryActions.map((action) => <DocumentAction key={action.id} action={action} slot="secondary" busy={busy} />)}
          {actions.dangerActions.length ? <div className={styles.dangerDivider} /> : null}
          {actions.dangerActions.map((action) => <DocumentAction key={action.id} action={action} slot="danger" busy={busy} />)}
        </div>
      ) : null}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </DetailCard>
  );
}

export function RelatedDocumentCard({
  icon = FileText,
  eyebrow = "RELATED DOCUMENT",
  title,
  meta,
  children,
  actions,
  className = "",
}) {
  const Icon = icon;
  return (
    <DetailCard icon={Icon} eyebrow={eyebrow} title={title} meta={meta} className={className}>
      <div className={styles.relatedBody}>{children}</div>
      {actions ? <div className={styles.relatedActions}>{actions}</div> : null}
    </DetailCard>
  );
}
