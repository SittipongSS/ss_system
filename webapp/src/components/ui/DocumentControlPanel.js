"use client";

import { CheckCircle2, FileCheck2, FileStack } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import { DetailCard } from "@/components/ui/DetailPage";
import { normalizeDocumentControlActions } from "@/lib/documentControlModel";
import styles from "./DocumentControlPanel.module.css";
import { naText } from "@/lib/format";

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

/* ⭐ `totalCaption` — คำใต้ตัวเลขนำ (มติผู้ใช้ 2026-08-25) · `totalComplete` = ครบแล้ว
   ⚠️ **เพิ่ม ไม่แก้ของเดิม** — การ์ดนี้ใช้ที่ใบสั่งขาย สัญญา ทะเบียนชำระ และคำร้อง ·
   ผู้เรียกที่ไม่ส่งสองตัวนี้ได้หน้าตาเดิมทุก px
   ⭐ `zero` รายแถว — แถวที่เป็นศูนย์ **จางลงแต่ไม่หาย** (แกนสามแถวของการ์ดคำร้อง) ·
   ซ่อนเมื่อไร ตำแหน่งของแถวที่เหลือจะเลื่อน แล้วข้อดีของ "ตำแหน่งคงที่ สแกนข้ามใบได้"
   ก็หมดไปทั้งอัน */
export function DocumentSummaryCard({
  title = "สรุปเอกสาร",
  total,
  totalCaption = null,
  totalComplete = false,
  rows = [],
  status,
  statusColor = "var(--text-3)",
  /* ⚠️ **ป้ายเหนือบรรทัดสถานะปรับได้** — การ์ดนี้ไม่ได้ใช้แค่กับเอกสารแล้ว · บนการ์ด
     คำร้อง บรรทัดนี้เป็นผลกระทบยอดใบสั่งขาย ⇒ คำว่า "สถานะเอกสาร" อ่านผิดเรื่อง
     ("สถานะเอกสาร · ใบสั่งขาย 1 — ยังไม่มีรายการที่ลูกค้าคอนเฟิร์ม") */
  statusLabel = "สถานะเอกสาร",
  children,
  className = "",
}) {
  return (
    <section className={`${styles.panel} ${styles.summaryCard} ${className}`.trim()}>
      <div className={styles.summaryLabel}>{title}</div>
      {total !== undefined && total !== null ? (
        <div className={totalCaption ? styles.lead : undefined}>
          <div className={`${styles.totalAmount} ${totalComplete ? styles.totalComplete : ""}`.trim()}>{total}</div>
          {totalCaption ? <div className={styles.totalCaption}>{totalCaption}</div> : null}
        </div>
      ) : null}
      {rows.length ? (
        <dl className={styles.summaryRows}>
          {rows.map((row, index) => (
            <div key={row.id || row.label || index} className={row.zero ? styles.summaryZero : undefined}>
              <dt>{row.label}</dt>
              <dd>{naText(row.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status ? (
        <div className={styles.documentStatus}>
          <span className={styles.statusDot} style={{ "--state-color": statusColor }} />
          <span><small>{statusLabel}</small><strong>{status}</strong></span>
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
    <DetailCard icon={FileCheck2} eyebrow={eyebrow} title={title} meta={statusDescription} className={className}>
      {/* ⭐ ห่อเนื้อการ์ดไว้ก้อนเดียวเพื่อให้ **จอแคบสลับลำดับได้** — ที่ ≤1050px รางขวา
          เลิกปักหมุดแล้วไหลไปต่อท้าย ⇒ ปุ่มระดับใบซึ่งอยู่ท้ายการ์ดตกไปอยู่ก้นหน้า
          (วัดจริงบนใบคำร้อง: การ์ดสูง 848px โดยเป็นราง 317 + ปุ่ม 345 ⇒ ปุ่มเริ่มหลัง
          เนื้อการ์ดไปแล้วราว 460px)
          ⚠️ **จอกว้างไม่เปลี่ยนอะไรเลย** — กล่องนี้เป็น block ตามเดิม สลับลำดับเฉพาะ
          ในมีเดียแคบ · การ์ดนี้มีผู้ใช้หลายหน้า (QT · SO · ดีล · โครงการ · คำร้อง)
          การเปลี่ยนลำดับบนจอกว้างคือการตัดสินใจเชิงดีไซน์ ไม่ใช่การแก้ปัญหาที่วัดได้
          ⚠️ ใช้ `order` ได้เพราะ **รางไม่มีอะไรที่โฟกัสได้เลย** (div/span ล้วน) ⇒ ลำดับ
          Tab ไม่เพี้ยนจากภาพ · ถ้าวันไหนรางมีปุ่ม ต้องกลับมาสลับ DOM จริงแทน */}
      <div className={styles.controlBody}>
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
          {/* 🐞 **เหตุผลที่ปุ่มหลักกดไม่ได้ ต้องเป็นตัวหนังสือ ไม่ใช่ tooltip** —
              `disabledReason` เดิมไหลไปเป็น `title` อย่างเดียว ⇒ ประโยคที่ระบุสาเหตุ
              ได้จริง (เช่น "รายการที่ 2: ต้องเลือกหมวดสินค้า") **ไม่เคยขึ้นบนจอเลย**
              ต้องเอาเมาส์ไปค้างบนปุ่มที่กดไม่ได้ถึงจะเห็น และบนจอสัมผัสไม่มีทางเห็น
              ⚠️ ขึ้นเฉพาะตอนปุ่มถูกปิดจริง — ปุ่มที่กดได้อยู่แล้วไม่ต้องมีคำอธิบาย
              ⚠️ `title` ยังอยู่ตามเดิม ไม่ได้ถอด (คนที่ชินกับ tooltip ยังได้เหมือนเดิม) */}
          {actions.primaryAction?.disabledReason && (actions.primaryAction.disabled || busy) ? (
            <p className={styles.blockedReason} role="status">{actions.primaryAction.disabledReason}</p>
          ) : null}
          {actions.primaryAction ? <DocumentAction action={actions.primaryAction} slot="primary" busy={busy} /> : null}
          {actions.secondaryActions.map((action) => <DocumentAction key={action.id} action={action} slot="secondary" busy={busy} />)}
          {actions.dangerActions.length ? <div className={styles.dangerDivider} /> : null}
          {actions.dangerActions.map((action) => <DocumentAction key={action.id} action={action} slot="danger" busy={busy} />)}
        </div>
      ) : null}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </DetailCard>
  );
}

export function RelatedDocumentCard({
  icon = FileStack,
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
