"use client";
// ── แถบสรุปงานบริการของผู้อนุมัติ (ม็อก SoApproveModal `.astrip`) ──────────────────────────────────────────────
//
// ⭐ "งานบริการ: ไป 12 รอบ · แต่ละครั้ง 6 โซนใน 5 ไซต์ · ครั้งละ 7 แพ็ค · รวมทั้งใบ 84 แพ็ค · ช่วง … · สัญญา: …" (มติ 29/09) — ข้อความจาก `serviceSetupStripText`
//   (ก้อน GET `stripText`) ตัวเดียวกับที่ server คิด · ที่นี่แค่แยกส่วนให้อ่านง่าย (สัญญายังไม่ผูก = สีเตือน)
// ⚠️ หน้าเป็นคนตัดสินว่าจะเมานต์เมื่อไร (ผู้อนุมัติ + ใบรออนุมัติ หรืองานบริการย้อนหลังรอตรวจ)
import { Fragment } from "react";
import { Repeat } from "lucide-react";
import { stripParts } from "./serviceSetupDraft";
import styles from "./ServiceBackfillPanel.module.css";

/** @param setup ผลของ `useServiceSetup` — ไม่มี `stripText` = ไม่วาด */
export default function ServiceSetupStrip({ setup }) {
  const text = setup?.data?.stripText;
  if (!text) return null;
  const { label, parts } = stripParts(text);
  return (
    <div className={styles.strip} role="note" aria-label="สรุปงานบริการของใบนี้">
      <Repeat size={15} aria-hidden="true" className={styles.stripIcon} />
      {label ? <span className={styles.stripLabel}>{label}</span> : null}
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index ? <span className={styles.stripSep} aria-hidden="true">·</span> : null}
          <span className={part.includes("ยังไม่ผูก") ? styles.stripWarn : undefined}>{part}</span>
        </Fragment>
      ))}
    </div>
  );
}
