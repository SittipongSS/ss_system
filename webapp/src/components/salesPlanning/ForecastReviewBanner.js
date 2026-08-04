"use client";
// ⏳ แถบเตือนก่อนขึ้นเดือนใหม่ — "เหลืออีกกี่วัน + ค้างกี่ใบ" พร้อมทางไปจัดการ
//
// มติผู้ใช้ 2026-08-05: 7 วันสุดท้ายของเดือน ให้เตือนพร้อมนับถอยหลังทุกวัน
// เพราะเดือน FC ที่ไม่ถูกเลื่อนจะค้างอยู่ในยอดของเดือนเก่าตลอดไป (ตรวจ prod:
// ค้าง 71 ใบ ~6 ล้าน) — ดู lib/sales/forecastDue.js
//
// ⚠️ ปุ่มพาไป **ตัวกรอง** ไม่ใช่บอกเฉย ๆ แล้วให้ไปหาเอง — ถ้าเตือนแล้วยังต้องไล่หา
// ในตาราง 144 แถว คนก็จะเลิกอ่านแถบนี้ภายในสัปดาห์เดียว
import { CalendarClock } from "lucide-react";
import Button from "@/components/ui/Button";
import styles from "./ForecastReviewBanner.module.css";

export default function ForecastReviewBanner({ daysLeft, overdueCount, onShowOverdue }) {
  return (
    <div className={styles.banner} role="status">
      <CalendarClock size={16} aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>
        <strong>อีก {daysLeft} วันขึ้นเดือนใหม่</strong>
        {" — มีดีล "}
        <strong>{overdueCount}</strong>
        {" ใบที่เดือน FC เลยกำหนดแล้ว เลื่อนให้ตรงความจริงก่อนปิดงวด"}
      </p>
      <Button size="sm" onClick={onShowOverdue}>ดูรายการที่ต้องเลื่อน</Button>
    </div>
  );
}
