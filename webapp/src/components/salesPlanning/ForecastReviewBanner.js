"use client";
// ⏳ แถบเตือนก่อนขึ้นเดือนใหม่ — "เหลืออีกกี่วัน + ค้างกี่ใบ" พร้อมทางไปจัดการ
//
// มติผู้ใช้ 2026-08-05: 7 วันสุดท้ายของเดือน ให้เตือนพร้อมนับถอยหลังทุกวัน
// เพราะเดือน FC ที่ไม่ถูกเลื่อนจะค้างอยู่ในยอดของเดือนเก่าตลอดไป (ตรวจ prod:
// ค้าง 71 ใบ ~6 ล้าน) — ดู lib/sales/forecastDue.js
//
// ⚠️ หน้าตาของแถบอยู่ที่ `ui/AlertBanner` ตัวเดียวทั้งระบบ (ยกออกไป 2026-08-11
// ตอนหน้าคำร้องต้องการแถบเดียวกัน) — ไฟล์นี้เหลือแค่ *ข้อความกับปุ่มของเรื่องนี้*
import { CalendarClock } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";

export default function ForecastReviewBanner({ daysLeft, overdueCount, onShowOverdue }) {
  return (
    <AlertBanner
      tone="warning"
      icon={CalendarClock}
      action={<Button size="sm" onClick={onShowOverdue}>ดูรายการที่ต้องเลื่อน</Button>}
    >
      <strong>อีก {daysLeft} วันขึ้นเดือนใหม่</strong>
      {" — มีดีล "}
      <strong>{overdueCount}</strong>
      {" ใบที่เดือน FC เลยกำหนดแล้ว เลื่อนให้ตรงความจริงก่อนปิดงวด"}
    </AlertBanner>
  );
}
