"use client";
// ── ธงนัดหมายของลีด — "🚩 11 พ.ย. · 13:30–15:00 · Studio 02" (mig 0424 · มติเจ้าของ 05/11) ──
//
// ตารางคิวลีด + หน้ารายละเอียดลีดใช้ตัวเดียวกัน · กวาดตาลงคอลัมน์แล้วต้องรู้ทันทีว่าใบไหนมีนัด วันไหน ห้องไหน
// ⭐ นัดวันนี้ = ธงสีเข้ม (ต้องเตรียมห้อง/คนวันนี้) · นัดที่ MKT จองแต่ AE ยังไม่ยืนยัน = กรอบประ
//    (ยังไม่นับเป็นนัดประชุม — มติข้อ 5) · คำเต็มอยู่ใน title และ aria-label

import { Flag } from "lucide-react";
import { fmtDayMonth } from "@/lib/format";
import {
  appointmentPlace, appointmentTimeRange, isAppointmentToday,
} from "@/lib/sales/leadAppointments";
import styles from "./LeadAppointmentFlag.module.css";

export default function LeadAppointmentFlag({ appointment, nowIso, className = "" }) {
  if (!appointment) return null;
  const today = isAppointmentToday(appointment, nowIso);
  const pending = appointment.source === "intake";
  const parts = [today ? "วันนี้" : fmtDayMonth(appointment.startAt), appointmentTimeRange(appointment), appointmentPlace(appointment)];
  const text = parts.join(" · ");
  const title = `นัดหมาย ${text}${pending ? ` — จองโดย ${appointment.createdByName || "MKT"} · รอ AE ยืนยันเป็นนัดประชุม` : " — AE ยืนยันแล้ว"}`;
  return (
    <span
      className={`${styles.flag} ${className}`.trim()}
      data-today={today ? "1" : undefined}
      data-pending={pending ? "1" : undefined}
      title={title}
      aria-label={title}
    >
      <Flag size={12} aria-hidden="true" />
      {/* ท่อนละก้อน ไม่ขาดกลางท่อน — คอลัมน์ชื่อในคิวลีดแคบ ตัดท้ายด้วย … แล้ว "ห้อง" ซึ่งเป็นท่อนสำคัญที่สุดหาย
          (เจอบนจอจริง 05/11: "20 พ.ย. · 13:30–15:00 · Studi…") ⇒ ห่อขึ้นบรรทัดใหม่ทีละท่อนแทน */}
      <span className={styles.text}>
        {parts.map((part, index) => (
          <span key={index} className={styles.part}>{index > 0 ? `· ${part}` : part}</span>
        ))}
      </span>
    </span>
  );
}
