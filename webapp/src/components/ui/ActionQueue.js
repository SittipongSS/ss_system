"use client";

/* คิว "งานที่ต้องทำตอนนี้" ของหน้าภาพรวมแต่ละโมดูล (PM / ฐานข้อมูล / สหมิตร)
     items: { id, tone, icon, badge, title, subtitle, cta, onClick }
     tone ∈ warning | danger | success | info | neutral (ค่าตั้งต้น neutral)

   ⚠️ เดิมบอกความหมายด้วย **แถบสีด้านซ้าย 3px** — ผู้ใช้ขอเปลี่ยน (2026-07-29)
   เพราะแถบสีบาง ๆ สื่อความหมายได้น้อยและกินพื้นที่ขอบการ์ด ตอนนี้ใช้
   **กล่องไอคอนพื้นสีจาง** แทน ซึ่งบอกได้ทั้งโทนและ *ชนิดของงาน* ในที่เดียว
   และเป็นแพตเทิร์นเดียวกับ Metric/KpiCard ที่มีอยู่แล้ว */

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info, Inbox } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import styles from "./ActionQueue.module.css";

const TONE_ICON = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  neutral: Inbox,
};

export default function ActionQueue({ items = [], empty = "ไม่มีงานค้างที่ต้องทำตอนนี้ 🎉" }) {
  if (!items.length) {
    return <EmptyState icon={CheckCircle2}>{empty}</EmptyState>;
  }
  return (
    <div className={styles.queue}>
      {items.map((item) => {
        const tone = TONE_ICON[item.tone] ? item.tone : "neutral";
        const Icon = item.icon || TONE_ICON[tone];
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={styles.row}
            data-tone={tone}
          >
            <span className={styles.icon} aria-hidden="true"><Icon size={17} /></span>
            <span className={styles.copy}>
              <strong>{item.title}</strong>
              {item.subtitle ? <small>{item.subtitle}</small> : null}
            </span>
            {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
            {item.cta ? (
              <span className={styles.cta}>
                {item.cta} <ChevronRight size={15} aria-hidden="true" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
