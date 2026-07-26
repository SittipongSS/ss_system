"use client";

import { Edit3, FilePlus2, Save, Send, Trash2 } from "lucide-react";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import styles from "./VersionControlCard.module.css";

export default function VersionControlCard({
  draft,
  published,
  dirty = false,
  readyToPublish = false,
  publishDisabledReason,
  busy = false,
  onCreateDraft,
  onEditDraft,
  onSaveDraft,
  onPublish,
  onDiscard,
  title = "ควบคุมเวอร์ชัน",
  statusDescription = "การเปลี่ยนแปลงมีผลเมื่อเผยแพร่เท่านั้น",
  className = "",
}) {
  const current = draft || published;
  const status = draft ? "ฉบับร่าง" : published ? "เผยแพร่แล้ว" : "ยังไม่มีเวอร์ชัน";
  const statusColor = draft ? "var(--amber)" : published ? "var(--green)" : "var(--text-3)";

  let primaryAction = null;
  let primaryId = null;
  if (!draft && onCreateDraft) {
    primaryId = "create";
    primaryAction = {
      id: primaryId,
      label: "สร้างฉบับร่าง",
      kind: "create",
      icon: FilePlus2,
      onClick: onCreateDraft,
    };
  } else if (draft && onSaveDraft && dirty) {
    primaryId = "save";
    primaryAction = {
      id: primaryId,
      label: "บันทึกฉบับร่าง",
      kind: "save",
      icon: Save,
      onClick: onSaveDraft,
    };
  } else if (draft && onPublish && readyToPublish) {
    primaryId = "publish";
    primaryAction = {
      id: primaryId,
      label: "เผยแพร่เวอร์ชัน",
      kind: "submit",
      icon: Send,
      onClick: onPublish,
    };
  } else if (draft && onEditDraft) {
    primaryId = "edit";
    primaryAction = {
      id: primaryId,
      label: "แก้ไขฉบับร่าง",
      kind: "edit",
      icon: Edit3,
      onClick: onEditDraft,
    };
  } else if (draft && onSaveDraft) {
    primaryId = "save";
    primaryAction = {
      id: primaryId,
      label: "บันทึกฉบับร่าง",
      kind: "save",
      icon: Save,
      onClick: onSaveDraft,
    };
  }

  const secondaryActions = [
    draft && onEditDraft && primaryId !== "edit" ? {
      id: "edit",
      label: "แก้ไขฉบับร่าง",
      kind: "edit",
      icon: Edit3,
      onClick: onEditDraft,
    } : null,
    draft && onSaveDraft && primaryId !== "save" ? {
      id: "save",
      label: "บันทึกฉบับร่าง",
      kind: "save",
      icon: Save,
      onClick: onSaveDraft,
    } : null,
    draft && onPublish && primaryId !== "publish" ? {
      id: "publish",
      label: "เผยแพร่เวอร์ชัน",
      kind: "submit",
      icon: Send,
      onClick: onPublish,
      disabled: !readyToPublish,
      disabledReason: publishDisabledReason || (!readyToPublish ? "บันทึกและตรวจความพร้อมก่อนเผยแพร่" : undefined),
    } : null,
  ].filter(Boolean);

  return (
    <DocumentControlCard
      eyebrow="VERSION CONTROL"
      title={title}
      status={status}
      statusColor={statusColor}
      statusDescription={statusDescription}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      dangerActions={draft && onDiscard ? [{
        id: "discard",
        label: "ยกเลิกฉบับร่าง",
        kind: "delete",
        icon: Trash2,
        onClick: onDiscard,
      }] : []}
      busy={busy}
      className={className}
    >
      <dl className={styles.meta}>
        <div><dt>เวอร์ชันร่าง</dt><dd>{draft?.versionNumber ? `V${draft.versionNumber}` : "-"}</dd></div>
        <div><dt>เวอร์ชันใช้งาน</dt><dd>{published?.versionNumber ? `V${published.versionNumber}` : "-"}</dd></div>
        {current?.changeNote ? <div className={styles.full}><dt>หมายเหตุ</dt><dd>{current.changeNote}</dd></div> : null}
      </dl>
      {draft ? (
        <p className={`${styles.readiness} ${readyToPublish ? styles.ready : ""}`}>
          {dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : readyToPublish ? "ฉบับร่างพร้อมเผยแพร่" : publishDisabledReason || "ฉบับร่างยังไม่พร้อมเผยแพร่"}
        </p>
      ) : null}
    </DocumentControlCard>
  );
}
