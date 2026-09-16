"use client";

import { useId } from "react";
import { CheckCircle2, FileCheck2, FileStack } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import { DetailCard } from "@/components/ui/DetailPage";
import { normalizeDocumentControlActions } from "@/lib/documentControlModel";
import styles from "./DocumentControlPanel.module.css";
import { naText } from "@/lib/format";

function DocumentAction({ action, slot, busy, describedBy }) {
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
    /* ⚠️ `title` เป็น **แอตทริบิวต์ HTML** รับได้แต่สตริง — `disabledReason` ที่เป็น
       node (เหตุผล + ปุ่มพาไปจุดที่แก้ได้) เคยไหลมาที่นี่แล้วกลายเป็น
       "[object Object]" ค้างเป็นทูลทิปของปุ่ม · บรรทัดที่คนอ่านจริงคือ
       `.blockedReason` ข้างล่าง ซึ่งรับ node ได้อยู่แล้ว */
    title: typeof disabledReason === "string" ? disabledReason : title,
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
        aria-describedby={describedBy}
        onClick={unavailable ? (event) => event.preventDefault() : onClick}
        {...common}
      />
    );
  }

  /* 🐞 **ปุ่มที่กดไม่ได้ต้องยัง Tab ไปถึง** — เดิมเป็นแอตทริบิวต์ `disabled` ⇒ ปุ่มหลัก
     ของทั้งใบ (ส่งผล/ยื่น) **หายจากลำดับ Tab ทั้งตัว** ตอนติดด่าน · คนที่ใช้คีย์บอร์ด
     หรือโปรแกรมอ่านหน้าจอจึงไม่มีทางรู้ว่ามีปุ่มนี้อยู่ ไม่ต้องพูดถึงเหตุผลที่กดไม่ได้
     (วัดจริง 2026-09-16 บนจอประเมินพื้นที่: รางทั้งราง 5 จุดหยุด ไม่มีปุ่มส่งสักจุด)
     ⇒ ใช้ `aria-disabled` + onClick ที่ไม่ทำอะไร **ท่าเดียวกับสาขาลิงก์ข้างบน**
        หน้าตายังจางเท่าเดิม (`.action[aria-disabled="true"]` มี opacity + pointer-events)
        และ `aria-describedby` ผูกปุ่มเข้ากับบรรทัดเหตุผล ⇒ โฟกัสแล้วได้ยินเหตุผลด้วย
     ⚠️ ห้ามกลับไปใช้ `disabled` — ด่านจริงอยู่ที่ server เสมอ ปุ่มนี้เป็นแค่การบอกล่วงหน้า */
  return (
    <ActionButton
      key={id}
      aria-disabled={unavailable || undefined}
      aria-describedby={describedBy}
      onClick={unavailable ? (event) => event.preventDefault() : onClick}
      {...common}
    />
  );
}

/* เหตุผลที่กดปุ่มนี้ไม่ได้ + ตัวปุ่ม — คู่กันเสมอ ทุกช่อง ไม่ใช่เฉพาะปุ่มหลัก
   🐞 เดิมวาดบรรทัดเหตุผลให้ `primaryAction` ช่องเดียว ⇒ `disabledReason` ของปุ่มรอง/
      ปุ่มอันตรายตกไปเป็น `title` (ทูลทิป) ซึ่งจอสัมผัสไม่มีทางเห็น = กฎ ui-visibility
      ("ติดด่าน = โชว์แล้วบอกเหตุ") ทำงานแค่ช่องเดียวจากสามช่อง */
function DocumentActionSlot({ action, slot, busy, reasonId }) {
  if (!action || action.visible === false) return null;
  const blocked = action.disabledReason && (action.disabled || busy);
  return (
    <>
      {blocked ? <p className={styles.blockedReason} id={reasonId} role="status">{action.disabledReason}</p> : null}
      <DocumentAction action={action} slot={slot} busy={busy} describedBy={blocked ? reasonId : undefined} />
    </>
  );
}

