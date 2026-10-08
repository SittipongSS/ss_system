"use client";
// ── แถบสรุปงานบริการของผู้อนุมัติ (ม็อก SoApproveModal `.astrip`) ──────────────────────────────────────────────
//
// ⭐ "งานบริการ: แต่ละครั้ง 6 โซนใน 5 ไซต์ · ครั้งละ 7 แพ็ค · จำนวนรอบบริการ 12 เดือน · รวมทั้งใบ 84 แพ็ค · ช่วง … · สัญญา: …"
//   (ลำดับคอลัมน์ของตารางงานบริการ ③ → ④ → ⑤ → ⑥ · มติเจ้าของ 08/10 — เดิม 29/09 ขึ้นด้วยจำนวนรอบบริการ) — ข้อความจาก `serviceSetupStripText`
//   (ก้อน GET `stripText`) ตัวเดียวกับที่ server คิด · ที่นี่แค่แยกส่วนให้อ่านง่าย (สัญญายังไม่ผูก = สีเตือน)
// ⚠️ หน้าเป็นคนตัดสินว่าจะเมานต์เมื่อไร (ผู้อนุมัติ + ใบรออนุมัติ หรืองานบริการย้อนหลังรอตรวจ)
// ⭐ ใบที่ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404): "งานบริการ: ข้ามการตั้งตอนยื่น · ยังขาด n ข้อ · อนุมัติแล้วยังไม่ส่ง TS" — ส่วนที่มีคำ
//   `SERVICE_DEFERRED_TEXT.stripWarn` ("ยังไม่ส่ง TS") ขึ้นสีเตือนแบบเดียวกับ "สัญญา: ยังไม่ผูก"
import { Fragment } from "react";
import { Repeat } from "lucide-react";
import { SERVICE_DEFERRED_TEXT } from "@/lib/sales/serviceSetup";
import { stripParts } from "./serviceSetupDraft";
import styles from "./ServiceBackfillPanel.module.css";

/* ส่วนของแถบที่ต้องขึ้นสีเตือน — สัญญายังไม่ผูก · อนุมัติแล้วยังไม่ส่ง TS (ใบที่ข้ามการตั้งงานบริการตอนยื่น) */
const warnPart = (part) => part.includes("ยังไม่ผูก") || part.includes(SERVICE_DEFERRED_TEXT.stripWarn);

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
          <span className={warnPart(part) ? styles.stripWarn : undefined}>{part}</span>
        </Fragment>
      ))}
    </div>
  );
}
