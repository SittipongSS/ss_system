"use client";

import thaiText from "@/components/ThaiText";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { LOAD_FAILURE_DETAIL_LABEL } from "@/lib/ui/loadFailure";
import styles from "./StatusNotice.module.css";
import Button from "./Button";

/* ⚠️ **ต้องครบทุกโทนที่ระบบมี** (`STATUS_TONES` ใน lib/ui/tone.js) — โทนที่ไม่มีในนี้
   ไม่ได้พังให้เห็น มัน **ตกกลับเป็นฟ้า `info` เงียบ ๆ** ⇒ กล่อง "ดูได้อย่างเดียว" และ
   "เหตุผลที่ยกเลิก" ซึ่งตัวตัดสินสั่งมาเป็น `neutral` เคยขึ้นเป็นกล่องฟ้าพร้อมไอคอน ℹ
   (ทั้งที่ไม่ใช่ข้อมูลใหม่ที่ต้องอ่าน) · ไม่มีตัวตรวจไหนจับได้เพราะ fallback ถูกต้องตามโค้ด */
const TONES = {
  neutral: Info,
  accent: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

/* `danger` = ชื่อที่ฝั่ง StatusBadge/Tag ใช้เรียกโทนแดง · ที่นี่คลาสชื่อ `error` มาแต่เดิม
   ⇒ รับทั้งสองคำแทนที่จะปล่อยให้ `danger` ตกเป็นฟ้า (ทางกลับของ TONE_ALIASES ใน tone.js) */
const TONE_ALIAS = { danger: "error" };

/**
 * กล่องแจ้งกลางของระบบ
 *
 * ⭐ `detail` — **บรรทัดรองตัวเล็กใต้ข้อความ** สำหรับข้อความดิบที่คนหน้างานอ่านไม่ออกแต่คนแก้ระบบต้องใช้
 *    (มติเจ้าของ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก") · ขึ้นต้นด้วยป้าย `detailLabel`
 *    (ค่าตั้งต้น "รายละเอียดสำหรับแจ้งปัญหา") ⇒ ผู้เรียกส่งแค่ข้อความดิบ ห้ามประกอบป้ายเอง
 *    · ข้อความในช่องนี้ **ไม่ถูกแปล** (`translate="no"`) — ตัวแปลของเบราว์เซอร์เคยเปลี่ยนชื่อคอลัมน์ในข้อความ
 *      ของฐานเป็นคำไทย แล้วคนก๊อปไปแจ้งได้สตริงที่ค้นในโค้ดไม่เจอ
 *    · ใช้คู่ `useApiList().errorDetail` (หรือ `sourcesFailureDetail` เมื่อจออ่านหลายแหล่ง) — lib/ui/loadFailure.js
 * ⚠️ ไม่มี `detail` = กล่องเดิมทุก px (ผู้เรียกเดิมไม่ขยับ)
 */
export default function StatusNotice({
  tone = "info",
  role,
  title,
  children,
  detail,
  detailLabel = LOAD_FAILURE_DETAIL_LABEL,
  action,
  icon: CustomIcon,
  onDismiss,
  dismissLabel = "ปิดข้อความแจ้งเตือน",
  className = "",
}) {
  const key = TONE_ALIAS[tone] || tone;
  const resolvedRole = role || (key === "error" ? "alert" : "status");
  const Icon = CustomIcon || TONES[key] || TONES.info;
  return (
    <div className={`${styles.notice} ${styles[key] || styles.info} ${className}`.trim()} role={resolvedRole}>
      <span className={styles.icon} aria-hidden="true"><Icon size={18} /></span>
      <div className={styles.copy}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.message}>{typeof children === "string" ? thaiText(children) : children}</div>
        {detail ? (
          <p className={styles.detail}>
            <span className={styles.detailLabel}>{detailLabel}:</span>{" "}
            <span translate="no">{typeof detail === "string" ? thaiText(detail) : detail}</span>
          </p>
        ) : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
      {onDismiss ? (
        <Button
          iconOnly
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
          icon={<X size={14} aria-hidden="true" />}
        />
      ) : null}
    </div>
  );
}