/* `orientation="row"` — รางแนวนอนสำหรับการ์ดที่กว้างเต็มหน้า (หัวใบรายละเอียด)
   ค่าตั้งต้นยังเป็นแนวตั้งเหมือนเดิม เพราะที่ใช้กันอยู่ทั้งหมดคือรางขวาที่แคบ
   ⚠️ ไม่ใช่คนละคอมโพเนนต์ — ขั้น/สถานะ/ป้ายชุดเดียวกัน ต่างแค่ผัง ไม่งั้นรางสองชุด
   จะเพี้ยนหากันเวลาเพิ่มสถานะใหม่ (โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้) */
/* ⭐ `step.number` — เลขขั้นที่ **ไม่ใช่ลำดับในอาเรย์ที่ส่งมา** · ค่าตั้งต้นยังเป็น
   `index + 1` เหมือนเดิมทุกผู้เรียก ⇒ รางที่ส่งครบทุกขั้นไม่เปลี่ยนสักพิกเซล
   ทำไมต้องมี: การ์ดที่โชว์ **เฉพาะขั้นปัจจุบัน** (ใบประเมินพื้นที่) ส่งมาแถวเดียว
   แล้วได้เลข "1" ทั้งที่ใบอยู่ขั้นที่ 4 — เลขที่โกหกแย่กว่าไม่มีเลข */
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
            {step.state === "done" ? <CheckCircle2 size={15} aria-hidden="true" /> : (step.number ?? index + 1)}
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
  /* ⭐ ไอคอนการ์ดปรับได้ — ค่าตั้งต้นยังเป็น FileCheck2 เหมือนเดิมทุกผู้เรียก
     ⚠️ หนึ่ง entity หนึ่งไอคอน: การ์ดของ *ใบประเมินพื้นที่* ใช้ ListChecks เพราะ
     FileCheck2 คือไอคอนของเอกสารที่ต้องอนุมัติ ไม่ใช่ของงานวัดหน้างาน */
  icon = FileCheck2,
  eyebrow = "DOCUMENT CONTROL",
  title = "จัดการเอกสาร",
  status,
  statusColor = "var(--text-3)",
  /* ⭐ บรรทัดรองของ **จุดสถานะ** — คนละช่องกับ `statusDescription` ซึ่งเป็น meta ของ
     หัวการ์ด (อยู่ *เหนือ* พาดหัวสถานะ) · ของที่อ่านคู่กับพาดหัวเสมอ ("ส่งโดย … ·
     เมื่อ … · รอฝ่ายขายปิดเรื่อง") ต้องอยู่ติดพาดหัว ไม่ใช่ลอยไปอยู่บนหัวการ์ด
     ⚠️ อยู่ในบล็อกสถานะ ⇒ ที่ ≤1050px มันเลื่อนขึ้นไปพร้อมสถานะ (order: -3) เอง */
  statusSub = null,
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
  /* ส่งต่อให้ `DetailCard` ตรง ๆ — เหตุผลเต็มอยู่ที่นั่น (การ์ดจัดการที่ไหลลงมาอยู่
     บนสุดของจอแคบมีพาดหัวสถานะของตัวเองแล้ว หัวการ์ดอีกชั้นกินที่เปล่า) */
  headerNarrow,
  /* ⭐ `tabletSplit` — **แท็บเล็ต (681–1050px) วางสถานะซ้าย ปุ่มขวา** แทนกองกันแนวตั้ง
     ที่ความกว้างนั้นการ์ดกินเต็มแถว (รางเลิกปักหมุดแล้ว) ⇒ คอลัมน์เดียวยาว 360px
     ดันแถบแท็บและเนื้อหาตกจอ 768px ทั้งที่ครึ่งขวาของการ์ดว่างเปล่า
     ⚠️ **ไม่ส่งมา = เหมือนเดิมทุก px** ทั้งเจ็ดหน้าที่ใช้การ์ดนี้ · จอกว้าง/จอมือถือ
     ไม่แตะเลย (รางแคบ 330px ไม่มีที่ให้แบ่ง · มือถือแบ่งแล้วปุ่มเหลือ 150px) */
  tabletSplit = false,
  className = "",
}) {
  const actions = normalizeDocumentControlActions({ primaryAction, secondaryActions, dangerActions });
  const hasActions = actions.primaryAction || actions.secondaryActions.length || actions.dangerActions.length;
  /* id ของบรรทัดเหตุผล — ต้องไม่ชนกันเมื่อหน้าหนึ่งมีการ์ดนี้มากกว่าหนึ่งใบ */
  const uid = useId();
  const reasonId = (id) => `${uid}-blocked-${id}`;

  return (
    <DetailCard icon={icon} eyebrow={eyebrow} title={title} meta={statusDescription}
      headerNarrow={headerNarrow} className={className}>
      {/* ⭐ ห่อเนื้อการ์ดไว้ก้อนเดียวเพื่อให้ **จอแคบสลับลำดับได้** — ที่ ≤1050px รางขวา
          เลิกปักหมุดแล้วไหลไปต่อท้าย ⇒ ปุ่มระดับใบซึ่งอยู่ท้ายการ์ดตกไปอยู่ก้นหน้า
          (วัดจริงบนใบคำร้อง: การ์ดสูง 848px โดยเป็นราง 317 + ปุ่ม 345 ⇒ ปุ่มเริ่มหลัง
          เนื้อการ์ดไปแล้วราว 460px)
          ⚠️ **จอกว้างไม่เปลี่ยนอะไรเลย** — กล่องนี้เป็น block ตามเดิม สลับลำดับเฉพาะ
          ในมีเดียแคบ · การ์ดนี้มีผู้ใช้หลายหน้า (QT · SO · ดีล · โครงการ · คำร้อง)
          การเปลี่ยนลำดับบนจอกว้างคือการตัดสินใจเชิงดีไซน์ ไม่ใช่การแก้ปัญหาที่วัดได้
          ⚠️ ใช้ `order` ได้เพราะ **รางไม่มีอะไรที่โฟกัสได้เลย** (div/span ล้วน) ⇒ ลำดับ
          Tab ไม่เพี้ยนจากภาพ · ถ้าวันไหนรางมีปุ่ม ต้องกลับมาสลับ DOM จริงแทน */}
      <div className={`${styles.controlBody} ${tabletSplit ? styles.bodySplit : ""}`.trim()}>
      {status ? (
        <div className={styles.controlStatus}>
          <span className={styles.statusDot} style={{ "--state-color": statusColor }} />
          {/* ⚠️ ไม่มี `statusSub` = DOM เดิมเป๊ะ (`<strong>` เป็นลูกตรงของบล็อกสถานะ) —
              ผู้เรียกเดิมทั้งเจ็ดหน้าจึงไม่ขยับสักพิกเซล */}
          {statusSub ? (
            <span className={styles.statusCopy}><strong>{status}</strong>{statusSub}</span>
          ) : <strong>{status}</strong>}
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
          {actions.primaryAction ? (
            <DocumentActionSlot action={actions.primaryAction} slot="primary" busy={busy}
              reasonId={reasonId(actions.primaryAction.id)} />
          ) : null}
          {actions.secondaryActions.map((action) => (
            <DocumentActionSlot key={action.id} action={action} slot="secondary" busy={busy}
              reasonId={reasonId(action.id)} />
          ))}
          {actions.dangerActions.length ? <div className={styles.dangerDivider} /> : null}
          {actions.dangerActions.map((action) => (
            <DocumentActionSlot key={action.id} action={action} slot="danger" busy={busy}
              reasonId={reasonId(action.id)} />
          ))}
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
