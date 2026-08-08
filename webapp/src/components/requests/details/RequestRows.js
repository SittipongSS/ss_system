"use client";
// ── การ์ดรายแถว — ของกลางที่ทุกหัวข้อที่มีบรรทัดใช้ร่วมกัน (P3b) ─────────
//
// ⚠️ **ห้ามให้หัวข้อไหนโคลนไฟล์นี้ไปแก้เอง** (ม-34) — สิ่งที่ต่างกันรายหัวข้อคือ
// *เนื้อของแถว* ซึ่งมาทาง `renderExtra` · โครงการ์ด/ป้ายขั้น/ไฟล์แนบเหมือนกันหมด
// โคลนเมื่อไรก็ได้สี่ก้อนที่เพี้ยนกันภายในสามเดือน
//
// ⚠️ ประวัติของก้าวอยู่ใน **เธรด** ที่เดียว (ม-49) — การ์ดนี้จึงไม่มีราง ไม่มีปุ่ม
// เหลือเฉพาะของที่เธรดเล่าแทนไม่ได้: สเปกที่ขอ กับไฟล์แนบของแถวนั้น
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ReadableText from "@/components/ui/ReadableText";
import StatusBadge from "@/components/ui/StatusBadge";
import { ROW_STAGE_LABELS, ROW_STAGE_TONES, rowStage } from "@/lib/requests/rowStage";
import styles from "./details.module.css";

// attachLabel/attachHint — สายเอกสารใช้การ์ดนี้ "ดูไฟล์" อย่างเดียว (ม-90: แนบผ่าน
// โมดัลส่งเอกสารทางเดียว) จึงต้องเปลี่ยนหัวข้อกับคำอธิบายได้โดยไม่โคลนการ์ด (ม-34)
export default function RequestRows({
  rows = [], canEditAttachments = false, renderExtra,
  attachLabel = "รูป / สเปกแนบ", attachHint,
}) {
  return rows.map((item) => (
    <div key={item.id} className={styles.rowCard}>
      <div className={styles.rowHead}>
        <div className={styles.rowTitle}>
          <strong>{item.label}</strong>
          <StatusBadge
            tone={ROW_STAGE_TONES[rowStage(item)] || "neutral"}
            label={ROW_STAGE_LABELS[rowStage(item)] || "—"}
          />
        </div>
      </div>
      {item.spec && <ReadableText text={item.spec} lines={3} className={styles.rowSpec} />}
      {renderExtra?.(item)}

      <div className={styles.rowAttach}>
        <div className="toolbar-label">{attachLabel}</div>
        {attachHint && <p className={styles.rowAttachHint}>{attachHint}</p>}
        <AttachmentsPanel
          entityType="dept_request_item"
          entityId={item.id}
          canEdit={canEditAttachments}
          inlineUpload
        />
      </div>
    </div>
  ));
}
